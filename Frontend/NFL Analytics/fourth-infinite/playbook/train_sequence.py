"""PLAYBOOK Phase C - PyTorch LSTM sequence model.

Reads data/pbp_features.parquet, builds a sequence of last-5 play-label
embeddings plus current-play static features, runs the sequence through
a small LSTM, concatenates the final hidden state with a static-feature
MLP, and classifies into RUN / SHORT_PASS / DEEP_PASS.

Targets:
  - Beat the Phase B LightGBM floor (acc 0.594, log-loss 0.874)
  - Lift DEEP_PASS recall from 0.026 via class-weighted cross-entropy

Run from the playbook venv:
    python train_sequence.py
"""

from __future__ import annotations

import json
import math
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    log_loss,
)

ROOT       = Path(__file__).parent
DATA_FILE  = ROOT / "data" / "pbp_features.parquet"
MODELS_DIR = ROOT / "models"

TRAIN_YEARS = range(1999, 2024)
TEST_YEARS  = range(2024, 2026)

LABELS       = ["RUN", "SHORT_PASS", "DEEP_PASS"]
LABEL_TO_IDX = {l: i for i, l in enumerate(LABELS)}

# 'NONE' = pre-drive padding token. padding_idx=0 in the embedding zeros
# its gradient so the model learns to treat it as no-information.
LABEL_VOCAB        = ["NONE"] + LABELS
LABEL_VOCAB_TO_IDX = {l: i for i, l in enumerate(LABEL_VOCAB)}

NUMERIC_FEATURES = [
    "down", "ydstogo", "yardline_100", "score_differential",
    "qtr", "quarter_seconds_remaining", "game_seconds_remaining",
    "posteam_timeouts_remaining", "defteam_timeouts_remaining",
]

BINARY_FEATURES = [
    "shotgun", "no_huddle",
    "is_red_zone", "is_goal_line", "is_two_minute",
    "is_third_down", "is_fourth_down",
    "is_short_yardage", "is_long_yardage", "is_garbage_time",
    "is_home",
]

PREV_LABELS = [f"prev_play_label_{i}" for i in range(1, 6)]
SEQ_LEN     = len(PREV_LABELS)

EMBED_TEAM      = 8
EMBED_LABEL     = 8
LSTM_HIDDEN     = 32
STATIC_HIDDEN   = 64
COMBINED_HIDDEN = 64
DROPOUT         = 0.3

BATCH_SIZE          = 8192
NUM_EPOCHS          = 15
LR                  = 1e-3
WEIGHT_DECAY        = 1e-4
EARLY_STOP_PATIENCE = 3
SEED                = 42

# Class-weight mode for the cross-entropy loss:
#   "inverse" - inverse frequency (DEEP_PASS gets 2.58x weight on this dataset).
#               Lifts DEEP_PASS recall hard but tanks argmax accuracy.
#   "off"     - uniform weights. Apples-to-apples vs the LightGBM baseline.
# Phase C v1 (weighted) and v2 (unweighted) artifacts both kept for comparison.
CLASS_WEIGHT_MODE = "off"  # set via env var PLAYBOOK_CLASS_WEIGHTS to override

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def build_team_vocab(df: pd.DataFrame) -> dict[str, int]:
    teams = sorted(set(df["posteam"].dropna().unique()) | set(df["defteam"].dropna().unique()))
    vocab: dict[str, int] = {"__UNK__": 0}
    for t in teams:
        vocab[t] = len(vocab)
    return vocab


class PbpDataset(Dataset):
    """Pre-tensors all arrays once. Indexing returns torch tensor slices."""

    def __init__(self, df: pd.DataFrame, team_vocab: dict[str, int],
                 num_mean: np.ndarray, num_std: np.ndarray) -> None:
        # Sequence: (N, SEQ_LEN). Reverse so column 0 is oldest, last is newest
        # so the LSTM consumes plays in time order.
        seq_cols = [
            df[col].map(LABEL_VOCAB_TO_IDX).fillna(0).astype(np.int64).values
            for col in PREV_LABELS
        ]
        seq = np.stack(seq_cols, axis=1)[:, ::-1].copy()
        self.seq = torch.from_numpy(seq)

        num = df[NUMERIC_FEATURES].astype(np.float32).fillna(0.0).values
        denom = np.where(num_std > 0, num_std, 1.0).astype(np.float32)
        self.num = torch.from_numpy(((num - num_mean) / denom).astype(np.float32))

        self.bin = torch.from_numpy(df[BINARY_FEATURES].astype(np.float32).fillna(0.0).values)

        unk = team_vocab["__UNK__"]
        self.posteam_idx = torch.from_numpy(
            df["posteam"].map(team_vocab).fillna(unk).astype(np.int64).values
        )
        self.defteam_idx = torch.from_numpy(
            df["defteam"].map(team_vocab).fillna(unk).astype(np.int64).values
        )
        self.y = torch.from_numpy(df["play_label"].map(LABEL_TO_IDX).astype(np.int64).values)

    def __len__(self) -> int:
        return self.y.size(0)

    def __getitem__(self, i: int):
        return (
            self.seq[i], self.num[i], self.bin[i],
            self.posteam_idx[i], self.defteam_idx[i], self.y[i],
        )


class PlaybookLSTM(nn.Module):
    def __init__(self, n_teams: int) -> None:
        super().__init__()
        self.label_emb   = nn.Embedding(len(LABEL_VOCAB), EMBED_LABEL, padding_idx=0)
        self.posteam_emb = nn.Embedding(n_teams, EMBED_TEAM)
        self.defteam_emb = nn.Embedding(n_teams, EMBED_TEAM)
        self.lstm        = nn.LSTM(EMBED_LABEL, LSTM_HIDDEN, batch_first=True)

        static_in = len(NUMERIC_FEATURES) + len(BINARY_FEATURES) + 2 * EMBED_TEAM
        self.static_mlp = nn.Sequential(
            nn.Linear(static_in, STATIC_HIDDEN),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
        )
        self.head = nn.Sequential(
            nn.Linear(LSTM_HIDDEN + STATIC_HIDDEN, COMBINED_HIDDEN),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
            nn.Linear(COMBINED_HIDDEN, len(LABELS)),
        )

    def forward(self, seq, num, binv, post_idx, def_idx):
        emb = self.label_emb(seq)              # (B, SEQ, EMB_LABEL)
        _, (h_n, _) = self.lstm(emb)            # h_n: (1, B, LSTM_HIDDEN)
        seq_repr = h_n.squeeze(0)               # (B, LSTM_HIDDEN)

        post = self.posteam_emb(post_idx)
        defe = self.defteam_emb(def_idx)
        static = torch.cat([num, binv, post, defe], dim=1)
        static_repr = self.static_mlp(static)

        combined = torch.cat([seq_repr, static_repr], dim=1)
        return self.head(combined)


def epoch_loop(model, loader, loss_fn, optim=None, train: bool = True) -> float:
    if train:
        model.train()
    else:
        model.eval()
    total_loss = 0.0
    n_seen = 0
    ctx = torch.enable_grad() if train else torch.no_grad()
    with ctx:
        for batch in loader:
            seq, num, binv, post, defe, y = (b.to(DEVICE, non_blocking=True) for b in batch)
            if train:
                optim.zero_grad()
            logits = model(seq, num, binv, post, defe)
            loss = loss_fn(logits, y)
            if train:
                loss.backward()
                optim.step()
            total_loss += loss.item() * y.size(0)
            n_seen += y.size(0)
    return total_loss / n_seen


def evaluate(model, loader) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    all_proba: list[np.ndarray] = []
    all_y: list[np.ndarray]     = []
    with torch.no_grad():
        for batch in loader:
            seq, num, binv, post, defe, y = (b.to(DEVICE, non_blocking=True) for b in batch)
            logits = model(seq, num, binv, post, defe)
            all_proba.append(torch.softmax(logits, dim=1).cpu().numpy())
            all_y.append(y.cpu().numpy())
    return np.concatenate(all_proba, axis=0), np.concatenate(all_y, axis=0)


def main() -> int:
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(SEED)

    print(f"Device: {DEVICE}")
    if DEVICE.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    print(f"Loading {DATA_FILE}...")
    df = pd.read_parquet(DATA_FILE)

    train_df = df[df["season"].isin(TRAIN_YEARS)].reset_index(drop=True)
    test_df  = df[df["season"].isin(TEST_YEARS)].reset_index(drop=True)
    print(f"Train: {len(train_df):,}  Test: {len(test_df):,}")

    val_size   = len(train_df) // 10
    train_only = train_df.iloc[:-val_size].reset_index(drop=True)
    val_only   = train_df.iloc[-val_size:].reset_index(drop=True)

    team_vocab = build_team_vocab(train_only)
    num_arr    = train_only[NUMERIC_FEATURES].astype(np.float32).fillna(0.0).values
    num_mean   = num_arr.mean(axis=0)
    num_std    = num_arr.std(axis=0)

    train_ds = PbpDataset(train_only, team_vocab, num_mean, num_std)
    val_ds   = PbpDataset(val_only,   team_vocab, num_mean, num_std)
    test_ds  = PbpDataset(test_df,    team_vocab, num_mean, num_std)

    train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,
                          num_workers=0, pin_memory=DEVICE.type == "cuda")
    val_dl   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False,
                          num_workers=0, pin_memory=DEVICE.type == "cuda")
    test_dl  = DataLoader(test_ds,  batch_size=BATCH_SIZE, shuffle=False,
                          num_workers=0, pin_memory=DEVICE.type == "cuda")

    cw_mode = os.environ.get("PLAYBOOK_CLASS_WEIGHTS", CLASS_WEIGHT_MODE).lower()
    counts  = np.bincount(train_only["play_label"].map(LABEL_TO_IDX).values, minlength=len(LABELS))
    if cw_mode == "inverse":
        weights = counts.sum() / (len(LABELS) * counts)
    elif cw_mode == "off":
        weights = np.ones(len(LABELS), dtype=np.float32)
    else:
        raise ValueError(f"unknown CLASS_WEIGHT_MODE: {cw_mode}")
    weights_t = torch.tensor(weights, dtype=torch.float32, device=DEVICE)
    print(f"Class counts (train): {dict(zip(LABELS, counts.tolist()))}")
    print(f"Class weight mode:    {cw_mode}")
    print(f"Class weights:        {dict(zip(LABELS, [round(float(w), 3) for w in weights]))}")

    suffix = "_weighted" if cw_mode == "inverse" else "_unweighted"
    model_file   = MODELS_DIR / f"sequence{suffix}.pt"
    metrics_file = MODELS_DIR / f"sequence_metrics{suffix}.json"

    model   = PlaybookLSTM(n_teams=len(team_vocab)).to(DEVICE)
    optim   = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    loss_fn = nn.CrossEntropyLoss(weight=weights_t)

    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Trainable params: {n_params:,}")

    best_val = math.inf
    best_state: dict | None = None
    patience = 0
    history: list[dict] = []

    for epoch in range(1, NUM_EPOCHS + 1):
        t0 = time.time()
        train_loss = epoch_loop(model, train_dl, loss_fn, optim, train=True)
        val_loss   = epoch_loop(model, val_dl,   loss_fn, optim=None, train=False)
        secs = time.time() - t0
        history.append({"epoch": epoch, "train_loss": round(train_loss, 4),
                        "val_loss": round(val_loss, 4), "secs": round(secs, 1)})
        print(f"Epoch {epoch:2d}  train {train_loss:.4f}  val {val_loss:.4f}  ({secs:.1f}s)")

        if val_loss < best_val - 1e-4:
            best_val = val_loss
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            patience = 0
        else:
            patience += 1
            if patience >= EARLY_STOP_PATIENCE:
                print(f"  early stop after {epoch} epochs")
                break

    if best_state is not None:
        model.load_state_dict(best_state)

    y_pred_proba, y_test = evaluate(model, test_dl)
    y_pred = np.argmax(y_pred_proba, axis=1)

    acc = accuracy_score(y_test, y_pred)
    ll  = log_loss(y_test, y_pred_proba, labels=list(range(len(LABELS))))
    cm  = confusion_matrix(y_test, y_pred)

    print()
    print(f"Test accuracy : {acc:.4f}")
    print(f"Test log-loss : {ll:.4f}")
    print()
    print("Per-class report:")
    print(classification_report(y_test, y_pred, target_names=LABELS, digits=4))
    print("Confusion matrix (rows = actual, cols = pred):")
    print(pd.DataFrame(cm, index=LABELS, columns=LABELS).to_string())

    MODELS_DIR.mkdir(exist_ok=True)
    torch.save({
        "model_state": best_state if best_state is not None else model.state_dict(),
        "team_vocab":  team_vocab,
        "label_vocab": LABEL_VOCAB,
        "num_mean":    num_mean.tolist(),
        "num_std":     num_std.tolist(),
        "config": {
            "embed_team":      EMBED_TEAM,
            "embed_label":     EMBED_LABEL,
            "lstm_hidden":     LSTM_HIDDEN,
            "static_hidden":   STATIC_HIDDEN,
            "combined_hidden": COMBINED_HIDDEN,
            "dropout":         DROPOUT,
            "seq_len":         SEQ_LEN,
        },
    }, model_file)
    print(f"\nModel saved to {model_file}")

    metrics = {
        "phase":           "C",
        "model":           "lstm_sequence",
        "class_weight_mode": cw_mode,
        "device":          str(DEVICE),
        "train_years":     [int(min(TRAIN_YEARS)), int(max(TRAIN_YEARS))],
        "test_years":      [int(min(TEST_YEARS)),  int(max(TEST_YEARS))],
        "n_train":         int(len(train_only)),
        "n_val":           int(len(val_only)),
        "n_test":          int(len(test_df)),
        "n_params":        int(n_params),
        "epochs_trained":  len(history),
        "best_val_loss":   round(float(best_val), 4),
        "test_accuracy":   round(float(acc), 4),
        "test_log_loss":   round(float(ll), 4),
        "labels":          LABELS,
        "class_weights":   {l: round(float(w), 4) for l, w in zip(LABELS, weights)},
        "confusion_matrix": cm.tolist(),
        "history":         history,
    }
    with open(metrics_file, "w") as fh:
        json.dump(metrics, fh, indent=2)
    print(f"Metrics written to {metrics_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""PLAYBOOK Phase C+D - LSTM with richer sequence input + multi-task EPA head.

Reads data/pbp_features.parquet (must be the enriched schema with per-step
prev_yards_gained / prev_epa columns from fetch_pbp.py >= 044cd7c).

Architecture
------------
Per step in the 5-play drive history, the LSTM sees:
    [label_emb (8) | yards_gained (1) | epa (1)]
Final hidden state is concatenated with a static MLP that consumes:
    numeric (9) | binary (11) | posteam_emb (8) | defteam_emb (8)
A shared head projects to COMBINED_HIDDEN, then splits into two heads:
    - classification head -> 3 logits (RUN / SHORT_PASS / DEEP_PASS)
    - EPA head            -> 3 expected-EPA values, one per play type

Training loss = CE(logits, y) + LAMBDA_EPA * MSE(gather(epa_pred, y), epa_actual).
Only the EPA prediction at the index of the actually-called play receives
gradient on each row. Counterfactual EPAs for the unchosen play types
emerge from the shared trunk learning a coherent EPA surface.

Run from the playbook venv (script picks GPU automatically):
    python train_sequence.py
or:
    PLAYBOOK_CLASS_WEIGHTS=inverse python train_sequence.py
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
import torch.nn.functional as F
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

PREV_LABELS  = [f"prev_play_label_{i}"   for i in range(1, 6)]
PREV_NUMERIC = ["yards_gained", "epa"]   # per-step numeric (matches fetch_pbp HISTORY_NUMERIC)
SEQ_LEN      = len(PREV_LABELS)

EMBED_TEAM      = 8
EMBED_LABEL     = 8
LSTM_HIDDEN     = 64
STATIC_HIDDEN   = 64
COMBINED_HIDDEN = 64
DROPOUT         = 0.3

BATCH_SIZE          = 8192
NUM_EPOCHS          = 20
LR                  = 1e-3
WEIGHT_DECAY        = 1e-4
EARLY_STOP_PATIENCE = 3
SEED                = 42
LAMBDA_EPA          = 1.0  # weight on regression head vs classification head

CLASS_WEIGHT_MODE = "off"  # env var override: PLAYBOOK_CLASS_WEIGHTS=inverse

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def build_team_vocab(df: pd.DataFrame) -> dict[str, int]:
    teams = sorted(set(df["posteam"].dropna().unique()) | set(df["defteam"].dropna().unique()))
    vocab: dict[str, int] = {"__UNK__": 0}
    for t in teams:
        vocab[t] = len(vocab)
    return vocab


def _build_seq_numeric(df: pd.DataFrame) -> np.ndarray:
    """Build the (N, SEQ_LEN, F_step) per-step numeric tensor and reverse to
    oldest-first order so the LSTM consumes plays chronologically."""
    per_step = []
    for i in range(1, SEQ_LEN + 1):
        cols = [f"prev_{feat}_{i}" for feat in PREV_NUMERIC]
        step = df[cols].astype(np.float32).fillna(0.0).values  # (N, F_step)
        per_step.append(step)
    seq = np.stack(per_step, axis=1)        # (N, SEQ_LEN, F_step), step 1 = newest
    return seq[:, ::-1, :].copy()           # reverse: index 0 = oldest


class PbpDataset(Dataset):
    def __init__(self, df: pd.DataFrame, team_vocab: dict[str, int],
                 num_mean: np.ndarray, num_std: np.ndarray,
                 seq_num_mean: np.ndarray, seq_num_std: np.ndarray) -> None:

        seq_lbl = np.stack([
            df[col].map(LABEL_VOCAB_TO_IDX).fillna(0).astype(np.int64).values
            for col in PREV_LABELS
        ], axis=1)[:, ::-1].copy()
        self.seq_lbl = torch.from_numpy(seq_lbl)

        seq_num = _build_seq_numeric(df)
        seq_num = (seq_num - seq_num_mean) / np.where(seq_num_std > 0, seq_num_std, 1.0)
        self.seq_num = torch.from_numpy(seq_num.astype(np.float32))

        num = df[NUMERIC_FEATURES].astype(np.float32).fillna(0.0).values
        denom = np.where(num_std > 0, num_std, 1.0).astype(np.float32)
        self.num = torch.from_numpy(((num - num_mean) / denom).astype(np.float32))

        self.bin = torch.from_numpy(df[BINARY_FEATURES].astype(np.float32).fillna(0.0).values)

        unk = team_vocab["__UNK__"]
        self.posteam_idx = torch.from_numpy(
            df["posteam"].map(team_vocab).fillna(unk).astype(np.int64).values)
        self.defteam_idx = torch.from_numpy(
            df["defteam"].map(team_vocab).fillna(unk).astype(np.int64).values)

        self.y          = torch.from_numpy(df["play_label"].map(LABEL_TO_IDX).astype(np.int64).values)
        self.epa_actual = torch.from_numpy(df["epa"].astype(np.float32).fillna(0.0).values)

    def __len__(self) -> int:
        return self.y.size(0)

    def __getitem__(self, i: int):
        return (
            self.seq_lbl[i], self.seq_num[i], self.num[i], self.bin[i],
            self.posteam_idx[i], self.defteam_idx[i],
            self.y[i], self.epa_actual[i],
        )


class PlaybookLSTM(nn.Module):
    def __init__(self, n_teams: int) -> None:
        super().__init__()
        self.label_emb   = nn.Embedding(len(LABEL_VOCAB), EMBED_LABEL, padding_idx=0)
        self.posteam_emb = nn.Embedding(n_teams, EMBED_TEAM)
        self.defteam_emb = nn.Embedding(n_teams, EMBED_TEAM)

        lstm_input = EMBED_LABEL + len(PREV_NUMERIC)
        self.lstm = nn.LSTM(lstm_input, LSTM_HIDDEN, batch_first=True)

        static_in = len(NUMERIC_FEATURES) + len(BINARY_FEATURES) + 2 * EMBED_TEAM
        self.static_mlp = nn.Sequential(
            nn.Linear(static_in, STATIC_HIDDEN),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
        )
        self.shared = nn.Sequential(
            nn.Linear(LSTM_HIDDEN + STATIC_HIDDEN, COMBINED_HIDDEN),
            nn.ReLU(),
            nn.Dropout(DROPOUT),
        )
        self.cls_head = nn.Linear(COMBINED_HIDDEN, len(LABELS))
        self.epa_head = nn.Linear(COMBINED_HIDDEN, len(LABELS))

    def forward(self, seq_lbl, seq_num, num, binv, post_idx, def_idx):
        emb     = self.label_emb(seq_lbl)               # (B, SEQ, EMB_LABEL)
        seq_in  = torch.cat([emb, seq_num], dim=-1)      # (B, SEQ, EMB_LABEL + 2)
        _, (h_n, _) = self.lstm(seq_in)                  # h_n: (1, B, LSTM_HIDDEN)
        seq_repr = h_n.squeeze(0)

        post = self.posteam_emb(post_idx)
        defe = self.defteam_emb(def_idx)
        static = torch.cat([num, binv, post, defe], dim=1)
        static_repr = self.static_mlp(static)

        combined = torch.cat([seq_repr, static_repr], dim=1)
        h = self.shared(combined)
        return self.cls_head(h), self.epa_head(h)


def _move_batch(batch):
    return tuple(b.to(DEVICE, non_blocking=True) for b in batch)


def epoch_loop(model, loader, weights_t, optim=None, train: bool = True) -> dict:
    model.train(train)
    tot_ce = tot_mse = tot_loss = 0.0
    n_seen = 0
    ctx = torch.enable_grad() if train else torch.no_grad()
    with ctx:
        for batch in loader:
            seq_lbl, seq_num, num, binv, post, defe, y, epa_actual = _move_batch(batch)
            if train:
                optim.zero_grad()
            logits, epa_pred = model(seq_lbl, seq_num, num, binv, post, defe)
            ce = F.cross_entropy(logits, y, weight=weights_t)
            called = epa_pred.gather(1, y.unsqueeze(1)).squeeze(1)
            mse = F.mse_loss(called, epa_actual)
            loss = ce + LAMBDA_EPA * mse
            if train:
                loss.backward()
                optim.step()
            bs = y.size(0)
            tot_ce   += ce.item() * bs
            tot_mse  += mse.item() * bs
            tot_loss += loss.item() * bs
            n_seen   += bs
    return {
        "ce":   tot_ce / n_seen,
        "mse":  tot_mse / n_seen,
        "loss": tot_loss / n_seen,
    }


def evaluate(model, loader) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    model.eval()
    proba_chunks: list[np.ndarray] = []
    epa_chunks:   list[np.ndarray] = []
    y_chunks:     list[np.ndarray] = []
    epa_actual_chunks: list[np.ndarray] = []
    with torch.no_grad():
        for batch in loader:
            seq_lbl, seq_num, num, binv, post, defe, y, epa_actual = _move_batch(batch)
            logits, epa_pred = model(seq_lbl, seq_num, num, binv, post, defe)
            proba_chunks.append(torch.softmax(logits, dim=1).cpu().numpy())
            epa_chunks.append(epa_pred.cpu().numpy())
            y_chunks.append(y.cpu().numpy())
            epa_actual_chunks.append(epa_actual.cpu().numpy())
    return (
        np.concatenate(proba_chunks, axis=0),
        np.concatenate(epa_chunks, axis=0),
        np.concatenate(y_chunks, axis=0),
        np.concatenate(epa_actual_chunks, axis=0),
    )


def main() -> int:
    torch.manual_seed(SEED); np.random.seed(SEED)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(SEED)
    print(f"Device: {DEVICE}")
    if DEVICE.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    print(f"Loading {DATA_FILE}...")
    df = pd.read_parquet(DATA_FILE)

    # Drop rows with null current-play EPA - regression target must be defined.
    n_before = len(df)
    df = df[df["epa"].notna()].reset_index(drop=True)
    if len(df) < n_before:
        print(f"Dropped {n_before - len(df):,} rows with null EPA")

    train_df = df[df["season"].isin(TRAIN_YEARS)].reset_index(drop=True)
    test_df  = df[df["season"].isin(TEST_YEARS)].reset_index(drop=True)
    print(f"Train: {len(train_df):,}  Test: {len(test_df):,}")

    val_size   = len(train_df) // 10
    train_only = train_df.iloc[:-val_size].reset_index(drop=True)
    val_only   = train_df.iloc[-val_size:].reset_index(drop=True)

    team_vocab = build_team_vocab(train_only)
    num_arr    = train_only[NUMERIC_FEATURES].astype(np.float32).fillna(0.0).values
    num_mean   = num_arr.mean(axis=0); num_std = num_arr.std(axis=0)

    seq_num_arr = _build_seq_numeric(train_only)         # (N, SEQ, F_step)
    seq_num_flat = seq_num_arr.reshape(-1, seq_num_arr.shape[-1])
    seq_num_mean = seq_num_flat.mean(axis=0)
    seq_num_std  = seq_num_flat.std(axis=0)

    train_ds = PbpDataset(train_only, team_vocab, num_mean, num_std, seq_num_mean, seq_num_std)
    val_ds   = PbpDataset(val_only,   team_vocab, num_mean, num_std, seq_num_mean, seq_num_std)
    test_ds  = PbpDataset(test_df,    team_vocab, num_mean, num_std, seq_num_mean, seq_num_std)

    pin = DEVICE.type == "cuda"
    train_dl = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,  num_workers=0, pin_memory=pin)
    val_dl   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False, num_workers=0, pin_memory=pin)
    test_dl  = DataLoader(test_ds,  batch_size=BATCH_SIZE, shuffle=False, num_workers=0, pin_memory=pin)

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
    print(f"Lambda (EPA loss):    {LAMBDA_EPA}")

    suffix = "_weighted" if cw_mode == "inverse" else "_unweighted"
    model_file   = MODELS_DIR / f"sequence{suffix}.pt"
    metrics_file = MODELS_DIR / f"sequence_metrics{suffix}.json"

    model = PlaybookLSTM(n_teams=len(team_vocab)).to(DEVICE)
    optim = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Trainable params: {n_params:,}")

    best_val = math.inf
    best_state: dict | None = None
    patience = 0
    history: list[dict] = []

    for epoch in range(1, NUM_EPOCHS + 1):
        t0 = time.time()
        tr = epoch_loop(model, train_dl, weights_t, optim, train=True)
        vl = epoch_loop(model, val_dl,   weights_t, optim=None, train=False)
        secs = time.time() - t0
        history.append({
            "epoch": epoch,
            "train_ce":   round(tr["ce"], 4),
            "train_mse":  round(tr["mse"], 4),
            "train_loss": round(tr["loss"], 4),
            "val_ce":     round(vl["ce"], 4),
            "val_mse":    round(vl["mse"], 4),
            "val_loss":   round(vl["loss"], 4),
            "secs":       round(secs, 1),
        })
        print(f"Epoch {epoch:2d}  "
              f"train ce={tr['ce']:.4f} mse={tr['mse']:.4f} | "
              f"val ce={vl['ce']:.4f} mse={vl['mse']:.4f} | "
              f"({secs:.1f}s)")

        if vl["loss"] < best_val - 1e-4:
            best_val = vl["loss"]
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            patience = 0
        else:
            patience += 1
            if patience >= EARLY_STOP_PATIENCE:
                print(f"  early stop after {epoch} epochs")
                break

    if best_state is not None:
        model.load_state_dict(best_state)

    proba, epa_pred, y_test, epa_actual = evaluate(model, test_dl)
    y_pred = np.argmax(proba, axis=1)

    acc = accuracy_score(y_test, y_pred)
    ll  = log_loss(y_test, proba, labels=list(range(len(LABELS))))
    cm  = confusion_matrix(y_test, y_pred)

    # EPA metrics
    called_idx = np.arange(len(y_test))
    epa_called = epa_pred[called_idx, y_test]
    overall_rmse = float(np.sqrt(((epa_called - epa_actual) ** 2).mean()))
    overall_mae  = float(np.abs(epa_called - epa_actual).mean())
    per_class_rmse = {}
    per_class_mae  = {}
    for c, lbl in enumerate(LABELS):
        m = y_test == c
        if m.sum() > 0:
            per_class_rmse[lbl] = float(np.sqrt(((epa_pred[m, c] - epa_actual[m]) ** 2).mean()))
            per_class_mae[lbl]  = float(np.abs(epa_pred[m, c] - epa_actual[m]).mean())
        else:
            per_class_rmse[lbl] = None
            per_class_mae[lbl]  = None

    # Counterfactual EPA distribution: for each row, what does the model say
    # the EPA would be for each play type? Useful for portfolio plots.
    epa_mean_per_class = {lbl: float(epa_pred[:, c].mean()) for c, lbl in enumerate(LABELS)}

    print()
    print(f"Test classification accuracy : {acc:.4f}")
    print(f"Test classification log-loss : {ll:.4f}")
    print(f"Test EPA RMSE (called play)  : {overall_rmse:.4f}")
    print(f"Test EPA MAE  (called play)  : {overall_mae:.4f}")
    print(f"Per-class EPA RMSE: {per_class_rmse}")
    print(f"Predicted EPA mean per class (across all test rows): {epa_mean_per_class}")
    print()
    print("Per-class classification report:")
    print(classification_report(y_test, y_pred, target_names=LABELS, digits=4, zero_division=0))
    print("Confusion matrix (rows = actual, cols = pred):")
    print(pd.DataFrame(cm, index=LABELS, columns=LABELS).to_string())

    MODELS_DIR.mkdir(exist_ok=True)
    torch.save({
        "model_state":  best_state if best_state is not None else model.state_dict(),
        "team_vocab":   team_vocab,
        "label_vocab":  LABEL_VOCAB,
        "num_mean":     num_mean.tolist(),
        "num_std":      num_std.tolist(),
        "seq_num_mean": seq_num_mean.tolist(),
        "seq_num_std":  seq_num_std.tolist(),
        "config": {
            "embed_team":      EMBED_TEAM,
            "embed_label":     EMBED_LABEL,
            "lstm_hidden":     LSTM_HIDDEN,
            "static_hidden":   STATIC_HIDDEN,
            "combined_hidden": COMBINED_HIDDEN,
            "dropout":         DROPOUT,
            "seq_len":         SEQ_LEN,
            "lambda_epa":      LAMBDA_EPA,
        },
    }, model_file)
    print(f"\nModel saved to {model_file}")

    metrics = {
        "phase":              "C+D",
        "model":              "lstm_multitask_epa",
        "class_weight_mode":  cw_mode,
        "lambda_epa":         LAMBDA_EPA,
        "device":             str(DEVICE),
        "train_years":        [int(min(TRAIN_YEARS)), int(max(TRAIN_YEARS))],
        "test_years":         [int(min(TEST_YEARS)),  int(max(TEST_YEARS))],
        "n_train":            int(len(train_only)),
        "n_val":              int(len(val_only)),
        "n_test":             int(len(test_df)),
        "n_params":           int(n_params),
        "epochs_trained":     len(history),
        "best_val_loss":      round(float(best_val), 4),
        "test_accuracy":      round(float(acc), 4),
        "test_log_loss":      round(float(ll), 4),
        "test_epa_rmse":      round(overall_rmse, 4),
        "test_epa_mae":       round(overall_mae, 4),
        "test_epa_rmse_per_class": {k: (round(v, 4) if v is not None else None) for k, v in per_class_rmse.items()},
        "test_epa_mae_per_class":  {k: (round(v, 4) if v is not None else None) for k, v in per_class_mae.items()},
        "predicted_epa_mean_per_class": {k: round(v, 4) for k, v in epa_mean_per_class.items()},
        "labels":             LABELS,
        "class_weights":      {l: round(float(w), 4) for l, w in zip(LABELS, weights)},
        "confusion_matrix":   cm.tolist(),
        "history":            history,
    }
    with open(metrics_file, "w") as fh:
        json.dump(metrics, fh, indent=2)
    print(f"Metrics written to {metrics_file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

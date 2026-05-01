"""PLAYBOOK Phase F - held-out evaluation + portfolio plots.

Loads the trained Phase D model (sequence_unweighted.pt), re-evaluates on
the 2024-2025 held-out set, and writes:

    eval/calibration_per_class.png
    eval/epa_rmse_by_down.png
    eval/epa_predicted_vs_actual.png
    eval/eval_summary.json

The PNGs ship in the repo so they render in playbook/README.md.

Run from the playbook venv:
    python eval.py
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch

from train_sequence import (
    PlaybookLSTM, PbpDataset,
    LABELS, NUMERIC_FEATURES, BINARY_FEATURES,
    PREV_NUMERIC, _build_seq_numeric,
)
from torch.utils.data import DataLoader

ROOT       = Path(__file__).parent
DATA_FILE  = ROOT / "data" / "pbp_features.parquet"
MODEL_FILE = ROOT / "models" / "sequence_unweighted.pt"
OUT_DIR    = ROOT / "eval"

TEST_YEARS = range(2024, 2026)

CLASS_COLORS = {"RUN": "#f59e0b", "SHORT_PASS": "#3b82f6", "DEEP_PASS": "#ef4444"}

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _style():
    plt.rcParams.update({
        "figure.facecolor":  "white",
        "axes.facecolor":    "white",
        "axes.edgecolor":    "#cccccc",
        "axes.labelcolor":   "#222222",
        "axes.titlecolor":   "#111111",
        "xtick.color":       "#444444",
        "ytick.color":       "#444444",
        "axes.spines.top":   False,
        "axes.spines.right": False,
        "axes.grid":         True,
        "grid.alpha":        0.25,
        "grid.color":        "#999999",
        "font.family":       "DejaVu Sans",
        "font.size":         11,
        "savefig.dpi":       150,
        "savefig.bbox":      "tight",
    })


def evaluate(model, loader):
    model.eval()
    proba_chunks, epa_chunks, y_chunks, epa_actual_chunks = [], [], [], []
    with torch.no_grad():
        for batch in loader:
            seq_lbl, seq_num, num, binv, post, defe, y, epa_actual = (
                b.to(DEVICE, non_blocking=True) for b in batch
            )
            logits, epa_pred = model(seq_lbl, seq_num, num, binv, post, defe)
            proba_chunks.append(torch.softmax(logits, dim=1).cpu().numpy())
            epa_chunks.append(epa_pred.cpu().numpy())
            y_chunks.append(y.cpu().numpy())
            epa_actual_chunks.append(epa_actual.cpu().numpy())
    return (
        np.concatenate(proba_chunks),
        np.concatenate(epa_chunks),
        np.concatenate(y_chunks),
        np.concatenate(epa_actual_chunks),
    )


def calibration_per_class(proba: np.ndarray, y: np.ndarray, bins: int = 10):
    """For each class c, bucket predictions by P(c) and compute actual hit rate."""
    edges  = np.linspace(0.0, 1.0, bins + 1)
    out: dict[str, dict] = {}
    for c, lbl in enumerate(LABELS):
        p_c   = proba[:, c]
        is_c  = (y == c).astype(np.float32)
        mids, rates, weights = [], [], []
        for i in range(bins):
            lo, hi = edges[i], edges[i + 1]
            mask = (p_c >= lo) & (p_c < hi if i < bins - 1 else p_c <= hi)
            if mask.sum() < 50:
                continue
            mids.append(p_c[mask].mean())
            rates.append(is_c[mask].mean())
            weights.append(int(mask.sum()))
        out[lbl] = {"pred_mid": mids, "actual_rate": rates, "n": weights}
    return out


def plot_calibration(cal: dict, path: Path) -> None:
    fig, ax = plt.subplots(figsize=(6.5, 5.5))
    ax.plot([0, 1], [0, 1], color="#aaa", linestyle="--", lw=1, label="perfect")
    for lbl in LABELS:
        d = cal[lbl]
        if not d["pred_mid"]:
            continue
        sizes = [max(20, min(180, w / 50)) for w in d["n"]]
        ax.scatter(d["pred_mid"], d["actual_rate"], s=sizes, color=CLASS_COLORS[lbl],
                   alpha=0.85, edgecolor="white", linewidth=1.0,
                   label=f"{lbl.replace('_',' ')} (n={sum(d['n']):,})")
        ax.plot(d["pred_mid"], d["actual_rate"], color=CLASS_COLORS[lbl], alpha=0.6, lw=1.5)
    ax.set_xlim(0, 1); ax.set_ylim(0, 1)
    ax.set_xlabel("Predicted probability")
    ax.set_ylabel("Actual hit rate")
    ax.set_title("Calibration per class · held-out 2024–2025\n(below diagonal = under-confident · above = over-confident)")
    ax.legend(loc="upper left", frameon=False)
    fig.savefig(path)
    plt.close(fig)


def epa_rmse_by(df: pd.DataFrame, epa_pred: np.ndarray, y: np.ndarray,
                epa_actual: np.ndarray, key: str) -> dict:
    """RMSE on the called play, grouped by `key`."""
    called_epa_pred = epa_pred[np.arange(len(y)), y]
    err2 = (called_epa_pred - epa_actual) ** 2
    grp: dict[str, dict] = {}
    for k, idx in df.groupby(key, observed=True).groups.items():
        idx_arr = np.asarray(idx)
        if len(idx_arr) < 50:
            continue
        grp[str(int(k)) if pd.notna(k) else "NA"] = {
            "n": int(len(idx_arr)),
            "rmse": float(np.sqrt(err2[idx_arr].mean())),
        }
    return grp


def plot_epa_rmse_by_down(rmse_by_down: dict, overall: float, path: Path) -> None:
    keys = sorted(rmse_by_down.keys(), key=lambda k: int(k))
    rmses = [rmse_by_down[k]["rmse"] for k in keys]
    ns    = [rmse_by_down[k]["n"]    for k in keys]
    fig, ax = plt.subplots(figsize=(6.5, 4.5))
    bars = ax.bar([f"Down {k}" for k in keys], rmses,
                  color=["#10b981", "#3b82f6", "#f59e0b", "#ef4444"][:len(keys)],
                  edgecolor="white", linewidth=1)
    ax.axhline(overall, color="#222", linestyle=":", lw=1.2, label=f"overall RMSE = {overall:.3f}")
    for bar, rmse, n in zip(bars, rmses, ns):
        ax.text(bar.get_x() + bar.get_width() / 2, rmse + 0.02,
                f"{rmse:.3f}\n(n={n:,})",
                ha="center", va="bottom", fontsize=10, color="#222")
    ax.set_ylim(0, max(rmses) * 1.25)
    ax.set_ylabel("EPA RMSE on called play")
    ax.set_title("EPA prediction error by down · held-out 2024–2025")
    ax.legend(loc="upper left", frameon=False)
    fig.savefig(path)
    plt.close(fig)


def plot_epa_dist(epa_pred: np.ndarray, epa_actual: np.ndarray, y: np.ndarray, path: Path) -> None:
    """For each class: predicted EPA distribution vs actual EPA distribution
    on plays where that class was called. Reveals the deep-pass-selection-bias
    story: predicted-EPA mean for deep is +0.36, but actual deep EPAs are
    extremely bimodal."""
    fig, axes = plt.subplots(1, 3, figsize=(13.5, 4.5), sharey=True)
    edges = np.linspace(-7.5, 7.5, 61)
    for ax, c, lbl in zip(axes, range(3), LABELS):
        m = y == c
        actual = np.clip(epa_actual[m], -7.5, 7.5)
        ax.hist(actual, bins=edges, color=CLASS_COLORS[lbl], alpha=0.55,
                edgecolor="white", linewidth=0.4, density=True, label="actual")
        pred_mean = epa_pred[m, c].mean()
        actual_mean = actual.mean()
        ax.axvline(pred_mean,   color="#222",            lw=2.0, linestyle="--",
                   label=f"pred mean = {pred_mean:+.2f}")
        ax.axvline(actual_mean, color=CLASS_COLORS[lbl], lw=2.5,
                   label=f"actual mean = {actual_mean:+.2f}")
        ax.set_title(f"{lbl.replace('_', ' ')} · n = {m.sum():,}")
        ax.set_xlabel("EPA on the called play")
        if c == 0:
            ax.set_ylabel("density")
        ax.set_xlim(-7.5, 7.5)
        ax.legend(loc="upper left", frameon=False, fontsize=9)
    fig.suptitle("EPA: predicted (single number per class) vs actual (full distribution)",
                 fontsize=12, y=1.02)
    fig.savefig(path)
    plt.close(fig)


def main() -> int:
    if not MODEL_FILE.exists():
        raise SystemExit(f"Model not found: {MODEL_FILE}. Run train_sequence.py first.")
    if not DATA_FILE.exists():
        raise SystemExit(f"Features not found: {DATA_FILE}. Run fetch_pbp.py first.")

    OUT_DIR.mkdir(exist_ok=True)
    _style()

    print(f"Loading {MODEL_FILE}...")
    ckpt = torch.load(MODEL_FILE, map_location=DEVICE, weights_only=False)
    model = PlaybookLSTM(n_teams=len(ckpt["team_vocab"])).to(DEVICE)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    print(f"Loading {DATA_FILE}...")
    df = pd.read_parquet(DATA_FILE)
    df = df[df["epa"].notna() & df["season"].isin(TEST_YEARS)].reset_index(drop=True)
    print(f"Test rows: {len(df):,}")

    num_mean     = np.asarray(ckpt["num_mean"],     dtype=np.float32)
    num_std      = np.asarray(ckpt["num_std"],      dtype=np.float32)
    seq_num_mean = np.asarray(ckpt["seq_num_mean"], dtype=np.float32)
    seq_num_std  = np.asarray(ckpt["seq_num_std"],  dtype=np.float32)

    test_ds = PbpDataset(df, ckpt["team_vocab"], num_mean, num_std, seq_num_mean, seq_num_std)
    test_dl = DataLoader(test_ds, batch_size=8192, shuffle=False, pin_memory=DEVICE.type == "cuda")

    print("Running evaluation...")
    proba, epa_pred, y, epa_actual = evaluate(model, test_dl)

    cal = calibration_per_class(proba, y)
    plot_calibration(cal, OUT_DIR / "calibration_per_class.png")
    print(f"  wrote {OUT_DIR / 'calibration_per_class.png'}")

    called_epa_pred = epa_pred[np.arange(len(y)), y]
    overall_rmse = float(np.sqrt(((called_epa_pred - epa_actual) ** 2).mean()))
    rmse_by_down = epa_rmse_by(df, epa_pred, y, epa_actual, "down")
    plot_epa_rmse_by_down(rmse_by_down, overall_rmse, OUT_DIR / "epa_rmse_by_down.png")
    print(f"  wrote {OUT_DIR / 'epa_rmse_by_down.png'}")

    plot_epa_dist(epa_pred, epa_actual, y, OUT_DIR / "epa_predicted_vs_actual.png")
    print(f"  wrote {OUT_DIR / 'epa_predicted_vs_actual.png'}")

    summary = {
        "phase":              "F",
        "test_rows":          int(len(df)),
        "test_years":         [int(min(TEST_YEARS)), int(max(TEST_YEARS))],
        "overall_epa_rmse":   round(overall_rmse, 4),
        "epa_rmse_by_down":   {k: {"n": v["n"], "rmse": round(v["rmse"], 4)} for k, v in rmse_by_down.items()},
        "calibration": {
            lbl: {
                "pred_mid":    [round(float(x), 4) for x in d["pred_mid"]],
                "actual_rate": [round(float(x), 4) for x in d["actual_rate"]],
                "n":           [int(x) for x in d["n"]],
            } for lbl, d in cal.items()
        },
        "predicted_epa_mean_per_class": {
            lbl: round(float(epa_pred[y == c, c].mean()), 4) for c, lbl in enumerate(LABELS)
        },
        "actual_epa_mean_per_class": {
            lbl: round(float(epa_actual[y == c].mean()), 4) for c, lbl in enumerate(LABELS)
        },
    }
    summary_file = OUT_DIR / "eval_summary.json"
    summary_file.write_text(json.dumps(summary, indent=2))
    print(f"  wrote {summary_file}")

    print()
    print(f"Overall EPA RMSE (called play): {overall_rmse:.4f}")
    print(f"By down: {summary['epa_rmse_by_down']}")
    print(f"Predicted EPA mean per class: {summary['predicted_epa_mean_per_class']}")
    print(f"Actual EPA mean per class:    {summary['actual_epa_mean_per_class']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

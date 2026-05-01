"""PLAYBOOK Phase E - generate scenario predictions JSON for the F&I view.

Loads the trained Phase C+D model (sequence_unweighted.pt) and runs
inference on a curated list of strategic NFL game scenarios. Output goes
to F&I's data/playbook_predictions.json so the static frontend can
fetch it alongside other JSONs (no torch in the browser).

Each scenario is hand-engineered to cover a decision-relevant situation
(short-yardage 3rd down, two-minute drill, goal line, garbage time,
etc.). We use a fixed PHI/NYG team pair so the user-facing number
reflects this-situation-not-this-team coaching insight.

Run from playbook venv:
    python build_predictions.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch

from train_sequence import (
    PlaybookLSTM,
    LABELS, LABEL_VOCAB, LABEL_VOCAB_TO_IDX,
    NUMERIC_FEATURES, BINARY_FEATURES,
    PREV_LABELS, PREV_NUMERIC, SEQ_LEN,
)

ROOT       = Path(__file__).parent
MODELS_DIR = ROOT / "models"
MODEL_FILE = MODELS_DIR / "sequence_unweighted.pt"
METRICS    = MODELS_DIR / "sequence_metrics_unweighted.json"

# F&I's data dir, sibling-of-playbook. Static frontend fetches from here.
F_AND_I_DATA = ROOT.parent / "data"
OUT_FILE     = F_AND_I_DATA / "playbook_predictions.json"

DEFAULT_POSTEAM = "PHI"
DEFAULT_DEFTEAM = "NYG"

DEVICE = torch.device("cpu")


def derive_binary(state: dict) -> dict:
    yl  = state["yardline_100"]
    gs  = state["game_seconds_remaining"]
    sd  = state["score_differential"]
    return {
        "is_red_zone":      int(yl <= 20),
        "is_goal_line":     int(yl <= 5),
        "is_two_minute":    int(gs < 120 and state["qtr"] in (2, 4)),
        "is_third_down":    int(state["down"] == 3),
        "is_fourth_down":   int(state["down"] == 4),
        "is_short_yardage": int(state["ydstogo"] <= 2),
        "is_long_yardage":  int(state["ydstogo"] >= 8),
        "is_garbage_time":  int(abs(sd) > 21),
    }


def make_scenario(id: str, name: str, description: str, **overrides) -> dict:
    base = {
        "down": 1, "ydstogo": 10, "yardline_100": 75,
        "score_differential": 0, "qtr": 2,
        "quarter_seconds_remaining": 600, "game_seconds_remaining": 1500,
        "posteam_timeouts_remaining": 3, "defteam_timeouts_remaining": 3,
        "shotgun": 0, "no_huddle": 0, "is_home": 1,
        "prev_play_label":    ["NONE"] * SEQ_LEN,
        "prev_yards_gained":  [0.0]    * SEQ_LEN,
        "prev_epa":           [0.0]    * SEQ_LEN,
    }
    base.update(overrides)
    base["id"] = id
    base["name"] = name
    base["description"] = description
    return base


SCENARIOS = [
    make_scenario(
        "drive-opener", "1st & 10 from own 25",
        "Standard drive opener after a touchback. Tied game, early 2nd quarter.",
    ),
    make_scenario(
        "midfield-1st", "1st & 10 at midfield",
        "Drive into opponent territory. Neutral score, run/pass balance test.",
        yardline_100=50,
    ),
    make_scenario(
        "2nd-medium", "2nd & 7 at own 35",
        "Standard medium-yards 2nd down. Pass-leaning across the league.",
        down=2, ydstogo=7, yardline_100=65,
    ),
    make_scenario(
        "2nd-long", "2nd & 14 at own 25",
        "Pass-down territory after a sack or TFL. Deep threat increases.",
        down=2, ydstogo=14, yardline_100=75, shotgun=1,
    ),
    make_scenario(
        "3rd-short", "3rd & 1 at midfield",
        "Conversion situation — short yardage rewards the run.",
        down=3, ydstogo=1, yardline_100=50,
    ),
    make_scenario(
        "3rd-medium", "3rd & 4 at own 35",
        "Balanced 3rd down. Most teams pass to the sticks.",
        down=3, ydstogo=4, yardline_100=65, shotgun=1,
    ),
    make_scenario(
        "3rd-long", "3rd & 8 at opponent 40",
        "Passing down. Deep threat real if the matchup invites it.",
        down=3, ydstogo=8, yardline_100=40, shotgun=1,
    ),
    make_scenario(
        "3rd-very-long", "3rd & 12 at own 25",
        "Almost certainly passing. Look for deep over short.",
        down=3, ydstogo=12, yardline_100=75, shotgun=1,
    ),
    make_scenario(
        "4th-short", "4th & 1 at opponent 35",
        "Aggressive coaches go for it. The model sees what tendencies say.",
        down=4, ydstogo=1, yardline_100=35,
    ),
    make_scenario(
        "goal-line-5", "1st & goal at 5",
        "Red zone scoring opportunity. Run rate elevates near the goal line.",
        yardline_100=5, ydstogo=5,
    ),
    make_scenario(
        "goal-line-1", "1st & goal at 1",
        "Goal-to-go from the 1. Heaviest run rate situation in football.",
        yardline_100=1, ydstogo=1,
    ),
    make_scenario(
        "two-minute-down-7", "1st & 10, two-minute drill, down 7",
        "Late 4th, must score a TD. Pace and pass rate spike.",
        qtr=4, ydstogo=10, yardline_100=70,
        quarter_seconds_remaining=110, game_seconds_remaining=110,
        score_differential=-7, shotgun=1, no_huddle=1,
    ),
    make_scenario(
        "garbage-time", "1st & 10, down 28, mid 4th quarter",
        "Garbage time. Trailing team passes; winning defense sits coverage.",
        qtr=4, score_differential=-28, yardline_100=70,
        quarter_seconds_remaining=400, game_seconds_remaining=400,
        shotgun=1,
    ),
]


def state_to_tensors(state: dict, ckpt: dict) -> dict:
    team_vocab    = ckpt["team_vocab"]
    num_mean      = np.asarray(ckpt["num_mean"],     dtype=np.float32)
    num_std       = np.asarray(ckpt["num_std"],      dtype=np.float32)
    seq_num_mean  = np.asarray(ckpt["seq_num_mean"], dtype=np.float32)
    seq_num_std   = np.asarray(ckpt["seq_num_std"],  dtype=np.float32)

    derived = derive_binary(state)

    num = np.array([float(state[f]) for f in NUMERIC_FEATURES], dtype=np.float32)
    num = (num - num_mean) / np.where(num_std > 0, num_std, 1.0)

    bin_vals = []
    for f in BINARY_FEATURES:
        if f in state:
            bin_vals.append(float(state[f]))
        elif f in derived:
            bin_vals.append(float(derived[f]))
        else:
            bin_vals.append(0.0)
    bin_arr = np.array(bin_vals, dtype=np.float32)

    # Reverse so oldest play is at index 0.
    labels_rev = list(reversed(state["prev_play_label"]))
    yards_rev  = list(reversed(state["prev_yards_gained"]))
    epa_rev    = list(reversed(state["prev_epa"]))

    seq_lbl = np.array([LABEL_VOCAB_TO_IDX.get(l, 0) for l in labels_rev], dtype=np.int64)
    seq_num = np.stack([
        np.array(yards_rev, dtype=np.float32),
        np.array(epa_rev,   dtype=np.float32),
    ], axis=1)
    seq_num = (seq_num - seq_num_mean) / np.where(seq_num_std > 0, seq_num_std, 1.0)

    posteam_idx = team_vocab.get(DEFAULT_POSTEAM, 0)
    defteam_idx = team_vocab.get(DEFAULT_DEFTEAM, 0)

    return {
        "seq_lbl":     torch.from_numpy(seq_lbl),
        "seq_num":     torch.from_numpy(seq_num.astype(np.float32)),
        "num":         torch.from_numpy(num.astype(np.float32)),
        "bin":         torch.from_numpy(bin_arr),
        "posteam_idx": torch.tensor(posteam_idx, dtype=torch.long),
        "defteam_idx": torch.tensor(defteam_idx, dtype=torch.long),
    }


def predict_scenario(model, state: dict, ckpt: dict) -> tuple[np.ndarray, np.ndarray]:
    t = state_to_tensors(state, ckpt)
    with torch.no_grad():
        logits, epa_pred = model(
            t["seq_lbl"].unsqueeze(0),
            t["seq_num"].unsqueeze(0),
            t["num"].unsqueeze(0),
            t["bin"].unsqueeze(0),
            t["posteam_idx"].unsqueeze(0),
            t["defteam_idx"].unsqueeze(0),
        )
        proba = torch.softmax(logits, dim=1).squeeze(0).numpy()
        epa   = epa_pred.squeeze(0).numpy()
    return proba, epa


def main() -> int:
    if not MODEL_FILE.exists():
        raise SystemExit(f"Model not found: {MODEL_FILE}. Train Phase C+D first.")

    print(f"Loading {MODEL_FILE}...")
    ckpt = torch.load(MODEL_FILE, map_location=DEVICE, weights_only=False)
    model = PlaybookLSTM(n_teams=len(ckpt["team_vocab"])).to(DEVICE)
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    metrics_blob = json.loads(METRICS.read_text()) if METRICS.exists() else {}

    out = {
        "version":     "1",
        "model":       "lstm_multitask_epa",
        "labels":      LABELS,
        "team_pair":   {"posteam": DEFAULT_POSTEAM, "defteam": DEFAULT_DEFTEAM},
        "metrics": {
            "test_accuracy":  metrics_blob.get("test_accuracy"),
            "test_log_loss":  metrics_blob.get("test_log_loss"),
            "test_epa_rmse":  metrics_blob.get("test_epa_rmse"),
            "test_epa_mae":   metrics_blob.get("test_epa_mae"),
            "train_years":    metrics_blob.get("train_years"),
            "test_years":     metrics_blob.get("test_years"),
        },
        "scenarios":   [],
    }

    for sc in SCENARIOS:
        proba, epa = predict_scenario(model, sc, ckpt)
        out["scenarios"].append({
            "id":          sc["id"],
            "name":        sc["name"],
            "description": sc["description"],
            "state": {
                k: sc[k] for k in (
                    "down", "ydstogo", "yardline_100", "score_differential",
                    "qtr", "quarter_seconds_remaining", "game_seconds_remaining",
                    "shotgun", "no_huddle",
                )
            },
            "predictions": {
                lbl: {
                    "prob": round(float(proba[i]), 4),
                    "epa":  round(float(epa[i]),   4),
                }
                for i, lbl in enumerate(LABELS)
            },
        })

    F_AND_I_DATA.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, indent=2))
    print(f"Wrote {len(SCENARIOS)} scenarios to {OUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

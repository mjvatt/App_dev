"""PLAYBOOK Phase B - LightGBM tabular baseline.

Loads data/pbp_features.parquet, splits chronologically (train 1999-2023,
test 2024-2025), trains a 3-class LightGBM classifier, and reports
held-out metrics. Categoricals are passed natively to LightGBM via the
category dtype - no one-hot encoding.

Establishes the accuracy and log-loss floor that Phase C (LSTM) must beat.

Run from the playbook venv:
    python -m playbook.train_baseline
or:
    python train_baseline.py
"""

from __future__ import annotations

import json
import pickle
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    log_loss,
)

ROOT       = Path(__file__).parent
DATA_FILE  = ROOT / "data" / "pbp_features.parquet"
MODELS_DIR = ROOT / "models"
MODEL_FILE = MODELS_DIR / "baseline.pkl"
METRICS    = MODELS_DIR / "baseline_metrics.json"

TRAIN_YEARS = range(1999, 2024)
TEST_YEARS  = range(2024, 2026)

LABELS       = ["RUN", "SHORT_PASS", "DEEP_PASS"]
LABEL_TO_IDX = {lbl: i for i, lbl in enumerate(LABELS)}

NUMERIC_FEATURES = [
    "down", "ydstogo", "yardline_100", "score_differential",
    "qtr", "quarter_seconds_remaining", "game_seconds_remaining",
    "posteam_timeouts_remaining", "defteam_timeouts_remaining",
]

# is_scramble / is_sack are POST-PLAY outcomes - excluded to avoid leakage.
# They remain on each row for downstream phases (e.g., history-based pressure
# signal: did the prior 5 plays include a sack).
BINARY_FEATURES = [
    "shotgun", "no_huddle",
    "is_red_zone", "is_goal_line", "is_two_minute",
    "is_third_down", "is_fourth_down",
    "is_short_yardage", "is_long_yardage", "is_garbage_time",
    "is_home",
]

CATEGORICAL_FEATURES = [
    "posteam", "defteam",
    "prev_play_label_1", "prev_play_label_2", "prev_play_label_3",
    "prev_play_label_4", "prev_play_label_5",
]

ALL_FEATURES = NUMERIC_FEATURES + BINARY_FEATURES + CATEGORICAL_FEATURES

LGB_PARAMS = {
    "objective":        "multiclass",
    "num_class":        len(LABELS),
    "metric":           "multi_logloss",
    "learning_rate":    0.05,
    "num_leaves":       63,
    "min_data_in_leaf": 200,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.9,
    "bagging_freq":     5,
    "verbose":          -1,
    "seed":             42,
}

NUM_BOOST_ROUND       = 500
EARLY_STOPPING_ROUNDS = 20


def prepare(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    X = df[ALL_FEATURES].copy()
    for c in CATEGORICAL_FEATURES:
        X[c] = X[c].astype("category")
    y = df["play_label"].map(LABEL_TO_IDX).astype("int8")
    return X, y


def main() -> int:
    print(f"Loading {DATA_FILE}...")
    df = pd.read_parquet(DATA_FILE)

    train_df = df[df["season"].isin(TRAIN_YEARS)].reset_index(drop=True)
    test_df  = df[df["season"].isin(TEST_YEARS)].reset_index(drop=True)
    print(f"Train: {len(train_df):,} rows ({train_df['season'].min()}-{train_df['season'].max()})")
    print(f"Test : {len(test_df):,} rows ({test_df['season'].min()}-{test_df['season'].max()})")

    X_train, y_train = prepare(train_df)
    X_test,  y_test  = prepare(test_df)

    # Last 10% of train chronologically = validation set for early stopping.
    val_size = len(X_train) // 10
    X_tr, X_val = X_train.iloc[:-val_size], X_train.iloc[-val_size:]
    y_tr, y_val = y_train.iloc[:-val_size], y_train.iloc[-val_size:]

    train_ds = lgb.Dataset(X_tr,  y_tr,  categorical_feature=CATEGORICAL_FEATURES)
    val_ds   = lgb.Dataset(X_val, y_val, categorical_feature=CATEGORICAL_FEATURES, reference=train_ds)

    print("Training LightGBM...")
    t0 = time.time()
    model = lgb.train(
        LGB_PARAMS,
        train_ds,
        num_boost_round=NUM_BOOST_ROUND,
        valid_sets=[train_ds, val_ds],
        valid_names=["train", "val"],
        callbacks=[
            lgb.early_stopping(EARLY_STOPPING_ROUNDS),
            lgb.log_evaluation(50),
        ],
    )
    train_secs = time.time() - t0
    print(f"Training: {train_secs:.1f}s, best iter = {model.best_iteration}")

    y_pred_proba = model.predict(X_test, num_iteration=model.best_iteration)
    y_pred       = np.argmax(y_pred_proba, axis=1)

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
    with open(MODEL_FILE, "wb") as fh:
        pickle.dump({
            "model":           model,
            "labels":          LABELS,
            "features":        ALL_FEATURES,
            "categorical":     CATEGORICAL_FEATURES,
            "best_iteration":  model.best_iteration,
        }, fh)
    print(f"\nModel pickled to {MODEL_FILE}")

    metrics = {
        "phase":             "B",
        "model":             "lightgbm_multiclass",
        "train_years":       [int(min(TRAIN_YEARS)), int(max(TRAIN_YEARS))],
        "test_years":        [int(min(TEST_YEARS)),  int(max(TEST_YEARS))],
        "n_train":           int(len(train_df)),
        "n_test":            int(len(test_df)),
        "best_iteration":    int(model.best_iteration),
        "training_seconds":  round(train_secs, 1),
        "test_accuracy":     float(acc),
        "test_log_loss":     float(ll),
        "labels":            LABELS,
        "confusion_matrix":  cm.tolist(),
        "feature_importance": {
            f: int(g) for f, g in zip(ALL_FEATURES, model.feature_importance(importance_type="gain"))
        },
    }
    with open(METRICS, "w") as fh:
        json.dump(metrics, fh, indent=2)
    print(f"Metrics written to {METRICS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

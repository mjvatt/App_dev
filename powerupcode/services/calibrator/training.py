"""Training pipeline for the Phase 2 trained calibrator.

Pure data + fit + eval functions. The CLI in ``scripts/train_calibrator.py``
wires DB access on top; everything here is testable in isolation.

Pipeline:
    raw attempts -> aggregate per challenge -> build (X, y_rate, y_time)
    -> fit two regressors -> persist (model_rate, model_time, feature_names).

A synthetic-attempt generator is included so the pipeline works before
~1000 real attempts exist (the floor where the trained model becomes
worth shipping). Synthetic data uses HeuristicPredictor as the truth
plus controlled noise — useful for validating wiring, NOT for putting
predictions in front of users.
"""
from __future__ import annotations

import statistics
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from services.calibrator.features import Features, extract_features
from services.calibrator.predictor import HeuristicPredictor, Prediction
from services.engine.interface import ChallengeData

PredictFn = Callable[[ChallengeData], Prediction]

if TYPE_CHECKING:  # avoid hard dep at import time
    from sklearn.ensemble import GradientBoostingRegressor


# Floor below which we refuse to fit — too few attempts produces a model
# that fits noise. Mirrors the "~1000 attempts" guidance in the roadmap
# but applied per challenge: each challenge needs at least this many
# attempts before its aggregate is reliable enough to use as a target.
MIN_ATTEMPTS_PER_CHALLENGE = 5


# Stable feature column order. Pinned here (rather than inferred from a
# Features instance) so artifact files trained at one commit can be loaded
# and applied at any later commit that adds new feature columns at the
# end of the list. Reordering or renaming is a breaking change that
# requires retraining and bumping TRAINED_MODEL_VERSION.
FEATURE_COLUMNS: tuple[str, ...] = (
    "prompt_length",
    "constraint_count",
    "example_count",
    "max_constraint_power",
    "has_dp_keyword",
    "has_graph_keyword",
    "has_design_keyword",
    "has_complexity_hint",
)


@dataclass(frozen=True)
class Attempt:
    """Minimal attempt projection for the calibrator. The training CLI
    builds these from ``attempts`` rows (challenge_id, passed, time_ms)
    so the rest of this module is DB-agnostic."""
    challenge_id: str
    passed: bool
    time_ms: int


@dataclass(frozen=True)
class ChallengeAggregate:
    """Per-challenge target distilled from N attempts."""
    challenge_id: str
    n_attempts: int
    solve_rate: float
    median_time_ms: int


@dataclass(frozen=True)
class TrainingMatrix:
    """Aligned arrays for fit_models. ``feature_names`` is included so the
    artifact records the exact columns the model was trained on."""
    X: list[list[float]]
    y_rate: list[float]
    y_time: list[int]
    feature_names: tuple[str, ...]
    challenge_ids: list[str]


@dataclass
class TrainedModels:
    """Two fitted regressors plus the columns they expect at predict time.
    Persisted as a single artifact via joblib so loading is one call."""
    model_rate: GradientBoostingRegressor
    model_time: GradientBoostingRegressor
    feature_names: tuple[str, ...]
    n_train: int = 0
    eval_metrics: dict[str, float] = field(default_factory=dict)


# ── Aggregation ──────────────────────────────────────────────────────────


def aggregate_attempts(
    attempts: Iterable[Attempt],
    *,
    min_attempts_per_challenge: int = MIN_ATTEMPTS_PER_CHALLENGE,
) -> list[ChallengeAggregate]:
    """Collapse raw attempts into one row per challenge.

    Drops challenges with fewer than ``min_attempts_per_challenge``
    attempts (their aggregates are too noisy to use as targets). Uses
    median time so a single 4-hour wall-clock outlier doesn't pull the
    target away from the typical solve time.
    """
    by_challenge: dict[str, list[Attempt]] = {}
    for a in attempts:
        by_challenge.setdefault(a.challenge_id, []).append(a)

    out: list[ChallengeAggregate] = []
    for cid, rows in by_challenge.items():
        if len(rows) < min_attempts_per_challenge:
            continue
        passed = sum(1 for r in rows if r.passed)
        # Time-to-solve is only meaningful for passing attempts; failed
        # attempts often abandoned mid-stream and don't represent a true
        # solve duration. Falls back to all attempts if nobody passed.
        passing_times = [r.time_ms for r in rows if r.passed and r.time_ms > 0]
        all_times = [r.time_ms for r in rows if r.time_ms > 0]
        time_pool = passing_times or all_times
        median_time = int(statistics.median(time_pool)) if time_pool else 0
        out.append(
            ChallengeAggregate(
                challenge_id=cid,
                n_attempts=len(rows),
                solve_rate=passed / len(rows),
                median_time_ms=median_time,
            )
        )
    return out


def build_training_matrix(
    challenges: Sequence[ChallengeData],
    aggregates: Sequence[ChallengeAggregate],
) -> TrainingMatrix:
    """Inner-join challenges and aggregates by id, extract features, return
    aligned (X, y_rate, y_time). Order is by aggregate iteration order."""
    by_id = {c.id: c for c in challenges}
    X: list[list[float]] = []
    y_rate: list[float] = []
    y_time: list[int] = []
    cids: list[str] = []
    for agg in aggregates:
        challenge = by_id.get(agg.challenge_id)
        if challenge is None:
            continue
        feats = extract_features(challenge)
        X.append(_feature_row(feats))
        y_rate.append(agg.solve_rate)
        y_time.append(agg.median_time_ms)
        cids.append(challenge.id)
    return TrainingMatrix(
        X=X, y_rate=y_rate, y_time=y_time,
        feature_names=FEATURE_COLUMNS, challenge_ids=cids,
    )


def _feature_row(feats: Features) -> list[float]:
    fdict = feats.as_dict()
    return [fdict[name] for name in FEATURE_COLUMNS]


# ── Synthetic attempts (pre-real-data scaffolding) ──────────────────────


def synthesize_attempts(
    challenges: Sequence[ChallengeData],
    *,
    n_per_challenge: int = 20,
    rate_noise: float = 0.08,
    time_noise: float = 0.25,
    seed: int = 0,
) -> list[Attempt]:
    """Generate plausible attempts by drawing from the heuristic predictor
    plus Gaussian noise. Only useful for validating that the training
    pipeline runs end-to-end before real attempts data exists — a model
    fit on synthetic data is approximately the heuristic and should not
    be served to users."""
    import random
    rng = random.Random(seed)
    heuristic = HeuristicPredictor()
    out: list[Attempt] = []
    for c in challenges:
        pred = heuristic.predict(c)
        # Per-challenge offset so synthetic attempts cluster around a
        # slightly-different-than-heuristic truth. Otherwise the trained
        # model would just rediscover the heuristic exactly.
        rate_offset = rng.gauss(0.0, rate_noise)
        time_mult = max(0.4, 1.0 + rng.gauss(0.0, time_noise))
        true_rate = max(0.02, min(0.98, pred.solve_rate + rate_offset))
        true_time = max(30_000, int(pred.time_ms * time_mult))
        for _ in range(n_per_challenge):
            passed = rng.random() < true_rate
            jitter = max(0.4, rng.gauss(1.0, 0.30))
            out.append(Attempt(
                challenge_id=c.id,
                passed=passed,
                time_ms=int(true_time * jitter) if passed else int(true_time * jitter * 0.6),
            ))
    return out


# ── Fitting ─────────────────────────────────────────────────────────────


def fit_models(
    matrix: TrainingMatrix,
    *,
    n_estimators: int = 200,
    max_depth: int = 3,
    learning_rate: float = 0.05,
    random_state: int = 42,
) -> TrainedModels:
    """Fit two GradientBoostingRegressors — one for solve_rate, one for
    time_ms — on the same X. Two separate models (rather than a single
    multi-output) keep hyperparameters tunable per-target and make the
    artifact easier to introspect."""
    if not matrix.X:
        raise ValueError("Cannot fit on empty matrix — no challenges had enough attempts")

    from sklearn.ensemble import GradientBoostingRegressor

    common = {
        "n_estimators": n_estimators,
        "max_depth": max_depth,
        "learning_rate": learning_rate,
        "random_state": random_state,
    }
    model_rate = GradientBoostingRegressor(**common)
    model_time = GradientBoostingRegressor(**common)
    model_rate.fit(matrix.X, matrix.y_rate)
    model_time.fit(matrix.X, matrix.y_time)

    return TrainedModels(
        model_rate=model_rate,
        model_time=model_time,
        feature_names=matrix.feature_names,
        n_train=len(matrix.X),
    )


# ── Evaluation ──────────────────────────────────────────────────────────


def evaluate_predictor(
    predict_fn: PredictFn,
    challenges: Sequence[ChallengeData],
    aggregates: Sequence[ChallengeAggregate],
) -> dict[str, float]:
    """Compare a predictor's outputs against held-out aggregates. Returns
    MAE / RMSE / R² for both targets. ``predict_fn`` is anything callable
    with a ChallengeData that returns a Prediction — pass either
    HeuristicPredictor().predict or a TrainedPredictor instance's predict
    so the same harness can score both."""
    by_id = {c.id: c for c in challenges}
    pairs: list[tuple[Prediction, ChallengeAggregate]] = []
    for agg in aggregates:
        c = by_id.get(agg.challenge_id)
        if c is None:
            continue
        pairs.append((predict_fn(c), agg))
    if not pairs:
        return {}

    rate_err = [p.solve_rate - a.solve_rate for p, a in pairs]
    time_err = [p.time_ms - a.median_time_ms for p, a in pairs]

    return {
        "n":            float(len(pairs)),
        "rate_mae":     _mae(rate_err),
        "rate_rmse":    _rmse(rate_err),
        "rate_r2":      _r2([a.solve_rate for _, a in pairs],
                            [p.solve_rate for p, _ in pairs]),
        "time_mae_ms":  _mae(time_err),
        "time_rmse_ms": _rmse(time_err),
        "time_r2":      _r2([a.median_time_ms for _, a in pairs],
                            [p.time_ms for p, _ in pairs]),
    }


def _mae(errors: Sequence[float]) -> float:
    return sum(abs(e) for e in errors) / len(errors)


def _rmse(errors: Sequence[float]) -> float:
    return float((sum(e * e for e in errors) / len(errors)) ** 0.5)


def _r2(actual: Sequence[float], predicted: Sequence[float]) -> float:
    """Coefficient of determination. Returns 0.0 (rather than NaN) when
    the actual values are flat — a flat target has R² undefined and
    treating it as zero matches sklearn's behavior on the same case."""
    if not actual:
        return 0.0
    mean_actual = sum(actual) / len(actual)
    ss_tot = sum((a - mean_actual) ** 2 for a in actual)
    if ss_tot == 0:
        return 0.0
    ss_res = sum((a - p) ** 2 for a, p in zip(actual, predicted))
    return 1.0 - ss_res / ss_tot

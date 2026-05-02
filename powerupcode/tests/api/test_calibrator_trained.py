"""Tests for the Phase 2 trained calibrator pipeline.

Pure-logic suite. Skipped wholesale if scikit-learn is not installed
(install with: pip install -e ".[calibrator]"). Covers:

  - aggregate_attempts: per-challenge solve rate, median time, drop floor
  - synthesize_attempts: shape, reproducibility under seed
  - build_training_matrix: row alignment, FEATURE_COLUMNS order
  - fit_models: returns sklearn regressors that can predict
  - TrainedPredictor: same Prediction shape as the heuristic; clamps
    extreme outputs; refuses mismatched feature columns
  - End-to-end: synthesize -> aggregate -> fit -> predict round-trip
  - Persist + load round-trip via joblib
  - evaluate_predictor: returns the expected metric keys
"""
from __future__ import annotations

import pytest

# Skip the whole file when sklearn is missing rather than failing at
# collection. The heuristic test suite carries the contract this module
# extends; the trained-calibrator pipeline is opt-in via the calibrator
# dep group.
sklearn = pytest.importorskip("sklearn")  # noqa: F841

from pathlib import Path  # noqa: E402

from services.calibrator.predictor import HeuristicPredictor, Prediction  # noqa: E402
from services.calibrator.trained import (  # noqa: E402
    TRAINED_MODEL_VERSION,
    TrainedPredictor,
    load_trained_models,
    save_trained_models,
)
from services.calibrator.training import (  # noqa: E402
    FEATURE_COLUMNS,
    Attempt,
    TrainedModels,
    aggregate_attempts,
    build_training_matrix,
    evaluate_predictor,
    fit_models,
    synthesize_attempts,
)
from services.engine.interface import ChallengeData, Difficulty, Topic  # noqa: E402


def _challenge(
    cid: str = "c1",
    *,
    difficulty: Difficulty = Difficulty.MEDIUM,
    topic: Topic = Topic.ARRAYS,
    prompt: str = "Solve a focused problem about an array.",
    constraints: list[str] | None = None,
    examples_count: int = 2,
) -> ChallengeData:
    return ChallengeData(
        id=cid,
        topic=topic,
        difficulty=difficulty,
        title="Test",
        prompt=prompt,
        constraints=constraints if constraints is not None else ["1 <= n <= 10^4"],
        examples=[{"input": f"i{i}", "output": f"o{i}"} for i in range(examples_count)],
    )


def _spread_challenges() -> list[ChallengeData]:
    """Variety pack across tiers + topics so the model has signal to learn."""
    return [
        _challenge("e1", difficulty=Difficulty.EASY,
                   prompt="Find a value in an array. " + "x" * 100),
        _challenge("e2", difficulty=Difficulty.EASY,
                   prompt="Sum array elements. " + "y" * 50),
        _challenge("m1", difficulty=Difficulty.MEDIUM,
                   prompt="Subarray with target sum. " + "z" * 600),
        _challenge("m2", difficulty=Difficulty.MEDIUM,
                   prompt="Find longest subsequence. " + "p" * 800,
                   constraints=["1 <= n <= 10^5", "1 <= a_i <= 10^9"]),
        _challenge("h1", difficulty=Difficulty.HARD,
                   prompt="Min cost edit distance partition. " + "q" * 1200,
                   constraints=["1 <= n <= 10^5", "k <= 10^4"]),
        _challenge("h2", difficulty=Difficulty.HARD,
                   prompt="Shortest path on weighted graph. " + "r" * 1300,
                   constraints=["1 <= n <= 10^5"], topic=Topic.GRAPHS),
        _challenge("b1", difficulty=Difficulty.BOSS,
                   prompt="Design a system with throughput and latency. " + "s" * 1800,
                   constraints=[
                       "throughput >= 10^6", "latency p99 <= 50ms",
                       "1 <= n <= 10^7", "scale 100 nodes",
                   ]),
        _challenge("b2", difficulty=Difficulty.BOSS,
                   prompt="System design under consistency. " + "t" * 2000,
                   constraints=["throughput >= 10^6", "1 <= n <= 10^7"]),
    ]


# ── aggregate_attempts ──────────────────────────────────────────────────


def test_aggregate_attempts_computes_solve_rate_and_median_time() -> None:
    attempts = [
        Attempt("c1", passed=True,  time_ms=10_000),
        Attempt("c1", passed=True,  time_ms=20_000),
        Attempt("c1", passed=False, time_ms=99_000),
        Attempt("c1", passed=True,  time_ms=15_000),
        Attempt("c1", passed=True,  time_ms=12_000),
    ]
    out = aggregate_attempts(attempts, min_attempts_per_challenge=3)
    assert len(out) == 1
    agg = out[0]
    assert agg.challenge_id == "c1"
    assert agg.n_attempts == 5
    assert abs(agg.solve_rate - 0.8) < 1e-9
    # Median of passing times {10k, 12k, 15k, 20k} = 13.5k
    assert agg.median_time_ms == 13_500


def test_aggregate_attempts_drops_below_floor() -> None:
    attempts = [
        Attempt("c1", passed=True, time_ms=1_000),
        Attempt("c2", passed=True, time_ms=1_000),
        Attempt("c2", passed=True, time_ms=1_000),
        Attempt("c2", passed=True, time_ms=1_000),
    ]
    out = aggregate_attempts(attempts, min_attempts_per_challenge=3)
    cids = {a.challenge_id for a in out}
    assert cids == {"c2"}


def test_aggregate_attempts_falls_back_to_all_when_nobody_passed() -> None:
    attempts = [Attempt("c1", passed=False, time_ms=t) for t in (5_000, 10_000, 15_000)]
    out = aggregate_attempts(attempts, min_attempts_per_challenge=3)
    assert len(out) == 1
    assert out[0].solve_rate == 0.0
    # Median of failing times since no one passed
    assert out[0].median_time_ms == 10_000


# ── synthesize_attempts ─────────────────────────────────────────────────


def test_synthesize_attempts_is_reproducible_under_seed() -> None:
    challenges = _spread_challenges()
    a1 = synthesize_attempts(challenges, n_per_challenge=10, seed=42)
    a2 = synthesize_attempts(challenges, n_per_challenge=10, seed=42)
    assert len(a1) == len(a2) == 10 * len(challenges)
    assert all(x == y for x, y in zip(a1, a2))


def test_synthesize_attempts_respects_per_challenge_count() -> None:
    challenges = _spread_challenges()
    out = synthesize_attempts(challenges, n_per_challenge=7, seed=0)
    assert len(out) == 7 * len(challenges)


# ── build_training_matrix ───────────────────────────────────────────────


def test_build_training_matrix_aligns_rows_and_uses_feature_columns_order() -> None:
    challenges = _spread_challenges()
    attempts = synthesize_attempts(challenges, n_per_challenge=10, seed=1)
    aggregates = aggregate_attempts(attempts, min_attempts_per_challenge=5)
    matrix = build_training_matrix(challenges, aggregates)
    assert len(matrix.X) == len(matrix.y_rate) == len(matrix.y_time)
    assert len(matrix.X[0]) == len(FEATURE_COLUMNS)
    assert matrix.feature_names == FEATURE_COLUMNS


# ── fit_models + end-to-end ─────────────────────────────────────────────


def test_fit_models_round_trip_predict() -> None:
    challenges = _spread_challenges()
    attempts = synthesize_attempts(challenges, n_per_challenge=20, seed=7)
    aggregates = aggregate_attempts(attempts, min_attempts_per_challenge=5)
    matrix = build_training_matrix(challenges, aggregates)
    models = fit_models(matrix, n_estimators=50, max_depth=3, random_state=7)

    predictor = TrainedPredictor(models)
    pred = predictor.predict(challenges[0])
    assert isinstance(pred, Prediction)
    assert pred.model_version == TRAINED_MODEL_VERSION
    assert 0.02 <= pred.solve_rate <= 0.95
    assert pred.time_ms >= 30_000


def test_fit_models_rejects_empty_matrix() -> None:
    challenges = _spread_challenges()
    aggregates: list = []
    matrix = build_training_matrix(challenges, aggregates)
    with pytest.raises(ValueError, match="empty matrix"):
        fit_models(matrix)


def test_trained_predictor_rejects_mismatched_feature_columns() -> None:
    # Hand-build a TrainedModels whose feature_names disagree with the
    # current FEATURE_COLUMNS list. Construction must fail loudly so a
    # silently-mismatched prediction can't reach a consumer.
    from sklearn.ensemble import GradientBoostingRegressor

    bogus = TrainedModels(
        model_rate=GradientBoostingRegressor(),
        model_time=GradientBoostingRegressor(),
        feature_names=("only_one",),
    )
    with pytest.raises(ValueError, match="feature_names"):
        TrainedPredictor(bogus)


def test_trained_models_persist_round_trip(tmp_path: Path) -> None:
    challenges = _spread_challenges()
    attempts = synthesize_attempts(challenges, n_per_challenge=15, seed=3)
    aggregates = aggregate_attempts(attempts, min_attempts_per_challenge=5)
    matrix = build_training_matrix(challenges, aggregates)
    models = fit_models(matrix, n_estimators=40, max_depth=2, random_state=3)

    artifact = tmp_path / "tc.joblib"
    save_trained_models(models, artifact)
    assert artifact.exists()
    reloaded = load_trained_models(artifact)
    assert reloaded.feature_names == FEATURE_COLUMNS

    p_orig = TrainedPredictor(models).predict(challenges[0])
    p_load = TrainedPredictor(reloaded).predict(challenges[0])
    assert abs(p_orig.solve_rate - p_load.solve_rate) < 1e-9
    assert p_orig.time_ms == p_load.time_ms


def test_load_trained_models_missing_artifact_raises_helpful_error(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="train_calibrator.py"):
        load_trained_models(tmp_path / "nope.joblib")


# ── evaluate_predictor ──────────────────────────────────────────────────


def test_evaluate_predictor_returns_expected_metric_keys() -> None:
    challenges = _spread_challenges()
    attempts = synthesize_attempts(challenges, n_per_challenge=10, seed=11)
    aggregates = aggregate_attempts(attempts, min_attempts_per_challenge=5)

    metrics = evaluate_predictor(HeuristicPredictor().predict, challenges, aggregates)
    for key in ("n", "rate_mae", "rate_rmse", "rate_r2",
                "time_mae_ms", "time_rmse_ms", "time_r2"):
        assert key in metrics
    assert metrics["n"] == float(len(aggregates))


def test_evaluate_predictor_handles_empty() -> None:
    challenges = _spread_challenges()
    metrics = evaluate_predictor(HeuristicPredictor().predict, challenges, [])
    assert metrics == {}

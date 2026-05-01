"""Tests for the v0 difficulty calibrator.

Pure-logic suite. The Phase 2 trained model will replace the
HeuristicPredictor at the same interface; these tests pin the
contract (Prediction shape, tier-bucketing logic, monotonicity of
the heuristic adjustments) so the swap-in stays type-safe.
"""
from services.calibrator import (
    HEURISTIC_MODEL_VERSION,
    HeuristicPredictor,
    Prediction,
    declared_vs_predicted_tier_gap,
    solve_rate_to_tier,
)
from services.calibrator.features import extract_features
from services.engine.interface import ChallengeData, Difficulty, Topic


def _challenge(
    *,
    difficulty: Difficulty = Difficulty.MEDIUM,
    topic: Topic = Topic.ARRAYS,
    prompt: str = "Solve a small focused problem about an array.",
    constraints: list[str] | None = None,
    examples_count: int = 2,
) -> ChallengeData:
    return ChallengeData(
        id="test",
        topic=topic,
        difficulty=difficulty,
        title="Test",
        prompt=prompt,
        constraints=constraints if constraints is not None else ["1 <= n <= 10^4"],
        examples=[{"input": f"i{i}", "output": f"o{i}"} for i in range(examples_count)],
    )


# ---- features --------------------------------------------------------


def test_features_count_constraints_and_examples() -> None:
    f = extract_features(
        _challenge(
            constraints=["a", "b", "c"],
            examples_count=4,
        )
    )
    assert f.constraint_count == 3
    assert f.example_count == 4


def test_features_max_constraint_power_parses_caret_notation() -> None:
    f = extract_features(_challenge(constraints=["1 <= n <= 10^5", "k <= 10^3"]))
    assert f.max_constraint_power == 5


def test_features_max_constraint_power_falls_back_to_plain_int() -> None:
    f = extract_features(_challenge(constraints=["n is at most 50000"]))
    # 50000 -> 4 powers of 10 (10^4)
    assert f.max_constraint_power == 4


def test_features_keyword_detection_is_case_insensitive() -> None:
    f = extract_features(_challenge(prompt="Find the longest SUBSEQUENCE in nums."))
    assert f.has_dp_keyword is True
    assert f.has_graph_keyword is False


def test_features_design_keyword_picks_up_system_design() -> None:
    f = extract_features(
        _challenge(
            topic=Topic.SYSTEM_DESIGN,
            prompt="Design a system with low latency at scale.",
        )
    )
    assert f.has_design_keyword is True


# ---- predictor: shape -------------------------------------------------


def test_predict_returns_clamped_solve_rate_and_positive_time() -> None:
    pred = HeuristicPredictor().predict(_challenge())
    assert isinstance(pred, Prediction)
    assert 0.02 <= pred.solve_rate <= 0.95
    assert pred.time_ms > 0
    assert pred.model_version == HEURISTIC_MODEL_VERSION


def test_predict_baseline_solve_rate_orders_by_tier() -> None:
    p = HeuristicPredictor()
    easy = p.predict(_challenge(difficulty=Difficulty.EASY)).solve_rate
    medium = p.predict(_challenge(difficulty=Difficulty.MEDIUM)).solve_rate
    hard = p.predict(_challenge(difficulty=Difficulty.HARD)).solve_rate
    boss = p.predict(_challenge(difficulty=Difficulty.BOSS)).solve_rate
    assert easy > medium > hard > boss


# ---- predictor: monotonic adjustments --------------------------------


def test_predict_long_prompt_lowers_solve_rate() -> None:
    p = HeuristicPredictor()
    short = p.predict(_challenge(prompt="x" * 100)).solve_rate
    long = p.predict(_challenge(prompt="x" * 2000)).solve_rate
    assert long < short


def test_predict_high_input_bound_lowers_solve_rate() -> None:
    p = HeuristicPredictor()
    small = p.predict(_challenge(constraints=["1 <= n <= 100"])).solve_rate
    huge = p.predict(_challenge(constraints=["1 <= n <= 10^7"])).solve_rate
    assert huge < small


def test_predict_dp_keyword_lowers_solve_rate() -> None:
    p = HeuristicPredictor()
    plain = p.predict(_challenge(prompt="Find pairs that sum to target.")).solve_rate
    dp = p.predict(
        _challenge(prompt="Find longest common subsequence between two strings.")
    ).solve_rate
    assert dp < plain


def test_predict_long_prompt_raises_time_estimate() -> None:
    p = HeuristicPredictor()
    short = p.predict(_challenge(prompt="x" * 100)).time_ms
    long = p.predict(_challenge(prompt="x" * 2000)).time_ms
    assert long > short


# ---- bucketing + tier gap ---------------------------------------------


def test_solve_rate_to_tier_boundaries() -> None:
    assert solve_rate_to_tier(0.80) == Difficulty.EASY
    assert solve_rate_to_tier(0.55) == Difficulty.EASY  # boundary inclusive
    assert solve_rate_to_tier(0.40) == Difficulty.MEDIUM
    assert solve_rate_to_tier(0.30) == Difficulty.MEDIUM  # boundary inclusive
    assert solve_rate_to_tier(0.20) == Difficulty.HARD
    assert solve_rate_to_tier(0.10) == Difficulty.HARD
    assert solve_rate_to_tier(0.05) == Difficulty.BOSS


def test_tier_gap_zero_when_aligned() -> None:
    assert declared_vs_predicted_tier_gap(Difficulty.EASY, Difficulty.EASY) == 0
    assert declared_vs_predicted_tier_gap(Difficulty.BOSS, Difficulty.BOSS) == 0


def test_tier_gap_grows_with_distance() -> None:
    assert declared_vs_predicted_tier_gap(Difficulty.EASY, Difficulty.MEDIUM) == 1
    assert declared_vs_predicted_tier_gap(Difficulty.EASY, Difficulty.HARD) == 2
    assert declared_vs_predicted_tier_gap(Difficulty.EASY, Difficulty.BOSS) == 3
    # Symmetric.
    assert declared_vs_predicted_tier_gap(Difficulty.BOSS, Difficulty.EASY) == 3

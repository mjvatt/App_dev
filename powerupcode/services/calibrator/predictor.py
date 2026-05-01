"""Calibrator predictors.

`Predictor` is the stable interface; `HeuristicPredictor` is the v0
implementation grounded in difficulty-tier baselines plus signed
adjustments from text features. Phase 2 will replace this with a
gradient-boosted model trained on real attempts data while keeping
the same shape.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from services.calibrator.features import Features, extract_features
from services.engine.interface import ChallengeData, Difficulty

HEURISTIC_MODEL_VERSION = "heuristic-v0"

# Solve-rate baselines per declared tier. Calibrated against rough
# industry numbers (LeetCode public acceptance rates by difficulty)
# and intentionally pessimistic on the high end — beta users will
# struggle more than veterans.
_TIER_BASELINE_SOLVE_RATE: dict[Difficulty, float] = {
    Difficulty.EASY: 0.65,
    Difficulty.MEDIUM: 0.40,
    Difficulty.HARD: 0.20,
    Difficulty.BOSS: 0.07,
}

# Median time in milliseconds, by tier. Real attempts spread is wide;
# these are point estimates the reviewer can sanity-check.
_TIER_BASELINE_TIME_MS: dict[Difficulty, int] = {
    Difficulty.EASY: 5 * 60_000,        # 5 min
    Difficulty.MEDIUM: 15 * 60_000,     # 15 min
    Difficulty.HARD: 35 * 60_000,       # 35 min
    Difficulty.BOSS: 75 * 60_000,       # 75 min
}


@dataclass(frozen=True)
class Prediction:
    solve_rate: float
    time_ms: int
    model_version: str


class Predictor(Protocol):
    def predict(self, challenge: ChallengeData) -> Prediction: ...


class HeuristicPredictor:
    """Difficulty-tier baseline plus signed adjustments from text
    features. Designed to be transparent — the reviewer can reason
    about why a prediction shifted away from the tier baseline."""

    model_version = HEURISTIC_MODEL_VERSION

    def predict(self, challenge: ChallengeData) -> Prediction:
        features = extract_features(challenge)
        baseline = _TIER_BASELINE_SOLVE_RATE.get(challenge.difficulty, 0.30)
        baseline_time = _TIER_BASELINE_TIME_MS.get(challenge.difficulty, 15 * 60_000)

        solve_rate = self._adjust_solve_rate(baseline, features)
        time_ms = self._adjust_time(baseline_time, features)
        return Prediction(
            solve_rate=solve_rate,
            time_ms=time_ms,
            model_version=self.model_version,
        )

    @staticmethod
    def _adjust_solve_rate(baseline: float, f: Features) -> float:
        adjustment = 0.0
        # Long prompts correlate with more setup -> harder.
        if f.prompt_length > 1500:
            adjustment -= 0.08
        elif f.prompt_length > 800:
            adjustment -= 0.03
        elif f.prompt_length < 200:
            adjustment += 0.03

        # More constraints means more edge cases to handle.
        if f.constraint_count >= 5:
            adjustment -= 0.04
        elif f.constraint_count <= 1:
            adjustment += 0.02

        # Higher input bounds typically force a better algorithm.
        if f.max_constraint_power >= 6:
            adjustment -= 0.06
        elif f.max_constraint_power >= 5:
            adjustment -= 0.03

        # Pattern-recognition signals.
        if f.has_dp_keyword:
            adjustment -= 0.04
        if f.has_graph_keyword:
            adjustment -= 0.02
        if f.has_design_keyword:
            adjustment -= 0.05
        if f.has_complexity_hint:
            # Explicit complexity targets force optimal solutions.
            adjustment -= 0.03

        # Clamp to a reasonable [0.02, 0.95] band so noisy features
        # can't drive predictions to the rails.
        return max(0.02, min(0.95, baseline + adjustment))

    @staticmethod
    def _adjust_time(baseline_ms: int, f: Features) -> int:
        multiplier = 1.0
        if f.prompt_length > 1500:
            multiplier *= 1.25
        elif f.prompt_length < 200:
            multiplier *= 0.85
        if f.constraint_count >= 5:
            multiplier *= 1.10
        if f.max_constraint_power >= 6:
            multiplier *= 1.15
        if f.has_dp_keyword:
            multiplier *= 1.10
        if f.has_design_keyword:
            multiplier *= 1.20
        return int(baseline_ms * multiplier)


def solve_rate_to_tier(rate: float) -> Difficulty:
    """Bucket a predicted solve rate into the tier it most resembles.
    Used to detect declared-vs-predicted mismatch in the review CLI.

    Boundaries: easy > 0.55, medium [0.30, 0.55], hard [0.10, 0.30),
    boss < 0.10. Matches the intent of the tier baselines above with
    some slack at each edge."""
    if rate >= 0.55:
        return Difficulty.EASY
    if rate >= 0.30:
        return Difficulty.MEDIUM
    if rate >= 0.10:
        return Difficulty.HARD
    return Difficulty.BOSS


_TIER_ORDER: list[Difficulty] = [
    Difficulty.EASY,
    Difficulty.MEDIUM,
    Difficulty.HARD,
    Difficulty.BOSS,
]


def declared_vs_predicted_tier_gap(declared: Difficulty, predicted: Difficulty) -> int:
    """Return the absolute index distance between declared tier and
    predicted-from-solve-rate tier. 0 means agreement; 2+ means the
    review CLI should warn loudly."""
    return abs(_TIER_ORDER.index(declared) - _TIER_ORDER.index(predicted))

"""Difficulty calibrator for AI-generated challenges.

Predicts solve_rate and time_to_solve before a challenge ships to
users. The current implementation is a heuristic (v0) — a real
trained model lands in Phase 2 once enough attempts data exists to
fit against. The interface stays the same across both phases so the
swap-in is a one-line change.

Two consumers:
  - generate_challenge.py   — annotate fresh AI candidates on insert
  - review_proposed_challenges.py — surface predictions and flag tier
                                    mismatches to the human reviewer
"""
from services.calibrator.predictor import (
    HEURISTIC_MODEL_VERSION,
    HeuristicPredictor,
    Prediction,
    Predictor,
    declared_vs_predicted_tier_gap,
    solve_rate_to_tier,
)

__all__ = [
    "HEURISTIC_MODEL_VERSION",
    "HeuristicPredictor",
    "Prediction",
    "Predictor",
    "declared_vs_predicted_tier_gap",
    "solve_rate_to_tier",
]

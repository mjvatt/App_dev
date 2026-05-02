"""Difficulty calibrator for AI-generated challenges.

Predicts solve_rate and time_to_solve before a challenge ships to
users. Two implementations behind the same Predictor protocol:

  - HeuristicPredictor (v0)   — tier baseline + signed adjustments
                                from text features. Always available.
  - TrainedPredictor (v1)     — gradient-boosted regressors fit on
                                real attempts data. Requires sklearn
                                (calibrator dep group) and a trained
                                artifact from scripts/train_calibrator.py.

TrainedPredictor lives in services.calibrator.trained and is imported
explicitly by callers that want it; this module's surface stays
sklearn-free so the heuristic path doesn't pay the import cost.

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

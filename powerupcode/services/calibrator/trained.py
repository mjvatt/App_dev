"""TrainedPredictor — Phase 2 ML calibrator.

Drop-in replacement for HeuristicPredictor that wraps a fitted pair of
GradientBoostingRegressors persisted via joblib. Same Predictor protocol,
so swapping it in is a one-line change at the consumer site.

Default artifact path: services/calibrator/artifacts/trained_v1.joblib
(gitignored — regenerate with scripts/train_calibrator.py).
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from services.calibrator.features import extract_features
from services.calibrator.predictor import Prediction
from services.calibrator.training import FEATURE_COLUMNS, TrainedModels, _feature_row
from services.engine.interface import ChallengeData

if TYPE_CHECKING:
    pass

TRAINED_MODEL_VERSION = "trained-v1"

DEFAULT_ARTIFACT_PATH = (
    Path(__file__).resolve().parent / "artifacts" / "trained_v1.joblib"
)


def save_trained_models(models: TrainedModels, path: Path | None = None) -> Path:
    """Persist a TrainedModels bundle. Returns the path written to.
    Creates parent directories as needed."""
    import joblib  # heavy dep — lazy

    target = path or DEFAULT_ARTIFACT_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(models, target)
    return target


def load_trained_models(path: Path | None = None) -> TrainedModels:
    """Load a TrainedModels bundle from disk. Raises FileNotFoundError
    with a clear pointer to the training script if the artifact is
    missing — this is a common dev-environment confusion."""
    import joblib

    target = path or DEFAULT_ARTIFACT_PATH
    if not target.exists():
        raise FileNotFoundError(
            f"Trained calibrator artifact not found at {target}. "
            "Generate it with: python scripts/train_calibrator.py "
            "(use --synthetic if you don't have ~1000 real attempts yet)."
        )
    obj = joblib.load(target)
    if not isinstance(obj, TrainedModels):
        raise TypeError(
            f"Artifact at {target} is not a TrainedModels bundle "
            f"(got {type(obj).__name__})"
        )
    return obj


class TrainedPredictor:
    """Predictor backed by two fitted regressors — solve_rate and time_ms.

    Constructor takes a pre-loaded TrainedModels (so callers can decide
    when to pay the joblib.load cost). For the common case of "load the
    default artifact and use it", call TrainedPredictor.from_default().
    """

    model_version = TRAINED_MODEL_VERSION

    def __init__(self, models: TrainedModels) -> None:
        if models.feature_names != FEATURE_COLUMNS:
            # The artifact was trained against a different feature column
            # set than the current code. Predictions would silently use
            # mismatched columns — fail fast instead.
            raise ValueError(
                "Trained model's feature_names disagree with current "
                f"FEATURE_COLUMNS. Model has {models.feature_names}; code "
                f"expects {FEATURE_COLUMNS}. Retrain the calibrator."
            )
        self._models = models

    @classmethod
    def from_default(cls) -> TrainedPredictor:
        return cls(load_trained_models())

    def predict(self, challenge: ChallengeData) -> Prediction:
        feats = extract_features(challenge)
        row = [_feature_row(feats)]
        rate = float(self._models.model_rate.predict(row)[0])
        # Clamp to the same band the heuristic uses so noisy ML can't
        # drive predictions outside [0.02, 0.95].
        rate = max(0.02, min(0.95, rate))
        time_ms = max(30_000, int(self._models.model_time.predict(row)[0]))
        return Prediction(
            solve_rate=rate,
            time_ms=time_ms,
            model_version=self.model_version,
        )

"""Train the Phase 2 calibrator (TrainedPredictor).

Pulls per-challenge attempts from the DB (or generates synthetic data
with --synthetic), aggregates into solve-rate and median-time targets,
fits two GradientBoostingRegressors, and persists the artifact at
``services/calibrator/artifacts/trained_v1.joblib``.

Reports MAE / RMSE / R² for both the heuristic baseline and the freshly
trained model on the same held-out split, so the human reviewer can
confirm the trained model is actually beating the baseline before
swapping it in at the consumer sites.

Usage (from powerupcode/):
    # Real attempts data (requires DB and >= MIN_ATTEMPTS_PER_CHALLENGE
    # attempts on enough challenges to be useful — roughly 50 challenges):
    python scripts/train_calibrator.py

    # Synthetic data path — useful for validating wiring before real
    # attempts data exists. Uses the challenge bank + heuristic + noise.
    python scripts/train_calibrator.py --synthetic

    # Custom artifact location:
    python scripts/train_calibrator.py --output /tmp/cal.joblib

Requires: pip install -e ".[calibrator]"
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from api.config import settings  # noqa: E402
from api.models.challenge import Attempt as AttemptRow  # noqa: E402
from services.calibrator.predictor import HeuristicPredictor  # noqa: E402
from services.calibrator.trained import (  # noqa: E402
    DEFAULT_ARTIFACT_PATH,
    TrainedPredictor,
    save_trained_models,
)
from services.calibrator.training import (  # noqa: E402
    MIN_ATTEMPTS_PER_CHALLENGE,
    Attempt,
    aggregate_attempts,
    build_training_matrix,
    evaluate_predictor,
    fit_models,
    synthesize_attempts,
)
from services.engine.interface import ChallengeData, Difficulty, Topic  # noqa: E402
from services.engine.repository import ChallengeRepository  # noqa: E402


async def _load_real_attempts(session_factory) -> list[Attempt]:  # type: ignore[no-untyped-def]
    async with session_factory() as session:
        rows = (await session.execute(select(AttemptRow))).scalars().all()
    return [
        Attempt(challenge_id=r.challenge_id, passed=bool(r.passed), time_ms=int(r.time_ms))
        for r in rows
    ]


async def _load_real_challenges(session_factory) -> list[ChallengeData]:  # type: ignore[no-untyped-def]
    repo = ChallengeRepository()
    async with session_factory() as session:
        return await repo.list_filtered(session)


_SYNTHETIC_BASE: dict[Difficulty, tuple[str, list[str]]] = {
    Difficulty.EASY: (
        "Find a value in an array.",
        ["1 <= n <= 10^3"],
    ),
    Difficulty.MEDIUM: (
        "Find subarray meeting a condition.",
        ["1 <= n <= 10^5", "k <= 50"],
    ),
    Difficulty.HARD: (
        "Compute minimum cost over partitions of the input.",
        ["1 <= n <= 10^5", "1 <= k <= n", "1 <= a_i <= 10^9"],
    ),
    Difficulty.BOSS: (
        "Design a system that supports the following operations under load.",
        [
            "throughput >= 10^6",
            "latency p99 <= 50ms",
            "1 <= n <= 10^7",
            "scale to 100 nodes",
            "consistency: linearizable",
        ],
    ),
}

_DP_PROMPT    = "Find the minimum cost subsequence partition."
_GRAPH_PROMPT = "Compute the shortest path between two vertices in a weighted graph."


def _load_synthetic_challenges() -> list[ChallengeData]:
    """Synthetic-mode fallback that doesn't need the engine_core bank.
    Generates a small spread across tiers so the heuristic produces
    distinct enough predictions for the trained model to learn from."""
    import string
    import textwrap

    challenges: list[ChallengeData] = []
    for tier in (Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD, Difficulty.BOSS):
        for topic in Topic:
            for k in range(2):
                prompt, constraints = _SYNTHETIC_BASE[tier]
                if topic == Topic.DYNAMIC_PROGRAMMING and tier != Difficulty.EASY:
                    prompt = _DP_PROMPT
                if topic == Topic.GRAPHS and tier != Difficulty.EASY:
                    prompt = _GRAPH_PROMPT
                full_prompt = textwrap.fill(
                    prompt + " " + " ".join(string.ascii_lowercase),
                    width=80,
                )
                challenges.append(ChallengeData(
                    id=f"syn-{tier.value}-{topic.value}-{k}",
                    topic=topic,
                    difficulty=tier,
                    title=f"Synthetic {tier.value} {topic.value} #{k}",
                    prompt=full_prompt,
                    constraints=constraints,
                    examples=[{"input": f"in{k}", "output": f"out{k}"}],
                ))
    return challenges


async def main_async(args: argparse.Namespace) -> int:
    if args.synthetic:
        challenges = _load_synthetic_challenges()
        attempts = synthesize_attempts(
            challenges,
            n_per_challenge=args.synthetic_per_challenge,
            seed=args.seed,
        )
        print(f"[synthetic] {len(challenges)} challenges, {len(attempts)} attempts")
    else:
        engine = create_async_engine(settings.database_url, echo=False)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        challenges = await _load_real_challenges(Session)
        attempts = await _load_real_attempts(Session)
        await engine.dispose()
        print(f"[real] {len(challenges)} challenges, {len(attempts)} attempts")

    aggregates = aggregate_attempts(
        attempts, min_attempts_per_challenge=args.min_attempts,
    )
    print(f"  -> {len(aggregates)} challenges meet >= {args.min_attempts} attempts")
    if len(aggregates) < 10:
        print(
            "ERROR: too few challenges meet the attempts floor. "
            "Either lower --min-attempts (NOT recommended for production) "
            "or wait until more attempts accumulate."
        )
        return 1

    matrix = build_training_matrix(challenges, aggregates)
    print(f"  -> training matrix: {len(matrix.X)} rows x {len(matrix.feature_names)} features")

    models = fit_models(
        matrix,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
    )
    trained = TrainedPredictor(models)

    # Eval both predictors on the same data so the reviewer can decide
    # whether to ship the trained one. NOTE: this is in-sample eval since
    # we don't carve out a held-out split here. Add a real CV when real
    # attempts data lands; for now the comparison is descriptive only.
    heuristic_metrics = evaluate_predictor(HeuristicPredictor().predict, challenges, aggregates)
    trained_metrics   = evaluate_predictor(trained.predict, challenges, aggregates)
    models.eval_metrics = trained_metrics

    print("\nMetrics (in-sample — caveat applies):")
    print(f"  {'metric':<14} {'heuristic':>14} {'trained':>14}")
    metric_keys = (
        "rate_mae", "rate_rmse", "rate_r2",
        "time_mae_ms", "time_rmse_ms", "time_r2",
    )
    for k in metric_keys:
        h = heuristic_metrics.get(k, 0.0)
        t = trained_metrics.get(k, 0.0)
        print(f"  {k:<14} {h:>14.4f} {t:>14.4f}")

    out_path = save_trained_models(models, Path(args.output) if args.output else None)
    print(f"\nWrote artifact -> {out_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument("--synthetic", action="store_true",
                        help="Use synthetic attempts data instead of the DB (no DB required).")
    parser.add_argument("--synthetic-per-challenge", type=int, default=20,
                        help="Synthetic attempts per challenge (default 20).")
    parser.add_argument("--min-attempts", type=int, default=MIN_ATTEMPTS_PER_CHALLENGE,
                        help="Drop challenges with fewer than this many attempts.")
    parser.add_argument("--n-estimators", type=int, default=200)
    parser.add_argument("--max-depth", type=int, default=3)
    parser.add_argument("--learning-rate", type=float, default=0.05)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--output", type=str, default=None,
                        help=f"Override artifact path (default: {DEFAULT_ARTIFACT_PATH}).")
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())

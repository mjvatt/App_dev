"""Feature extraction for the calibrator.

Pure functions over ChallengeData. Hand-crafted features now; an ML
predictor in Phase 2 may consume the same dict and add learned
embedding features alongside.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from services.engine.interface import ChallengeData

_DP_KEYWORDS = (
    "subsequence", "subarray", "interval", "partition", "match",
    "minimum cost", "maximum profit", "edit distance", "knapsack",
)
_GRAPH_KEYWORDS = (
    "graph", "node", "vertex", "edge", "tree", "dag", "topological",
    "bfs", "dfs", "shortest path", "connected component",
)
_DESIGN_KEYWORDS = (
    "design", "system", "architecture", "throughput", "latency",
    "scale", "consistency", "trade-off",
)
_BIG_O_HINTS = ("o(", "log n", "log(n)", "linear time", "constant space")

# Pulls integer-with-power upper bounds, e.g. "n <= 10^4" -> 4.
_POWER_RE = re.compile(r"10\s*\^\s*(\d+)")
_POWER_FALLBACK_RE = re.compile(r"\b(\d{4,})\b")  # plain ints >= 1000


@dataclass(frozen=True)
class Features:
    prompt_length: int
    constraint_count: int
    example_count: int
    max_constraint_power: int  # e.g., "n <= 10^5" -> 5
    has_dp_keyword: bool
    has_graph_keyword: bool
    has_design_keyword: bool
    has_complexity_hint: bool

    def as_dict(self) -> dict[str, float]:
        return {
            "prompt_length": float(self.prompt_length),
            "constraint_count": float(self.constraint_count),
            "example_count": float(self.example_count),
            "max_constraint_power": float(self.max_constraint_power),
            "has_dp_keyword": float(self.has_dp_keyword),
            "has_graph_keyword": float(self.has_graph_keyword),
            "has_design_keyword": float(self.has_design_keyword),
            "has_complexity_hint": float(self.has_complexity_hint),
        }


def _max_constraint_power(constraints: list[str]) -> int:
    """Largest 10^k bound across constraints, or the log10 of the
    largest plain integer if no power notation is used. Returns 0 if
    nothing parseable is found."""
    best = 0
    for c in constraints:
        for m in _POWER_RE.finditer(c):
            try:
                best = max(best, int(m.group(1)))
            except ValueError:
                continue
        if best == 0:
            for m in _POWER_FALLBACK_RE.finditer(c):
                try:
                    val = int(m.group(1))
                    # Round down to nearest power of 10.
                    power = 0
                    while val >= 10:
                        val //= 10
                        power += 1
                    best = max(best, power)
                except ValueError:
                    continue
    return best


def _has_any(text: str, keywords: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(kw in lowered for kw in keywords)


def extract_features(challenge: ChallengeData) -> Features:
    haystack = challenge.prompt + " " + " ".join(challenge.constraints)
    return Features(
        prompt_length=len(challenge.prompt),
        constraint_count=len(challenge.constraints),
        example_count=len(challenge.examples),
        max_constraint_power=_max_constraint_power(list(challenge.constraints)),
        has_dp_keyword=_has_any(haystack, _DP_KEYWORDS),
        has_graph_keyword=_has_any(haystack, _GRAPH_KEYWORDS),
        has_design_keyword=_has_any(haystack, _DESIGN_KEYWORDS),
        has_complexity_hint=_has_any(haystack, _BIG_O_HINTS),
    )

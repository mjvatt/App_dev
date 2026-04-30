"""
Personalized curriculum recommender.

Pure functions only. Takes a slice of attempt history and returns the
topic the user is weakest in plus a difficulty appropriate for their
overall level. The router builds a human-readable rationale from the
output.

Strategy:
  - No history yet -> arrays + easy (universal entry point)
  - History exists but a topic has zero passes -> that topic + easy
  - Otherwise -> topic with the lowest pass count, difficulty matched
    to whether the user has passed any hard tier yet

This is deliberately simple. Smarter recommenders (Elo, knowledge
tracing, neural curricula) require more data than we have. The point
of v1 is to surface 'spend a session here' nudges that beat 'pick
something random'.
"""
from collections.abc import Iterable
from dataclasses import dataclass

from services.engine.interface import Difficulty, Topic

# All topics, in the order we present them when ties need breaking.
_ALL_TOPICS: tuple[Topic, ...] = (
    Topic.ARRAYS,
    Topic.STRINGS,
    Topic.LINKED_LISTS,
    Topic.TREES,
    Topic.GRAPHS,
    Topic.DYNAMIC_PROGRAMMING,
    Topic.SYSTEM_DESIGN,
)


@dataclass(frozen=True)
class AttemptSummary:
    topic: Topic
    difficulty: Difficulty | None
    passed: bool


@dataclass(frozen=True)
class Recommendation:
    weak_topic: Topic
    suggested_difficulty: Difficulty
    pass_count: int  # in the weak topic
    total_attempts: int  # across all topics
    rationale: str


_TOPIC_LABEL: dict[Topic, str] = {
    Topic.ARRAYS: "arrays",
    Topic.STRINGS: "strings",
    Topic.LINKED_LISTS: "linked lists",
    Topic.TREES: "trees",
    Topic.GRAPHS: "graphs",
    Topic.DYNAMIC_PROGRAMMING: "dynamic programming",
    Topic.SYSTEM_DESIGN: "system design",
}


def _topic_label(t: Topic) -> str:
    return _TOPIC_LABEL[t]


def recommend(attempts: Iterable[AttemptSummary]) -> Recommendation:
    """Return the topic to focus on plus a starter difficulty."""
    history = list(attempts)
    total = len(history)

    # Empty-history fallback: universal starting point.
    if total == 0:
        return Recommendation(
            weak_topic=Topic.ARRAYS,
            suggested_difficulty=Difficulty.EASY,
            pass_count=0,
            total_attempts=0,
            rationale=(
                "Start with arrays — they're the foundation almost every "
                "other topic builds on. An easy one is enough for your first "
                "session."
            ),
        )

    pass_counts: dict[Topic, int] = {t: 0 for t in _ALL_TOPICS}
    attempt_counts: dict[Topic, int] = {t: 0 for t in _ALL_TOPICS}
    has_passed_hard = False

    for a in history:
        attempt_counts[a.topic] += 1
        if a.passed:
            pass_counts[a.topic] += 1
            if a.difficulty in (Difficulty.HARD, Difficulty.BOSS):
                has_passed_hard = True

    # First, pick any topic the user has zero passes in. Prefer ones
    # they've at least tried (they're already aware of the gap) but
    # fall back to fully-untouched topics.
    zero_pass_attempted = [
        t for t in _ALL_TOPICS if pass_counts[t] == 0 and attempt_counts[t] > 0
    ]
    zero_pass_untouched = [
        t for t in _ALL_TOPICS if pass_counts[t] == 0 and attempt_counts[t] == 0
    ]

    if zero_pass_attempted:
        weak = zero_pass_attempted[0]
        rationale = (
            f"You've tried {attempt_counts[weak]} {_topic_label(weak)} "
            f"problems without a pass yet. Reset with an easy one to lock "
            "in the pattern."
        )
        return Recommendation(
            weak_topic=weak,
            suggested_difficulty=Difficulty.EASY,
            pass_count=0,
            total_attempts=total,
            rationale=rationale,
        )

    if zero_pass_untouched:
        weak = zero_pass_untouched[0]
        rationale = (
            f"You haven't touched {_topic_label(weak)} yet. They show up in "
            "most senior interviews — start with an easy one to build the "
            "shape of the problem."
        )
        return Recommendation(
            weak_topic=weak,
            suggested_difficulty=Difficulty.EASY,
            pass_count=0,
            total_attempts=total,
            rationale=rationale,
        )

    # Every topic has at least one pass. Find the lowest pass count and
    # recommend at the user's apparent level.
    weak = min(_ALL_TOPICS, key=lambda t: pass_counts[t])
    weakest_count = pass_counts[weak]
    strongest_count = max(pass_counts[t] for t in _ALL_TOPICS)
    suggested_diff = Difficulty.MEDIUM if has_passed_hard else Difficulty.EASY

    if strongest_count >= weakest_count * 3 and weakest_count > 0:
        rationale = (
            f"You've passed {strongest_count} problems in your strongest "
            f"topic but only {weakest_count} in {_topic_label(weak)}. Even "
            "out the gap — interview panels love asking about the topic "
            "you haven't drilled."
        )
    else:
        rationale = (
            f"Strong across the board. {_topic_label(weak).capitalize()} "
            f"has your lowest count ({weakest_count}). Try a "
            f"{suggested_diff.value} one and keep climbing."
        )

    return Recommendation(
        weak_topic=weak,
        suggested_difficulty=suggested_diff,
        pass_count=weakest_count,
        total_attempts=total,
        rationale=rationale,
    )

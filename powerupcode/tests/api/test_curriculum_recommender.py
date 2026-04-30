from services.curriculum.recommender import AttemptSummary, recommend
from services.engine.interface import Difficulty, Topic


def _att(topic: Topic, passed: bool, difficulty: Difficulty = Difficulty.EASY) -> AttemptSummary:
    return AttemptSummary(topic=topic, difficulty=difficulty, passed=passed)


def test_no_history_recommends_arrays_easy() -> None:
    rec = recommend([])
    assert rec.weak_topic == Topic.ARRAYS
    assert rec.suggested_difficulty == Difficulty.EASY
    assert rec.total_attempts == 0
    assert "arrays" in rec.rationale.lower()


def test_zero_pass_attempted_topic_takes_priority() -> None:
    """User has passed many arrays but has tried graphs and failed.
    The 'fix what you've struggled at' nudge wins over untouched topics."""
    history = [
        _att(Topic.ARRAYS, passed=True),
        _att(Topic.ARRAYS, passed=True),
        _att(Topic.ARRAYS, passed=True),
        _att(Topic.GRAPHS, passed=False),
        _att(Topic.GRAPHS, passed=False),
    ]
    rec = recommend(history)
    assert rec.weak_topic == Topic.GRAPHS
    assert rec.suggested_difficulty == Difficulty.EASY


def test_untouched_topic_recommended_when_no_failed_attempts() -> None:
    """Every tried topic has a pass; suggest a topic the user hasn't
    touched yet. Order in _ALL_TOPICS breaks ties."""
    history = [_att(Topic.ARRAYS, passed=True)]
    rec = recommend(history)
    # First untouched topic in declaration order is STRINGS.
    assert rec.weak_topic == Topic.STRINGS
    assert rec.suggested_difficulty == Difficulty.EASY


def test_all_topics_passed_picks_lowest_count() -> None:
    """Once the user has passed at least one of every topic, the
    recommendation surfaces the topic with the fewest passes."""
    history = []
    # Three passes each in arrays/strings/etc., one in dynamic_programming.
    for t in (
        Topic.ARRAYS,
        Topic.STRINGS,
        Topic.LINKED_LISTS,
        Topic.TREES,
        Topic.GRAPHS,
        Topic.SYSTEM_DESIGN,
    ):
        history.extend(_att(t, passed=True) for _ in range(3))
    history.append(_att(Topic.DYNAMIC_PROGRAMMING, passed=True))

    rec = recommend(history)
    assert rec.weak_topic == Topic.DYNAMIC_PROGRAMMING


def test_difficulty_climbs_when_user_has_passed_hard() -> None:
    history = [
        _att(Topic.ARRAYS, passed=True, difficulty=Difficulty.HARD),
        _att(Topic.STRINGS, passed=True),
        _att(Topic.LINKED_LISTS, passed=True),
        _att(Topic.TREES, passed=True),
        _att(Topic.GRAPHS, passed=True),
        _att(Topic.DYNAMIC_PROGRAMMING, passed=True),
        _att(Topic.SYSTEM_DESIGN, passed=True),
    ]
    rec = recommend(history)
    # User has passed a hard, so curriculum graduates them off easy.
    assert rec.suggested_difficulty == Difficulty.MEDIUM


def test_rationale_quotes_user_specific_counts() -> None:
    """Rationale should feel personalized — bake in the actual numbers."""
    history = []
    for _ in range(8):
        history.append(_att(Topic.ARRAYS, passed=True))
    for t in (
        Topic.STRINGS,
        Topic.LINKED_LISTS,
        Topic.TREES,
        Topic.GRAPHS,
        Topic.DYNAMIC_PROGRAMMING,
        Topic.SYSTEM_DESIGN,
    ):
        history.append(_att(t, passed=True))

    rec = recommend(history)
    # All topics have a pass; weakest is one of the singletons. Rationale
    # should mention numbers (8 vs 1).
    assert "8" in rec.rationale
    assert "1" in rec.rationale

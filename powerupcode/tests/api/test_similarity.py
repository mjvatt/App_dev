from services.engine.similarity import hash_solution, normalize


def test_normalize_strips_python_line_comments() -> None:
    a = "def f(x):\n    return x + 1  # add one"
    b = "def f(x):\n    return x + 1"
    assert normalize(a) == normalize(b)


def test_normalize_strips_js_block_comments() -> None:
    a = "function f(x) { /* doc */ return x + 1; }"
    b = "function f(x) {  return x + 1; }"
    assert normalize(a) == normalize(b)


def test_normalize_strips_python_triple_quoted_docstring() -> None:
    a = 'def f(x):\n    """does the thing"""\n    return x + 1'
    b = "def f(x):\n    return x + 1"
    assert normalize(a) == normalize(b)


def test_normalize_collapses_whitespace_runs() -> None:
    a = "def   f(x):\n\n\n    return    x + 1"
    b = "def f(x):\n    return x + 1"
    assert normalize(a) == normalize(b)


def test_normalize_preserves_case() -> None:
    """Case carries semantic meaning in real code (variable names,
    function names). normalize() must NOT lowercase."""
    a = "def Foo(): pass"
    b = "def foo(): pass"
    assert normalize(a) != normalize(b)


def test_hash_matches_for_cosmetic_only_changes() -> None:
    a = "def solution(nums):\n    # find the answer\n    return sum(nums)"
    b = "def solution(nums):\n    return sum(nums)\n"
    assert hash_solution(a) == hash_solution(b)


def test_hash_differs_for_logic_changes() -> None:
    a = "def solution(nums): return sum(nums)"
    b = "def solution(nums): return max(nums)"
    assert hash_solution(a) != hash_solution(b)


def test_hash_handles_empty_input() -> None:
    assert hash_solution("") == hash_solution("   ")
    # Empty stays a stable string, just doesn't crash.
    assert isinstance(hash_solution(""), str)

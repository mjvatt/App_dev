"""
Submission similarity detection.

Hashes a normalized version of the user's code so we can detect verbatim
or near-verbatim copies between users on the same challenge. Pure functions
only — the routing layer composes the DB lookup.

We don't try to defeat sophisticated paraphrasers (variable renames, line
reordering, etc.) here; that requires AST-level work per language. The
goal is to catch the cheap-and-common case: people pasting another user's
solution from Discord or a screenshot.
"""
import hashlib
import re

# Strip Python (#), JS/TS/Java (// and /* ... */) single- and multi-line comments.
_LINE_COMMENT = re.compile(r"(#|//).*?$", re.MULTILINE)
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_TRIPLE_QUOTED = re.compile(r'"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'')


def normalize(code: str) -> str:
    """Strip comments, collapse whitespace, drop blank lines.

    Designed for fast, language-agnostic 'is this the same code' comparison.
    Two submissions with identical logic and only-cosmetic differences
    (extra blank lines, trailing spaces, indentation noise) hash equal."""
    if not code:
        return ""
    stripped = _BLOCK_COMMENT.sub("", code)
    stripped = _TRIPLE_QUOTED.sub("", stripped)
    stripped = _LINE_COMMENT.sub("", stripped)
    # Collapse internal whitespace runs (incl. newlines) to single spaces;
    # trim. We deliberately DO NOT lowercase — case matters in real code.
    return re.sub(r"\s+", " ", stripped).strip()


def hash_solution(code: str) -> str:
    return hashlib.sha256(normalize(code).encode("utf-8")).hexdigest()

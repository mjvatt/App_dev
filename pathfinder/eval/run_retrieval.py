"""PATHFINDER retrieval-stage eval harness.

Runs each case in eval/cases.json through `find_candidates` and reports
recall@5 / recall@10 against each case's anchor SOC list, plus a check
that no Military Specific (55-XXXX) SOC leaks through the retrieval
filter. The LLM synthesizer is intentionally NOT invoked - this eval
isolates retrieval quality.

The DB must be running with O*NET ingested + pgvector loaded:
    docker compose up -d postgres
    python -m services.ingest.onet build
    python -m services.ingest.pgvector_load

Run from the pathfinder venv:
    python -m eval.run_retrieval
or:
    python eval/run_retrieval.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

# Make the package importable when run as `python eval/run_retrieval.py`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.schemas import RecommendRequest  # noqa: E402
from services.agents.retrieval import build_profile_text, find_candidates  # noqa: E402

ROOT       = Path(__file__).parent
CASES_FILE = ROOT / "cases.json"
RESULTS    = ROOT / "results.json"

EMBEDDING_K = 15
TOP_K_REPORT = 10


def recall_at_k(returned_socs: list[str], expected: list[str], k: int) -> float:
    if not expected:
        return float("nan")
    head = set(returned_socs[:k])
    hits = sum(1 for soc in expected if soc in head)
    return hits / len(expected)


def first_rank(returned_socs: list[str], expected: list[str]) -> int | None:
    """1-indexed rank of the first expected SOC in the returned list, or None."""
    for i, soc in enumerate(returned_socs, start=1):
        if soc in expected:
            return i
    return None


def banned_hits(returned_socs: list[str]) -> list[str]:
    """Returns any SOCs that violate the no-military-occupation rule."""
    return [s for s in returned_socs if s.startswith("55-")]


async def evaluate_case(case: dict[str, Any]) -> dict[str, Any]:
    request = RecommendRequest(**case["profile"])
    profile_text = build_profile_text(request)
    candidates = await find_candidates(request, profile_text, embedding_k=EMBEDDING_K)
    returned_socs = [c.soc_code for c in candidates]

    expected = case.get("expected_socs", [])
    return {
        "id":              case["id"],
        "description":     case["description"],
        "n_candidates":    len(candidates),
        "expected":        expected,
        "returned_top10":  [
            {
                "soc":        c.soc_code,
                "title":      c.title,
                "source":     c.source,
                "similarity": round(float(c.similarity), 4) if c.similarity is not None else None,
            }
            for c in candidates[:TOP_K_REPORT]
        ],
        "recall_at_5":     round(recall_at_k(returned_socs, expected, 5),  4),
        "recall_at_10":    round(recall_at_k(returned_socs, expected, 10), 4),
        "first_hit_rank":  first_rank(returned_socs, expected),
        "banned_hits":     banned_hits(returned_socs),
    }


async def main() -> int:
    blob = json.loads(CASES_FILE.read_text(encoding="utf-8"))
    cases = blob["cases"]

    results: list[dict[str, Any]] = []
    for case in cases:
        try:
            res = await evaluate_case(case)
        except Exception as exc:
            res = {"id": case["id"], "error": str(exc)}
        results.append(res)

    valid = [r for r in results if "error" not in r]
    summary: dict[str, Any] = {
        "n_cases":            len(cases),
        "n_valid":            len(valid),
        "n_errors":           len(cases) - len(valid),
        "mean_recall_at_5":   round(_safe_mean([r["recall_at_5"]  for r in valid]), 4),
        "mean_recall_at_10":  round(_safe_mean([r["recall_at_10"] for r in valid]), 4),
        "cases_with_any_hit_in_top5":  sum(1 for r in valid if r["recall_at_5"]  > 0),
        "cases_with_any_hit_in_top10": sum(1 for r in valid if r["recall_at_10"] > 0),
        "cases_with_banned_hits":      sum(1 for r in valid if r["banned_hits"]),
    }

    out = {"summary": summary, "cases": results}
    RESULTS.write_text(json.dumps(out, indent=2), encoding="utf-8")

    _print_report(out)
    return 0


def _safe_mean(values: list[float]) -> float:
    valid = [v for v in values if v == v]  # filter NaN
    return sum(valid) / len(valid) if valid else float("nan")


def _print_report(out: dict[str, Any]) -> None:
    s = out["summary"]
    print("=" * 72)
    print(f"PATHFINDER retrieval eval · {s['n_cases']} cases ({s['n_errors']} errors)")
    print("=" * 72)
    print(f"  mean recall@5            : {s['mean_recall_at_5']}")
    print(f"  mean recall@10           : {s['mean_recall_at_10']}")
    print(f"  cases hit in top 5       : {s['cases_with_any_hit_in_top5']}/{s['n_valid']}")
    print(f"  cases hit in top 10      : {s['cases_with_any_hit_in_top10']}/{s['n_valid']}")
    print(f"  cases with banned hits   : {s['cases_with_banned_hits']}/{s['n_valid']}")
    print()
    for r in out["cases"]:
        if "error" in r:
            print(f"  [{r['id']}] ERROR: {r['error']}")
            continue
        first = r["first_hit_rank"]
        first_str = f"#{first}" if first is not None else "miss"
        print(f"  [{r['id']:<26}] R@5={r['recall_at_5']:.2f}  R@10={r['recall_at_10']:.2f}  first_hit={first_str:<5}  n={r['n_candidates']}")
        for cand in r["returned_top10"][:5]:
            mark = "  *" if cand["soc"] in r["expected"] else "   "
            sim = f"{cand['similarity']:.3f}" if cand["similarity"] is not None else "  -  "
            print(f"      {mark} {cand['soc']}  [{cand['source']:<9} sim={sim}]  {cand['title'][:50]}")
        print()
    print(f"Wrote {RESULTS}")


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

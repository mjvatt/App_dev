"""Attach BLS wage data and USAJobs postings to retrieved candidates.

Wage lookups are sequential against a single async session (each is a
small indexed read). USAJobs calls are fanned out via asyncio.gather
since they are I/O-bound HTTP calls and the in-memory cache absorbs
repeats.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass

from services.agents.retrieval import CandidateOccupation
from services.retrieval.store import session as db_session
from services.retrieval.usajobs import JobPosting, search_postings
from services.retrieval.wages import WageSnapshot, get_wage_snapshot


@dataclass
class GroundedCandidate:
    candidate: CandidateOccupation
    wages: WageSnapshot | None
    postings_count: int
    sample_postings: list[JobPosting]


async def ground_candidates(
    candidates: list[CandidateOccupation],
    location: str,
    *,
    postings_per_candidate: int = 3,
) -> list[GroundedCandidate]:
    if not candidates:
        return []

    async with db_session() as session:
        wages: list[WageSnapshot | None] = [
            await get_wage_snapshot(session, c.soc_code, location) for c in candidates
        ]

    posting_tasks = [
        search_postings(keyword=c.title, location=location, results_per_page=postings_per_candidate)
        for c in candidates
    ]
    posting_results = await asyncio.gather(*posting_tasks, return_exceptions=True)

    grounded: list[GroundedCandidate] = []
    for cand, w, p in zip(candidates, wages, posting_results, strict=False):
        postings: list[JobPosting] = [] if isinstance(p, BaseException) else list(p)
        grounded.append(
            GroundedCandidate(
                candidate=cand,
                wages=w,
                postings_count=len(postings),
                sample_postings=postings[:2],
            )
        )
    return grounded

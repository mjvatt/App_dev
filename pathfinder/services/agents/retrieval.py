"""Candidate occupation retrieval.

Takes a structured veteran profile and produces a deduplicated list of
candidate civilian occupations from two signals:

1. The DMDC Military Occupational Classification crosswalk (precise
   when present; thin for combat-arms MOCs).
2. pgvector cosine similarity over a profile-text embedding (fills in
   when the crosswalk is silent).

Filters out the O*NET 55-XXXX series ("Military Specific Occupations")
since recommending Infantry as a civilian role is never useful.
"""
from __future__ import annotations

from dataclasses import dataclass

from api.schemas import RecommendRequest
from services.ingest.onet import OccupationDetail
from services.retrieval.embeddings import embed_one
from services.retrieval.onet import get_index as onet_index
from services.retrieval.pgvector_search import find_similar_occupations
from services.retrieval.store import session as db_session


@dataclass
class CandidateOccupation:
    soc_code: str
    title: str
    description: str
    job_zone: int | None
    job_zone_summary: str | None
    top_skills: list[str]
    top_knowledge: list[str]
    core_tasks: list[str]
    source: str  # 'crosswalk' | 'embedding'
    similarity: float | None  # cosine similarity in [0,1] for embedding hits


def build_profile_text(request: RecommendRequest) -> str:
    """Compact profile text used for embedding-based candidate search."""
    parts: list[str] = []
    parts.append(
        f"{request.pay_grade} {request.branch.replace('_', ' ').title()} "
        f"{request.occupation_code} with {request.years_of_service} years of service."
    )
    if request.combat_deployments:
        parts.append(f"{request.combat_deployments} combat deployments.")
    if request.leadership_roles:
        parts.append(f"Leadership roles: {request.leadership_roles}.")
    if request.additional_skills:
        parts.append(f"Specialty schools and skills: {request.additional_skills}.")
    if request.civilian_skills:
        parts.append(f"Civilian skills: {request.civilian_skills}.")
    if request.certifications:
        parts.append(f"Certifications: {request.certifications}.")
    parts.append(f"Education: {request.education_level.replace('_', ' ').title()}.")
    if request.goals:
        parts.append(f"Goals: {request.goals}")
    return " ".join(parts)


def _is_military_only(soc_code: str) -> bool:
    return soc_code.startswith("55-")


def _to_candidate(
    occ: OccupationDetail, *, source: str, similarity: float | None
) -> CandidateOccupation:
    return CandidateOccupation(
        soc_code=occ.soc_code,
        title=occ.title,
        description=occ.description,
        job_zone=occ.job_zone,
        job_zone_summary=occ.job_zone_summary,
        top_skills=[s.name for s in occ.top_skills],
        top_knowledge=[k.name for k in occ.top_knowledge],
        core_tasks=occ.core_tasks,
        source=source,
        similarity=similarity,
    )


async def find_candidates(
    request: RecommendRequest,
    profile_text: str,
    *,
    embedding_k: int = 15,
) -> list[CandidateOccupation]:
    idx = onet_index()
    candidates: dict[str, CandidateOccupation] = {}

    moc = request.occupation_code.upper()
    for soc in idx.moc_to_onetsoc.get(moc, []):
        if _is_military_only(soc):
            continue
        occ = idx.occupations.get(soc)
        if occ is None:
            continue
        candidates[soc] = _to_candidate(occ, source="crosswalk", similarity=None)

    query_vector = embed_one(profile_text)
    async with db_session() as s:
        sims = await find_similar_occupations(s, query_vector, k=embedding_k)
    for sim in sims:
        if sim.soc_code in candidates or _is_military_only(sim.soc_code):
            continue
        occ = idx.occupations.get(sim.soc_code)
        if occ is None:
            continue
        candidates[sim.soc_code] = _to_candidate(
            occ, source="embedding", similarity=round(1.0 - float(sim.distance), 4)
        )
    return list(candidates.values())

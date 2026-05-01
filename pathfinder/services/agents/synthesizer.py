"""Multi-stage synthesizer agent.

Pipeline:
1. retrieval.find_candidates — crosswalk + pgvector → ~15-20 candidates.
2. grounding.ground_candidates — attach BLS wages + USAJobs postings.
3. Claude synthesis — single tool-use call ranks the top 5 and writes
   rationale, skill gaps, and action steps.
4. Assemble — attach wage_range, posting counts, and citations to each
   recommendation deterministically (the LLM never invents these).

Graceful degradation:
- No ANTHROPIC_API_KEY → returns the top-N grounded candidates without
  rationale or skill gaps so the page still renders something useful.
- LLM call fails or returns no tool_use block → same fallback path.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from anthropic import AsyncAnthropic

from api.config import get_settings
from api.schemas import (
    ActionStep,
    Citation,
    Recommendation,
    RecommendRequest,
    RecommendResponse,
    SkillGap,
)
from services.agents.grounding import GroundedCandidate, ground_candidates
from services.agents.prompts import (
    RECOMMEND_TOOL,
    SYSTEM_PROMPT,
    build_user_message,
)
from services.agents.retrieval import build_profile_text, find_candidates

log = logging.getLogger(__name__)

EMBEDDING_K = 15
MAX_RECOMMENDATIONS = 5
DATA_YEAR_FALLBACK = 2024


async def synthesize(request: RecommendRequest) -> RecommendResponse:
    profile_text = build_profile_text(request)
    candidates = await find_candidates(request, profile_text, embedding_k=EMBEDDING_K)
    if not candidates:
        return RecommendResponse(
            recommendations=[],
            notes="No candidate occupations found for this profile.",
        )

    grounded = await ground_candidates(candidates, request.location)
    grounded_by_soc = {g.candidate.soc_code: g for g in grounded}

    settings = get_settings()
    if not settings.anthropic_api_key:
        return _fallback_recommendation_set(
            grounded,
            note=(
                "ANTHROPIC_API_KEY is not configured; returning top retrieved "
                "candidates without LLM rationale or skill-gap analysis."
            ),
        )

    profile_dict = request.model_dump()
    user_msg = build_user_message(profile_dict, grounded)

    try:
        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model=settings.synthesizer_model,
            max_tokens=4096,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[RECOMMEND_TOOL],
            tool_choice={"type": "tool", "name": "recommend"},
            messages=[{"role": "user", "content": user_msg}],
        )
    except Exception as exc:  # network / API error
        log.warning("synthesizer LLM call failed: %s", exc)
        return _fallback_recommendation_set(
            grounded, note="LLM call failed; showing retrieval results without rationale."
        )

    payload = _extract_tool_payload(response)
    if payload is None:
        log.warning("synthesizer returned no tool_use block")
        return _fallback_recommendation_set(
            grounded, note="LLM did not return structured output; showing retrieval results."
        )

    return _assemble_response(payload, grounded_by_soc)


def _extract_tool_payload(response: Any) -> dict[str, Any] | None:
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "recommend":
            data = block.input
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except json.JSONDecodeError:
                    return None
            if isinstance(data, dict):
                return data
    return None


def _assemble_response(
    payload: dict[str, Any],
    grounded_by_soc: dict[str, GroundedCandidate],
) -> RecommendResponse:
    raw = payload.get("recommendations") or []
    out: list[Recommendation] = []
    for item in raw:
        soc = (item.get("soc_code") or "").strip()
        grounded = grounded_by_soc.get(soc)
        if not grounded:
            # Hallucination guard: drop SOCs not in the retrieved set.
            log.info("dropping LLM-suggested SOC %s not in candidate set", soc)
            continue
        skill_gaps = [
            SkillGap(
                skill=g.get("skill", "").strip(),
                have=bool(g.get("have", False)),
                note=g.get("note"),
            )
            for g in (item.get("skill_gaps") or [])
            if g.get("skill")
        ]
        action_steps = [
            ActionStep(
                label=a.get("label", "").strip(),
                detail=a.get("detail"),
                url=a.get("url"),
            )
            for a in (item.get("action_steps") or [])
            if a.get("label")
        ]
        out.append(
            Recommendation(
                soc_code=soc,
                title=item.get("title", grounded.candidate.title),
                fit_score=_clamp(float(item.get("fit_score", 0.0))),
                rationale=item.get("rationale", "").strip(),
                wage_range=_wage_range(grounded),
                open_postings=grounded.postings_count or None,
                skill_gaps=skill_gaps,
                action_steps=action_steps,
                citations=_citations_for(grounded),
            )
        )

    notes = None
    if not out:
        notes = "LLM produced no usable recommendations; verify candidate retrieval."
    return RecommendResponse(recommendations=out, notes=notes)


def _fallback_recommendation_set(
    grounded: list[GroundedCandidate], *, note: str
) -> RecommendResponse:
    """Return top-N grounded candidates without LLM-authored rationale."""
    ranked = sorted(
        grounded,
        key=lambda g: (
            0 if g.candidate.source == "crosswalk" else 1,
            -(g.candidate.similarity or 0.0),
        ),
    )
    out: list[Recommendation] = []
    for g in ranked[:MAX_RECOMMENDATIONS]:
        c = g.candidate
        skill_gaps = [SkillGap(skill=s, have=False) for s in c.top_skills[:3]]
        out.append(
            Recommendation(
                soc_code=c.soc_code,
                title=c.title,
                fit_score=c.similarity if c.similarity is not None else 0.5,
                rationale=c.description,
                wage_range=_wage_range(g),
                open_postings=g.postings_count or None,
                skill_gaps=skill_gaps,
                action_steps=[],
                citations=_citations_for(g),
            )
        )
    return RecommendResponse(recommendations=out, notes=note)


def _wage_range(g: GroundedCandidate) -> str | None:
    if not g.wages:
        return None
    base = g.wages.range_str()
    if not base:
        return None
    return f"{base} ({g.wages.area_name}, {g.wages.data_year})"


def _citations_for(g: GroundedCandidate) -> list[Citation]:
    citations: list[Citation] = [
        Citation(
            source="O*NET",
            title=f"{g.candidate.soc_code} — {g.candidate.title}",
            url=f"https://www.onetonline.org/link/summary/{g.candidate.soc_code}",
        )
    ]
    if g.wages:
        citations.append(
            Citation(
                source="BLS OEWS",
                title=(
                    f"OEWS {g.wages.data_year} {g.wages.area_type} wage data — "
                    f"{g.wages.area_name}"
                ),
                url="https://www.bls.gov/oes/tables.htm",
            )
        )
    if g.postings_count:
        citations.append(
            Citation(
                source="USAJobs",
                title=f"{g.postings_count} live federal postings near user",
                url="https://www.usajobs.gov/",
            )
        )
    return citations


def _clamp(value: float) -> float:
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value

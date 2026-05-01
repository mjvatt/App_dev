from types import SimpleNamespace

from services.agents.grounding import GroundedCandidate
from services.agents.retrieval import CandidateOccupation
from services.agents.synthesizer import (
    _assemble_response,
    _citations_for,
    _clamp,
    _extract_tool_payload,
    _fallback_recommendation_set,
    _wage_range,
)
from services.retrieval.wages import WageSnapshot


def _candidate(soc: str = "13-1151.00", title: str = "Trainer", source: str = "crosswalk", sim=None):
    return CandidateOccupation(
        soc_code=soc,
        title=title,
        description="Designs training programs.",
        job_zone=4,
        job_zone_summary="Bachelor's typical.",
        top_skills=["Active Listening", "Speaking", "Instructing"],
        top_knowledge=["Education"],
        core_tasks=["Conduct training"],
        source=source,
        similarity=sim,
    )


def _grounded(soc="13-1151.00", title="Trainer", postings=12, source="crosswalk", sim=None,
              wages=None):
    return GroundedCandidate(
        candidate=_candidate(soc=soc, title=title, source=source, sim=sim),
        wages=wages or WageSnapshot(
            soc_code=soc.split(".")[0], area_type="msa", area_name="Boise City, ID",
            employment=350, mean_annual=72000, median_annual=68000,
            p10_annual=48000, p90_annual=98000, state_abbr="ID", data_year=2024,
        ),
        postings_count=postings,
        sample_postings=[],
    )


def test_clamp() -> None:
    assert _clamp(-0.5) == 0.0
    assert _clamp(1.5) == 1.0
    assert _clamp(0.42) == 0.42


def test_wage_range_uses_msa_label() -> None:
    text = _wage_range(_grounded())
    assert "Boise City, ID" in text
    assert "2024" in text


def test_wage_range_returns_none_when_no_wage() -> None:
    g = _grounded()
    g.wages = None
    assert _wage_range(g) is None


def test_citations_includes_onet_always() -> None:
    citations = _citations_for(_grounded(postings=0))
    sources = [c.source for c in citations]
    assert "O*NET" in sources
    assert "BLS OEWS" in sources
    assert "USAJobs" not in sources


def test_citations_includes_usajobs_when_postings_present() -> None:
    citations = _citations_for(_grounded(postings=5))
    sources = [c.source for c in citations]
    assert "USAJobs" in sources


def test_extract_tool_payload_returns_dict() -> None:
    block = SimpleNamespace(
        type="tool_use", name="recommend", input={"recommendations": [{"soc_code": "x"}]}
    )
    response = SimpleNamespace(content=[block])
    assert _extract_tool_payload(response) == {"recommendations": [{"soc_code": "x"}]}


def test_extract_tool_payload_handles_string_input() -> None:
    block = SimpleNamespace(
        type="tool_use", name="recommend", input='{"recommendations": []}'
    )
    response = SimpleNamespace(content=[block])
    assert _extract_tool_payload(response) == {"recommendations": []}


def test_extract_tool_payload_returns_none_when_no_tool_use() -> None:
    block = SimpleNamespace(type="text", text="hello")
    response = SimpleNamespace(content=[block])
    assert _extract_tool_payload(response) is None


def test_assemble_response_drops_unknown_socs() -> None:
    grounded_by_soc = {"13-1151.00": _grounded()}
    payload = {
        "recommendations": [
            {
                "soc_code": "13-1151.00",
                "title": "Training and Development",
                "fit_score": 0.82,
                "rationale": "Personalized rationale.",
                "skill_gaps": [{"skill": "Curriculum design", "have": False}],
                "action_steps": [{"label": "Enroll in CPLP prep"}],
            },
            {
                "soc_code": "99-9999.99",
                "title": "Made-up Role",
                "fit_score": 0.95,
                "rationale": "...",
                "skill_gaps": [],
                "action_steps": [],
            },
        ]
    }
    resp = _assemble_response(payload, grounded_by_soc)
    assert len(resp.recommendations) == 1
    rec = resp.recommendations[0]
    assert rec.soc_code == "13-1151.00"
    assert rec.fit_score == 0.82
    assert rec.skill_gaps[0].skill == "Curriculum design"
    assert rec.action_steps[0].label == "Enroll in CPLP prep"
    assert rec.wage_range and "Boise City, ID" in rec.wage_range
    assert rec.open_postings == 12


def test_fallback_returns_top_n_with_crosswalk_priority() -> None:
    grounded = [
        _grounded(soc="33-3051.00", title="Police", source="embedding", sim=0.7),
        _grounded(soc="13-1151.00", title="Trainer", source="crosswalk"),
    ]
    resp = _fallback_recommendation_set(grounded, note="no key")
    assert resp.notes == "no key"
    assert resp.recommendations[0].soc_code == "13-1151.00"  # crosswalk first
    assert resp.recommendations[1].soc_code == "33-3051.00"
    # No LLM rationale, so we use the description.
    assert resp.recommendations[0].rationale == "Designs training programs."


def test_fallback_caps_at_max_recommendations() -> None:
    grounded = [_grounded(soc=f"{i}-0000.00") for i in range(10, 20)]
    resp = _fallback_recommendation_set(grounded, note="no key")
    assert len(resp.recommendations) == 5

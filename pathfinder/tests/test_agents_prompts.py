from services.agents.grounding import GroundedCandidate
from services.agents.prompts import (
    RECOMMEND_TOOL,
    SYSTEM_PROMPT,
    build_user_message,
    render_candidate,
    render_profile,
)
from services.agents.retrieval import CandidateOccupation
from services.retrieval.usajobs import JobPosting, Salary
from services.retrieval.wages import WageSnapshot


PROFILE = {
    "branch": "army",
    "component": "active",
    "occupation_code": "11B",
    "pay_grade": "E-5",
    "years_of_service": 8,
    "combat_deployments": 2,
    "leadership_roles": "Squad Leader",
    "additional_skills": None,
    "education_level": "some_college",
    "certifications": None,
    "civilian_skills": None,
    "location": "Boise, ID",
    "open_to_relocate": False,
    "dependents": 2,
    "target_salary": 75000,
    "work_style": "in_person",
    "goals": "Leadership track.",
}


def _candidate(**overrides) -> CandidateOccupation:
    base = dict(
        soc_code="13-1151.00",
        title="Training and Development Specialists",
        description="Design and conduct training programs.",
        job_zone=4,
        job_zone_summary="Bachelor's typical.",
        top_skills=["Active Listening", "Speaking", "Instructing"],
        top_knowledge=["Education and Training", "English Language"],
        core_tasks=["Conduct training", "Evaluate effectiveness"],
        source="embedding",
        similarity=0.61,
    )
    base.update(overrides)
    return CandidateOccupation(**base)


def _grounded(**overrides) -> GroundedCandidate:
    base = dict(
        candidate=_candidate(),
        wages=WageSnapshot(
            soc_code="13-1151",
            area_type="msa",
            area_name="Boise City, ID",
            employment=350,
            mean_annual=72000,
            median_annual=68000,
            p10_annual=48000,
            p90_annual=98000,
            state_abbr="ID",
            data_year=2024,
        ),
        postings_count=12,
        sample_postings=[],
    )
    base.update(overrides)
    return GroundedCandidate(**base)


def test_system_prompt_constrains_output() -> None:
    assert "ONLY" in SYSTEM_PROMPT
    assert "soc_code" in SYSTEM_PROMPT
    assert "recommend tool" in SYSTEM_PROMPT


def test_recommend_tool_schema_shape() -> None:
    assert RECOMMEND_TOOL["name"] == "recommend"
    schema = RECOMMEND_TOOL["input_schema"]
    item = schema["properties"]["recommendations"]["items"]
    assert "soc_code" in item["required"]
    assert "rationale" in item["required"]


def test_render_profile_includes_key_fields() -> None:
    text = render_profile(PROFILE)
    assert "E-5 Army 11B" in text
    assert "8 years of service" in text
    assert "2 combat deployments" in text
    assert "Boise, ID" in text
    assert "not open to relocate" in text
    assert "$75,000+" in text
    assert "Squad Leader" in text
    assert "Leadership track." in text


def test_render_profile_handles_no_target_salary_no_combat() -> None:
    text = render_profile({**PROFILE, "target_salary": None, "combat_deployments": 0})
    assert "no target salary stated" in text
    assert "no combat deployments" in text


def test_render_candidate_includes_wage_and_postings() -> None:
    text = render_candidate(1, _grounded())
    assert "[1]" in text
    assert "13-1151.00" in text
    assert "Training and Development Specialists" in text
    assert "Job zone 4" in text
    assert "Active Listening" in text
    assert "Boise City, ID" in text
    assert "12" in text  # postings count


def test_render_candidate_omits_missing_data() -> None:
    text = render_candidate(1, _grounded(wages=None, postings_count=0))
    assert "Wage" not in text
    assert "USAJobs" not in text


def test_render_candidate_with_sample_posting() -> None:
    sample = JobPosting(
        title="Training Specialist",
        department="Department of Defense",
        agency=None,
        locations=["Boise, ID"],
        salary=Salary(min_amount=70000, max_amount=95000, interval="annual"),
        url="https://example",
        posted_date="2026-04-01",
        closes_date=None,
        job_categories=[],
    )
    text = render_candidate(1, _grounded(sample_postings=[sample]))
    assert "Training Specialist at Department of Defense" in text


def test_build_user_message_lists_all_candidates() -> None:
    g1 = _grounded()
    g2 = _grounded(candidate=_candidate(soc_code="33-3051.00", title="Police"))
    text = build_user_message(PROFILE, [g1, g2])
    assert "Veteran profile:" in text
    assert "Candidate occupations:" in text
    assert "[1]" in text
    assert "[2]" in text
    assert "13-1151.00" in text
    assert "33-3051.00" in text
    assert "recommend tool" in text

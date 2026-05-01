from api.schemas import RecommendRequest
from services.agents.retrieval import (
    CandidateOccupation,
    _is_military_only,
    _to_candidate,
    build_profile_text,
)
from services.ingest.onet import OccupationDetail, RatedItem


def _request(**overrides) -> RecommendRequest:
    base = {
        "branch": "army",
        "component": "active",
        "occupation_code": "11B",
        "pay_grade": "E-5",
        "years_of_service": 8,
        "combat_deployments": 2,
        "leadership_roles": "Squad Leader, Team Leader",
        "additional_skills": "Air Assault, Combat Lifesaver",
        "education_level": "some_college",
        "certifications": None,
        "civilian_skills": "Logistics from prior civilian job",
        "location": "Boise, ID",
        "open_to_relocate": False,
        "dependents": 2,
        "target_salary": 75000,
        "work_style": "in_person",
        "goals": "Stable income, leadership track.",
    }
    base.update(overrides)
    return RecommendRequest(**base)


def test_build_profile_text_includes_service_and_skills() -> None:
    text = build_profile_text(_request())
    assert "E-5 Army 11B" in text
    assert "8 years of service" in text
    assert "2 combat deployments" in text
    assert "Squad Leader" in text
    assert "Air Assault" in text
    assert "Logistics" in text
    assert "Some College" in text
    assert "Stable income" in text


def test_build_profile_text_omits_empty_optional() -> None:
    text = build_profile_text(_request(
        leadership_roles=None, additional_skills=None,
        civilian_skills=None, certifications=None, goals=None,
    ))
    assert "Leadership roles:" not in text
    assert "Specialty schools" not in text
    assert "Civilian skills" not in text
    assert "Certifications" not in text
    assert "Goals:" not in text


def test_build_profile_text_skips_zero_combat_deployments() -> None:
    text = build_profile_text(_request(combat_deployments=0))
    assert "combat deployments" not in text.lower()


def test_is_military_only() -> None:
    assert _is_military_only("55-3016.00")
    assert _is_military_only("55-1015.00")
    assert not _is_military_only("33-3051.00")
    assert not _is_military_only("13-1151.00")


def test_to_candidate_maps_fields() -> None:
    occ = OccupationDetail(
        soc_code="33-3051.00",
        title="Police and Sheriff's Patrol Officers",
        description="Maintain order, respond to emergencies, enforce laws.",
        job_zone=3,
        job_zone_summary="High school plus academy.",
        top_skills=[RatedItem(name="Active Listening", importance=4.12)],
        top_knowledge=[RatedItem(name="Public Safety and Security", importance=4.5)],
        core_tasks=["Patrol assigned area", "Investigate incidents"],
    )
    c = _to_candidate(occ, source="crosswalk", similarity=None)
    assert isinstance(c, CandidateOccupation)
    assert c.soc_code == "33-3051.00"
    assert c.top_skills == ["Active Listening"]
    assert c.top_knowledge == ["Public Safety and Security"]
    assert c.source == "crosswalk"
    assert c.similarity is None

from fastapi.testclient import TestClient

from api.main import app


SAMPLE_REQUEST = {
    "branch": "army",
    "component": "active",
    "occupation_code": "11B",
    "pay_grade": "E-5",
    "years_of_service": 8,
    "combat_deployments": 2,
    "leadership_roles": "Team Leader, Squad Leader",
    "additional_skills": "Air Assault, Combat Lifesaver",
    "education_level": "some_college",
    "certifications": None,
    "civilian_skills": "Fleet logistics from prior civilian job",
    "location": "Boise, ID",
    "open_to_relocate": False,
    "dependents": 2,
    "target_salary": 75000,
    "work_style": "in_person",
    "goals": "Stable income, stay close to family, leadership track.",
}


def test_health() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_recommend_stub_shape() -> None:
    with TestClient(app) as client:
        response = client.post("/v1/recommend", json=SAMPLE_REQUEST)
        assert response.status_code == 200
        body = response.json()
        assert "recommendations" in body
        assert isinstance(body["recommendations"], list)
        assert len(body["recommendations"]) >= 1
        rec = body["recommendations"][0]
        expected = {
            "soc_code", "title", "fit_score", "rationale",
            "skill_gaps", "action_steps", "citations",
        }
        assert expected <= set(rec)


def test_recommend_rejects_missing_required_fields() -> None:
    with TestClient(app) as client:
        response = client.post("/v1/recommend", json={"branch": "army"})
        assert response.status_code == 422

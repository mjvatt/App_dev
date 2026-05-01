from fastapi.testclient import TestClient

from api.main import app


def test_health() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_recommend_stub_shape() -> None:
    with TestClient(app) as client:
        response = client.post("/v1/recommend", json={"moc": "11B"})
        assert response.status_code == 200
        body = response.json()
        assert "recommendations" in body
        assert isinstance(body["recommendations"], list)
        assert len(body["recommendations"]) >= 1
        rec = body["recommendations"][0]
        assert {"soc_code", "title", "fit_score", "rationale", "skill_gaps", "citations"} <= set(rec)

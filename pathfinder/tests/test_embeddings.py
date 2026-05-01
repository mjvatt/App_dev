from services.retrieval.embeddings import build_occupation_embedding_text


def test_build_includes_required_fields() -> None:
    text = build_occupation_embedding_text(
        title="Police Officer",
        description="Maintain order and respond to incidents.",
        top_skills=["Active Listening", "Speaking"],
        top_knowledge=["Public Safety and Security"],
        job_zone=3,
        job_zone_summary="High school diploma plus academy.",
        core_tasks=["Patrol assigned area.", "Respond to calls."],
    )
    assert "Title: Police Officer" in text
    assert "Description: Maintain order and respond to incidents." in text
    assert "Active Listening" in text
    assert "Speaking" in text
    assert "Public Safety and Security" in text
    assert "Job zone 3" in text
    assert "academy" in text
    assert "Patrol assigned area." in text


def test_build_omits_empty_sections() -> None:
    text = build_occupation_embedding_text(
        title="Foo",
        description="Bar.",
        top_skills=[],
        top_knowledge=[],
        job_zone=None,
        job_zone_summary=None,
        core_tasks=[],
    )
    assert text == "Title: Foo\nDescription: Bar."


def test_build_caps_core_tasks() -> None:
    many_tasks = [f"Task {i}." for i in range(20)]
    text = build_occupation_embedding_text(
        title="Foo",
        description="Bar.",
        top_skills=[],
        top_knowledge=[],
        job_zone=None,
        job_zone_summary=None,
        core_tasks=many_tasks,
    )
    assert "Task 0." in text
    assert "Task 5." in text
    assert "Task 6." not in text

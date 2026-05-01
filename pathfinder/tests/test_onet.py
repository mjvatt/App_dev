import json
from dataclasses import asdict
from pathlib import Path

from services.ingest.onet import (
    OccupationDetail,
    OnetIndex,
    RatedItem,
    load_index,
)
from services.retrieval.onet import get_occupation, lookup_occupations_for_moc


def _fixture_index() -> OnetIndex:
    return OnetIndex(
        onet_db_version="30.2",
        crosswalk_version="07/2024",
        moc_to_onetsoc={
            "11B": ["33-3051.00", "33-9032.00"],
            "25B": ["15-1244.00"],
        },
        occupations={
            "33-3051.00": OccupationDetail(
                soc_code="33-3051.00",
                title="Police and Sheriff's Patrol Officers",
                description="Maintain order, respond to emergencies, enforce laws.",
                job_zone=2,
                job_zone_summary="Most of these occupations require a high school diploma.",
                top_skills=[RatedItem(name="Active Listening", importance=4.12)],
                top_knowledge=[RatedItem(name="Public Safety and Security", importance=4.5)],
                core_tasks=["Patrol assigned area", "Investigate incidents"],
            ),
            "33-9032.00": OccupationDetail(
                soc_code="33-9032.00",
                title="Security Guards",
                description="Guard, patrol, or monitor premises.",
                job_zone=2,
                job_zone_summary="High school diploma typical.",
                top_skills=[],
                top_knowledge=[],
                core_tasks=[],
            ),
            "15-1244.00": OccupationDetail(
                soc_code="15-1244.00",
                title="Network and Computer Systems Administrators",
                description="Install, configure, and support network systems.",
                job_zone=4,
                job_zone_summary="Bachelor's degree typical.",
                top_skills=[],
                top_knowledge=[],
                core_tasks=[],
            ),
        },
    )


def _write_fixture(tmp_path: Path) -> Path:
    target = tmp_path / "occupation_index.json"
    target.write_text(json.dumps(asdict(_fixture_index()), indent=2), encoding="utf-8")
    return target


def test_load_index_round_trips_via_fixture(tmp_path: Path) -> None:
    fixture = _write_fixture(tmp_path)
    idx = load_index(fixture)
    assert idx.onet_db_version == "30.2"
    assert idx.crosswalk_version == "07/2024"
    assert "11B" in idx.moc_to_onetsoc
    assert "33-3051.00" in idx.occupations
    occ = idx.occupations["33-3051.00"]
    assert occ.title == "Police and Sheriff's Patrol Officers"
    assert occ.top_skills[0].name == "Active Listening"
    assert occ.top_skills[0].importance == 4.12
    assert "Patrol assigned area" in occ.core_tasks


def test_lookup_occupations_for_moc_known() -> None:
    idx = _fixture_index()
    results = lookup_occupations_for_moc("11B", index=idx)
    assert [r.soc_code for r in results] == ["33-3051.00", "33-9032.00"]


def test_lookup_occupations_for_moc_is_case_insensitive() -> None:
    idx = _fixture_index()
    assert lookup_occupations_for_moc("11b", index=idx)[0].soc_code == "33-3051.00"


def test_lookup_occupations_for_moc_unknown() -> None:
    idx = _fixture_index()
    assert lookup_occupations_for_moc("ZZZ", index=idx) == []


def test_get_occupation() -> None:
    idx = _fixture_index()
    occ = get_occupation("15-1244.00", index=idx)
    assert occ is not None
    assert occ.job_zone == 4
    assert get_occupation("99-0000.00", index=idx) is None

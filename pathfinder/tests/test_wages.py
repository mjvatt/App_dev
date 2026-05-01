from services.ingest.bls import (
    _MSA_STATE_RE,
    _coerce_int,
    _state_abbr_for,
)
from services.retrieval.wages import WageSnapshot, _normalize_soc, _resolve_state


def test_coerce_int_handles_suppression() -> None:
    assert _coerce_int("*") is None
    assert _coerce_int("**") is None
    assert _coerce_int("#") is None
    assert _coerce_int("") is None
    assert _coerce_int(None) is None


def test_coerce_int_strips_commas() -> None:
    assert _coerce_int("1,234") == 1234
    assert _coerce_int("12,345.67") == 12345
    assert _coerce_int(42) == 42


def test_state_abbr_for_state() -> None:
    assert _state_abbr_for("state", "Idaho") == "ID"
    assert _state_abbr_for("state", "New York") == "NY"
    assert _state_abbr_for("state", "District of Columbia") == "DC"
    assert _state_abbr_for("state", "Mars") is None


def test_state_abbr_for_msa() -> None:
    assert _state_abbr_for("msa", "Boise City, ID Metropolitan Statistical Area") == "ID"
    assert _state_abbr_for(
        "msa", "New York-Newark-Jersey City, NY-NJ-PA Metropolitan Statistical Area"
    ) == "NY"


def test_state_abbr_for_national() -> None:
    assert _state_abbr_for("national", "U.S.") is None


def test_msa_state_regex() -> None:
    m = _MSA_STATE_RE.search("Boise City, ID Metropolitan Statistical Area")
    assert m and m.group(1) == "ID"


def test_normalize_soc_strips_onet_suffix() -> None:
    assert _normalize_soc("11-1011.00") == "11-1011"
    assert _normalize_soc("11-1011.03") == "11-1011"
    assert _normalize_soc("33-3051") == "33-3051"


def test_resolve_state() -> None:
    assert _resolve_state("Idaho") == "ID"
    assert _resolve_state("idaho") == "ID"
    assert _resolve_state("Boise, ID") == "ID"
    assert _resolve_state("ID") == "ID"
    assert _resolve_state("Mars") is None
    assert _resolve_state("") is None
    assert _resolve_state("flexible") is None


def test_wage_snapshot_range_str() -> None:
    snap = WageSnapshot(
        soc_code="33-3051", area_type="state", area_name="Idaho",
        employment=1000, median_annual=60000, mean_annual=62000,
        p10_annual=42000, p90_annual=85000, state_abbr="ID", data_year=2024,
    )
    assert snap.range_str() == "$42,000 – $85,000"


def test_wage_snapshot_range_str_falls_back_to_median() -> None:
    snap = WageSnapshot(
        soc_code="33-3051", area_type="national", area_name="U.S.",
        employment=None, median_annual=60000, mean_annual=None,
        p10_annual=None, p90_annual=None, state_abbr=None, data_year=2024,
    )
    assert snap.range_str() == "~$60,000 median"


def test_wage_snapshot_range_str_returns_none_when_empty() -> None:
    snap = WageSnapshot(
        soc_code="33-3051", area_type="national", area_name="U.S.",
        employment=None, median_annual=None, mean_annual=None,
        p10_annual=None, p90_annual=None, state_abbr=None, data_year=2024,
    )
    assert snap.range_str() is None

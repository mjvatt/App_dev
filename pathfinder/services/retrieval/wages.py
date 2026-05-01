"""Runtime lookup over BLS OEWS wage data.

Resolves a SOC code + free-text location to the most specific wage row
available, falling back from MSA → state → national.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from services.retrieval.db_models import BLSWage

# Reuse the canonical state name → abbreviation map.
from services.ingest.bls import _STATE_ABBR


@dataclass
class WageSnapshot:
    soc_code: str
    area_type: str
    area_name: str
    employment: int | None
    median_annual: int | None
    mean_annual: int | None
    p10_annual: int | None
    p90_annual: int | None
    state_abbr: str | None
    data_year: int

    def range_str(self) -> str | None:
        if self.p10_annual and self.p90_annual:
            return f"${self.p10_annual:,} – ${self.p90_annual:,}"
        if self.median_annual:
            return f"~${self.median_annual:,} median"
        return None


def _normalize_soc(code: str) -> str:
    """O*NET-SOC (e.g., '11-1011.00') → SOC (e.g., '11-1011')."""
    return code.split(".", 1)[0].strip()


@lru_cache(maxsize=1)
def _state_lookup() -> dict[str, str]:
    """Lowercased state name and abbreviation → canonical abbreviation."""
    out: dict[str, str] = {}
    for name, abbr in _STATE_ABBR.items():
        out[name.lower()] = abbr
        out[abbr.lower()] = abbr
    return out


def _resolve_state(location: str) -> str | None:
    if not location:
        return None
    text = location.strip().lower()
    lookup = _state_lookup()
    if text in lookup:
        return lookup[text]
    # Try suffix tokens: "Boise, ID" → "id"
    parts = [p.strip() for p in text.replace("/", ",").split(",") if p.strip()]
    for part in reversed(parts):
        if part in lookup:
            return lookup[part]
    return None


async def _try_msa(session: AsyncSession, soc: str, city: str) -> BLSWage | None:
    stmt = (
        select(BLSWage)
        .where(BLSWage.soc_code == soc, BLSWage.area_type == "msa")
        .where(BLSWage.area_name.ilike(f"%{city}%"))
        .order_by(BLSWage.median_annual.desc().nulls_last())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _try_state(session: AsyncSession, soc: str, state_abbr: str) -> BLSWage | None:
    stmt = (
        select(BLSWage)
        .where(
            BLSWage.soc_code == soc,
            BLSWage.area_type == "state",
            BLSWage.state_abbr == state_abbr,
        )
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _try_national(session: AsyncSession, soc: str) -> BLSWage | None:
    stmt = (
        select(BLSWage)
        .where(BLSWage.soc_code == soc, BLSWage.area_type == "national")
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_wage_snapshot(
    session: AsyncSession,
    soc_code: str,
    location: str | None = None,
) -> WageSnapshot | None:
    """Resolve SOC × location to the most specific wage row.

    Priority:
    - empty / 'flexible' / 'anywhere' → national
    - "<state>" with no comma → state row first, fall back to MSA / national
    - everything else (e.g., "Boise, ID" or just "Boise") → MSA substring on
      the first token, then state if resolvable, then national
    """
    soc = _normalize_soc(soc_code)
    text = (location or "").strip()
    if not text or text.lower() in {"flexible", "anywhere"}:
        row = await _try_national(session, soc)
        return _to_snapshot(row) if row else None

    state_abbr = _resolve_state(text)
    has_comma = "," in text
    is_bare_state = bool(state_abbr) and not has_comma

    if is_bare_state:
        if (row := await _try_state(session, soc, state_abbr)):
            return _to_snapshot(row)

    first_token = text.split(",", 1)[0].strip()
    if len(first_token) >= 3 and not is_bare_state:
        if (row := await _try_msa(session, soc, first_token)):
            return _to_snapshot(row)

    if state_abbr and not is_bare_state:
        if (row := await _try_state(session, soc, state_abbr)):
            return _to_snapshot(row)

    row = await _try_national(session, soc)
    return _to_snapshot(row) if row else None


def _to_snapshot(row: BLSWage) -> WageSnapshot:
    return WageSnapshot(
        soc_code=row.soc_code,
        area_type=row.area_type,
        area_name=row.area_name,
        employment=row.employment,
        median_annual=row.median_annual,
        mean_annual=row.mean_annual,
        p10_annual=row.p10_annual,
        p90_annual=row.p90_annual,
        state_abbr=row.state_abbr,
        data_year=row.data_year,
    )

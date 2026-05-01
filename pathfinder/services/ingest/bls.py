"""BLS Occupational Employment and Wage Statistics (OEWS) ingestion.

Downloads the May 2024 OEWS national, state, and MSA wage tables, parses
the relevant columns, and upserts into bls_wages so the synthesizer can
ground recommendations in real wage data for the user's geography.

CLI:
    python -m services.ingest.bls build [--force]

Pre-requisites:
    - Postgres running and migrated (alembic upgrade head).
"""
from __future__ import annotations

import argparse
import asyncio
import io
import re
import sys
import zipfile
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

import httpx
from openpyxl import load_workbook
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from services.retrieval.db_models import BLSWage
from services.retrieval.store import session as db_session

OEWS_VERSION = "M2024"
DATA_YEAR = 2024

DOWNLOADS = {
    "national": (
        "https://www.bls.gov/oes/special-requests/oesm24nat.zip",
        "oesm24nat/national_M2024_dl.xlsx",
    ),
    "state": (
        "https://www.bls.gov/oes/special-requests/oesm24st.zip",
        "oesm24st/state_M2024_dl.xlsx",
    ),
    "msa": (
        "https://www.bls.gov/oes/special-requests/oesm24ma.zip",
        "oesm24ma/MSA_M2024_dl.xlsx",
    ),
}

DATA_ROOT = Path(__file__).resolve().parents[2] / "data" / "bls"
RAW_DIR = DATA_ROOT / "raw"

# BLS gates raw downloads on a credible Accept header. Including a Referer
# back to the public tables page is the difference between 200 and 403.
_BLS_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.bls.gov/oes/tables.htm",
}

# Suppression markers BLS uses in numeric fields. Convert to None.
_SUPPRESSION = {"*", "**", "#", "(8)", "(9)", "", "NA", "N/A"}

_STATE_ABBR = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT",
    "Delaware": "DE", "District of Columbia": "DC", "Florida": "FL",
    "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL",
    "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY",
    "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA",
    "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS", "Missouri": "MO",
    "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH",
    "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
    "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN",
    "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA",
    "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
    "Puerto Rico": "PR", "Guam": "GU", "U.S. Virgin Islands": "VI",
}

# MSA AREA_TITLE state suffix, e.g., "Boise City, ID Metropolitan Statistical Area".
_MSA_STATE_RE = re.compile(r",\s*([A-Z]{2}(?:-[A-Z]{2})*)\b")


@dataclass
class WageRow:
    soc_code: str
    area_type: str
    area_code: str
    area_name: str
    state_abbr: str | None
    employment: int | None
    mean_annual: int | None
    median_annual: int | None
    p10_annual: int | None
    p25_annual: int | None
    p75_annual: int | None
    p90_annual: int | None


def _coerce_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value).strip().replace(",", "")
    if s in _SUPPRESSION:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _state_abbr_for(area_type: str, area_title: str) -> str | None:
    if area_type == "state":
        return _STATE_ABBR.get(area_title.strip())
    if area_type == "msa":
        m = _MSA_STATE_RE.search(area_title)
        if m:
            return m.group(1).split("-")[0]
    return None


def _ensure_download(url: str, dest: Path, force: bool = False) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force and dest.stat().st_size > 1000:
        return dest
    response = httpx.get(url, headers=_BLS_HEADERS, follow_redirects=True, timeout=600)
    response.raise_for_status()
    dest.write_bytes(response.content)
    return dest


def _iter_xlsx(zip_path: Path, member: str) -> Iterator[dict[str, object]]:
    with zipfile.ZipFile(zip_path) as zf:
        with zf.open(member) as f:
            buf = io.BytesIO(f.read())
    wb = load_workbook(buf, read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = list(next(rows))
    for row in rows:
        if row is None or all(c is None for c in row):
            continue
        yield dict(zip(header, row, strict=False))


def _parse_file(area_type: str, zip_path: Path, member: str) -> Iterable[WageRow]:
    for row in _iter_xlsx(zip_path, member):
        if (row.get("O_GROUP") or "").lower() != "detailed":
            continue
        if (row.get("I_GROUP") or "").lower() != "cross-industry":
            continue
        soc_code = (row.get("OCC_CODE") or "").strip()
        if not soc_code or soc_code == "00-0000":
            continue
        area_title = (row.get("AREA_TITLE") or "").strip()
        area_code = str(row.get("AREA") or "").strip() or "0"
        yield WageRow(
            soc_code=soc_code,
            area_type=area_type,
            area_code=area_code,
            area_name=area_title,
            state_abbr=_state_abbr_for(area_type, area_title),
            employment=_coerce_int(row.get("TOT_EMP")),
            mean_annual=_coerce_int(row.get("A_MEAN")),
            median_annual=_coerce_int(row.get("A_MEDIAN")),
            p10_annual=_coerce_int(row.get("A_PCT10")),
            p25_annual=_coerce_int(row.get("A_PCT25")),
            p75_annual=_coerce_int(row.get("A_PCT75")),
            p90_annual=_coerce_int(row.get("A_PCT90")),
        )


async def _upsert_batch(session, batch: list[WageRow]) -> None:
    rows = [
        {
            "soc_code": r.soc_code,
            "area_type": r.area_type,
            "area_code": r.area_code,
            "area_name": r.area_name,
            "state_abbr": r.state_abbr,
            "employment": r.employment,
            "mean_annual": r.mean_annual,
            "median_annual": r.median_annual,
            "p10_annual": r.p10_annual,
            "p25_annual": r.p25_annual,
            "p75_annual": r.p75_annual,
            "p90_annual": r.p90_annual,
            "data_year": DATA_YEAR,
        }
        for r in batch
    ]
    stmt = pg_insert(BLSWage).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_bls_wages_soc_area",
        set_={
            "area_name": stmt.excluded.area_name,
            "state_abbr": stmt.excluded.state_abbr,
            "employment": stmt.excluded.employment,
            "mean_annual": stmt.excluded.mean_annual,
            "median_annual": stmt.excluded.median_annual,
            "p10_annual": stmt.excluded.p10_annual,
            "p25_annual": stmt.excluded.p25_annual,
            "p75_annual": stmt.excluded.p75_annual,
            "p90_annual": stmt.excluded.p90_annual,
            "data_year": stmt.excluded.data_year,
            "indexed_at": func.now(),
        },
    )
    await session.execute(stmt)


async def build(force: bool = False, batch_size: int = 1000) -> int:
    print(f"[bls] downloading {OEWS_VERSION} archives...")
    paths: dict[str, tuple[Path, str]] = {}
    for area_type, (url, member) in DOWNLOADS.items():
        dest = RAW_DIR / Path(url).name
        _ensure_download(url, dest, force=force)
        paths[area_type] = (dest, member)

    total = 0
    async with db_session() as session:
        for area_type, (zip_path, member) in paths.items():
            print(f"[bls] parsing {area_type}: {member}")
            batch: list[WageRow] = []
            count = 0
            for wage in _parse_file(area_type, zip_path, member):
                batch.append(wage)
                if len(batch) >= batch_size:
                    await _upsert_batch(session, batch)
                    count += len(batch)
                    batch.clear()
                    if count % (batch_size * 10) == 0:
                        print(f"[bls]   {area_type}: {count} rows")
            if batch:
                await _upsert_batch(session, batch)
                count += len(batch)
            print(f"[bls]   {area_type}: {count} rows")
            total += count
        await session.commit()
    print(f"[bls] done. {total} rows upserted.")
    return total


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="bls")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub_build = sub.add_parser("build", help="Download OEWS archives and load wages.")
    sub_build.add_argument("--force", action="store_true", help="Re-download archives.")
    args = parser.parse_args(argv)
    if args.cmd == "build":
        asyncio.run(build(force=args.force))
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())

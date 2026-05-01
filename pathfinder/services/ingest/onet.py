"""O*NET data ingestion.

Downloads the O*NET 30.2 text database and the Military Occupational
Classification crosswalk, parses the relevant tables, and writes a denormalized
JSON index for runtime consumption by services.retrieval.onet.

CLI:
    python -m services.ingest.onet build [--force]
    python -m services.ingest.onet status
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import zipfile
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from pathlib import Path

import httpx

ONET_DB_URL = "https://www.onetcenter.org/dl_files/database/db_30_2_text.zip"
ONET_DB_VERSION = "30.2"
ONET_DB_DIR_IN_ZIP = "db_30_2_text"

MILITARY_CROSSWALK_URL = "https://www.onetcenter.org/dl_files/2019/military_crosswalk.zip"
MILITARY_CROSSWALK_VERSION = "07/2024"
MILITARY_CROSSWALK_CSV = "military_crosswalk/milx0724.csv"

DATA_ROOT = Path(__file__).resolve().parents[2] / "data" / "onet"
RAW_DIR = DATA_ROOT / "raw"
PARSED_DIR = DATA_ROOT / "parsed"
INDEX_FILE = PARSED_DIR / "occupation_index.json"

TOP_SKILLS_PER_OCCUPATION = 10
TOP_KNOWLEDGE_PER_OCCUPATION = 10
MAX_CORE_TASKS = 12


@dataclass
class RatedItem:
    name: str
    importance: float


@dataclass
class JobZoneInfo:
    zone: int
    summary: str


@dataclass
class OccupationDetail:
    soc_code: str
    title: str
    description: str
    job_zone: int | None
    job_zone_summary: str | None
    top_skills: list[RatedItem]
    top_knowledge: list[RatedItem]
    core_tasks: list[str]


@dataclass
class OnetIndex:
    onet_db_version: str
    crosswalk_version: str
    moc_to_onetsoc: dict[str, list[str]]
    occupations: dict[str, OccupationDetail]


def _ensure_download(url: str, dest: Path, force: bool = False) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        return dest
    with httpx.stream("GET", url, follow_redirects=True, timeout=300.0) as response:
        response.raise_for_status()
        with dest.open("wb") as f:
            for chunk in response.iter_bytes(chunk_size=1024 * 256):
                f.write(chunk)
    return dest


def download_onet_database(force: bool = False) -> Path:
    return _ensure_download(ONET_DB_URL, RAW_DIR / "db_30_2_text.zip", force=force)


def download_military_crosswalk(force: bool = False) -> Path:
    return _ensure_download(
        MILITARY_CROSSWALK_URL, RAW_DIR / "military_crosswalk.zip", force=force
    )


def _open_tsv(zf: zipfile.ZipFile, name: str) -> Iterable[dict[str, str]]:
    with zf.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        yield from csv.DictReader(text, delimiter="\t")


def _open_csv(zf: zipfile.ZipFile, name: str) -> Iterable[dict[str, str]]:
    with zf.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        yield from csv.DictReader(text)


def parse_occupation_data(db_zip: Path) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    with zipfile.ZipFile(db_zip) as zf:
        for row in _open_tsv(zf, f"{ONET_DB_DIR_IN_ZIP}/Occupation Data.txt"):
            soc = row["O*NET-SOC Code"]
            out[soc] = {"title": row["Title"], "description": row["Description"]}
    return out


def parse_rated_items(
    db_zip: Path, file_name: str, top_n: int
) -> dict[str, list[RatedItem]]:
    """Parse Skills.txt or Knowledge.txt — only IM (importance) rows. Top N per SOC."""
    raw: dict[str, list[tuple[float, str]]] = defaultdict(list)
    with zipfile.ZipFile(db_zip) as zf:
        for row in _open_tsv(zf, f"{ONET_DB_DIR_IN_ZIP}/{file_name}"):
            if row.get("Scale ID") != "IM":
                continue
            try:
                value = float(row["Data Value"])
            except (KeyError, ValueError):
                continue
            raw[row["O*NET-SOC Code"]].append((value, row["Element Name"]))
    out: dict[str, list[RatedItem]] = {}
    for soc, items in raw.items():
        items.sort(reverse=True)
        out[soc] = [
            RatedItem(name=name, importance=round(score, 2)) for score, name in items[:top_n]
        ]
    return out


def parse_job_zones(db_zip: Path) -> dict[str, JobZoneInfo]:
    summaries: dict[int, str] = {}
    with zipfile.ZipFile(db_zip) as zf:
        for row in _open_tsv(zf, f"{ONET_DB_DIR_IN_ZIP}/Job Zone Reference.txt"):
            try:
                z = int(row["Job Zone"])
            except (KeyError, ValueError):
                continue
            summaries[z] = (row.get("Education") or "").strip()
        out: dict[str, JobZoneInfo] = {}
        for row in _open_tsv(zf, f"{ONET_DB_DIR_IN_ZIP}/Job Zones.txt"):
            try:
                z = int(row["Job Zone"])
            except (KeyError, ValueError):
                continue
            out[row["O*NET-SOC Code"]] = JobZoneInfo(zone=z, summary=summaries.get(z, ""))
    return out


def parse_core_tasks(db_zip: Path, max_per_soc: int) -> dict[str, list[str]]:
    raw: dict[str, list[str]] = defaultdict(list)
    with zipfile.ZipFile(db_zip) as zf:
        for row in _open_tsv(zf, f"{ONET_DB_DIR_IN_ZIP}/Task Statements.txt"):
            if (row.get("Task Type") or "").strip() != "Core":
                continue
            soc = row["O*NET-SOC Code"]
            if len(raw[soc]) < max_per_soc:
                raw[soc].append(row["Task"].strip())
    return dict(raw)


def parse_crosswalk(crosswalk_zip: Path) -> dict[str, list[str]]:
    """MOC → unique sorted list of O*NET-SOC codes from ONET1..ONET4 columns."""
    out: dict[str, set[str]] = defaultdict(set)
    onet_columns = ["ONET1", "ONET2", "ONET3", "ONET4"]
    with zipfile.ZipFile(crosswalk_zip) as zf:
        for row in _open_csv(zf, MILITARY_CROSSWALK_CSV):
            if (row.get("STATUS") or "").strip() != "A":
                continue
            moc = (row.get("MOC") or "").strip()
            if not moc:
                continue
            for col in onet_columns:
                code = (row.get(col) or "").strip()
                if code:
                    out[moc].add(code)
    return {moc: sorted(socs) for moc, socs in out.items() if socs}


def build_index(force: bool = False) -> Path:
    print(f"[onet] downloading O*NET {ONET_DB_VERSION} database...")
    db_zip = download_onet_database(force=force)
    print(f"[onet] downloading Military Crosswalk ({MILITARY_CROSSWALK_VERSION})...")
    crosswalk_zip = download_military_crosswalk(force=force)

    print("[onet] parsing occupation core...")
    occ_core = parse_occupation_data(db_zip)
    print(f"[onet]   {len(occ_core)} occupations")

    print("[onet] parsing skills (IM only, top {})...".format(TOP_SKILLS_PER_OCCUPATION))
    skills = parse_rated_items(db_zip, "Skills.txt", TOP_SKILLS_PER_OCCUPATION)
    print("[onet] parsing knowledge (IM only, top {})...".format(TOP_KNOWLEDGE_PER_OCCUPATION))
    knowledge = parse_rated_items(db_zip, "Knowledge.txt", TOP_KNOWLEDGE_PER_OCCUPATION)
    print("[onet] parsing job zones...")
    zones = parse_job_zones(db_zip)
    print("[onet] parsing core tasks...")
    tasks = parse_core_tasks(db_zip, MAX_CORE_TASKS)

    print("[onet] parsing military crosswalk...")
    crosswalk = parse_crosswalk(crosswalk_zip)
    print(f"[onet]   {len(crosswalk)} MOCs mapped")

    occupations: dict[str, OccupationDetail] = {}
    for soc, core in occ_core.items():
        zone = zones.get(soc)
        occupations[soc] = OccupationDetail(
            soc_code=soc,
            title=core["title"],
            description=core["description"],
            job_zone=zone.zone if zone else None,
            job_zone_summary=zone.summary if zone else None,
            top_skills=skills.get(soc, []),
            top_knowledge=knowledge.get(soc, []),
            core_tasks=tasks.get(soc, []),
        )

    index = OnetIndex(
        onet_db_version=ONET_DB_VERSION,
        crosswalk_version=MILITARY_CROSSWALK_VERSION,
        moc_to_onetsoc=crosswalk,
        occupations=occupations,
    )

    PARSED_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_FILE.write_text(json.dumps(asdict(index), indent=2), encoding="utf-8")
    print(f"[onet] wrote {INDEX_FILE} ({INDEX_FILE.stat().st_size // 1024} KB)")
    return INDEX_FILE


def load_index(path: Path | None = None) -> OnetIndex:
    p = path or INDEX_FILE
    raw = json.loads(p.read_text(encoding="utf-8"))
    occupations = {
        soc: OccupationDetail(
            soc_code=detail["soc_code"],
            title=detail["title"],
            description=detail["description"],
            job_zone=detail.get("job_zone"),
            job_zone_summary=detail.get("job_zone_summary"),
            top_skills=[RatedItem(**i) for i in detail.get("top_skills", [])],
            top_knowledge=[RatedItem(**i) for i in detail.get("top_knowledge", [])],
            core_tasks=detail.get("core_tasks", []),
        )
        for soc, detail in raw["occupations"].items()
    }
    return OnetIndex(
        onet_db_version=raw["onet_db_version"],
        crosswalk_version=raw["crosswalk_version"],
        moc_to_onetsoc=raw["moc_to_onetsoc"],
        occupations=occupations,
    )


def _status() -> int:
    if not INDEX_FILE.exists():
        print("[onet] no index. Run: python -m services.ingest.onet build")
        return 1
    idx = load_index()
    print(f"[onet] index at {INDEX_FILE}")
    print(f"[onet]   O*NET DB version: {idx.onet_db_version}")
    print(f"[onet]   crosswalk version: {idx.crosswalk_version}")
    print(f"[onet]   occupations: {len(idx.occupations)}")
    print(f"[onet]   MOCs mapped: {len(idx.moc_to_onetsoc)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="onet")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub_build = sub.add_parser("build", help="Download O*NET archives and build the index.")
    sub_build.add_argument("--force", action="store_true", help="Re-download archives.")
    sub.add_parser("status", help="Report cache state.")
    args = parser.parse_args(argv)
    if args.cmd == "build":
        build_index(force=args.force)
        return 0
    if args.cmd == "status":
        return _status()
    return 1


if __name__ == "__main__":
    sys.exit(main())

"""USAJobs Search API client.

Live federal job postings, queried on demand (no precomputation). The
synthesizer pairs each recommendation's title and the user's location
with this client so PATHFINDER can quote real openings instead of
generic prose.

Auth: USAJobs requires a User-Agent that is a contact email; an API
key is optional but recommended for higher rate limits. Both come from
settings (USAJOBS_USER_AGENT, USAJOBS_API_KEY).

Caching: in-memory TTL cache (1h by default). The API has rate limits
and the same recommendation card may render across many requests.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx

from api.config import get_settings

USAJOBS_API_URL = "https://data.usajobs.gov/api/search"

# RateIntervalCode → human label.
_INTERVAL_LABELS: dict[str, str] = {
    "PA": "annual",
    "PH": "hourly",
    "PD": "daily",
    "PW": "weekly",
    "PM": "monthly",
    "WC": "without compensation",
}

_CACHE_TTL_SECONDS = 3600
_cache: dict[tuple[str | None, str | None, int], tuple[float, list["JobPosting"]]] = {}


@dataclass
class Salary:
    min_amount: int | None
    max_amount: int | None
    interval: str


@dataclass
class JobPosting:
    title: str
    department: str
    agency: str | None
    locations: list[str]
    salary: Salary | None
    url: str
    posted_date: str
    closes_date: str | None
    job_categories: list[str]


def _parse_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _parse_salary(remuneration: list[dict[str, Any]]) -> Salary | None:
    if not remuneration:
        return None
    first = remuneration[0]
    return Salary(
        min_amount=_parse_int(first.get("MinimumRange")),
        max_amount=_parse_int(first.get("MaximumRange")),
        interval=_INTERVAL_LABELS.get(first.get("RateIntervalCode", ""), "annual"),
    )


def _split_iso_date(value: str | None) -> str | None:
    if not value:
        return None
    return value.split("T", 1)[0] or None


def _extract_locations(desc: dict[str, Any]) -> list[str]:
    locations = desc.get("PositionLocation") or []
    names = [loc.get("LocationName", "").strip() for loc in locations]
    names = [n for n in names if n]
    if names:
        return names
    display = (desc.get("PositionLocationDisplay") or "").strip()
    return [display] if display else []


def _parse_posting(item: dict[str, Any]) -> JobPosting:
    desc = item.get("MatchedObjectDescriptor") or {}
    return JobPosting(
        title=desc.get("PositionTitle", ""),
        department=desc.get("DepartmentName", ""),
        agency=desc.get("OrganizationName"),
        locations=_extract_locations(desc),
        salary=_parse_salary(desc.get("PositionRemuneration") or []),
        url=desc.get("PositionURI", ""),
        posted_date=_split_iso_date(desc.get("PublicationStartDate")) or "",
        closes_date=_split_iso_date(desc.get("ApplicationCloseDate")),
        job_categories=[
            cat.get("Name", "")
            for cat in (desc.get("JobCategory") or [])
            if cat.get("Name")
        ],
    )


def parse_search_response(payload: dict[str, Any]) -> list[JobPosting]:
    items = (payload.get("SearchResult") or {}).get("SearchResultItems") or []
    return [_parse_posting(item) for item in items]


def _build_headers() -> dict[str, str]:
    settings = get_settings()
    headers = {
        "Host": "data.usajobs.gov",
        "User-Agent": settings.usajobs_user_agent or "pathfinder@example.com",
        "Accept": "application/json",
    }
    if settings.usajobs_api_key:
        headers["Authorization-Key"] = settings.usajobs_api_key
    return headers


async def search_postings(
    *,
    keyword: str | None = None,
    location: str | None = None,
    results_per_page: int = 10,
) -> list[JobPosting]:
    """Search live federal postings. Returns at most `results_per_page`.

    Returns an empty list (and caches that result) when the API key is
    missing or the API rejects authentication, so the synthesizer can
    keep building recommendations without USAJobs grounding rather than
    failing the whole request.
    """
    key = (keyword, location, results_per_page)
    now = time.monotonic()
    cached = _cache.get(key)
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    if not get_settings().usajobs_api_key:
        _cache[key] = (now, [])
        return []

    params: dict[str, str | int] = {"ResultsPerPage": min(results_per_page, 50)}
    if keyword:
        params["Keyword"] = keyword
    if location and location.strip().lower() not in {"flexible", "anywhere", ""}:
        params["LocationName"] = location

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(USAJOBS_API_URL, headers=_build_headers(), params=params)
    if response.status_code in (401, 403):
        # Cache the empty result so we don't retry every recommendation.
        _cache[key] = (now, [])
        return []
    response.raise_for_status()
    postings = parse_search_response(response.json())
    _cache[key] = (now, postings)
    return postings


def clear_cache() -> None:
    _cache.clear()

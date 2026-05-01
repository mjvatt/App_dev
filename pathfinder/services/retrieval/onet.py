"""Runtime lookup over the O*NET cache built by services.ingest.onet."""
from __future__ import annotations

from functools import lru_cache

from services.ingest.onet import OccupationDetail, OnetIndex, load_index


@lru_cache(maxsize=1)
def get_index() -> OnetIndex:
    return load_index()


def lookup_occupations_for_moc(
    moc: str, index: OnetIndex | None = None
) -> list[OccupationDetail]:
    idx = index or get_index()
    socs = idx.moc_to_onetsoc.get(moc.upper(), [])
    return [idx.occupations[s] for s in socs if s in idx.occupations]


def get_occupation(
    soc_code: str, index: OnetIndex | None = None
) -> OccupationDetail | None:
    idx = index or get_index()
    return idx.occupations.get(soc_code)

# Ingestion modules

Loaders for the public corpora that back retrieval.

## Implemented

- `onet.py` — O*NET 30.2 occupation database + Military Occupational
  Classification crosswalk. Run with `python -m services.ingest.onet build`.
  Writes a denormalized JSON index to `data/onet/parsed/occupation_index.json`.

## Planned

- `bls.py` — BLS Occupational Employment and Wage Statistics (OEWS) by metro
  area for wage grounding.
- `usajobs.py` — USAJobs API client for live federal postings (no
  precomputation; queried on demand).

# Ingestion modules

Loaders for the public corpora that back retrieval.

## Implemented

- `onet.py` — O*NET 30.2 occupation database + Military Occupational
  Classification crosswalk. Run with `python -m services.ingest.onet build`.
  Writes a denormalized JSON index to `data/onet/parsed/occupation_index.json`.
- `pgvector_load.py` — embeds occupations via fastembed and loads into
  Postgres for similarity retrieval.
- `bls.py` — BLS OEWS May 2024 wage tables (national + state + MSA). Run
  with `python -m services.ingest.bls build`. Loads ~178K rows into
  `bls_wages` for wage grounding by SOC × geography.

## Planned

- `usajobs.py` — USAJobs API client for live federal postings (no
  precomputation; queried on demand).

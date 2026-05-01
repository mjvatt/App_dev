# Pathfinder

Veteran-to-civilian career transition copilot. Maps a Military Occupational Code
(MOC) and free-text background to ranked civilian occupations with skill-gap
analysis and citation-backed rationale.

## Status

Phase 1 — MVP scaffold. The HTTP surface and frontend shell are wired up; the
agent pipeline, retrieval store, and ingestion modules are stubs.

## Stack

- Backend: Python 3.12, FastAPI, SQLAlchemy + asyncpg, pgvector, Anthropic SDK
- Frontend: Next.js 14 (App Router), TypeScript, Tailwind
- Vector store: pgvector on Postgres 16 (via docker compose)
- LLM: Anthropic Claude (Sonnet 4.6 default, Opus 4.7 for synthesis)

## Running locally

1. Copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY`.
2. Start Postgres: `docker compose up -d`
3. Install backend deps: `pip install -e .[dev]`
4. Apply migrations: `alembic upgrade head`
5. Build the O*NET JSON cache (one-time, ~30s):
   `python -m services.ingest.onet build`
6. Embed and load occupations into pgvector (one-time, downloads
   ~80 MB embedding model on first run, ~1–2 min):
   `python -m services.ingest.pgvector_load`
7. Load BLS OEWS wages (one-time, ~50 MB download, ~1–3 min parse):
   `python -m services.ingest.bls build`
8. Run backend: `uvicorn api.main:app --reload --port 8001`
9. Install frontend deps: `npm install`
10. Run frontend: `npm run dev` (port 3002)

The O*NET build downloads ~18 MB of public archives into `data/onet/raw/` and
writes a denormalized JSON index to `data/onet/parsed/occupation_index.json`.
Both directories are gitignored. Re-run with `--force` to refresh from upstream.

Embeddings are computed locally via `fastembed` (BAAI/bge-small-en-v1.5,
384-dim). The first call downloads the model into the user's fastembed cache.
Re-running `pgvector_load` upserts on `soc_code` so it's idempotent.

## Layout

```
api/                FastAPI app, routers, schemas
services/agents/    Specialist + synthesizer agents (stubs)
services/retrieval/ pgvector store + crosswalk lookups (stubs)
services/ingest/    O*NET / OPM ingestion modules (placeholder)
app/                Next.js App Router pages
lib/                Frontend API client
tests/              pytest suite + eval harness
data/               Ingested public corpora (gitignored)
```

## Data sources (public)

- O*NET Military Crosswalk and Occupation Database
- OPM job series and qualification standards
- USAJobs API (Phase 2)

VA benefits content is intentionally deferred to Phase 2 with separate guardrails.

## Disclaimer

Pathfinder is informational. It does not replace VA benefits counseling,
licensed career advisors, or official career transition programs.

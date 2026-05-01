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
4. Build the O*NET cache (one-time, ~30s on a fresh machine):
   `python -m services.ingest.onet build`
5. Run backend: `uvicorn api.main:app --reload --port 8001`
6. Install frontend deps: `npm install`
7. Run frontend: `npm run dev` (port 3002)

The O*NET build downloads ~18 MB of public archives into `data/onet/raw/` and
writes a denormalized JSON index to `data/onet/parsed/occupation_index.json`.
Both directories are gitignored. Re-run with `--force` to refresh from upstream.

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

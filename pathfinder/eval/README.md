# PATHFINDER retrieval eval

Retrieval-stage eval harness. Validates that `services.agents.retrieval.find_candidates` surfaces plausible civilian SOCs for a representative spread of veteran profiles, without invoking the LLM synthesizer.

## Why retrieval-only

The retrieval stage is fully deterministic (crosswalk lookup + pgvector cosine similarity over `bge-small-en-v1.5` embeddings) and does not require an Anthropic API key to run. Bad retrieval upstream means the synthesizer can't recover, so isolating retrieval quality is the prerequisite for any LLM-stage tuning.

## Files

| File | Role |
| --- | --- |
| `cases.json` | Hand-curated veteran profiles + anchor SOC sets per case |
| `run_retrieval.py` | Loads cases, calls `find_candidates`, writes `results.json` and prints a summary |
| `results.json` | Last run's per-case retrieval output + recall metrics (gitignored — regenerate locally) |

## Metrics

For each case:

- **recall@5** = (anchor SOCs that appear in top-5 returned candidates) / (total anchor SOCs)
- **recall@10** = same, top-10
- **first_hit_rank** = 1-indexed position of the first anchor SOC, or null
- **banned_hits** = any returned SOC starting with `55-` (Military Specific Occupations) — should be empty after the retrieval filter

Aggregate: mean recall@5 / @10, count of cases with any hit, count of cases with banned hits.

## Adding cases

Each case in `cases.json` is:

```json
{
  "id": "kebab-case-id",
  "description": "one-line case rationale",
  "profile":     { ...full RecommendRequest fields... },
  "expected_socs":         ["..."],
  "expected_titles_hint":  ["human-friendly hints, optional"]
}
```

The `expected_socs` list is the anchor set — small (2-4 entries), representing SOCs a competent retrieval system *should* surface. False negatives at top-5 don't necessarily mean the model is wrong; they mean the case deserves a human look at the actual top-10 to decide if the returned alternatives are equivalent.

## Run

```
docker compose up -d postgres
python -m services.ingest.onet build         # one-time
python -m services.ingest.pgvector_load      # one-time
python eval/run_retrieval.py
```

## Current findings (2026-05-01, baseline run on the 10 seed cases)

| Metric | Value |
| --- | --- |
| Mean recall@5 | 0.20 |
| Mean recall@10 | 0.33 |
| Cases hit in top 5 | 5/10 |
| Cases hit in top 10 | 7/10 |
| Cases with banned hits | 0/10 |

Three retrieval-quality issues exposed:

1. **"Marine" semantic collision.** `0311-marine-rifleman` returns Captains/Boats/Marine Engineers because the word *marine* in `branch=marines` context aligns the embedding with maritime occupations. Likely fix: normalize branch tokens in `build_profile_text` (e.g., "Marine Corps" instead of bare "marines").
2. **Combat-arms officer gap.** `11a-officer-captain` returns Aerospace/Wind-Energy/Aviation Ops instead of Operations Manager / Project Management Specialist. The crosswalk is empty for combat arms; embedding picks "operations"-flavored roles but the wrong industry. Likely fix: weight leadership_roles + civilian_skills more heavily in the profile text, or post-filter by job zone + skill overlap.
3. **AFSC intel analyst miss.** `1n0x1-af-intel-analyst` returns aerospace engineering instead of intel analyst SOCs. Likely fix: include the canonical AFSC title ("All-Source Intelligence Analyst") in profile text alongside the code.

The combat-arms gap was anticipated in `project_pathfinder.md`. The "marine" collision and AFSC code blind spot are new findings from this eval.

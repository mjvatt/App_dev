# Fourth & Infinite

NFL draft analytics platform covering the 1994–2026 drafts. Static frontend (vanilla JavaScript + Chart.js), Python data pipeline, no backend.

Live site: https://mjvatt.github.io/App_dev/

## Engines

| Engine | Focus | Output |
| --- | --- | --- |
| **SAGE** | Smart Analytics & Grade Engine — descriptive grading and trade analysis | Player vs Slot scatter (with per-position expected-AV curves), Trade Analysis with deep-dive on who each side actually drafted |
| **GHOST** | Grading Hidden Opportunity & Sleeper Tracker — late-round and undervalued picks | Late-Round Steals, Sleeper Scores, Hidden Gem Colleges, ML hit-probability classifier (Top Predicted / Biggest Surprises / Biggest Busts) |
| **ATLAS** | Advanced Team Legacy Analytics System — franchise-level draft history | Era Rankings, Dynasty Index, Boom & Bust scatter, Draft → Wins lag analysis (per-position filter) |
| **ORACLE** | Win prediction | Per-team forecast with calibrated spreads and conf/division filters |

## Other views

- Dashboard, Draft Board (filterable + sortable), Team Hub (with cap allocation donut), 2026 Draft Class, 2027 Draft Class (pre-draft projections), Position Trends, College Pipeline, Pick Value Calculator.

## Data pipeline

```
scrape_draft.py            picks (footballdb)
fetch_av_nflverse.py       canonical career AV + age + pfr_id (nflverse)
fetch_combine.py           combine measurables (nflverse, 2000+)
fetch_college_stats.py     CFBD season aggregates (Patron tier key in data/.cfbd_api_key)
fetch_team_stats.py        team season records
fetch_trades.py            historical trades
scrape_salaries.py         Spotrac salaries (2013–2025)
build_data.py              merges av + combine + age + cfb_* into data/draft_data.json
train_sleeper_model.py     GHOST classifier -> data/sleeper_predictions.json
train_oracle_model.py      ORACLE win-prediction GBR -> data/oracle_predictions.json
```

## Run locally

```bash
cd "Frontend/NFL Analytics/fourth-infinite"
python -m http.server 8000
# open http://localhost:8000
```

Refresh the dataset:

```bash
python fetch_combine.py
python fetch_av_nflverse.py
python fetch_college_stats.py
python build_data.py
python train_sleeper_model.py
```

`data/.cfbd_api_key`, `data/college_cache/`, `data/college_stats.csv`, `data/combine_data.csv`, and the model prediction JSONs are gitignored. Predictions regenerate from training scripts.

## Data sources & attribution

- [nflverse](https://github.com/nflverse) — career AV, combine measurables, draft picks, ages
- [College Football Data API](https://collegefootballdata.com/) — college season stats (Patron tier)
- [Pro Football Reference](https://www.pro-football-reference.com/) — historical references
- [footballdb](https://www.footballdb.com/) — raw draft pick scrape
- [Spotrac](https://www.spotrac.com/) — cap/salary

## Honest model notes

- **GHOST CV AUC ≈ 0.635** with combine + age + college encoding + position-relevant CFBD aggregates. The literature ceiling for late-round NFL hit prediction is ~0.70 with much richer features (PFF grades). Adding raw CFBD college stats did not lift AUC.
- **ORACLE** reports two CV R² values: signal R² on raw predictions and calibrated R² on what the UI actually displays. Calibration trades MSE accuracy for distributional realism (the playoff bracket needs spread, not just centered estimates).
- **2026 class** predictions currently run on a reduced feature set (combine + age null until nflverse publishes 2026 rookie rows post-draft). Interpret 2026 hit-probabilities accordingly until the May refresh lands.

## Stack

- Frontend: HTML + vanilla JS + Chart.js, pure black dark mode (#000000), mobile responsive at 900 / 600 / 380px breakpoints
- Pipeline: Python (no framework)
- Hosting: GitHub Pages via GitHub Actions workflow at `.github/workflows/deploy-fourth-infinite.yml`

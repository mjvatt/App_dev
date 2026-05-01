# PLAYBOOK

NFL play-call prediction engine. Sequence model that predicts the next play type (run / short pass / deep pass / play action / scramble) given game state and recent play history, with an expected-EPA-delta head so the output is decision support, not just classification.

Lives inside Fourth & Infinite as an isolated Python package. PLAYBOOK MAY read F&I's `data/draft_data.json` for player-level joins; F&I never imports from PLAYBOOK. The eventual web view consumes a precomputed JSON output, same pattern as `sleeper_predictions.json`.

## Status

Phase A — scaffolding only. No model code yet.

## Phases

| Phase | Scope | Output |
| --- | --- | --- |
| A | Pull nflverse play-by-play (1999–2025), engineer features, define play-type labels | `playbook/data/pbp_features.parquet` |
| B | Tabular gradient-boosted baseline on current-state features only | `playbook/models/baseline.pkl` + held-out metrics |
| C | PyTorch LSTM on last-N play history plus current state | `playbook/models/sequence.pt` + lift over baseline |
| D | Multi-task: play-type classification + expected-EPA-delta regression head | trained model + per-play-type EPA forecasts |
| E | Frontend integration in F&I as `view-playbook` panel | precomputed lookup JSON loaded by the static UI |
| F | Held-out 2024–2025 eval, calibration, confusion matrix, error analysis | "Honest model notes" section in this README + plots |

## Setup

Separate virtual environment is required. PyTorch alone is ~2 GB and should not be in the F&I top-level Python.

```
cd "Frontend/NFL Analytics/fourth-infinite/playbook"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

GPU build: install PyTorch with CUDA support first, then the rest.

```
.venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
```

`cu121` matches CUDA 12.1. Adjust the URL for your driver version.

## Run

```
python -m playbook.fetch_pbp           # Phase A
python -m playbook.train_baseline      # Phase B
python -m playbook.train_sequence      # Phase C
python -m playbook.eval                # Phase F
```

(Each script is added in its phase. Earlier scripts must complete before later phases run.)

## Data sources

- **nflverse play-by-play** via `nfl_data_py`. Every play 1999–present with EPA, formation, personnel, win probability, success indicators.
- **F&I `data/draft_data.json`** for player-level joins (rookie indicator, draft pedigree).

## Boundary rules

- PLAYBOOK reads F&I data; F&I does not import PLAYBOOK.
- All PLAYBOOK Python deps live in `playbook/requirements.txt`. F&I's existing top-level scripts continue to run on system Python.
- Trained model artifacts and raw parquet caches stay local. The web UI ships only a precomputed predictions JSON.

## Honest model notes

Filled in during Phase F.

"""Smoke-test the F&I app. Static cross-reference + data-shape checks.

Runs without a browser. Catches the common ways a wiring change would
break the app:
  - JS calls getElementById('X') for an X that does not exist in HTML
  - JS calls DraftCharts.foo / DraftData.bar that are not exported
  - showView() if-branch refers to a view id with no matching <section>
  - Data files are missing keys the JS expects

Usage (from fourth-infinite/):
    python smoke_test.py

Exit code 0 on all green, 1 if any FAIL.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HTML = (ROOT / 'index.html').read_text(encoding='utf-8')
APP  = (ROOT / 'js' / 'app.js').read_text(encoding='utf-8')
DATA = (ROOT / 'js' / 'data.js').read_text(encoding='utf-8')
CHRT = (ROOT / 'js' / 'charts.js').read_text(encoding='utf-8')

PASS, FAIL, WARN = 0, 0, 0
results: list[tuple[str, str, str]] = []


def check(label: str, ok: bool, detail: str = '', warn: bool = False) -> None:
    global PASS, FAIL, WARN
    if ok:
        PASS += 1
        results.append(('PASS', label, detail))
    elif warn:
        WARN += 1
        results.append(('WARN', label, detail))
    else:
        FAIL += 1
        results.append(('FAIL', label, detail))


# ── 1. ID cross-reference ────────────────────────────────────────────────
# An ID may be defined statically in HTML *or* injected dynamically by JS
# (innerHTML template literals, document.createElement().id = '...'). We
# consider all three sources before flagging a getElementById() target as
# missing.
html_ids = set(re.findall(r'\bid="([^"]+)"', HTML))
js_template_ids = set(re.findall(r'\bid="([^"${}]+)"', APP))   # excludes ${...} interpolations
js_assigned_ids = set(re.findall(r"\.id\s*=\s*['\"]([^'\"]+)['\"]", APP))
known_ids = html_ids | js_template_ids | js_assigned_ids

js_ids = set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]", APP))
missing_html_ids = sorted(js_ids - known_ids)
check(
    'Every getElementById() target exists in HTML or is JS-injected',
    not missing_html_ids,
    f"missing: {missing_html_ids[:8]}{' ...' if len(missing_html_ids) > 8 else ''}",
)

# ── 2. View ids referenced from showView() exist as <section> ────────────
view_branches = re.findall(r"id\s*===\s*['\"]([\w-]+)['\"]", APP)
view_branches = sorted(set(view_branches))
missing_views = [v for v in view_branches if f'id="view-{v}"' not in HTML]
check(
    'Every showView() branch has a matching <section id="view-...">',
    not missing_views,
    f"missing: {missing_views}",
)

# ── 3. Nav data-view values point at registered views ───────────────────
nav_views = sorted(set(re.findall(r'data-view="([\w-]+)"', HTML)))
unregistered = [v for v in nav_views if f'id="view-{v}"' not in HTML]
check(
    'Every nav data-view points at an existing <section>',
    not unregistered,
    f"missing: {unregistered}",
)

# ── 4. DraftCharts / DraftData calls resolve to exports ─────────────────
def _exports(src: str, module: str) -> set[str]:
    # find the final `return { ... };` of the IIFE — exports of the module.
    m = re.search(r'return\s*\{([^}]+)\}\s*;\s*\}\s*\)\s*\(\s*\)', src, re.DOTALL)
    if not m:
        return set()
    body = m.group(1)
    return {tok.strip() for tok in body.split(',') if tok.strip()}

charts_exports = _exports(CHRT, 'DraftCharts')
data_exports   = _exports(DATA, 'DraftData')

charts_calls = set(re.findall(r'DraftCharts\.(\w+)\s*\(', APP))
data_calls   = set(re.findall(r'DraftData\.(\w+)\s*\(', APP))

missing_chart_exports = sorted(charts_calls - charts_exports)
missing_data_exports  = sorted(data_calls   - data_exports)
check(
    'Every DraftCharts.X() call has a matching export',
    not missing_chart_exports,
    f"missing: {missing_chart_exports}",
)
check(
    'Every DraftData.X() call has a matching export',
    not missing_data_exports,
    f"missing: {missing_data_exports}",
)

# ── 5. JSON file integrity + shape ──────────────────────────────────────
def _load_json(rel: str) -> dict | None:
    p = ROOT / rel
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except Exception as e:  # noqa: BLE001
        return {'__error__': str(e)}

draft = _load_json('data/draft_data.json')
check('draft_data.json parses', isinstance(draft, dict) and '__error__' not in draft)
if draft:
    check('draft_data.json has picks list', bool(draft.get('picks')))
    check('draft_data.json has meta', bool(draft.get('meta')))

sleeper = _load_json('data/sleeper_predictions.json')
check('sleeper_predictions.json parses', isinstance(sleeper, dict) and '__error__' not in sleeper)
if sleeper:
    preds = sleeper.get('predictions') or []
    check('sleeper has predictions', bool(preds))
    sample = preds[0] if preds else {}
    check(
        'sleeper rows carry SHAP top_features (3 entries each)',
        bool(sample.get('top_features')) and len(sample['top_features']) == 3,
        f"first row top_features len: {len(sample.get('top_features') or [])}",
    )
    check(
        'sleeper SHAP entries have name/value/shap keys',
        all(set(f.keys()) >= {'name', 'value', 'shap'} for f in (sample.get('top_features') or [])),
    )
    check(
        'sleeper meta carries shap_baseline_logodds',
        'shap_baseline_logodds' in (sleeper.get('meta') or {}),
    )

oracle = _load_json('data/oracle_predictions.json')
check('oracle_predictions.json parses', isinstance(oracle, dict) and '__error__' not in oracle)
if oracle:
    forecast = oracle.get('forecast') or []
    check('oracle has forecast list (32 rows)', len(forecast) == 32, f"rows: {len(forecast)}")
    if forecast:
        sample = forecast[0]
        for key in ('franchise', 'predicted_wins', 'conf', 'div'):
            check(f'oracle forecast row has "{key}"', key in sample)

# ── 6. Today's specific feature wiring ──────────────────────────────────
today_ids = [
    # search autocomplete
    'globalSearch', 'globalSearchResults', 'globalSearchWrap',
    # class strength
    'cs-kpis', 'cs-metric', 'cs-table', 'cs-table-body', 'chart-classStrength',
    # trade simulator
    'ts-A-input', 'ts-A-add', 'ts-A-chips', 'ts-A-totals',
    'ts-B-input', 'ts-B-add', 'ts-B-chips', 'ts-B-totals',
    'ts-reset', 'ts-verdict',
    # ORACLE matchup
    'matchup-team-a', 'matchup-team-b', 'matchup-result',
    # QB Lab
    'view-qb-lab', 'qb-kpis', 'chart-qb-round-hit', 'qb-round-table',
    'qb-college-body', 'chart-qb-age', 'chart-qb-forty', 'qb-leaderboard-body',
    # Position Lab
    'view-position-lab', 'pl-pos-toggle', 'pl-kpis', 'chart-pl-round-hit',
    'pl-round-table', 'pl-college-body', 'chart-pl-age', 'chart-pl-forty',
    'pl-leaderboard-body',
    # Class Compare
    'view-class-compare', 'cc-year-a', 'cc-year-b', 'cc-kpis',
    'chart-cc-strength', 'cc-leaderboard-a', 'cc-leaderboard-b',
    'cc-leaderboard-a-title', 'cc-leaderboard-b-title',
    # Trade Search
    'view-trade-search', 'tsh-team', 'tsh-yfrom', 'tsh-yto', 'tsh-sort',
    'tsh-flip-only', 'tsh-kpis', 'tsh-list', 'tsh-list-title',
    # Reach & Steal Map
    'view-reach-steal', 'rs-pos-toggle', 'rs-team', 'rs-yfrom', 'rs-yto',
    'rs-kpis', 'chart-rs-scatter', 'rs-steals-body', 'rs-reaches-body',
]
missing_today = [i for i in today_ids if f'id="{i}"' not in HTML]
check(
    "Today's feature element IDs all present in HTML",
    not missing_today,
    f"missing: {missing_today}",
)

# ── 7. Specific helpers wired in this session ───────────────────────────
expected_data_helpers = [
    'draftClassStrength',     # Class Strength view
    'expectedAvForPick',      # Trade Simulator
    'oracleData',             # ORACLE Matchup tab
    'loadOraclePredictions',  # ORACLE Matchup tab
    'getSleeperPredictions',  # SHAP modal panel
]
missing_helpers = [h for h in expected_data_helpers if h not in data_exports]
check(
    "Today's required DraftData helpers are exported",
    not missing_helpers,
    f"missing: {missing_helpers}",
)

expected_chart_helpers = [
    'classStrengthBar',   # Class Strength view
    'genericScatter',     # QB Lab scatters
    'divergentScatter',   # Reach & Steal Map
]
missing_chart_helpers = [h for h in expected_chart_helpers if h not in charts_exports]
check(
    "Today's required DraftCharts helpers are exported",
    not missing_chart_helpers,
    f"missing: {missing_chart_helpers}",
)

# ── 8. Deep-link URL helpers present ────────────────────────────────────
deep_link_present = all(
    name in APP for name in (
        '_serializeModalUrl', '_parseModalUrl', '_clearModalUrl',
    )
) and "popstate" in APP
check('Modal deep-link helpers present in app.js', deep_link_present)

# ── 9. JS syntax check via `node --check` (skip if node unavailable) ────
node = shutil.which('node')
if node:
    for js in ('js/app.js', 'js/data.js', 'js/charts.js'):
        proc = subprocess.run(
            [node, '--check', str(ROOT / js)],
            capture_output=True, text=True,
        )
        check(
            f"{js} parses without syntax errors",
            proc.returncode == 0,
            (proc.stderr or proc.stdout).strip()[:200],
        )
else:
    check('node available for syntax check', False, 'node not found on PATH', warn=True)


# ── Report ──────────────────────────────────────────────────────────────
print('\nF&I smoke test results')
print('=' * 78)
for status, label, detail in results:
    line = f"  [{status}] {label}"
    if detail and status != 'PASS':
        line += f"\n         {detail}"
    print(line)
print('=' * 78)
print(f"  PASS: {PASS}    FAIL: {FAIL}    WARN: {WARN}")

sys.exit(0 if FAIL == 0 else 1)

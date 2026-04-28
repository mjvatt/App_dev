"""
train_oracle_model.py  (v2)

Trains a GradientBoostingRegressor to predict franchise season wins
using prior-season performance, draft capital, and prior-year cap space.

Features (per franchise, predicting wins in season Y):
  prior_wins        — wins in Y-1
  prior2_wins       — wins in Y-2
  point_diff_pg     — (pf - pa) per game in Y-1
  made_playoffs     — bool, Y-1 season
  draft_capital     — pick value score for Y draft class
  recent_av_rate    — avg career AV per capital unit, drafts Y-4 through Y-2,
                      capped at AV_CAP_YEAR to avoid incomplete-class noise
  cap_space_m       — cap space in Y-1 ($M); prior-year financial flexibility

Cap data coverage: 2013-2025 (Spotrac). Missing franchise-years use the
per-year league median. Years before 2013 use the global cap median across
all available data (neutral fill — cap_space_m contributes no cross-team
signal for those years, preserving the full 1996-2024 training window).

Outputs data/oracle_predictions.json:
  forecast    — 2026 projections for all 32 franchises
  backtest    — historical predicted vs actual wins (2014-2024)
  importances — feature importances sorted descending
  meta        — training stats and CV R^2

Usage:
    python train_oracle_model.py
"""

import json
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score

DATA_PATH      = 'data/draft_data.json'
SALARIES_PATH  = 'data/salaries.json'
OUTPUT_PATH    = 'data/oracle_predictions.json'

TRAIN_FROM   = 1996   # full window; pre-2013 uses neutral cap fill
TRAIN_TO     = 2024
AV_CAP_YEAR  = 2021
AV_WINDOW    = 4

PICK_VAL = lambda pick: 100 * (pick ** -0.66)

FRANCHISE_ALIASES = {
    'Houston Oilers':           'Tennessee Titans',
    'Tennessee Oilers':         'Tennessee Titans',
    'San Diego Chargers':       'Los Angeles Chargers',
    'Oakland Raiders':          'Las Vegas Raiders',
    'Los Angeles Raiders':      'Las Vegas Raiders',
    'St. Louis Rams':           'Los Angeles Rams',
    'Washington Redskins':      'Washington Commanders',
    'Washington Football Team': 'Washington Commanders',
}

def _franchise(team, year):
    if team == 'Cleveland Browns' and int(year) <= 1995:
        return 'Baltimore Ravens'
    return FRANCHISE_ALIASES.get(team, team)


def build_standings_map(standings):
    m = {}
    for s in standings:
        f = _franchise(s['team'], s['year'])
        if f not in m:
            m[f] = {}
        m[f][s['year']] = dict(s, franchise=f)
    return m


def build_capital_map(picks):
    m = {}
    for p in picks:
        if p['pick'] <= 0:
            continue
        f = _franchise(p['team'], p['year'])
        y = p['year']
        if f not in m:
            m[f] = {}
        m[f][y] = m[f].get(y, 0.0) + PICK_VAL(p['pick'])
    return m


def build_av_by_fy(picks):
    m = {}
    for p in picks:
        if p['pick'] <= 0 or p['year'] > AV_CAP_YEAR:
            continue
        f = _franchise(p['team'], p['year'])
        y = p['year']
        if f not in m:
            m[f] = {}
        if y not in m[f]:
            m[f][y] = {'av': 0.0, 'cap': 0.0}
        m[f][y]['av']  += p['career_av']
        m[f][y]['cap'] += PICK_VAL(p['pick'])
    return m


def build_cap_space_map(salaries):
    """Build {franchise: {year: cap_space_m}} from salaries.json.
    Salaries already use current franchise names."""
    m = {}
    for r in salaries.get('cap_by_year', []):
        team = r['team']
        y    = r['year']
        if team not in m:
            m[team] = {}
        m[team][y] = r['cap_space'] / 1e6
    return m


def build_cap_medians(cap_map):
    """Per-year median cap space. Also computes a global median for pre-2013 fill."""
    by_year = {}
    all_vals = []
    for fmap in cap_map.values():
        for y, v in fmap.items():
            if y not in by_year:
                by_year[y] = []
            by_year[y].append(v)
            all_vals.append(v)
    medians = {y: float(np.median(vals)) for y, vals in by_year.items()}
    medians['_global'] = float(np.median(all_vals)) if all_vals else 0.0
    return medians


def _recent_av_rate(franchise, target_year, av_by_fy, global_rate):
    total_av, total_cap = 0.0, 0.0
    for dy in range(target_year - AV_WINDOW, target_year - 1):
        if dy > AV_CAP_YEAR:
            continue
        d = av_by_fy.get(franchise, {}).get(dy)
        if d and d['cap'] > 0:
            total_av  += d['av']
            total_cap += d['cap']
    return (total_av / total_cap) if total_cap > 0 else global_rate


def build_features(franchise, target_year, standings_map, capital_map,
                   av_by_fy, global_av_rate, cap_map, cap_medians):
    sm    = standings_map.get(franchise, {})
    prev1 = sm.get(target_year - 1)
    prev2 = sm.get(target_year - 2)
    if not prev1:
        return None

    games  = prev1['w'] + prev1['l'] + prev1.get('t', 0) or 17
    pd_pg  = (prev1['pf'] - prev1['pa']) / games
    p2w    = prev2['w'] if prev2 else prev1['w']
    cap    = capital_map.get(franchise, {}).get(target_year, 0.0)
    avr    = _recent_av_rate(franchise, target_year, av_by_fy, global_av_rate)

    # Prior-year cap space. Falls back to year median if franchise is missing,
    # then global median for years before cap data begins (pre-2013).
    cs_m = cap_map.get(franchise, {}).get(target_year - 1)
    if cs_m is None:
        cs_m = cap_medians.get(target_year - 1, cap_medians.get('_global', 0.0))

    return [prev1['w'], p2w, pd_pg, 1 if prev1.get('playoff') else 0, cap, avr, cs_m]


FEATURE_NAMES = [
    'prior_wins', 'prior2_wins', 'point_diff_pg', 'made_playoffs',
    'draft_capital', 'recent_av_rate', 'cap_space_m',
]


def main():
    with open(DATA_PATH) as f:
        raw = json.load(f)
    with open(SALARIES_PATH) as f:
        salaries = json.load(f)

    picks     = raw['picks']
    standings = raw['standings']

    standings_map = build_standings_map(standings)
    capital_map   = build_capital_map(picks)
    av_by_fy      = build_av_by_fy(picks)
    cap_map       = build_cap_space_map(salaries)
    cap_medians   = build_cap_medians(cap_map)

    all_rates = [
        v['av'] / v['cap']
        for fy in av_by_fy.values()
        for v in fy.values()
        if v['cap'] > 0
    ]
    global_av_rate = float(np.mean(all_rates)) if all_rates else 2.0

    franchises = sorted(set(_franchise(s['team'], s['year']) for s in standings))

    X, y, train_meta = [], [], []
    for franchise in franchises:
        sm = standings_map.get(franchise, {})
        for year in range(TRAIN_FROM, TRAIN_TO + 1):
            if year not in sm:
                continue
            features = build_features(
                franchise, year, standings_map, capital_map,
                av_by_fy, global_av_rate, cap_map, cap_medians,
            )
            if features is None:
                continue
            X.append(features)
            y.append(float(sm[year]['w']))
            train_meta.append((franchise, year))

    X = np.array(X)
    y = np.array(y)

    model = GradientBoostingRegressor(
        n_estimators=300,
        max_depth=3,
        learning_rate=0.04,
        subsample=0.8,
        min_samples_leaf=5,
        random_state=42,
    )
    model.fit(X, y)

    cv_scores = cross_val_score(model, X, y, cv=5, scoring='r2')
    print(f"Training samples : {len(X)}")
    print(f"CV R2            : {cv_scores.mean():.3f} +/- {cv_scores.std():.3f}")

    # Spread calibration: scale predictions so their std matches historical
    # win std. Preserves rank order; corrects MSE-driven compression toward mean.
    preds_raw   = model.predict(X)
    std_actual  = float(np.std(y))
    std_raw     = float(np.std(preds_raw))
    mean_raw    = float(np.mean(preds_raw))
    spread_factor = (std_actual / std_raw) if std_raw > 0 else 1.0
    print(f"Spread factor    : {spread_factor:.3f}  (std actual={std_actual:.2f}, predicted={std_raw:.2f})")

    def calibrate(raw):
        return round(max(1.0, min(17.0, mean_raw + (raw - mean_raw) * spread_factor)), 1)

    preds_all = preds_raw  # raw used for backtest display
    backtest = [
        {
            'franchise':      f,
            'year':           yr,
            'actual_wins':    int(yw),
            'predicted_wins': calibrate(float(p)),
            'error':          round(calibrate(float(p)) - float(yw), 1),
        }
        for (f, yr), p, yw in zip(train_meta, preds_all, y)
    ]

    forecast = []
    for franchise in franchises:
        features = build_features(
            franchise, 2026, standings_map, capital_map,
            av_by_fy, global_av_rate, cap_map, cap_medians,
        )
        if features is None:
            continue
        raw_pred = float(model.predict([features])[0])
        pred     = calibrate(raw_pred)
        row25   = standings_map.get(franchise, {}).get(2025, {})
        games25 = row25.get('w', 0) + row25.get('l', 0) + row25.get('t', 0) or 17
        cs25_m  = cap_map.get(franchise, {}).get(2025, cap_medians.get(2025, 0.0))
        forecast.append({
            'franchise':      franchise,
            'conf':           row25.get('conf', ''),
            'div':            row25.get('div', ''),
            'predicted_wins': round(pred, 1),
            'prior_wins':     row25.get('w', 0),
            'made_playoffs':  bool(row25.get('playoff', False)),
            'draft_capital':  round(capital_map.get(franchise, {}).get(2026, 0.0), 1),
            'point_diff_pg':  round((row25.get('pf', 0) - row25.get('pa', 0)) / games25, 2),
            'cap_space_m':    round(cs25_m, 1),
        })
    forecast.sort(key=lambda x: -x['predicted_wins'])

    importances = sorted(
        [{'feature': n, 'importance': round(float(v), 4)}
         for n, v in zip(FEATURE_NAMES, model.feature_importances_)],
        key=lambda x: -x['importance'],
    )

    print("\nFeature importances:")
    for fi in importances:
        print(f"  {fi['feature']:20s} {fi['importance']:.4f}")

    print("\n2026 Forecast (top 10):")
    for row in forecast[:10]:
        marker = '*' if row['made_playoffs'] else ' '
        print(f"  {row['franchise']:<32s} {row['predicted_wins']:>4.1f}W  "
              f"(2025: {row['prior_wins']}W{marker}, cap: ${row['cap_space_m']:.1f}M)")

    output = {
        'forecast':    forecast,
        'backtest':    backtest,
        'importances': importances,
        'meta': {
            'train_from':    TRAIN_FROM,
            'train_to':      TRAIN_TO,
            'n_train':       len(X),
            'cv_r2_mean':    round(float(cv_scores.mean()), 3),
            'cv_r2_std':     round(float(cv_scores.std()), 3),
            'spread_factor': round(spread_factor, 3),
            'av_cap_year':   AV_CAP_YEAR,
            'forecast_year': 2026,
        },
    }

    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    print(f"\nWrote {len(forecast)} forecast + {len(backtest)} backtest rows -> {OUTPUT_PATH}")


if __name__ == '__main__':
    main()

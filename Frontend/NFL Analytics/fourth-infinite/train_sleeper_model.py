"""
train_sleeper_model.py

Trains a GradientBoostingRegressor on historical draft picks (≤ TRAIN_CUTOFF)
to predict career AV surplus above slot expectation.

Outputs data/sleeper_predictions.json with:
  - predictions: every valid pick scored (predicted_surplus, actual_surplus)
  - importances: feature importances sorted descending
  - meta: training stats and CV R²

Usage:
    python train_sleeper_model.py
"""

import json
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score

DATA_PATH   = 'data/draft_data.json'
OUTPUT_PATH = 'data/sleeper_predictions.json'
TRAIN_CUTOFF = 2018
INCOMPLETE_YEAR = 2021
WINDOW = 12
POS_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST']
SMOOTH_K = 10  # Bayesian smoothing strength for college target encoding


def build_expected_av(picks):
    """Rolling-average draft_av by pick slot, calibrated on picks <= 2020."""
    slots = {}
    for p in picks:
        if p['pick'] > 0 and p['year'] <= 2020:
            s = p['pick']
            if s not in slots:
                slots[s] = {'sum': 0, 'n': 0}
            slots[s]['sum'] += p['draft_av']
            slots[s]['n']   += 1

    expected = {}
    for pick in range(1, 257):
        total, n = 0.0, 0
        for j in range(max(1, pick - WINDOW), min(256, pick + WINDOW) + 1):
            if j in slots:
                total += slots[j]['sum']
                n     += slots[j]['n']
        if n > 0:
            expected[pick] = total / n
    return expected


def year_era(year):
    if year <= 2003: return 0
    if year <= 2013: return 1
    return 2


def build_feature_row(p, college_enc, global_mean):
    enc = college_enc.get(p['college'], global_mean)
    row = [p['round'], p['pick'], enc, year_era(p['year'])]
    for g in POS_GROUPS:
        row.append(1 if p['pos_group'] == g else 0)
    return row


def main():
    with open(DATA_PATH) as f:
        raw = json.load(f)
    picks = raw['picks']

    expected_av = build_expected_av(picks)

    def surplus(p):
        return p['career_av'] - expected_av.get(p['pick'], 0.0)

    valid = [p for p in picks if p['pick'] > 0 and p['pos_group'] in POS_GROUPS]
    train = [p for p in valid if p['year'] <= TRAIN_CUTOFF]

    # Target-encode college: Bayesian smoothing toward global mean surplus
    global_mean = np.mean([surplus(p) for p in train])
    college_buckets = {}
    for p in train:
        c = p['college']
        if c not in college_buckets:
            college_buckets[c] = []
        college_buckets[c].append(surplus(p))

    college_enc = {}
    for college, vals in college_buckets.items():
        n = len(vals)
        mean = float(np.mean(vals))
        college_enc[college] = (n * mean + SMOOTH_K * global_mean) / (n + SMOOTH_K)

    X_train = np.array([build_feature_row(p, college_enc, global_mean) for p in train])
    y_train = np.array([surplus(p) for p in train])

    model = GradientBoostingRegressor(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        random_state=42,
    )
    model.fit(X_train, y_train)

    cv_scores = cross_val_score(model, X_train, y_train, cv=5, scoring='r2')
    print(f"Training samples : {len(train)}")
    print(f"CV R²            : {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")

    # Score all valid picks
    X_all = np.array([build_feature_row(p, college_enc, global_mean) for p in valid])
    preds = model.predict(X_all)

    results = []
    for p, pred in zip(valid, preds):
        results.append({
            'player':             p['player'],
            'year':               p['year'],
            'team':               p['team'],
            'pos':                p['pos'],
            'pos_group':          p['pos_group'],
            'college':            p['college'],
            'round':              p['round'],
            'pick':               p['pick'],
            'career_av':          p['career_av'],
            'draft_av':           p['draft_av'],
            'pro_bowls':          p['pro_bowls'],
            'predicted_surplus':  round(float(pred), 2),
            'actual_surplus':     round(surplus(p), 2),
            'incomplete':         p['year'] >= INCOMPLETE_YEAR,
        })

    results.sort(key=lambda x: x['predicted_surplus'], reverse=True)

    feature_names = ['round', 'pick', 'college_enc', 'era'] + [f'pos_{g}' for g in POS_GROUPS]
    importances = sorted(
        [{'feature': n, 'importance': round(float(v), 4)}
         for n, v in zip(feature_names, model.feature_importances_)],
        key=lambda x: -x['importance'],
    )

    print("\nFeature importances:")
    for fi in importances:
        print(f"  {fi['feature']:18s} {fi['importance']:.4f}")

    output = {
        'predictions': results,
        'importances': importances,
        'meta': {
            'train_cutoff':  TRAIN_CUTOFF,
            'n_train':       len(train),
            'n_scored':      len(results),
            'cv_r2_mean':    round(float(cv_scores.mean()), 3),
            'cv_r2_std':     round(float(cv_scores.std()), 3),
        },
    }

    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    print(f"\nWrote {len(results)} predictions -> {OUTPUT_PATH}")


if __name__ == '__main__':
    main()

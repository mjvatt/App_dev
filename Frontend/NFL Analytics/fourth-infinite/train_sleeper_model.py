"""
train_sleeper_model.py  (v2 — classifier)

Trains a GradientBoostingClassifier to predict whether a draft pick
will exceed slot expectation by a meaningful margin.

Why classification (was regression):
  Regression on career-AV-surplus had honest CV R^2 ~ 0.0. Once
  target-encoding leakage was removed, the regression target's signal
  in non-pick features was essentially noise. Binary "hit / miss" is
  a more tractable target — even when individual outcomes are noisy,
  hit *probability* is learnable from athletic profile, age, college,
  and position.

Target:
  hit = (career_av - expected_av_at_slot) > HIT_THRESHOLD
  where expected_av_at_slot is the rolling mean draft_av at that pick
  (kept for consistency with the rest of the app). HIT_THRESHOLD = 10
  AV roughly corresponds to 2-3 solid starter-level seasons above what
  the slot delivered in its first four years on average.

Features:
  - round, pick                         (slot info)
  - college_enc (per-fold target enc.)  (program signal)
  - age_at_draft                        (older = more bust risk)
  - position one-hots                   (positional bust rates)
  - era (0/1/2 by decade)               (rule changes, scheme shifts)
  - ht_in, wt                           (size)
  - forty, bench, vertical,
    broad_jump, cone, shuttle           (athletic profile)

Missing combine values are imputed per-position-group with the median
across completed careers (year <= TRAIN_CUTOFF). Combine coverage is
~60% so imputation matters.

Training window: 2000 onward (combine starts 2000).
Held-out CV uses leak-free target encoding rebuilt per fold.

Outputs data/sleeper_predictions.json:
  - predictions: every valid pick scored (predicted_prob, actual_hit)
  - importances: feature importances
  - meta: training stats including ROC AUC, hit rate, n_train

Usage:
    python train_sleeper_model.py
"""

import json
import math
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import KFold
from sklearn.metrics import roc_auc_score

DATA_PATH       = 'data/draft_data.json'
OUTPUT_PATH     = 'data/sleeper_predictions.json'
TRAIN_CUTOFF    = 2021
INCOMPLETE_YEAR = 2022
WINDOW          = 12
COMBINE_FROM    = 2000   # combine data begins
HIT_THRESHOLD   = 10.0   # surplus AV cut-off for "hit"
SMOOTH_K        = 10     # college Bayesian smoothing strength
POS_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST']

COMBINE_FIELDS = ['ht_in', 'wt', 'forty', 'bench',
                  'vertical', 'broad_jump', 'cone', 'shuttle']


def build_expected_av(picks):
    """Rolling-average draft_av by pick slot, calibrated on picks <= TRAIN_CUTOFF."""
    slots = {}
    for p in picks:
        if p['pick'] > 0 and p['year'] <= TRAIN_CUTOFF:
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
    if year <= 2003:
        return 0
    if year <= 2013:
        return 1
    return 2


def build_combine_imputers(picks):
    """Per-position-group median for each combine field, with global fallback."""
    by_pos = {g: {f: [] for f in COMBINE_FIELDS} for g in POS_GROUPS}
    global_vals = {f: [] for f in COMBINE_FIELDS}
    for p in picks:
        if p.get('year', 0) < COMBINE_FROM or p['year'] > TRAIN_CUTOFF:
            continue
        if p['pos_group'] not in POS_GROUPS:
            continue
        for f in COMBINE_FIELDS:
            v = p.get(f)
            if v is not None:
                by_pos[p['pos_group']][f].append(v)
                global_vals[f].append(v)
    medians = {g: {} for g in POS_GROUPS}
    for g in POS_GROUPS:
        for f in COMBINE_FIELDS:
            vals = by_pos[g][f]
            if vals:
                medians[g][f] = float(np.median(vals))
            elif global_vals[f]:
                medians[g][f] = float(np.median(global_vals[f]))
            else:
                medians[g][f] = 0.0
    medians['_global'] = {
        f: (float(np.median(global_vals[f])) if global_vals[f] else 0.0)
        for f in COMBINE_FIELDS
    }
    return medians


def _impute(p, imputers):
    g = p['pos_group']
    pos_med = imputers.get(g, imputers['_global'])
    out = {}
    for f in COMBINE_FIELDS:
        v = p.get(f)
        if v is None:
            v = pos_med.get(f, imputers['_global'].get(f, 0.0))
        out[f] = float(v)
    return out


def build_feature_row(p, college_enc, college_global_mean, imputers):
    enc  = college_enc.get(p['college'], college_global_mean)
    age  = p.get('age') or 22  # league rookie average
    feats = [
        p['round'],
        p['pick'],
        enc,
        age,
        year_era(p['year']),
    ]
    for g in POS_GROUPS:
        feats.append(1 if p['pos_group'] == g else 0)
    imputed = _impute(p, imputers)
    for f in COMBINE_FIELDS:
        feats.append(imputed[f])
    return feats


FEATURE_NAMES = (
    ['round', 'pick', 'college_enc', 'age', 'era']
    + [f'pos_{g}' for g in POS_GROUPS]
    + COMBINE_FIELDS
)


def main():
    with open(DATA_PATH) as f:
        raw = json.load(f)
    picks = raw['picks']

    expected_av = build_expected_av(picks)

    def surplus(p):
        return p['career_av'] - expected_av.get(p['pick'], 0.0)

    valid = [
        p for p in picks
        if p['pick'] > 0
        and p['pos_group'] in POS_GROUPS
        and p['year'] >= COMBINE_FROM
    ]
    train = [p for p in valid if p['year'] <= TRAIN_CUTOFF]
    print(f"Valid picks (>= {COMBINE_FROM}) : {len(valid)}")
    print(f"Training set   (<= {TRAIN_CUTOFF}) : {len(train)}")

    imputers = build_combine_imputers(picks)
    y_train  = np.array([1 if surplus(p) > HIT_THRESHOLD else 0 for p in train])
    hit_rate = float(y_train.mean())
    print(f"Hit rate (>{HIT_THRESHOLD} AV surplus) : {hit_rate:.3f}  "
          f"({int(y_train.sum())}/{len(y_train)})")

    def _build_college_enc(picks_subset):
        targets = [1 if surplus(p) > HIT_THRESHOLD else 0 for p in picks_subset]
        gm = float(np.mean(targets))
        buckets = {}
        for p, t in zip(picks_subset, targets):
            buckets.setdefault(p['college'], []).append(t)
        enc = {}
        for college, vals in buckets.items():
            n = len(vals)
            m = float(np.mean(vals))
            enc[college] = (n * m + SMOOTH_K * gm) / (n + SMOOTH_K)
        return enc, gm

    # Honest CV: rebuild college encoding per fold from train_idx only.
    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    cv_aucs = []
    for fold_idx, (train_idx, val_idx) in enumerate(kf.split(train)):
        fold_train = [train[i] for i in train_idx]
        fold_val   = [train[i] for i in val_idx]
        fold_enc, fold_gm = _build_college_enc(fold_train)

        Xt = np.array([build_feature_row(p, fold_enc, fold_gm, imputers) for p in fold_train])
        Xv = np.array([build_feature_row(p, fold_enc, fold_gm, imputers) for p in fold_val])
        yt = y_train[train_idx]
        yv = y_train[val_idx]

        m_cv = GradientBoostingClassifier(
            n_estimators=300,
            max_depth=3,
            learning_rate=0.05,
            subsample=0.8,
            min_samples_leaf=10,
            random_state=42,
        )
        m_cv.fit(Xt, yt)
        if len(np.unique(yv)) < 2:
            continue
        proba = m_cv.predict_proba(Xv)[:, 1]
        cv_aucs.append(roc_auc_score(yv, proba))

    cv_aucs = np.array(cv_aucs)
    print(f"CV AUC (5-fold)  : {cv_aucs.mean():.3f} +/- {cv_aucs.std():.3f}")

    # Final fit on full training set for scoring all picks
    college_enc, college_gm = _build_college_enc(train)
    X_train = np.array([build_feature_row(p, college_enc, college_gm, imputers) for p in train])

    model = GradientBoostingClassifier(
        n_estimators=300,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.8,
        min_samples_leaf=10,
        random_state=42,
    )
    model.fit(X_train, y_train)

    X_all = np.array([build_feature_row(p, college_enc, college_gm, imputers) for p in valid])
    probas = model.predict_proba(X_all)[:, 1]

    results = []
    for p, prob in zip(valid, probas):
        s    = surplus(p)
        hit  = bool(s > HIT_THRESHOLD)
        complete = p['year'] < INCOMPLETE_YEAR
        results.append({
            'player':            p['player'],
            'year':              p['year'],
            'team':              p['team'],
            'pos':               p['pos'],
            'pos_group':         p['pos_group'],
            'college':           p['college'],
            'round':             p['round'],
            'pick':              p['pick'],
            'career_av':         p['career_av'],
            'draft_av':          p['draft_av'],
            'pro_bowls':         p['pro_bowls'],
            'predicted_prob':    round(float(prob), 3),
            'actual_surplus':    round(s, 1),
            'actual_hit':        hit if complete else None,
            'incomplete':        not complete,
        })

    results.sort(key=lambda r: r['predicted_prob'], reverse=True)

    importances = sorted(
        [{'feature': n, 'importance': round(float(v), 4)}
         for n, v in zip(FEATURE_NAMES, model.feature_importances_)],
        key=lambda x: -x['importance'],
    )

    print("\nFeature importances:")
    for fi in importances:
        print(f"  {fi['feature']:14s} {fi['importance']:.4f}")

    output = {
        'predictions': results,
        'importances': importances,
        'meta': {
            'model_kind':       'classifier',
            'train_from':       COMBINE_FROM,
            'train_cutoff':     TRAIN_CUTOFF,
            'incomplete_year':  INCOMPLETE_YEAR,
            'hit_threshold':    HIT_THRESHOLD,
            'hit_rate':         round(hit_rate, 3),
            'n_train':          len(train),
            'n_scored':         len(results),
            'cv_auc_mean':      round(float(cv_aucs.mean()), 3),
            'cv_auc_std':       round(float(cv_aucs.std()), 3),
        },
    }

    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    print(f"\nWrote {len(results)} predictions -> {OUTPUT_PATH}")


if __name__ == '__main__':
    main()

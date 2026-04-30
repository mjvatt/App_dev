"""
fetch_college_stats.py

Pulls college player career stats from collegefootballdata.com (CFBD).
Aggregates per-season stats into career totals, keyed by (player_name, college).

API key:
  Set the env var CFBD_API_KEY, OR drop the key into data/.cfbd_api_key
  (gitignored). Both are read.

Strategy:
  - Limit to colleges with >= MIN_COLLEGE_PICKS picks across 2000-2025.
    This covers ~95% of NFL draftees while cutting fetch volume by half.
  - For each (college, year) in that set across YEAR_FROM..YEAR_TO,
    fetch /stats/player/season for each of 5 categories.
  - Cache each response to data/college_cache/<sha>.json so re-runs are
    incremental.
  - Aggregate per-player career totals across all years.

Output: data/college_stats.csv with one row per (player_name, college):
  player_name, college, seasons_played, last_season,
  pass_yards, pass_tds, pass_ints, pass_completions, pass_attempts,
  rush_yards, rush_tds, rush_atts,
  rec_yards, rec_tds, receptions,
  def_tackles, def_sacks, def_ints,
  ko_returns, ko_return_yards
"""

import csv
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT          = Path(__file__).parent
DRAFT_PATH    = ROOT / "data" / "draft_data.json"
CACHE_DIR     = ROOT / "data" / "college_cache"
OUT_FILE      = ROOT / "data" / "college_stats.csv"
KEY_FILE      = ROOT / "data" / ".cfbd_api_key"

MIN_COLLEGE_PICKS = 5
YEAR_FROM         = 1996   # earliest senior year for 2000 draftees (4 yrs back)
YEAR_TO           = 2024   # latest senior year for 2025 draftees
CATEGORIES        = ["passing", "rushing", "receiving", "defensive", "kickReturns"]
MAX_CONCURRENCY   = 12     # Patron tier — push harder.
RETRY_BASE_SLEEP  = 2.0
MAX_RETRIES       = 6
INTER_REQ_SLEEP   = 0.0    # per-worker sleep before each request

# Stat keys we keep, per category. CFBD encodes stats as
# {"category": ..., "statType": "YDS", "stat": "1234"} rows.
# Keep only useful aggregates and pull as numbers.
KEEP_STATS = {
    "passing":     {"YDS": "pass_yards", "TD": "pass_tds", "INT": "pass_ints",
                    "COMPLETIONS": "pass_completions", "ATT": "pass_attempts"},
    "rushing":     {"YDS": "rush_yards", "TD": "rush_tds", "CAR": "rush_atts"},
    "receiving":   {"YDS": "rec_yards", "TD": "rec_tds", "REC": "receptions"},
    "defensive":   {"TOT": "def_tackles", "SACKS": "def_sacks", "INT": "def_ints"},
    "kickReturns": {"NO": "ko_returns", "YDS": "ko_return_yards"},
}

OUT_FIELDS = [
    "player_name", "college", "seasons_played", "last_season",
    "pass_yards", "pass_tds", "pass_ints", "pass_completions", "pass_attempts",
    "rush_yards", "rush_tds", "rush_atts",
    "rec_yards", "rec_tds", "receptions",
    "def_tackles", "def_sacks", "def_ints",
    "ko_returns", "ko_return_yards",
]


def load_api_key():
    key = os.environ.get("CFBD_API_KEY")
    if key:
        return key.strip()
    if KEY_FILE.exists():
        return KEY_FILE.read_text(encoding="utf-8").strip()
    sys.exit("No CFBD API key. Set CFBD_API_KEY env var or drop into data/.cfbd_api_key")


def cache_path(team, year, category):
    h = hashlib.sha1(f"{team}|{year}|{category}".encode("utf-8")).hexdigest()[:16]
    return CACHE_DIR / f"{h}.json"


def fetch_combo(team, year, category, key):
    """Fetch one (team, year, category) tuple with retry + on-disk cache.

    Never caches empty on rate-limit failure — that would corrupt future
    runs. Caches empty only on a true 200-OK empty list or a 4xx-other.
    On exhausted retries (likely 429 storm), raises so the caller can
    re-queue or report it.
    """
    cp = cache_path(team, year, category)
    if cp.exists():
        with cp.open(encoding="utf-8") as f:
            return json.load(f)

    qs = urllib.parse.urlencode({"year": year, "team": team, "category": category})
    url = f"https://api.collegefootballdata.com/stats/player/season?{qs}"
    last_err = None
    for attempt in range(MAX_RETRIES):
        if INTER_REQ_SLEEP:
            time.sleep(INTER_REQ_SLEEP)
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "User-Agent":    "fourth-infinite/0.1",
                },
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
            # 200-OK (even empty) -> cache and return.
            cp.parent.mkdir(parents=True, exist_ok=True)
            cp.write_text(json.dumps(data), encoding="utf-8")
            return data
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429:
                wait = RETRY_BASE_SLEEP * (2 ** attempt)
                time.sleep(wait)
                continue
            if e.code in (502, 503, 504):
                time.sleep(RETRY_BASE_SLEEP * (2 ** attempt))
                continue
            # 4xx other than 429 — treat as bad query, cache empty.
            cp.parent.mkdir(parents=True, exist_ok=True)
            cp.write_text("[]", encoding="utf-8")
            return []
        except Exception as e:
            last_err = e
            time.sleep(RETRY_BASE_SLEEP * (2 ** attempt))
    # Exhausted retries — DO NOT cache. Raise so caller knows it failed.
    raise RuntimeError(f"give-up after {MAX_RETRIES} retries on {team}/{year}/{category}: {last_err}")


def main():
    key = load_api_key()

    with DRAFT_PATH.open(encoding="utf-8") as f:
        draft = json.load(f)
    picks = [p for p in draft["picks"]
             if 2000 <= p["year"] <= 2025 and p["college"]]

    # College pick counts -> filter
    pick_counts = defaultdict(int)
    for p in picks:
        pick_counts[p["college"]] += 1
    target_colleges = [c for c, n in pick_counts.items() if n >= MIN_COLLEGE_PICKS]
    print(f"Target colleges: {len(target_colleges)} (>= {MIN_COLLEGE_PICKS} picks)")
    print(f"Year range:      {YEAR_FROM}-{YEAR_TO}")
    print(f"Categories:      {CATEGORIES}")

    combos = [
        (col, yr, cat)
        for col in target_colleges
        for yr  in range(YEAR_FROM, YEAR_TO + 1)
        for cat in CATEGORIES
    ]
    print(f"Total fetches:   {len(combos)}")

    # Aggregator: (player_name, college) -> stat_key -> total
    agg = defaultdict(lambda: defaultdict(float))
    seasons = defaultdict(set)

    def _process(col, yr, cat, rows):
        for r in rows:
            player = (r.get("player") or "").strip()
            team   = (r.get("team")   or "").strip()
            stat_t = (r.get("statType") or "").strip().upper()
            if not player or not team:
                continue
            key_map = KEEP_STATS.get(cat, {})
            if stat_t not in key_map:
                continue
            try:
                val = float(r.get("stat", 0) or 0)
            except (TypeError, ValueError):
                continue
            agg[(player, team)][key_map[stat_t]] += val
            seasons[(player, team)].add(yr)

    pending = list(combos)
    rounds_done = 0
    while pending:
        rounds_done += 1
        failures = []
        completed = 0
        t0 = time.time()
        print(f"\n=== Round {rounds_done}: {len(pending)} combos ===")
        with ThreadPoolExecutor(max_workers=MAX_CONCURRENCY) as ex:
            futures = {ex.submit(fetch_combo, c, y, cat, key): (c, y, cat) for (c, y, cat) in pending}
            for fut in as_completed(futures):
                (col, yr, cat) = futures[fut]
                try:
                    rows = fut.result()
                    _process(col, yr, cat, rows)
                except Exception as e:
                    failures.append((col, yr, cat))
                completed += 1
                if completed % 1000 == 0:
                    rate = completed / max(0.001, time.time() - t0)
                    eta = (len(pending) - completed) / max(0.01, rate)
                    print(f"  {completed}/{len(pending)} fetched | {rate:.1f}/s | ETA {eta/60:.1f}m | failures so far: {len(failures)}")
        print(f"  Round {rounds_done} done. Failures to retry: {len(failures)}")
        if not failures:
            break
        if rounds_done >= 4:
            print(f"  Giving up after {rounds_done} rounds. {len(failures)} combos still failing.")
            break
        pending = failures
        time.sleep(30)  # let CFBD recover before another sweep

    print(f"Aggregating {len(agg)} player-college rows...")
    rows = []
    for (player, team), stats in agg.items():
        row = {"player_name": player, "college": team}
        yrs = sorted(seasons[(player, team)])
        row["seasons_played"] = len(yrs)
        row["last_season"]    = yrs[-1] if yrs else ""
        for f in OUT_FIELDS:
            if f in row:
                continue
            v = stats.get(f, 0)
            row[f] = int(v) if v.is_integer() else round(v, 2)
        rows.append(row)

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUT_FILE.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUT_FIELDS)
        w.writeheader()
        w.writerows(rows)

    print(f"\nWrote {len(rows)} rows to {OUT_FILE}")


if __name__ == "__main__":
    main()

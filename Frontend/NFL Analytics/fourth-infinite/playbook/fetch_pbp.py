"""PLAYBOOK Phase A — fetch nflverse play-by-play, engineer features, build labels.

Pulls play_by_play_{year}.parquet from nflverse GitHub releases for each
year in YEARS, filters to offensive plays, derives the 3-class play label
(RUN / SHORT_PASS / DEEP_PASS) per the design decision in
project_aiml_portfolio.md, engineers numeric and binary features, and
writes a single combined parquet to data/pbp_features.parquet.

Raw downloads are cached at data/raw/play_by_play_{year}.parquet. Re-runs
reuse the cache. Delete data/raw/ to force a refresh.

Run:
    python -m playbook.fetch_pbp
or:
    python fetch_pbp.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import requests
from tqdm import tqdm

ROOT     = Path(__file__).parent
DATA_DIR = ROOT / "data"
RAW_DIR  = DATA_DIR / "raw"
OUT_FILE = DATA_DIR / "pbp_features.parquet"

YEARS = range(1999, 2026)  # 1999-2025 inclusive

URL_TMPL = (
    "https://github.com/nflverse/nflverse-data/releases/"
    "download/pbp/play_by_play_{year}.parquet"
)

# Columns we read from nflverse pbp (~370 total in source). Older years may
# be missing some; load_year() backfills missing columns with NA.
KEEP_COLUMNS = [
    "season", "week", "game_id", "play_id", "drive",
    "posteam", "defteam", "home_team", "away_team",
    "qtr", "down", "ydstogo", "yardline_100",
    "quarter_seconds_remaining", "game_seconds_remaining",
    "posteam_timeouts_remaining", "defteam_timeouts_remaining",
    "score_differential",
    "play_type", "pass_attempt", "rush_attempt", "qb_scramble", "sack",
    "qb_kneel", "qb_spike", "two_point_attempt",
    "air_yards", "pass_length",
    "shotgun", "no_huddle",
    "epa",
]

DEEP_PASS_THRESHOLD = 10  # air yards; nflverse short/deep convention
HISTORY_N = 5             # last N play labels in current drive


def download_year(year: int) -> Path:
    cached = RAW_DIR / f"play_by_play_{year}.parquet"
    if cached.exists():
        return cached
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    url = URL_TMPL.format(year=year)
    resp = requests.get(url, stream=True, timeout=120)
    resp.raise_for_status()
    with open(cached, "wb") as fh:
        for chunk in resp.iter_content(chunk_size=1 << 16):
            fh.write(chunk)
    return cached


def load_year(year: int) -> pd.DataFrame:
    df = pd.read_parquet(download_year(year))
    for c in KEEP_COLUMNS:
        if c not in df.columns:
            df[c] = pd.NA
    return df[KEEP_COLUMNS]


def filter_offensive(df: pd.DataFrame) -> pd.DataFrame:
    keep = (
        df["play_type"].isin(["pass", "run"])
        & (df["qb_kneel"].fillna(0) == 0)
        & (df["qb_spike"].fillna(0) == 0)
        & (df["two_point_attempt"].fillna(0) == 0)
        & df["posteam"].notna()
        & df["defteam"].notna()
        & df["down"].notna()
    )
    return df[keep].copy()


def label_play(df: pd.DataFrame) -> pd.DataFrame:
    """3-class label. Scrambles and sacks classify as SHORT_PASS by intent.
    Air yards is null on sacks/scrambles, so they fall through to short."""
    is_pass = df["play_type"].eq("pass") | df["qb_scramble"].fillna(0).eq(1)
    air = pd.to_numeric(df["air_yards"], errors="coerce")
    is_deep  = is_pass & air.notna() & (air >= DEEP_PASS_THRESHOLD)
    is_short = is_pass & ~is_deep

    label = pd.Series("RUN", index=df.index, dtype="object")
    label[is_short] = "SHORT_PASS"
    label[is_deep]  = "DEEP_PASS"
    return df.assign(play_label=label)


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Numeric/binary derivations only. Categorical encoding deferred to
    Phase B (model-specific)."""
    df = df.copy()
    yl = pd.to_numeric(df["yardline_100"], errors="coerce")
    gs = pd.to_numeric(df["game_seconds_remaining"], errors="coerce")
    df["is_red_zone"]      = (yl <= 20).fillna(False).astype("int8")
    df["is_goal_line"]     = (yl <=  5).fillna(False).astype("int8")
    df["is_two_minute"]    = ((gs < 120) & df["qtr"].isin([2, 4])).fillna(False).astype("int8")
    df["is_third_down"]    = (df["down"] == 3).fillna(False).astype("int8")
    df["is_fourth_down"]   = (df["down"] == 4).fillna(False).astype("int8")
    df["is_short_yardage"] = (df["ydstogo"] <= 2).fillna(False).astype("int8")
    df["is_long_yardage"]  = (df["ydstogo"] >= 8).fillna(False).astype("int8")
    df["is_garbage_time"]  = (df["score_differential"].abs() > 21).fillna(False).astype("int8")
    df["is_scramble"]      = df["qb_scramble"].fillna(0).astype("int8")
    df["is_sack"]          = df["sack"].fillna(0).astype("int8")
    df["is_home"]          = (df["posteam"] == df["home_team"]).astype("int8")
    return df


def add_play_history(df: pd.DataFrame, n: int = HISTORY_N) -> pd.DataFrame:
    """Last-N play labels within each drive. Resets at change of possession.
    Pre-drive slots are filled with 'NONE'."""
    df = df.sort_values(["game_id", "play_id"]).reset_index(drop=True)
    grp = df.groupby(["game_id", "drive"], dropna=False)["play_label"]
    for i in range(1, n + 1):
        df[f"prev_play_label_{i}"] = grp.shift(i).fillna("NONE").astype("string")
    return df


def process_year(year: int) -> pd.DataFrame:
    df = load_year(year)
    df = filter_offensive(df)
    df = label_play(df)
    df = engineer_features(df)
    return df


def main() -> int:
    DATA_DIR.mkdir(exist_ok=True)
    frames: list[pd.DataFrame] = []
    for year in tqdm(list(YEARS), desc="years", unit="yr"):
        try:
            frames.append(process_year(year))
        except Exception as exc:
            print(f"  ! year {year} failed: {exc}", file=sys.stderr)
            continue

    if not frames:
        print("No years processed.", file=sys.stderr)
        return 1

    full = pd.concat(frames, ignore_index=True)
    full = add_play_history(full)
    full.to_parquet(OUT_FILE, index=False, compression="zstd")

    print()
    print(f"Wrote {len(full):,} rows to {OUT_FILE}")
    print()
    print("Label distribution:")
    print(full["play_label"].value_counts().to_string())
    print()
    print(f"Years: {full['season'].min()}-{full['season'].max()}, "
          f"games: {full['game_id'].nunique():,}, "
          f"drives: {full.groupby(['game_id','drive']).ngroups:,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

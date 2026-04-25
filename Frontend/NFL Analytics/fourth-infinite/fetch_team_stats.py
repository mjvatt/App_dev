"""
fetch_team_stats.py

Downloads nflverse player_stats.csv (offensive stats) and schedules.csv
(points for/against), aggregates to team-season level, and writes
data/team_stats.json.

Coverage: 1999–2025 (nflverse player stats begin 1999).

Usage:
    python fetch_team_stats.py
"""

import csv
import json
import urllib.request
from collections import defaultdict
from pathlib import Path

PLAYER_STATS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "player_stats/player_stats.csv"
)
SCHEDULES_URL = (
    "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
)
OUT_FILE   = Path(__file__).parent / "data" / "team_stats.json"
FIRST_YEAR = 1999
LAST_YEAR  = 2025

TEAM_MAP = {
    "ARI": "Arizona Cardinals",
    "ATL": "Atlanta Falcons",
    "BAL": "Baltimore Ravens",
    "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers",
    "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals",
    "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos",
    "DET": "Detroit Lions",
    "GB":  "Green Bay Packers",
    "HOU": "Houston Texans",
    "IND": "Indianapolis Colts",
    "JAX": "Jacksonville Jaguars",
    "JAC": "Jacksonville Jaguars",
    "KC":  "Kansas City Chiefs",
    "LA":  "Los Angeles Rams",
    "LAC": "Los Angeles Chargers",
    "LAR": "Los Angeles Rams",
    "LV":  "Las Vegas Raiders",
    "LVR": "Las Vegas Raiders",
    "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings",
    "NE":  "New England Patriots",
    "NO":  "New Orleans Saints",
    "NYG": "New York Giants",
    "NYJ": "New York Jets",
    "OAK": "Oakland Raiders",
    "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers",
    "SD":  "San Diego Chargers",
    "SEA": "Seattle Seahawks",
    "SF":  "San Francisco 49ers",
    "STL": "St. Louis Rams",
    "TB":  "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans",
    "WAS": "Washington Commanders",
    "WSH": "Washington Commanders",
}


def fetch_csv(url):
    print(f"Downloading {url.split('/')[-1]} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read().decode("utf-8")


def ival(row, field):
    v = row.get(field, "") or ""
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return 0


def main():
    # ── Offensive stats from player_stats.csv ────────────────────────
    offense = defaultdict(lambda: {
        "pass_yards": 0, "rush_yards": 0,
        "pass_tds": 0,   "rush_tds": 0,
    })

    content = fetch_csv(PLAYER_STATS_URL)
    for row in csv.DictReader(content.splitlines()):
        if row.get("season_type", "").strip() != "REG":
            continue
        year = ival(row, "season")
        if not (FIRST_YEAR <= year <= LAST_YEAR):
            continue
        team = TEAM_MAP.get(row.get("recent_team", "").strip())
        if not team:
            continue
        key = (team, year)
        offense[key]["pass_yards"] += ival(row, "passing_yards")
        offense[key]["rush_yards"] += ival(row, "rushing_yards")
        offense[key]["pass_tds"]   += ival(row, "passing_tds")
        offense[key]["rush_tds"]   += ival(row, "rushing_tds")

    print(f"  {len(offense)} team-season offense rows")

    # ── Points from schedules.csv ────────────────────────────────────
    scoring = defaultdict(lambda: {"points_for": 0, "points_against": 0, "games": 0})

    content = fetch_csv(SCHEDULES_URL)
    for row in csv.DictReader(content.splitlines()):
        if row.get("game_type", "").strip() not in ("REG", ""):
            continue
        year = ival(row, "season")
        if not (FIRST_YEAR <= year <= LAST_YEAR):
            continue
        h_score = ival(row, "home_score")
        a_score = ival(row, "away_score")
        if h_score == 0 and a_score == 0:
            continue  # skip unplayed/future games
        h_team = TEAM_MAP.get(row.get("home_team", "").strip())
        a_team = TEAM_MAP.get(row.get("away_team", "").strip())
        if h_team:
            scoring[(h_team, year)]["points_for"]    += h_score
            scoring[(h_team, year)]["points_against"] += a_score
            scoring[(h_team, year)]["games"]          += 1
        if a_team:
            scoring[(a_team, year)]["points_for"]    += a_score
            scoring[(a_team, year)]["points_against"] += h_score
            scoring[(a_team, year)]["games"]          += 1

    print(f"  {len(scoring)} team-season scoring rows")

    # ── Merge and write ──────────────────────────────────────────────
    all_keys = sorted(set(offense) | set(scoring))
    results  = []
    for (team, year) in all_keys:
        o = offense.get((team, year), {})
        s = scoring.get((team, year), {})
        results.append({
            "year":           year,
            "team":           team,
            "games":          s.get("games", 0),
            "points_for":     s.get("points_for", 0),
            "points_against": s.get("points_against", 0),
            "pass_yards":     o.get("pass_yards", 0),
            "rush_yards":     o.get("rush_yards", 0),
            "pass_tds":       o.get("pass_tds", 0),
            "rush_tds":       o.get("rush_tds", 0),
        })

    OUT_FILE.parent.mkdir(exist_ok=True)
    with open(OUT_FILE, "w") as f:
        json.dump({"stats": results}, f, separators=(",", ":"))

    print(f"Wrote {len(results)} rows -> {OUT_FILE}")


if __name__ == "__main__":
    main()

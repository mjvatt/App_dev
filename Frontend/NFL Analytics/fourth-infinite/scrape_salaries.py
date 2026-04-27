"""
scrape_salaries.py

Scrapes Spotrac for NFL salary cap data and writes data/salaries.json.

Two datasets collected:
  cap_by_year  — all 32 teams, available cap space per season (FIRST_YEAR–CURRENT_YEAR)
                 (Spotrac's /nfl/cap/{year}/ page ranks by cap space; that's the
                  metric available from the league summary URL)
  top_earners  — top 15 active-roster cap hits per team for CURRENT_YEAR

Flags:
  --probe   Fetch league cap 2025 + Cowboys 2025, print parsed results, exit.
  --debug   Dump raw HTML for every fetched URL to debug_*.html files.
  --year N  Override CURRENT_YEAR for top_earners (e.g. --year 2024).

Usage:
    python scrape_salaries.py --probe
    python scrape_salaries.py
    python scrape_salaries.py --debug
"""

import json
import re
import sys
import time
import cloudscraper
from bs4 import BeautifulSoup
from pathlib import Path

CURRENT_YEAR = 2025
FIRST_YEAR   = 2013
TOP_N        = 15
DELAY        = 5.0
OUT_FILE     = Path(__file__).parent / "data" / "salaries.json"
BASE         = "https://www.spotrac.com"

PROBE  = "--probe" in sys.argv
DEBUG  = "--debug" in sys.argv
if "--year" in sys.argv:
    idx = sys.argv.index("--year")
    CURRENT_YEAR = int(sys.argv[idx + 1])

TEAM_SLUGS = {
    "Arizona Cardinals":     "arizona-cardinals",
    "Atlanta Falcons":       "atlanta-falcons",
    "Baltimore Ravens":      "baltimore-ravens",
    "Buffalo Bills":         "buffalo-bills",
    "Carolina Panthers":     "carolina-panthers",
    "Chicago Bears":         "chicago-bears",
    "Cincinnati Bengals":    "cincinnati-bengals",
    "Cleveland Browns":      "cleveland-browns",
    "Dallas Cowboys":        "dallas-cowboys",
    "Denver Broncos":        "denver-broncos",
    "Detroit Lions":         "detroit-lions",
    "Green Bay Packers":     "green-bay-packers",
    "Houston Texans":        "houston-texans",
    "Indianapolis Colts":    "indianapolis-colts",
    "Jacksonville Jaguars":  "jacksonville-jaguars",
    "Kansas City Chiefs":    "kansas-city-chiefs",
    "Las Vegas Raiders":     "las-vegas-raiders",
    "Los Angeles Chargers":  "los-angeles-chargers",
    "Los Angeles Rams":      "los-angeles-rams",
    "Miami Dolphins":        "miami-dolphins",
    "Minnesota Vikings":     "minnesota-vikings",
    "New England Patriots":  "new-england-patriots",
    "New Orleans Saints":    "new-orleans-saints",
    "New York Giants":       "new-york-giants",
    "New York Jets":         "new-york-jets",
    "Philadelphia Eagles":   "philadelphia-eagles",
    "Pittsburgh Steelers":   "pittsburgh-steelers",
    "San Francisco 49ers":   "san-francisco-49ers",
    "Seattle Seahawks":      "seattle-seahawks",
    "Tampa Bay Buccaneers":  "tampa-bay-buccaneers",
    "Tennessee Titans":      "tennessee-titans",
    "Washington Commanders": "washington-commanders",
}

# Reverse: slug → canonical name (used for href matching)
SLUG_TO_TEAM = {slug: name for name, slug in TEAM_SLUGS.items()}

# NFL abbreviation → canonical name (league cap summary page uses abbreviated cells)
TEAM_ABBREVS = {
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
    "JAC": "Jacksonville Jaguars",
    "JAX": "Jacksonville Jaguars",
    "KC":  "Kansas City Chiefs",
    "LV":  "Las Vegas Raiders",
    "LVR": "Las Vegas Raiders",
    "LAC": "Los Angeles Chargers",
    "LA":  "Los Angeles Rams",
    "LAR": "Los Angeles Rams",
    "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings",
    "NE":  "New England Patriots",
    "NO":  "New Orleans Saints",
    "NYG": "New York Giants",
    "NYJ": "New York Jets",
    "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers",
    "SF":  "San Francisco 49ers",
    "SEA": "Seattle Seahawks",
    "TB":  "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans",
    "WAS": "Washington Commanders",
    "WSH": "Washington Commanders",
}

# Player cell format: "Dak Prescott(QB, 32)"
_NAME_POS_RE = re.compile(r"^(.*?)\s*\(([A-Z/]+),\s*\d+\)")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def parse_dollars(text):
    s = text.strip().replace("$", "").replace(",", "")
    s = s.replace("(", "-").replace(")", "")
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 0


def is_dollar(text):
    return bool(re.search(r"\$[\d,]+", text))


def team_from_href(tag):
    """Return canonical team name from any <a href> containing a known slug."""
    a = tag.find("a", href=True) if hasattr(tag, "find") else None
    if not a:
        return None
    href = a["href"]
    for slug, name in SLUG_TO_TEAM.items():
        if f"/{slug}/" in href:
            return name
    return None


def team_from_abbrev(cell_text):
    """
    League cap summary cells contain the team abbreviation doubled, e.g. 'NENE',
    'LVLV', 'WASWAS'. Split in half; look up the first half in TEAM_ABBREVS.
    """
    n = len(cell_text)
    if n < 2:
        return None
    half = cell_text[: n // 2]
    if cell_text == half * 2:
        return TEAM_ABBREVS.get(half)
    # Fallback: direct lookup (handles odd-length or non-doubled cells)
    return TEAM_ABBREVS.get(cell_text)


def extract_player_pos(cell_text):
    """Split 'Dak Prescott(QB, 32)' → ('Dak Prescott', 'QB')."""
    m = _NAME_POS_RE.match(cell_text.strip())
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return cell_text.strip(), ""


def header_indices(table):
    """Lowercased header text → column index from the first header row with content."""
    for tr in table.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        texts = [c.get_text(strip=True).lower() for c in cells]
        if any(texts):
            return {t: i for i, t in enumerate(texts)}
    return {}


def fetch(session, url):
    resp = session.get(url, timeout=25)
    resp.raise_for_status()
    if DEBUG:
        slug = re.sub(r"[^a-z0-9]", "_", url.replace(BASE, "").strip("/"))
        Path(f"debug_{slug}.html").write_text(resp.text, encoding="utf-8")
    return resp.text


# ---------------------------------------------------------------------------
# League cap summary  (one page per year → cap space per team)
# ---------------------------------------------------------------------------

def fetch_cap_summary(session, year):
    url = f"{BASE}/nfl/cap/{year}/"
    print(f"  {year}  GET {url}", end=" ... ", flush=True)
    html = fetch(session, url)
    soup = BeautifulSoup(html, "html.parser")

    rows = []
    seen = set()

    for table in soup.find_all("table"):
        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if not tds:
                continue

            # Team: abbrev cell is doubled (e.g. "NENE"); href uses redirect IDs (no slug)
            team = None
            for td in tds[:3]:
                team = team_from_abbrev(td.get_text(strip=True))
                if team:
                    break
            if not team or team in seen:
                continue

            # Dollar value: only one per row on this page (cap space)
            cap_space = max(
                (parse_dollars(td.get_text()) for td in tds if is_dollar(td.get_text())),
                default=0,
            )
            if cap_space == 0:
                continue

            seen.add(team)
            rows.append({"year": year, "team": team, "cap_space": cap_space})

    print(f"{len(rows)} teams")
    return rows


# ---------------------------------------------------------------------------
# Per-team top earners  (Table 0 = active roster, already sorted by cap hit)
# ---------------------------------------------------------------------------

def fetch_team_earners(session, team_name, slug, year=CURRENT_YEAR):
    url = f"{BASE}/nfl/{slug}/cap/{year}/"
    print(f"  {team_name}  GET {url}", end=" ... ", flush=True)
    html = fetch(session, url)
    soup = BeautifulSoup(html, "html.parser")

    tables = soup.find_all("table")
    if not tables:
        print("0 earners (no tables)")
        return []

    # Table 0 = active roster ranked by cap hit descending
    table = tables[0]
    hdrs  = header_indices(table)

    # Headers confirmed by probe: ['rk', 'player', 'cap hit']
    player_idx = hdrs.get("player", 1)
    cap_idx    = hdrs.get("cap hit", 2)

    earners = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) <= max(player_idx, cap_idx):
            continue

        raw_player = tds[player_idx].get_text(strip=True)
        player, pos = extract_player_pos(raw_player)

        if not player or player.lower() in ("player", "name", "total"):
            continue

        cap_hit = parse_dollars(tds[cap_idx].get_text())
        if cap_hit <= 0:
            continue

        earners.append({
            "year":    year,
            "team":    team_name,
            "rank":    len(earners) + 1,
            "player":  player,
            "pos":     pos,
            "cap_hit": cap_hit,
        })

        if len(earners) >= TOP_N:
            break

    print(f"{len(earners)} earners")
    return earners


# ---------------------------------------------------------------------------
# Probe mode
# ---------------------------------------------------------------------------

def probe(session):
    print("\n--- League cap summary (2025) ---")
    rows = fetch_cap_summary(session, 2025)
    for r in rows[:5]:
        print(f"  {r}")
    if len(rows) > 5:
        print(f"  ... ({len(rows)} total)")

    time.sleep(DELAY)

    print("\n--- Cowboys top earners (2025) ---")
    earners = fetch_team_earners(session, "Dallas Cowboys", "dallas-cowboys")
    for e in earners:
        print(f"  #{e['rank']:2d}  {e['player']:<25} {e['pos']:<5} ${e['cap_hit']:>12,}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    session = cloudscraper.create_scraper()

    if PROBE:
        probe(session)
        return

    OUT_FILE.parent.mkdir(exist_ok=True)

    cap_by_year = []
    print(f"Fetching league cap summaries ({FIRST_YEAR}–{CURRENT_YEAR})...")
    for year in range(FIRST_YEAR, CURRENT_YEAR + 1):
        try:
            rows = fetch_cap_summary(session, year)
            cap_by_year.extend(rows)
        except Exception as e:
            print(f"  ERROR year {year}: {e}")
        time.sleep(DELAY)

    top_earners = []
    print(f"\nFetching top earners per team ({CURRENT_YEAR})...")
    for team_name, slug in TEAM_SLUGS.items():
        try:
            rows = fetch_team_earners(session, team_name, slug)
            top_earners.extend(rows)
        except Exception as e:
            print(f"  ERROR {team_name}: {e}")
        time.sleep(DELAY)

    out = {"cap_by_year": cap_by_year, "top_earners": top_earners}
    with open(OUT_FILE, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(
        f"\nSaved {len(cap_by_year)} cap-year rows "
        f"and {len(top_earners)} earner rows → {OUT_FILE}"
    )


if __name__ == "__main__":
    main()

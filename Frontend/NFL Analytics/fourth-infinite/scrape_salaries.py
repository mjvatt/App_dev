"""
scrape_salaries.py

Scrapes Spotrac for NFL salary cap data and writes data/salaries.json.

Two datasets collected:
  cap_by_year  — all 32 teams, total cap hit per season (FIRST_YEAR–CURRENT_YEAR)
  top_earners  — top 15 cap hits per team for CURRENT_YEAR

Flags:
  --probe   Fetch one URL (league cap 2025 + Cowboys 2025), print table
            structure, then exit. Use this first to verify HTML before a
            full run.
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


def match_team(cell_text):
    """Map a Spotrac team cell (may include city, nickname, or both) to a canonical name."""
    lower = cell_text.lower()
    for name in TEAM_SLUGS:
        parts = name.lower().split()
        # Match on city (first word) or last word of nickname
        if parts[0] in lower or parts[-1] in lower:
            return name
    return None


def header_indices(table):
    """Return a dict of lowercased header text → column index for the first header row found."""
    for tr in table.find_all("tr"):
        ths = tr.find_all(["th", "td"])
        texts = [th.get_text(strip=True).lower() for th in ths]
        if any(t for t in texts):
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
# League cap summary  (one page per year → all 32 teams)
# ---------------------------------------------------------------------------

_CAP_HIT_KEYS  = {"cap hit", "total", "total allocations", "cap allocations", "cap"}
_CAP_SPACE_KEYS = {"cap space", "available", "space", "remaining"}
_TEAM_KEYS     = {"team"}


def fetch_cap_summary(session, year):
    url = f"{BASE}/nfl/cap/{year}/"
    print(f"  {year}  GET {url}", end=" ... ", flush=True)
    html = fetch(session, url)
    soup = BeautifulSoup(html, "html.parser")

    rows = []
    for table in soup.find_all("table"):
        hdrs = header_indices(table)

        team_idx    = next((hdrs[k] for k in _TEAM_KEYS     if k in hdrs), None)
        cap_idx     = next((hdrs[k] for k in _CAP_HIT_KEYS  if k in hdrs), None)
        space_idx   = next((hdrs[k] for k in _CAP_SPACE_KEYS if k in hdrs), None)

        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if not tds:
                continue

            # Team: use detected index, else scan all cells
            team_text = tds[team_idx].get_text(strip=True) if team_idx is not None and team_idx < len(tds) else ""
            if not team_text:
                team_text = " ".join(td.get_text(strip=True) for td in tds[:3])
            team = match_team(team_text)
            if not team:
                continue

            # Cap hit: use detected index, else largest dollar value in row
            if cap_idx is not None and cap_idx < len(tds):
                cap_hit = parse_dollars(tds[cap_idx].get_text())
            else:
                dollar_vals = [parse_dollars(td.get_text()) for td in tds if is_dollar(td.get_text())]
                cap_hit = max(dollar_vals, default=0)

            cap_space = 0
            if space_idx is not None and space_idx < len(tds):
                cap_space = parse_dollars(tds[space_idx].get_text())

            if cap_hit > 0:
                rows.append({"year": year, "team": team, "cap_hit": cap_hit, "cap_space": cap_space})

    print(f"{len(rows)} teams")
    return rows


# ---------------------------------------------------------------------------
# Per-team top earners  (one page per team for CURRENT_YEAR)
# ---------------------------------------------------------------------------

_PLAYER_KEYS  = {"player", "name"}
_POS_KEYS     = {"pos", "position"}
_CAPHIT_KEYS  = {"cap hit", "cap", "2025 cap hit", "2024 cap hit", "cap number"}


def fetch_team_earners(session, team_name, slug, year=CURRENT_YEAR):
    url = f"{BASE}/nfl/{slug}/cap/{year}/"
    print(f"  {team_name}  GET {url}", end=" ... ", flush=True)
    html = fetch(session, url)
    soup = BeautifulSoup(html, "html.parser")

    earners = []
    for table in soup.find_all("table"):
        hdrs = header_indices(table)

        player_idx = next((hdrs[k] for k in _PLAYER_KEYS  if k in hdrs), 0)
        pos_idx    = next((hdrs[k] for k in _POS_KEYS     if k in hdrs), None)
        cap_idx    = next((hdrs[k] for k in _CAPHIT_KEYS  if k in hdrs), None)

        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 2:
                continue

            player = tds[player_idx].get_text(strip=True) if player_idx < len(tds) else ""
            if not player or player.lower() in ("player", "name", "total", ""):
                continue

            pos = ""
            if pos_idx is not None and pos_idx < len(tds):
                pos = tds[pos_idx].get_text(strip=True)

            if cap_idx is not None and cap_idx < len(tds):
                cap_hit = parse_dollars(tds[cap_idx].get_text())
            else:
                dollar_vals = [parse_dollars(td.get_text()) for td in tds if is_dollar(td.get_text())]
                cap_hit = max(dollar_vals, default=0)

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

        if len(earners) >= TOP_N:
            break

    print(f"{len(earners)} earners")
    return earners


# ---------------------------------------------------------------------------
# Probe mode — inspect table structure without writing data
# ---------------------------------------------------------------------------

def probe(session):
    for label, url in [
        ("league cap 2025", f"{BASE}/nfl/cap/2025/"),
        ("Cowboys 2025",    f"{BASE}/nfl/dallas-cowboys/cap/2025/"),
    ]:
        print(f"\n{'='*60}")
        print(f"PROBE: {label}")
        print(f"URL:   {url}")
        try:
            html = fetch(session, url)
            soup = BeautifulSoup(html, "html.parser")
            tables = soup.find_all("table")
            print(f"Tables found: {len(tables)}")
            for i, t in enumerate(tables):
                print(f"\n  Table {i}: id={t.get('id')} class={t.get('class')}")
                hdrs = header_indices(t)
                print(f"  Headers: {list(hdrs.keys())}")
                data_rows = [tr for tr in t.find_all("tr") if tr.find("td")]
                print(f"  Data rows: {len(data_rows)}")
                for tr in data_rows[:3]:
                    print(f"    {[td.get_text(strip=True)[:25] for td in tr.find_all('td')]}")
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(DELAY)


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

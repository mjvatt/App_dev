import csv
import re
import time
import requests
from bs4 import BeautifulSoup
from pathlib import Path

DATA_DIR = Path(__file__).parent / "Data"
BASE_URL = "https://www.footballdb.com/draft/draft.html"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}
YEARS = range(2005, 2026)
ROUNDS = range(1, 8)
DELAY = 2.0  # seconds between requests — be polite


def fetch_round(session, year, rnd):
    params = {"lg": "NFL", "yr": year, "rnd": rnd}
    resp = session.get(BASE_URL, params=params, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    table = soup.find("table", class_="statistics")
    if not table:
        return []

    rows = []
    for tr in table.find("tbody").find_all("tr"):
        cells = [td.get_text(strip=True) for td in tr.find_all("td")]
        if len(cells) < 4:
            continue
        # Site columns: Round, Pick, Team, Player, Pos, College, Note
        # Round comes as "1(5)" — keep only the leading digit(s)
        round_raw = cells[0] if len(cells) > 0 else ""
        round_num = re.match(r"^(\d+)", round_raw).group(1) if re.match(r"^(\d+)", round_raw) else round_raw
        pick_num  = cells[1] if len(cells) > 1 else ""
        # Team has abbreviation appended e.g. "San Francisco 49ersSF" — strip trailing uppercase+digits slug
        team_raw  = cells[2] if len(cells) > 2 else ""
        team      = re.sub(r"[A-Z]{2,4}$", "", team_raw).strip()
        player    = cells[3] if len(cells) > 3 else ""
        pos       = cells[4] if len(cells) > 4 else ""
        college   = cells[5] if len(cells) > 5 else ""
        note      = cells[6] if len(cells) > 6 else ""
        rows.append([round_num, pick_num, team, player, pos, college, "", note])
    return rows


def scrape_year(session, year):
    all_rows = []
    for rnd in ROUNDS:
        print(f"  Round {rnd}...", end=" ", flush=True)
        try:
            rows = fetch_round(session, year, rnd)
            if not rows:
                print("empty — stopping rounds early")
                break
            all_rows.extend(rows)
            print(f"{len(rows)} picks")
        except Exception as e:
            print(f"ERROR: {e}")
            break
        time.sleep(DELAY)
    return all_rows


def save_csv(year, rows):
    out_path = DATA_DIR / f"NFL_draft_{year}.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Rnd.", "Pick #", "NFL Team", "Player", "Pos.", "College", "Conf.", "Notes"])
        writer.writerows(rows)
    print(f"  Saved {out_path.name} ({len(rows)} picks total)")


def main():
    DATA_DIR.mkdir(exist_ok=True)
    session = requests.Session()
    for year in YEARS:
        out_path = DATA_DIR / f"NFL_draft_{year}.csv"
        if out_path.exists():
            print(f"{year}: already exists, skipping")
            continue
        print(f"\nScraping {year}...")
        rows = scrape_year(session, year)
        if rows:
            save_csv(year, rows)
        else:
            print(f"  No data found for {year}")
        time.sleep(DELAY)


if __name__ == "__main__":
    main()

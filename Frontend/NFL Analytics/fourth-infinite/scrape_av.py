# NOTE: PFR now returns 403 for automated requests.
# Use fetch_av_nflverse.py instead — single download, no rate limits.
import csv
import time
import cloudscraper
from bs4 import BeautifulSoup
from pathlib import Path

OUT_FILE = Path(__file__).parent / "data" / "av_data.csv"
BASE_URL = "https://www.pro-football-reference.com/years/{year}/draft.htm"
YEARS = range(1994, 2026)
DELAY = 4.0  # PFR rate-limits aggressively — keep this at 4+

FIELDNAMES = ["year", "pick", "player", "pos", "team", "seasons",
              "career_av", "draft_av", "pro_bowls", "starts"]


def safe_int(val, default=0):
    try:
        return int(str(val).strip())
    except (ValueError, TypeError):
        return default


def cell_text(tr, stat):
    td = tr.find(attrs={"data-stat": stat})
    return td.get_text(strip=True) if td else ""


def fetch_year(session, year):
    url = BASE_URL.format(year=year)
    resp = session.get(url, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    table = soup.find("table", id="drafts")
    if not table:
        return []

    tbody = table.find("tbody")
    if not tbody:
        return []

    rows = []
    for tr in tbody.find_all("tr"):
        # Sub-header rows injected by PFR between rounds — skip them
        if "thead" in tr.get("class", []):
            continue

        pick = safe_int(cell_text(tr, "pick_overall"))
        if not pick:
            continue

        rows.append({
            "year":      year,
            "pick":      pick,
            "player":    cell_text(tr, "player"),
            "pos":       cell_text(tr, "pos"),
            "team":      cell_text(tr, "team"),
            "seasons":   safe_int(cell_text(tr, "seasons")),
            "career_av": safe_int(cell_text(tr, "career_av")),
            "draft_av":  safe_int(cell_text(tr, "draft_av")),
            "pro_bowls": safe_int(cell_text(tr, "pro_bowls")),
            "starts":    safe_int(cell_text(tr, "g_start")),
        })

    return rows


def main():
    OUT_FILE.parent.mkdir(exist_ok=True)
    session = cloudscraper.create_scraper()
    all_rows = []

    for year in YEARS:
        print(f"Scraping {year}...", end=" ", flush=True)
        try:
            rows = fetch_year(session, year)
            all_rows.extend(rows)
            print(f"{len(rows)} picks")
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(DELAY)

    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\nSaved {len(all_rows)} rows to {OUT_FILE}")


if __name__ == "__main__":
    main()

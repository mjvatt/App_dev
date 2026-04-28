import csv
import urllib.request
from pathlib import Path

URL = "https://github.com/nflverse/nflverse-data/releases/download/draft_picks/draft_picks.csv"
OUT_FILE = Path(__file__).parent / "data" / "av_data.csv"
YEARS = set(range(1994, 2026))

FIELDNAMES = ["year", "pick", "player", "pos", "team", "seasons",
              "career_av", "draft_av", "pro_bowls", "starts",
              "pfr_id", "age"]


def main():
    print("Downloading nflverse draft_picks.csv...")
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read().decode("utf-8")

    reader = csv.DictReader(content.splitlines())
    rows = []
    for row in reader:
        year = int(row["season"])
        if year not in YEARS:
            continue
        pick = int(row["pick"]) if row["pick"] else 0
        if not pick:
            continue
        try:
            age = int(row["age"]) if row.get("age") else 0
        except ValueError:
            age = 0
        rows.append({
            "year":      year,
            "pick":      pick,
            "player":    row.get("pfr_player_name", "").strip(),
            "pos":       row.get("position", "").strip(),
            "team":      row.get("team", "").strip(),
            "seasons":   int(row["seasons_started"]) if row.get("seasons_started") else 0,
            "career_av": int(row["w_av"]) if row.get("w_av") else 0,
            "draft_av":  int(row["dr_av"]) if row.get("dr_av") else 0,
            "pro_bowls": int(row["probowls"]) if row.get("probowls") else 0,
            "starts":    int(row["games"]) if row.get("games") else 0,
            "pfr_id":    row.get("pfr_player_id", "").strip(),
            "age":       age,
        })

    OUT_FILE.parent.mkdir(exist_ok=True)
    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Saved {len(rows)} rows ({YEARS.intersection({r['year'] for r in rows}).__len__()} years) to {OUT_FILE}")


if __name__ == "__main__":
    main()

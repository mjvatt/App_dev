"""
fetch_combine.py

Downloads NFL combine measurables from nflverse.
Output: data/combine_data.csv keyed by pfr_id (joins draft_picks via pfr_player_id).

Coverage: 2000-2026. Ten fields per row:
  pfr_id, draft_year, ht_in (height in inches), wt, forty,
  bench, vertical, broad_jump, cone, shuttle.

Missing values are left blank. Combine is opt-in; many drafted players
skip individual events (especially OL/DL skipping the bench, etc).
"""

import csv
import urllib.request
from pathlib import Path

URL = "https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv"
OUT_FILE = Path(__file__).parent / "data" / "combine_data.csv"

FIELDNAMES = ["pfr_id", "draft_year", "ht_in", "wt", "forty",
              "bench", "vertical", "broad_jump", "cone", "shuttle"]


def _ht_to_inches(s):
    """Convert e.g. '6-4' to 76. Returns '' on parse failure."""
    s = (s or "").strip()
    if not s or "-" not in s:
        return ""
    try:
        ft, inch = s.split("-", 1)
        return int(ft) * 12 + int(inch)
    except (ValueError, TypeError):
        return ""


def _num(val):
    """Pass-through for numeric strings; '' for blanks."""
    s = (val or "").strip()
    if not s:
        return ""
    try:
        f = float(s)
        return f if not f.is_integer() else int(f)
    except ValueError:
        return ""


def main():
    print("Downloading nflverse combine.csv...")
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read().decode("utf-8")

    reader = csv.DictReader(content.splitlines())
    rows = []
    for row in reader:
        pfr_id = (row.get("pfr_id") or "").strip()
        if not pfr_id:
            continue
        try:
            draft_year = int(row.get("draft_year") or 0) or None
        except ValueError:
            draft_year = None
        rows.append({
            "pfr_id":     pfr_id,
            "draft_year": draft_year if draft_year else "",
            "ht_in":      _ht_to_inches(row.get("ht")),
            "wt":         _num(row.get("wt")),
            "forty":      _num(row.get("forty")),
            "bench":      _num(row.get("bench")),
            "vertical":   _num(row.get("vertical")),
            "broad_jump": _num(row.get("broad_jump")),
            "cone":       _num(row.get("cone")),
            "shuttle":    _num(row.get("shuttle")),
        })

    OUT_FILE.parent.mkdir(exist_ok=True)
    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    n_with_forty = sum(1 for r in rows if r["forty"] != "")
    print(f"Saved {len(rows)} combine rows ({n_with_forty} with forty time) to {OUT_FILE}")


if __name__ == "__main__":
    main()

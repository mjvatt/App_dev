import csv
import json
from pathlib import Path

DATA_DIR       = Path(__file__).parent / "Data"
OUT_FILE       = Path(__file__).parent / "data" / "draft_data.json"
STANDINGS_FILE = Path(__file__).parent / "data" / "standings.csv"
AV_FILE        = Path(__file__).parent / "data" / "av_data.csv"
COMBINE_FILE   = Path(__file__).parent / "data" / "combine_data.csv"

POSITION_GROUPS = {
    "QB": ["QB"],
    "RB": ["RB", "FB", "HB"],
    "WR": ["WR", "FL", "SE"],
    "TE": ["TE"],
    "OL": ["OT", "OG", "OC", "C", "G", "T", "OL"],
    "DL": ["DE", "DT", "NT", "DL", "NG"],
    "LB": ["LB", "ILB", "OLB", "MLB", "SLB", "WLB"],
    "DB": ["CB", "S", "SS", "FS", "DB", "SAF"],
    "ST": ["K", "P", "LS"],
}


def get_position_group(pos):
    key = pos.upper().strip()
    for group, members in POSITION_GROUPS.items():
        if key in members:
            return group
    return "Other"


def safe_int(val, default=0):
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def safe_float(val, default=None):
    s = (val or "").strip() if isinstance(val, str) else val
    if s == "" or s is None:
        return default
    try:
        return float(s)
    except (ValueError, TypeError):
        return default


# Load AV data — keyed by (year, overall_pick)
av_lookup = {}
if AV_FILE.exists():
    with open(AV_FILE, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            key = (safe_int(row["year"]), safe_int(row["pick"]))
            av_lookup[key] = {
                "seasons":   safe_int(row.get("seasons")),
                "career_av": safe_int(row.get("career_av")),
                "draft_av":  safe_int(row.get("draft_av")),
                "pro_bowls": safe_int(row.get("pro_bowls")),
                "starts":    safe_int(row.get("starts")),
                "pfr_id":    (row.get("pfr_id") or "").strip(),
                "age":       safe_int(row.get("age")) or None,
            }


# Load combine data — keyed by pfr_id
combine_lookup = {}
if COMBINE_FILE.exists():
    with open(COMBINE_FILE, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            pid = (row.get("pfr_id") or "").strip()
            if not pid:
                continue
            combine_lookup[pid] = {
                "ht_in":      safe_float(row.get("ht_in")),
                "wt":         safe_float(row.get("wt")),
                "forty":      safe_float(row.get("forty")),
                "bench":      safe_float(row.get("bench")),
                "vertical":   safe_float(row.get("vertical")),
                "broad_jump": safe_float(row.get("broad_jump")),
                "cone":       safe_float(row.get("cone")),
                "shuttle":    safe_float(row.get("shuttle")),
            }

picks = []
for csv_file in sorted(DATA_DIR.glob("NFL_draft_*.csv")):
    year = int(csv_file.stem.split("_")[-1])
    with open(csv_file, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pos = row.get("Pos.", "").strip()
            pick_num = safe_int(row.get("Pick #", 0))
            av = av_lookup.get((year, pick_num), {})
            pfr_id = av.get("pfr_id", "")
            combine = combine_lookup.get(pfr_id, {}) if pfr_id else {}
            picks.append({
                "year":       year,
                "round":      safe_int(row.get("Rnd.", 0)),
                "pick":       pick_num,
                "team":       row.get("NFL Team", "").strip(),
                "player":     row.get("Player", "").strip(),
                "pos":        pos,
                "pos_group":  get_position_group(pos),
                "college":    row.get("College", "").strip(),
                "notes":      row.get("Notes", "").strip(),
                "seasons":    av.get("seasons", 0),
                "career_av":  av.get("career_av", 0),
                "draft_av":   av.get("draft_av", 0),
                "pro_bowls":  av.get("pro_bowls", 0),
                "starts":     av.get("starts", 0),
                "pfr_id":     pfr_id,
                "age":        av.get("age"),
                "ht_in":      combine.get("ht_in"),
                "wt":         combine.get("wt"),
                "forty":      combine.get("forty"),
                "bench":      combine.get("bench"),
                "vertical":   combine.get("vertical"),
                "broad_jump": combine.get("broad_jump"),
                "cone":       combine.get("cone"),
                "shuttle":    combine.get("shuttle"),
            })

years     = sorted({p["year"]    for p in picks})
teams     = sorted({p["team"]    for p in picks if p["team"]})
positions = sorted({p["pos"]    for p in picks if p["pos"]})
colleges  = sorted({p["college"] for p in picks if p["college"]})

# Load standings
standings = []
if STANDINGS_FILE.exists():
    with open(STANDINGS_FILE, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            standings.append({
                "year":   int(row["year"]),
                "conf":   row["conf"],
                "div":    row["div"],
                "team":   row["team"],
                "w":      safe_int(row["w"]),
                "l":      safe_int(row["l"]),
                "t":      safe_int(row["t"]),
                "pct":    row["pct"],
                "pf":     safe_int(row["pf"]),
                "pa":     safe_int(row["pa"]),
                "home_w": safe_int(row["home_w"]),
                "home_l": safe_int(row["home_l"]),
                "away_w": safe_int(row["away_w"]),
                "away_l": safe_int(row["away_l"]),
                "playoff": row["playoff"] == "y",
            })

OUT_FILE.parent.mkdir(exist_ok=True)
with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(
        {
            "picks": picks,
            "standings": standings,
            "meta": {
                "years": years,
                "teams": teams,
                "positions": positions,
                "colleges": colleges,
                "total_picks": len(picks),
                "total_standings": len(standings),
            },
        },
        f,
        separators=(",", ":"),
    )

av_covered = sum(1 for p in picks if p["career_av"] > 0)
print(f"Built {OUT_FILE}: {len(picks)} picks | {len(standings)} team-seasons | {len(years)} years | {av_covered} picks with AV data")

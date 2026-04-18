import csv
import re
import time
import requests
from bs4 import BeautifulSoup
from pathlib import Path

OUT_FILE = Path(__file__).parent / "data" / "standings.csv"
BASE_URL = "https://www.footballdb.com/standings/index.html"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}
YEARS = range(1994, 2026)
DELAY = 2.0

# Strip "y - ", "x - ", "z - ", "*- " etc. playoff marker prefixes
PREFIX_RE = re.compile(r'^[a-z*]\s*-\s*', re.IGNORECASE)

# Known team -> (conf, div) mapping covering all franchises 1994-2025
# Relocated teams are listed under their current name; historical names handled in scraper
TEAM_MAP = {
    # AFC East
    'Buffalo Bills':          ('AFC','East'), 'Miami Dolphins':         ('AFC','East'),
    'New England Patriots':   ('AFC','East'), 'New York Jets':          ('AFC','East'),
    # AFC North (post-2002); pre-2002 these were AFC Central — handled by year logic below
    'Baltimore Ravens':       ('AFC','North'), 'Cincinnati Bengals':    ('AFC','North'),
    'Cleveland Browns':       ('AFC','North'), 'Pittsburgh Steelers':   ('AFC','North'),
    # AFC South (created 2002)
    'Houston Texans':         ('AFC','South'), 'Indianapolis Colts':    ('AFC','South'),
    'Jacksonville Jaguars':   ('AFC','South'), 'Tennessee Titans':      ('AFC','South'),
    'Tennessee Oilers':       ('AFC','Central'), 'Houston Oilers':      ('AFC','Central'),
    # AFC West
    'Denver Broncos':         ('AFC','West'),  'Kansas City Chiefs':    ('AFC','West'),
    'Las Vegas Raiders':      ('AFC','West'),  'Oakland Raiders':       ('AFC','West'),
    'Los Angeles Raiders':    ('AFC','West'),  'Los Angeles Chargers':  ('AFC','West'),
    'San Diego Chargers':     ('AFC','West'),
    # NFC East
    'Dallas Cowboys':         ('NFC','East'),  'New York Giants':       ('NFC','East'),
    'Philadelphia Eagles':    ('NFC','East'),  'Washington Commanders': ('NFC','East'),
    'Washington Football Team':('NFC','East'), 'Washington Redskins':   ('NFC','East'),
    # NFC North (post-2002); pre-2002 were NFC Central
    'Chicago Bears':          ('NFC','North'), 'Detroit Lions':         ('NFC','North'),
    'Green Bay Packers':      ('NFC','North'), 'Minnesota Vikings':     ('NFC','North'),
    # NFC South (created 2002)
    'Atlanta Falcons':        ('NFC','South'), 'Carolina Panthers':     ('NFC','South'),
    'New Orleans Saints':     ('NFC','South'), 'Tampa Bay Buccaneers':  ('NFC','South'),
    # NFC West
    'Arizona Cardinals':      ('NFC','West'),  'Los Angeles Rams':      ('NFC','West'),
    'St. Louis Rams':         ('NFC','West'),  'San Francisco 49ers':   ('NFC','West'),
    'Seattle Seahawks':       ('NFC','West'),
}

def clean_team(raw):
    name = PREFIX_RE.sub('', raw).strip()
    # Site appends the location slug directly after team name: "Miami DolphinsMiami"
    # Split at the first uppercase letter that immediately follows a lowercase letter
    m = re.search(r'(?<=[a-z])(?=[A-Z])', name)
    if m:
        name = name[:m.start()]
    return name.strip()


def parse_record(cell):
    """Parse 'W-L-T' cell into (w, l, t)."""
    parts = cell.strip().split('-')
    if len(parts) == 3:
        return parts[0], parts[1], parts[2]
    return '', '', ''


def scrape_year(session, year):
    resp = session.get(BASE_URL, params={'lg': 'NFL', 'yr': year}, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'html.parser')

    rows_out = []
    current_conf = ''
    current_div  = ''

    for table in soup.find_all('table'):
        thead = table.find('thead') or table.find('tr', class_='header')
        if not thead:
            continue

        # Detect conference from table context (prior heading sibling)
        header_cells = [th.get_text(strip=True) for th in thead.find_all(['th','td'])]
        if not header_cells or 'W' not in header_cells:
            continue

        # Walk rows
        for tr in table.find_all('tr'):
            cells = [td.get_text(strip=True) for td in tr.find_all(['td','th'])]
            if not cells:
                continue

            # Division header row — single cell like "EAST", "NORTH NFC" etc.
            if len(cells) <= 2 and any(d in cells[0].upper() for d in ('EAST','WEST','NORTH','SOUTH','CENTRAL','NFC','AFC')):
                text = cells[0].upper()
                if 'NFC' in text:
                    current_conf = 'NFC'
                elif 'AFC' in text:
                    current_conf = 'AFC'
                div_words = [w for w in text.split() if w in ('EAST','WEST','NORTH','SOUTH','CENTRAL')]
                if div_words:
                    current_div = div_words[0].title()
                continue

            # Detect conf from last column header
            if 'NFC' in header_cells:
                # alternate-conf column present; try to detect from surrounding
                pass

            if len(cells) < 4:
                continue

            # Team row: first cell is team name, rest are stats
            raw_team = cells[0]
            if not raw_team or raw_team in ('W','L','T','Pct','PF','PA','Home','Away','Div','Conf','NFC','AFC','EAST','WEST','NORTH','SOUTH'):
                continue

            # Try to parse W L T
            try:
                w = int(cells[1])
                l = int(cells[2])
                t = int(cells[3])
            except (ValueError, IndexError):
                continue

            pct = cells[4] if len(cells) > 4 else ''
            pf  = cells[5] if len(cells) > 5 else ''
            pa  = cells[6] if len(cells) > 6 else ''

            hw, hl, ht = parse_record(cells[7])  if len(cells) > 7  else ('','','')
            aw, al, at = parse_record(cells[8])  if len(cells) > 8  else ('','','')
            dw, dl, dt = parse_record(cells[9])  if len(cells) > 9  else ('','','')
            cw, cl, ct = parse_record(cells[10]) if len(cells) > 10 else ('','','')

            # Detect conf from last non-empty column if available
            if len(cells) > 11:
                conf_cell = cells[11]
                if '/' in conf_cell or conf_cell in ('NFC','AFC'):
                    current_conf = conf_cell if conf_cell in ('NFC','AFC') else current_conf

            team = clean_team(raw_team)
            conf, div = TEAM_MAP.get(team, (current_conf, current_div))
            # Pre-2002 realignment: North/South divisions didn't exist
            if year < 2002:
                if div == 'North' and team in ('Baltimore Ravens','Cincinnati Bengals','Cleveland Browns','Pittsburgh Steelers'):
                    div = 'Central'
                elif div == 'North' and team in ('Chicago Bears','Detroit Lions','Green Bay Packers','Minnesota Vikings'):
                    div = 'Central'
                elif div == 'South' and team in ('Indianapolis Colts','Jacksonville Jaguars','Tennessee Titans','Tennessee Oilers'):
                    div = 'Central'
                elif div == 'South' and team in ('Atlanta Falcons','Carolina Panthers','New Orleans Saints','Tampa Bay Buccaneers'):
                    div = 'Central'
            rows_out.append({
                'year': year, 'conf': conf, 'div': div,
                'team': team,
                'w': w, 'l': l, 't': t, 'pct': pct, 'pf': pf, 'pa': pa,
                'home_w': hw, 'home_l': hl, 'home_t': ht,
                'away_w': aw, 'away_l': al, 'away_t': at,
                'div_w': dw,  'div_l': dl,  'div_t': dt,
                'conf_w': cw, 'conf_l': cl, 'conf_t': ct,
                'playoff': 'y' if PREFIX_RE.match(raw_team[:3]) else '',
            })

    return rows_out


FIELDNAMES = [
    'year','conf','div','team','w','l','t','pct','pf','pa',
    'home_w','home_l','home_t','away_w','away_l','away_t',
    'div_w','div_l','div_t','conf_w','conf_l','conf_t','playoff',
]


def main():
    OUT_FILE.parent.mkdir(exist_ok=True)
    session = requests.Session()
    all_rows = []

    for year in YEARS:
        print(f'Scraping {year}...', end=' ', flush=True)
        try:
            rows = scrape_year(session, year)
            all_rows.extend(rows)
            print(f'{len(rows)} teams')
        except Exception as e:
            print(f'ERROR: {e}')
        time.sleep(DELAY)

    with open(OUT_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(all_rows)

    print(f'\nSaved {len(all_rows)} team-season rows to {OUT_FILE}')


if __name__ == '__main__':
    main()

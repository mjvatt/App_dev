import csv, json, urllib.request
from pathlib import Path
from collections import defaultdict

URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/trades.csv'
OUT = Path(__file__).parent / 'data' / 'trades.json'

def main():
    print('Downloading trades...')
    req = urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        content = r.read().decode('utf-8')

    by_id = defaultdict(lambda: {'season': None, 'date': None, 'assets': []})
    for row in csv.DictReader(content.splitlines()):
        tid = row['trade_id']
        by_id[tid]['season'] = int(row['season'])
        by_id[tid]['date']   = row['trade_date']

        if row.get('pick_round'):
            by_id[tid]['assets'].append({
                'type':        'pick',
                'frm':         row['gave'],
                'to':          row['received'],
                'pick_season': int(row['pick_season']) if row.get('pick_season') else int(row['season']),
                'round':       int(row['pick_round']),
                'pick':        int(row['pick_number']) if row.get('pick_number') else None,
                'cond':        row.get('conditional') == '1',
            })
        elif row.get('pfr_name'):
            by_id[tid]['assets'].append({
                'type':   'player',
                'frm':    row['gave'],
                'to':     row['received'],
                'player': row['pfr_name'],
            })

    trades = [
        {'id': tid, 'season': t['season'], 'date': t['date'], 'assets': t['assets']}
        for tid, t in by_id.items()
        if any(a['type'] == 'pick' for a in t['assets'])
    ]
    trades.sort(key=lambda t: (t['season'], t['date'] or ''))

    OUT.parent.mkdir(exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(trades, f, separators=(',', ':'))

    seasons = sorted(set(t['season'] for t in trades))
    print(f'Saved {len(trades)} pick trades ({seasons[0]}-{seasons[-1]}) to {OUT}')

if __name__ == '__main__':
    main()

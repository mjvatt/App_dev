/* data.js — loads draft_data.json and exposes aggregation helpers */

const DraftData = (() => {
  let _picks = [];
  let _meta  = {};

  const POS_COLORS = {
    QB:    '#3b82f6',
    RB:    '#10b981',
    WR:    '#f59e0b',
    TE:    '#ef4444',
    OL:    '#8b5cf6',
    DL:    '#ec4899',
    LB:    '#06b6d4',
    DB:    '#f97316',
    ST:    '#6b7280',
    Other: '#374151',
  };

  async function load() {
    const resp = await fetch('data/draft_data.json');
    const json = await resp.json();
    _picks = json.picks;
    _meta  = json.meta;
    return json;
  }

  function picks(filter = {}) {
    return _picks.filter(p => {
      if (filter.year      && p.year      !== +filter.year)      return false;
      if (filter.round     && p.round     !== +filter.round)     return false;
      if (filter.team      && p.team      !== filter.team)       return false;
      if (filter.pos_group && p.pos_group !== filter.pos_group)  return false;
      if (filter.pos       && p.pos       !== filter.pos)        return false;
      if (filter.yearFrom  && p.year      <  +filter.yearFrom)   return false;
      if (filter.yearTo    && p.year      >  +filter.yearTo)     return false;
      if (filter.search) {
        const q = filter.search.toLowerCase();
        if (!p.player.toLowerCase().includes(q) &&
            !p.team.toLowerCase().includes(q) &&
            !p.college.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function meta() { return _meta; }

  function posColor(group) { return POS_COLORS[group] || POS_COLORS.Other; }

  function posColorAlpha(group, a = 0.75) {
    const hex = posColor(group).replace('#', '');
    const r = parseInt(hex.slice(0,2),16);
    const g = parseInt(hex.slice(2,4),16);
    const b = parseInt(hex.slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* picks per year (all or filtered) */
  function picksPerYear(filter = {}) {
    const years = _meta.years;
    const counts = {};
    years.forEach(y => counts[y] = 0);
    picks(filter).forEach(p => { if (counts[p.year] !== undefined) counts[p.year]++; });
    return { labels: years, values: years.map(y => counts[y]) };
  }

  /* position group counts (for donut/bar) */
  function byPosGroup(filter = {}) {
    const groups = ['QB','RB','WR','TE','OL','DL','LB','DB','ST','Other'];
    const counts = {};
    groups.forEach(g => counts[g] = 0);
    picks(filter).forEach(p => {
      if (counts[p.pos_group] !== undefined) counts[p.pos_group]++;
      else counts['Other']++;
    });
    const nonzero = groups.filter(g => counts[g] > 0);
    return {
      labels: nonzero,
      values: nonzero.map(g => counts[g]),
      colors: nonzero.map(g => posColor(g)),
    };
  }

  /* position group % share per year */
  function posGroupSharePerYear(groups) {
    const years = _meta.years;
    const data = {};
    groups.forEach(g => { data[g] = []; });

    years.forEach(year => {
      const yearPicks = picks({ year });
      const total = yearPicks.length || 1;
      const counts = {};
      groups.forEach(g => counts[g] = 0);
      yearPicks.forEach(p => { if (counts[p.pos_group] !== undefined) counts[p.pos_group]++; });
      groups.forEach(g => data[g].push(+(counts[g] / total * 100).toFixed(1)));
    });

    return { years, data };
  }

  /* top N colleges by pick count */
  function topColleges(n = 25, filter = {}) {
    const counts = {};
    picks(filter).forEach(p => {
      if (!p.college) return;
      counts[p.college] = (counts[p.college] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, n);
    return { labels: sorted.map(e => e[0]), values: sorted.map(e => e[1]) };
  }

  /* round 1 picks by year — position breakdown */
  function round1ByPosGroup(year) {
    const r1 = picks({ year, round: 1 });
    const groups = ['QB','RB','WR','TE','OL','DL','LB','DB','ST','Other'];
    const counts = {};
    groups.forEach(g => counts[g] = 0);
    r1.forEach(p => {
      if (counts[p.pos_group] !== undefined) counts[p.pos_group]++;
      else counts['Other']++;
    });
    const nonzero = groups.filter(g => counts[g] > 0);
    return { labels: nonzero, values: nonzero.map(g => counts[g]), colors: nonzero.map(g => posColor(g)) };
  }

  /* picks per round for a team */
  function teamByRound(team) {
    const rounds = [1,2,3,4,5,6,7];
    const teamPicks = picks({ team });
    const counts = {};
    rounds.forEach(r => counts[r] = 0);
    teamPicks.forEach(p => { if (counts[p.round] !== undefined) counts[p.round]++; });
    return { labels: rounds.map(r => `Rnd ${r}`), values: rounds.map(r => counts[r]) };
  }

  return { load, picks, meta, posColor, posColorAlpha, picksPerYear, byPosGroup, posGroupSharePerYear, topColleges, round1ByPosGroup, teamByRound };
})();

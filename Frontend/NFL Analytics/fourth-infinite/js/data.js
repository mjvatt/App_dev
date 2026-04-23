/* data.js — loads draft_data.json and exposes aggregation helpers */

const DraftData = (() => {
  let _picks     = [];
  let _standings = [];
  let _meta      = {};

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
    _picks     = json.picks;
    _standings = json.standings || [];
    _meta      = json.meta;
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

  /* standings — generic filter (year, team, conf, div, playoff) */
  function standings(filter = {}) {
    return _standings.filter(s => {
      if (filter.year    && s.year    !== +filter.year)  return false;
      if (filter.team    && s.team    !== filter.team)   return false;
      if (filter.conf    && s.conf    !== filter.conf)   return false;
      if (filter.div     && s.div     !== filter.div)    return false;
      if (filter.playoff !== undefined && s.playoff !== filter.playoff) return false;
      return true;
    });
  }

  /* all season rows for one team, sorted by year */
  function teamStandings(team) {
    return standings({ team }).sort((a, b) => a.year - b.year);
  }

  /* wins per year for one team — {labels, values, playoffs} */
  function winsByYear(team) {
    const rows = teamStandings(team);
    return {
      labels:  rows.map(r => r.year),
      values:  rows.map(r => r.w),
      playoffs: rows.map(r => r.playoff),
    };
  }

  /* picks made in year Y correlated with wins in year Y+1, for scatter */
  function draftToWinsScatter(team) {
    const rows = teamStandings(team);
    const byYear = {};
    rows.forEach(r => { byYear[r.year] = r; });

    const points = [];
    teamStandings(team).forEach(r => {
      const nextSeason = byYear[r.year + 1];
      if (!nextSeason) return;
      const pickCount = picks({ team, year: r.year }).length;
      points.push({ x: pickCount, y: nextSeason.w, year: r.year });
    });
    return points;
  }

  /* round capital split — % of each team's pick value from R1 / R2-3 / R4-7 for a given year */
  function teamRoundCapitalSplit(year) {
    const yearPicks = picks({ year: +year });
    const buckets = {};
    yearPicks.forEach(p => {
      if (!p.pick) return;
      const val = 100 * Math.pow(p.pick, -0.66);
      if (!buckets[p.team]) buckets[p.team] = { r1: 0, r23: 0, r47: 0 };
      if (p.round === 1)      buckets[p.team].r1  += val;
      else if (p.round <= 3)  buckets[p.team].r23 += val;
      else                    buckets[p.team].r47 += val;
    });
    const rows = Object.entries(buckets).map(([team, b]) => {
      const total = b.r1 + b.r23 + b.r47 || 1;
      return {
        team,
        r1:  +(b.r1  / total * 100).toFixed(1),
        r23: +(b.r23 / total * 100).toFixed(1),
        r47: +(b.r47 / total * 100).toFixed(1),
      };
    }).sort((a, b) => b.r1 - a.r1);
    return {
      labels: rows.map(r => r.team),
      r1:    rows.map(r => r.r1),
      r23:   rows.map(r => r.r23),
      r47:   rows.map(r => r.r47),
    };
  }

  /* total draft capital score for every team in a given year — sum of V(pick) per team */
  function teamCapitalByYear(year) {
    const yearPicks = picks({ year: +year });
    const scores = {};
    yearPicks.forEach(p => {
      if (!p.pick) return;
      scores[p.team] = (scores[p.team] || 0) + 100 * Math.pow(p.pick, -0.66);
    });
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(e => e[0]),
      values: sorted.map(e => +e[1].toFixed(1)),
    };
  }

  /* power-law pick value curve — V(pick) = 100 * (1/pick)^0.66, normalized to pick #1 = 100 */
  function pickValueCurve() {
    const labels = Array.from({ length: 256 }, (_, i) => i + 1);
    const raw    = labels.map(p => Math.pow(p, -0.66));
    const scale  = 100 / raw[0];
    return labels.map((p, i) => ({ x: p, y: +(raw[i] * scale).toFixed(1) }));
  }

  /* player-vs-slot grade scatter
     Expected curve: rolling avg draft_av per pick slot, calibrated on drafts ≤ 2020.
     Scatter points: filtered via filter arg. */
  function slotGradeScatter(filter = {}) {
    const slots = {};
    _picks.filter(p => p.pick > 0 && p.year <= 2020).forEach(p => {
      if (!slots[p.pick]) slots[p.pick] = { sum: 0, n: 0 };
      slots[p.pick].sum += p.draft_av;
      slots[p.pick].n++;
    });

    const WINDOW = 12;
    const curve = [];
    for (let pick = 1; pick <= 256; pick++) {
      let sum = 0, n = 0;
      for (let j = Math.max(1, pick - WINDOW); j <= Math.min(256, pick + WINDOW); j++) {
        if (slots[j]) { sum += slots[j].sum; n += slots[j].n; }
      }
      if (n > 0) curve.push({ x: pick, y: +(sum / n).toFixed(1) });
    }

    const byGroup = {};
    picks(filter).filter(p => p.pick > 0).forEach(p => {
      if (!byGroup[p.pos_group]) {
        byGroup[p.pos_group] = {
          points: [],
          color: posColor(p.pos_group),
          colorAlpha: posColorAlpha(p.pos_group, 0.5),
        };
      }
      byGroup[p.pos_group].points.push({
        x: p.pick,
        y: p.draft_av,
        player: p.player,
        team: p.team,
        year: p.year,
        pos: p.pos,
      });
    });

    return { byGroup, curve };
  }

  /* team outcome efficiency — career AV generated per unit of draft capital spent */
  function teamOutcomeEfficiency(filter = {}) {
    const byTeam = {};
    picks(filter).filter(p => p.pick > 0).forEach(p => {
      if (!byTeam[p.team]) byTeam[p.team] = { capSum: 0, avSum: 0, n: 0 };
      byTeam[p.team].capSum += 100 * Math.pow(p.pick, -0.66);
      byTeam[p.team].avSum  += p.career_av;
      byTeam[p.team].n++;
    });

    const rows = Object.entries(byTeam)
      .filter(([, t]) => t.capSum > 0 && t.n >= 5)
      .map(([team, t]) => ({
        team,
        efficiency: +(t.avSum / t.capSum).toFixed(2),
        totalAV:    t.avSum,
        capital:    +t.capSum.toFixed(1),
        picks:      t.n,
      }))
      .sort((a, b) => b.efficiency - a.efficiency);

    return {
      labels: rows.map(r => r.team),
      values: rows.map(r => r.efficiency),
      meta:   rows,
    };
  }

  /* pro bowl rate by round — % of picks with ≥1 pro bowl, by round 1-7 */
  function proBowlRateByRound(filter = {}) {
    const buckets = {};
    for (let r = 1; r <= 7; r++) buckets[r] = { total: 0, pb: 0 };

    picks(filter).filter(p => p.round >= 1 && p.round <= 7).forEach(p => {
      buckets[p.round].total++;
      if (p.pro_bowls > 0) buckets[p.round].pb++;
    });

    const rows = [];
    for (let r = 1; r <= 7; r++) {
      const { total, pb } = buckets[r];
      if (total > 0) rows.push({ round: r, rate: +(pb / total * 100).toFixed(1), pb, total });
    }

    return {
      labels: rows.map(r => `Round ${r.round}`),
      values: rows.map(r => r.rate),
      meta:   rows,
    };
  }

  return { load, picks, meta, posColor, posColorAlpha, picksPerYear, byPosGroup, posGroupSharePerYear, topColleges, round1ByPosGroup, teamByRound, standings, teamStandings, winsByYear, draftToWinsScatter, pickValueCurve, teamCapitalByYear, teamRoundCapitalSplit, slotGradeScatter, teamOutcomeEfficiency, proBowlRateByRound };
})();

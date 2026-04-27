/* data.js — loads draft_data.json and exposes aggregation helpers */

const DraftData = (() => {
  let _picks        = [];
  let _standings    = [];
  let _meta         = {};
  let _trades       = null;
  let _expectedAv   = null;
  let _sleeperPreds = null;
  let _teamStats    = null;
  let _salaries     = null;

  const FRANCHISE_ALIASES = {
    'Houston Oilers':         'Tennessee Titans',
    'Tennessee Oilers':       'Tennessee Titans',
    'San Diego Chargers':     'Los Angeles Chargers',
    'Oakland Raiders':        'Las Vegas Raiders',
    'Los Angeles Raiders':    'Las Vegas Raiders',
    'St. Louis Rams':         'Los Angeles Rams',
    'Washington Redskins':    'Washington Commanders',
    'Washington Football Team': 'Washington Commanders',
  };

  function _franchise(team, year) {
    if (team === 'Cleveland Browns' && +year <= 1995) return 'Baltimore Ravens';
    return FRANCHISE_ALIASES[team] || team;
  }

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
    _picks     = json.picks.map(p => ({ ...p, franchise: _franchise(p.team, p.year) }));
    _standings = (json.standings || []).map(s => ({ ...s, franchise: _franchise(s.team, s.year) }));
    _meta      = json.meta;
    return json;
  }

  function franchiseTeams() {
    return [...new Set(_picks.map(p => p.franchise))].filter(Boolean).sort();
  }

  function picks(filter = {}) {
    return _picks.filter(p => {
      if (filter.year      && p.year      !== +filter.year)      return false;
      if (filter.round     && p.round     !== +filter.round)     return false;
      if (filter.team      && p.team      !== filter.team)       return false;
      if (filter.franchise && p.franchise !== filter.franchise)  return false;
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

  /* avg career AV per pick per year, by position group — capped at 2020 (incomplete beyond) */
  function posGroupAvPerYear(groups) {
    const CUTOFF = 2020;
    const validYears = _meta.years.filter(y => y <= CUTOFF);
    const data = {};
    groups.forEach(g => { data[g] = []; });

    validYears.forEach(year => {
      const byGroup = {};
      groups.forEach(g => { byGroup[g] = { avSum: 0, n: 0 }; });
      picks({ year }).filter(p => p.pick > 0).forEach(p => {
        if (byGroup[p.pos_group]) {
          byGroup[p.pos_group].avSum += p.career_av;
          byGroup[p.pos_group].n++;
        }
      });
      groups.forEach(g => {
        const { avSum, n } = byGroup[g];
        data[g].push(n > 0 ? +(avSum / n).toFixed(1) : null);
      });
    });

    return { years: validYears, data };
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

  /* picks per round for a franchise */
  function teamByRound(franchise) {
    const rounds = [1,2,3,4,5,6,7];
    const teamPicks = picks({ franchise });
    const counts = {};
    rounds.forEach(r => counts[r] = 0);
    teamPicks.forEach(p => { if (counts[p.round] !== undefined) counts[p.round]++; });
    return { labels: rounds.map(r => `Rnd ${r}`), values: rounds.map(r => counts[r]) };
  }

  /* standings — generic filter (year, yearFrom, yearTo, team, franchise, conf, div, playoff) */
  function standings(filter = {}) {
    return _standings.filter(s => {
      if (filter.year      && s.year      !== +filter.year)      return false;
      if (filter.yearFrom  && s.year      <  +filter.yearFrom)   return false;
      if (filter.yearTo    && s.year      >  +filter.yearTo)     return false;
      if (filter.team      && s.team      !== filter.team)       return false;
      if (filter.franchise && s.franchise !== filter.franchise)  return false;
      if (filter.conf      && s.conf      !== filter.conf)       return false;
      if (filter.div       && s.div       !== filter.div)        return false;
      if (filter.playoff   !== undefined  && s.playoff !== filter.playoff) return false;
      return true;
    });
  }

  /* ATLAS — league-wide draft capital (year Y) vs wins (year Y+1) with linear regression */
  function leagueDraftToWins(yearFrom = 1994, yearTo = 2024) {
    const standingsMap = {};
    _standings.forEach(s => {
      if (!standingsMap[s.year]) standingsMap[s.year] = {};
      standingsMap[s.year][s.franchise] = s.w;
    });

    const capByKey = {};
    _picks.filter(p => p.pick > 0 && p.year >= +yearFrom && p.year <= +yearTo).forEach(p => {
      const key = `${p.franchise}|${p.year}`;
      capByKey[key] = (capByKey[key] || 0) + 100 * Math.pow(p.pick, -0.66);
    });

    const points = [];
    Object.entries(capByKey).forEach(([key, capital]) => {
      const [franchise, yearStr] = key.split('|');
      const year = +yearStr;
      const nextW = standingsMap[year + 1]?.[franchise];
      if (nextW === undefined) return;
      points.push({ franchise, year, capital: +capital.toFixed(1), wins: nextW });
    });

    const n = points.length;
    if (n < 2) return { points, m: 0, b: 0, r2: 0, xMin: 0, xMax: 100 };

    const sumX  = points.reduce((s, p) => s + p.capital, 0);
    const sumY  = points.reduce((s, p) => s + p.wins, 0);
    const sumXY = points.reduce((s, p) => s + p.capital * p.wins, 0);
    const sumX2 = points.reduce((s, p) => s + p.capital * p.capital, 0);
    const denom = n * sumX2 - sumX * sumX;
    const m     = denom ? (n * sumXY - sumX * sumY) / denom : 0;
    const b     = (sumY - m * sumX) / n;
    const yMean = sumY / n;
    const ssTot = points.reduce((s, p) => s + Math.pow(p.wins - yMean, 2), 0);
    const ssRes = points.reduce((s, p) => s + Math.pow(p.wins - (m * p.capital + b), 2), 0);
    const r2    = ssTot > 0 ? +(1 - ssRes / ssTot).toFixed(3) : 0;
    const xMin  = +Math.min(...points.map(p => p.capital)).toFixed(1);
    const xMax  = +Math.max(...points.map(p => p.capital)).toFixed(1);

    return { points, m: +m.toFixed(4), b: +b.toFixed(2), r2, xMin, xMax };
  }

  /* ATLAS — franchise legacy score: 40% win %, 40% playoff rate, 20% draft efficiency */
  function dynastyIndex(yearFrom = 1994, yearTo = 2025) {
    const DRAFT_CUTOFF = 2020;
    const draftYearTo  = Math.min(+yearTo, DRAFT_CUTOFF);

    const byTeam = {};
    standings({ yearFrom, yearTo }).forEach(s => {
      if (!byTeam[s.franchise]) byTeam[s.franchise] = { w: 0, l: 0, t: 0, seasons: 0, playoffs: 0 };
      byTeam[s.franchise].w       += s.w;
      byTeam[s.franchise].l       += s.l;
      byTeam[s.franchise].t       += s.t;
      byTeam[s.franchise].seasons++;
      if (s.playoff) byTeam[s.franchise].playoffs++;
    });

    const byTeamDraft = {};
    picks({ yearFrom, yearTo: draftYearTo }).filter(p => p.pick > 0).forEach(p => {
      if (!byTeamDraft[p.franchise]) byTeamDraft[p.franchise] = { avSum: 0, capSum: 0 };
      byTeamDraft[p.franchise].avSum  += p.career_av;
      byTeamDraft[p.franchise].capSum += 100 * Math.pow(p.pick, -0.66);
    });

    const rows = Object.entries(byTeam)
      .filter(([, d]) => d.seasons >= 3)
      .map(([team, d]) => {
        const games       = d.w + d.l + d.t || 1;
        const winPct      = d.w / games;
        const playoffRate = d.playoffs / d.seasons;
        const dd          = byTeamDraft[team] || { avSum: 0, capSum: 1 };
        const draftEff    = dd.capSum > 0 ? dd.avSum / dd.capSum : 0;
        return { team, winPct, playoffRate, draftEff, wins: d.w, seasons: d.seasons, playoffs: d.playoffs };
      });

    const ext = key => {
      const vals = rows.map(r => r[key]);
      return { min: Math.min(...vals), max: Math.max(...vals) };
    };
    const norm = (v, min, max) => max > min ? (v - min) / (max - min) : 0.5;

    const { min: minW, max: maxW } = ext('winPct');
    const { min: minP, max: maxP } = ext('playoffRate');
    const { min: minD, max: maxD } = ext('draftEff');

    return rows.map(r => ({
      team:         r.team,
      wins:         r.wins,
      seasons:      r.seasons,
      playoffs:     r.playoffs,
      winPct:       +r.winPct.toFixed(3),
      playoffRate:  +r.playoffRate.toFixed(3),
      draftEff:     +r.draftEff.toFixed(2),
      score:        +(
        (0.4 * norm(r.winPct,      minW, maxW) +
         0.4 * norm(r.playoffRate, minP, maxP) +
         0.2 * norm(r.draftEff,    minD, maxD)) * 100
      ).toFixed(1),
    })).sort((a, b) => b.score - a.score);
  }

  /* all season rows for one franchise (normalised), sorted by year */
  function teamStandings(franchise) {
    return standings({ franchise }).sort((a, b) => a.year - b.year);
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

  /* draft capital spent in year Y correlated with wins in year Y+1, for scatter */
  function draftToWinsScatter(franchise) {
    const rows = teamStandings(franchise);
    const byYear = {};
    rows.forEach(r => { byYear[r.year] = r; });

    const points = [];
    rows.forEach(r => {
      const nextSeason = byYear[r.year + 1];
      if (!nextSeason) return;
      const capital = picks({ franchise, year: r.year })
        .filter(p => p.pick > 0)
        .reduce((s, p) => s + 100 * Math.pow(p.pick, -0.66), 0);
      points.push({ x: +capital.toFixed(1), y: nextSeason.w, year: r.year });
    });
    return points;
  }

  /* round capital split — % of each franchise's pick value from R1 / R2-3 / R4-7 for a given year */
  function teamRoundCapitalSplit(year) {
    const yearPicks = picks({ year: +year });
    const buckets = {};
    yearPicks.forEach(p => {
      if (!p.pick) return;
      const val = 100 * Math.pow(p.pick, -0.66);
      if (!buckets[p.franchise]) buckets[p.franchise] = { r1: 0, r23: 0, r47: 0 };
      if (p.round === 1)      buckets[p.franchise].r1  += val;
      else if (p.round <= 3)  buckets[p.franchise].r23 += val;
      else                    buckets[p.franchise].r47 += val;
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

  /* total draft capital score for every franchise in a given year — sum of V(pick) per franchise */
  function teamCapitalByYear(year) {
    const yearPicks = picks({ year: +year });
    const scores = {};
    yearPicks.forEach(p => {
      if (!p.pick) return;
      scores[p.franchise] = (scores[p.franchise] || 0) + 100 * Math.pow(p.pick, -0.66);
    });
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(e => e[0]),
      values: sorted.map(e => +e[1].toFixed(1)),
    };
  }

  /* cached rolling-avg Draft AV by pick slot (calibrated on picks ≤ 2020) */
  function _buildExpectedAv() {
    if (_expectedAv) return _expectedAv;
    const slots = {};
    _picks.filter(p => p.pick > 0 && p.year <= 2020).forEach(p => {
      if (!slots[p.pick]) slots[p.pick] = { sum: 0, n: 0 };
      slots[p.pick].sum += p.draft_av;
      slots[p.pick].n++;
    });
    const WINDOW = 12;
    _expectedAv = {};
    for (let pick = 1; pick <= 256; pick++) {
      let sum = 0, n = 0;
      for (let j = Math.max(1, pick - WINDOW); j <= Math.min(256, pick + WINDOW); j++) {
        if (slots[j]) { sum += slots[j].sum; n += slots[j].n; }
      }
      if (n > 0) _expectedAv[pick] = +(sum / n).toFixed(1);
    }
    return _expectedAv;
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
    const expAv = _buildExpectedAv();
    const curve = Object.entries(expAv)
      .map(([p, v]) => ({ x: +p, y: v }))
      .sort((a, b) => a.x - b.x);

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
      if (!byTeam[p.franchise]) byTeam[p.franchise] = { capSum: 0, avSum: 0, n: 0 };
      byTeam[p.franchise].capSum += 100 * Math.pow(p.pick, -0.66);
      byTeam[p.franchise].avSum  += p.career_av;
      byTeam[p.franchise].n++;
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

  /* SAGE — % of class career AV contributed by each position group, by year */
  function draftClassPosByYear() {
    const GROUPS = ['QB','RB','WR','TE','OL','DL','LB','DB','ST'];
    const byYear = {};

    _picks.filter(p => p.pick > 0).forEach(p => {
      if (!byYear[p.year]) {
        byYear[p.year] = {};
        GROUPS.forEach(g => { byYear[p.year][g] = 0; });
      }
      if (GROUPS.includes(p.pos_group)) byYear[p.year][p.pos_group] += p.career_av;
    });

    const data = {};
    GROUPS.forEach(g => { data[g] = []; });

    _meta.years.forEach(year => {
      const yd = byYear[year] || {};
      const total = GROUPS.reduce((s, g) => s + (yd[g] || 0), 0) || 1;
      GROUPS.forEach(g => data[g].push(+((yd[g] || 0) / total * 100).toFixed(1)));
    });

    return {
      years:  _meta.years,
      groups: GROUPS,
      data,
      colors: GROUPS.reduce((acc, g) => { acc[g] = posColor(g); return acc; }, {}),
    };
  }

  /* career AV generated per unit of draft capital, by year, for one franchise */
  function teamDraftClassGrades(franchise) {
    const INCOMPLETE_YEAR = 2021;
    const pickVal = pick => 100 * Math.pow(pick, -0.66);

    const byYear = {};
    _picks.filter(p => p.pick > 0 && p.franchise === franchise).forEach(p => {
      if (!byYear[p.year]) byYear[p.year] = { avSum: 0, capital: 0, n: 0 };
      byYear[p.year].avSum   += p.career_av;
      byYear[p.year].capital += pickVal(p.pick);
      byYear[p.year].n++;
    });

    return _meta.years.map(year => {
      const c = byYear[year] || { avSum: 0, capital: 0, n: 0 };
      return {
        year,
        grade:      c.capital > 0 ? +(c.avSum / c.capital).toFixed(3) : 0,
        totalAV:    c.avSum,
        capital:    +c.capital.toFixed(1),
        picks:      c.n,
        incomplete: year >= INCOMPLETE_YEAR,
      };
    });
  }

  /* G1.1 — R4-R7 picks with highest Draft AV above slot expectation */
  function lateRoundSteals(filter = {}, topN = 30) {
    const expAv = _buildExpectedAv();
    return picks(filter)
      .filter(p => p.round >= 4 && p.pick > 0 && p.draft_av > 0)
      .map(p => ({ ...p, expected: expAv[p.pick] || 0, surplus: +(p.draft_av - (expAv[p.pick] || 0)).toFixed(1) }))
      .filter(p => p.surplus > 0)
      .sort((a, b) => b.surplus - a.surplus)
      .slice(0, topN);
  }

  /* G1.2 — R3-R7 picks ranked by sleeper score (AV surplus + Pro Bowl bonus) */
  function sleeperScores(filter = {}, topN = 30) {
    const expAv = _buildExpectedAv();
    return picks(filter)
      .filter(p => p.round >= 3 && p.pick > 0 && p.draft_av > 0)
      .map(p => {
        const surplus = p.draft_av - (expAv[p.pick] || 0);
        return { ...p, surplus: +surplus.toFixed(1), score: +(surplus + p.pro_bowls * 10).toFixed(1) };
      })
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  /* G1.3 — colleges ranked by avg career AV per pick (min picks threshold) */
  function hiddenGemColleges(filter = {}, minPicks = 20, topN = 30) {
    const byCollege = {};
    picks(filter).filter(p => p.college).forEach(p => {
      if (!byCollege[p.college]) byCollege[p.college] = { avSum: 0, pbSum: 0, n: 0 };
      byCollege[p.college].avSum += p.career_av;
      byCollege[p.college].pbSum += p.pro_bowls;
      byCollege[p.college].n++;
    });
    return Object.entries(byCollege)
      .filter(([, c]) => c.n >= minPicks)
      .map(([college, c]) => ({
        college,
        avgAV:     +(c.avSum / c.n).toFixed(1),
        totalPicks: c.n,
        totalAV:    c.avSum,
        avgPB:      +(c.pbSum / c.n).toFixed(2),
      }))
      .sort((a, b) => b.avgAV - a.avgAV)
      .slice(0, topN);
  }

  /* SAGE — career AV generated per unit of draft capital, by draft year */
  function draftClassGrades() {
    const INCOMPLETE_YEAR = 2021;
    const pickVal = pick => 100 * Math.pow(pick, -0.66);

    const byYear = {};
    _picks.filter(p => p.pick > 0).forEach(p => {
      if (!byYear[p.year]) byYear[p.year] = { avSum: 0, capital: 0, n: 0 };
      byYear[p.year].avSum   += p.career_av;
      byYear[p.year].capital += pickVal(p.pick);
      byYear[p.year].n++;
    });

    return _meta.years.map(year => {
      const c = byYear[year] || { avSum: 0, capital: 0, n: 0 };
      return {
        year,
        grade:      c.capital > 0 ? +(c.avSum / c.capital).toFixed(3) : 0,
        totalAV:    c.avSum,
        capital:    +c.capital.toFixed(1),
        picks:      c.n,
        incomplete: year >= INCOMPLETE_YEAR,
      };
    });
  }

  /* G1.5 — position groups ranked by avg Draft AV surplus per R4–R7 pick */
  function posLateRoundEfficiency(filter = {}) {
    const expAv = _buildExpectedAv();
    const byPos = {};
    picks(filter)
      .filter(p => p.round >= 4 && p.pick > 0)
      .forEach(p => {
        const surplus = p.draft_av - (expAv[p.pick] || 0);
        if (!byPos[p.pos_group]) byPos[p.pos_group] = { surplusSum: 0, n: 0, totalAV: 0 };
        byPos[p.pos_group].surplusSum += surplus;
        byPos[p.pos_group].n++;
        byPos[p.pos_group].totalAV += p.draft_av;
      });
    return Object.entries(byPos)
      .map(([pos_group, c]) => ({
        pos_group,
        avgSurplus: +(c.surplusSum / c.n).toFixed(2),
        totalPicks: c.n,
        totalAV:    c.totalAV,
      }))
      .sort((a, b) => b.avgSurplus - a.avgSurplus);
  }

  /* G1.4 — franchises ranked by avg Draft AV surplus per R4–R7 pick */
  function teamLateRoundEfficiency(filter = {}, minPicks = 10) {
    const expAv = _buildExpectedAv();
    const byTeam = {};
    picks(filter)
      .filter(p => p.round >= 4 && p.pick > 0)
      .forEach(p => {
        const surplus = p.draft_av - (expAv[p.pick] || 0);
        if (!byTeam[p.franchise]) byTeam[p.franchise] = { surplusSum: 0, n: 0, totalAV: 0 };
        byTeam[p.franchise].surplusSum += surplus;
        byTeam[p.franchise].n++;
        byTeam[p.franchise].totalAV += p.draft_av;
      });
    return Object.entries(byTeam)
      .filter(([, c]) => c.n >= minPicks)
      .map(([team, c]) => ({
        team,
        avgSurplus: +(c.surplusSum / c.n).toFixed(2),
        totalPicks: c.n,
        totalAV:    c.totalAV,
      }))
      .sort((a, b) => b.avgSurplus - a.avgSurplus);
  }

  /* G — colleges ranked by avg career AV surplus above slot expectation */
  function collegeSlotSurplus(filter = {}, minPicks = 20, topN = 30) {
    const expAv = _buildExpectedAv();
    const byCollege = {};

    picks(filter).filter(p => p.college && p.pick > 0).forEach(p => {
      if (!byCollege[p.college]) byCollege[p.college] = { surplusSum: 0, avSum: 0, pickSum: 0, n: 0 };
      byCollege[p.college].surplusSum += p.career_av - (expAv[p.pick] || 0);
      byCollege[p.college].avSum      += p.career_av;
      byCollege[p.college].pickSum    += p.pick;
      byCollege[p.college].n++;
    });

    return Object.entries(byCollege)
      .filter(([, c]) => c.n >= minPicks)
      .map(([college, c]) => ({
        college,
        avgSurplus: +(c.surplusSum / c.n).toFixed(2),
        totalPicks: c.n,
        totalAV:    c.avSum,
        avgPick:    +(c.pickSum / c.n).toFixed(1),
      }))
      .sort((a, b) => b.avgSurplus - a.avgSurplus)
      .slice(0, topN);
  }

  async function loadTeamStats() {
    if (_teamStats !== null) return;
    try {
      const resp = await fetch('data/team_stats.json');
      const json = await resp.json();
      _teamStats = {};
      json.stats.forEach(s => {
        if (!_teamStats[s.team]) _teamStats[s.team] = {};
        _teamStats[s.team][s.year] = s;
      });
    } catch (_) {
      _teamStats = {};
    }
  }

  function teamSeasonStat(team, stat) {
    if (!_teamStats || !_teamStats[team]) return { labels: [], values: [] };
    const rows = Object.values(_teamStats[team]).sort((a, b) => a.year - b.year);
    return {
      labels: rows.map(r => r.year),
      values: rows.map(r => r[stat] || 0),
    };
  }

  async function loadSleeperPredictions() {
    if (_sleeperPreds !== null) return;
    try {
      const resp = await fetch('data/sleeper_predictions.json');
      _sleeperPreds = await resp.json();
    } catch (_) {
      _sleeperPreds = { predictions: [], importances: [], meta: {} };
    }
  }

  function sleeperModelRankings(filter = {}, topN = 30, mode = 'predicted') {
    if (!_sleeperPreds) return { picks: [], importances: [], modelMeta: {} };
    let preds = _sleeperPreds.predictions;

    if (filter.yearFrom)  preds = preds.filter(p => p.year      >= +filter.yearFrom);
    if (filter.yearTo)    preds = preds.filter(p => p.year      <= +filter.yearTo);
    if (filter.pos_group) preds = preds.filter(p => p.pos_group === filter.pos_group);
    if (filter.round)     preds = preds.filter(p => p.round     === +filter.round);

    const scored = preds.map(p => ({
      ...p,
      displayScore: mode === 'surprise'
        ? +(p.actual_surplus - p.predicted_surplus).toFixed(2)
        : p.predicted_surplus,
    }));

    return {
      picks:       scored.sort((a, b) => b.displayScore - a.displayScore).slice(0, topN),
      importances: _sleeperPreds.importances,
      modelMeta:   _sleeperPreds.meta,
    };
  }

  async function loadSalaries() {
    if (_salaries !== null) return;
    try {
      const resp = await fetch('data/salaries.json');
      _salaries = await resp.json();
    } catch (_) {
      _salaries = { cap_by_year: [], top_earners: [] };
    }
  }

  function teamCapSpace(team) {
    if (!_salaries) return [];
    return _salaries.cap_by_year
      .filter(r => r.team === team)
      .sort((a, b) => a.year - b.year);
  }

  function teamTopEarners(team) {
    if (!_salaries) return [];
    return _salaries.top_earners.filter(r => r.team === team);
  }

  async function loadTrades() {
    if (_trades !== null) return;
    try {
      const resp = await fetch('data/trades.json');
      _trades = await resp.json();
    } catch (_) {
      _trades = [];
    }
  }

  function tradesForYear(year) {
    return (_trades || []).filter(t => t.season === +year);
  }

  return { load, picks, meta, posColor, posColorAlpha, franchiseTeams, leagueDraftToWins, loadTeamStats, teamSeasonStat, loadSalaries, teamCapSpace, teamTopEarners, picksPerYear, byPosGroup, posGroupAvPerYear, posGroupSharePerYear, topColleges, round1ByPosGroup, teamByRound, standings, teamStandings, winsByYear, draftToWinsScatter, pickValueCurve, teamCapitalByYear, teamRoundCapitalSplit, slotGradeScatter, teamOutcomeEfficiency, proBowlRateByRound, draftClassGrades, teamDraftClassGrades, draftClassPosByYear, lateRoundSteals, sleeperScores, hiddenGemColleges, collegeSlotSurplus, posLateRoundEfficiency, teamLateRoundEfficiency, loadTrades, tradesForYear, loadSleeperPredictions, sleeperModelRankings, dynastyIndex };
})();

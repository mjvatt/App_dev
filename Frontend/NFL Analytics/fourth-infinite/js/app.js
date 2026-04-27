/* app.js — navigation, filters, table, wiring */

(async () => {
  /* ── Load data ────────────────────────────────────────────────────── */
  const { meta } = await DraftData.load();
  document.getElementById('pickCount').textContent = `${meta.total_picks.toLocaleString()} picks`;

  /* ── Navigation ───────────────────────────────────────────────────── */
  const VIEW_TITLES = {
    dashboard:  ['Dashboard',        '32 seasons · 8,116 picks · all NFL teams'],
    draftboard: ['Draft Board',      'Search and filter every pick from 1994–2026'],
    teams:      ['Team Hub',         'Draft history and tendencies by franchise'],
    class2026:  ['2026 Draft Class', 'NFL Draft · April 24–26, 2026'],
    positions:  ['Position Trends',  'How position drafting has evolved over 32 years'],
    colleges:   ['College Pipeline', 'Which programs feed the NFL draft'],
    atlas:      ['ATLAS',            'Advanced Team Legacy Analytics System'],
    sage:       ['SAGE',             'Smart Analytics & Grade Engine'],
    ghost:      ['GHOST',            'Grading Hidden Opportunity & Sleeper Tracker'],
  };

  let _currentView = 'dashboard';

  function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const view = document.getElementById(`view-${id}`);
    if (view) view.classList.add('active');
    document.querySelector(`[data-view="${id}"]`)?.classList.add('active');

    const [title, sub] = VIEW_TITLES[id] || [id, ''];
    document.getElementById('viewTitle').textContent = title;
    document.getElementById('viewSub').textContent   = sub;
    _currentView = id;

    if (id === 'dashboard')  initDashboard();
    if (id === 'teams')      initTeamHub();
    if (id === 'class2026')  initClass2026();
    if (id === 'atlas')      initATLAS();
    if (id === 'positions')  initPositionTrends();
    if (id === 'colleges')   renderCollegePipeline();
    if (id === 'draftboard') renderDraftTable();
    if (id === 'sage')       initSAGE();
    if (id === 'ghost')      initGHOST();
  }

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); showView(el.dataset.view); });
  });

  /* ── Sidebar toggle ───────────────────────────────────────────────── */
  const sidebar = document.getElementById('sidebar');
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });

  /* ── Global search (redirects to draft board) ─────────────────────── */
  document.getElementById('globalSearch').addEventListener('input', e => {
    const q = e.target.value.trim();
    if (!q) return;
    if (_currentView !== 'draftboard') showView('draftboard');
    document.getElementById('db-search').value = q;
    filterAndRender();
  });

  /* ═══════════════════════════════════════════════════════════════════
     DASHBOARD
  ═══════════════════════════════════════════════════════════════════ */
  function initDashboard() {
    document.getElementById('viewSub').textContent =
      `${meta.years.length} seasons · ${meta.total_picks.toLocaleString()} picks · all NFL teams`;
    document.getElementById('kpi-years').textContent    = meta.years.length;
    document.getElementById('kpi-picks').textContent    = meta.total_picks.toLocaleString();
    document.getElementById('kpi-teams').textContent    = meta.teams.length;
    document.getElementById('kpi-colleges').textContent = meta.colleges.length;

    /* picks per year */
    DraftCharts.picksPerYear('chart-picksPerYear', DraftData.picksPerYear());

    /* all-time position donut */
    DraftCharts.donut('chart-positionDonut', DraftData.byPosGroup(), 'Picks');

    /* top colleges */
    DraftCharts.hbar('chart-topColleges', DraftData.topColleges(20));

    /* Top draft classes */
    const topClasses = DraftData.draftClassGrades()
      .filter(d => !d.incomplete && d.picks > 0)
      .sort((a, b) => b.grade - a.grade)
      .slice(0, 5);
    document.getElementById('dash-top-classes').innerHTML = topClasses.map((d, i) => `
      <li class="stat-row">
        <span class="stat-rank">${i + 1}</span>
        <div class="stat-main">
          <div class="stat-label">${d.year} Draft</div>
          <div class="stat-sub">${d.picks} picks · ${d.totalAV.toLocaleString()} career AV</div>
        </div>
        <span class="stat-value">${d.grade}</span>
      </li>`).join('');

    /* Top drafting teams (careers through 2020 to avoid incomplete data) */
    const topTeams = DraftData.teamOutcomeEfficiency({ yearFrom: 1994, yearTo: 2020 });
    document.getElementById('dash-top-teams').innerHTML = topTeams.meta.slice(0, 5).map((t, i) => `
      <li class="stat-row">
        <span class="stat-rank">${i + 1}</span>
        <div class="stat-main">
          <div class="stat-label">${t.team}</div>
          <div class="stat-sub">${t.picks} picks · ${t.totalAV.toLocaleString()} career AV</div>
        </div>
        <span class="stat-value">${t.efficiency}</span>
      </li>`).join('');

    /* Round 1 year selector */
    const r1Sel = document.getElementById('r1year-select');
    r1Sel.innerHTML = meta.years.slice().reverse()
      .map(y => `<option value="${y}">${y}</option>`).join('');
    r1Sel.addEventListener('change', () => renderR1Chart(+r1Sel.value));
    renderR1Chart(meta.years[meta.years.length - 1]);
  }

  function renderR1Chart(year) {
    DraftCharts.vbar('chart-r1positions', DraftData.round1ByPosGroup(year));
  }

  /* ═══════════════════════════════════════════════════════════════════
     DRAFT BOARD
  ═══════════════════════════════════════════════════════════════════ */
  const PAGE_SIZE = 50;
  let _filteredPicks = [];
  let _currentPage   = 1;
  let _sortCol       = 'year';
  let _sortDir       = 1;

  /* populate selects */
  const dbYear = document.getElementById('db-year');
  meta.years.slice().reverse().forEach(y => {
    dbYear.add(new Option(y, y));
  });

  const dbTeam = document.getElementById('db-team');
  meta.teams.forEach(t => dbTeam.add(new Option(t, t)));

  const dbPos = document.getElementById('db-pos');
  meta.positions.forEach(p => dbPos.add(new Option(p, p)));

  ['db-year','db-round','db-team','db-pos'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => { _currentPage = 1; filterAndRender(); });
  });
  document.getElementById('db-search').addEventListener('input', () => { _currentPage = 1; filterAndRender(); });
  document.getElementById('db-clear').addEventListener('click', () => {
    ['db-year','db-round','db-team','db-pos'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('db-search').value = '';
    _currentPage = 1;
    filterAndRender();
  });

  /* sorting */
  document.querySelectorAll('.draft-table th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (_sortCol === col) _sortDir *= -1;
      else { _sortCol = col; _sortDir = 1; }
      document.querySelectorAll('.draft-table th').forEach(h => {
        h.classList.remove('sort-asc','sort-desc');
        const icon = h.querySelector('i');
        if (icon) icon.className = 'fas fa-sort';
      });
      th.classList.add(_sortDir === 1 ? 'sort-asc' : 'sort-desc');
      const icon = th.querySelector('i');
      if (icon) icon.className = _sortDir === 1 ? 'fas fa-sort-up' : 'fas fa-sort-down';
      _currentPage = 1;
      renderDraftTable();
    });
  });

  function filterAndRender() {
    renderDraftTable();
  }

  function renderDraftTable() {
    const filter = {
      year:   document.getElementById('db-year').value   || undefined,
      round:  document.getElementById('db-round').value  || undefined,
      team:   document.getElementById('db-team').value   || undefined,
      pos:    document.getElementById('db-pos').value    || undefined,
      search: document.getElementById('db-search').value || undefined,
    };
    _filteredPicks = DraftData.picks(filter).sort((a, b) => {
      const va = a[_sortCol], vb = b[_sortCol];
      if (typeof va === 'number') return (va - vb) * _sortDir;
      return String(va).localeCompare(String(vb)) * _sortDir;
    });

    const total = _filteredPicks.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    _currentPage = Math.min(_currentPage, pages || 1);

    const slice = _filteredPicks.slice((_currentPage - 1) * PAGE_SIZE, _currentPage * PAGE_SIZE);
    const tbody = document.getElementById('draftTableBody');
    tbody.innerHTML = slice.map(p => `
      <tr>
        <td>${p.year}</td>
        <td>${p.round}</td>
        <td>${p.pick}</td>
        <td>${p.team}</td>
        <td><strong>${p.player}</strong></td>
        <td>${p.pos}</td>
        <td><span class="pos-pill" style="background:${DraftData.posColor(p.pos_group)}22;color:${DraftData.posColor(p.pos_group)}">${p.pos_group}</span></td>
        <td>${p.college}</td>
        <td style="text-align:right">${p.draft_av}</td>
        <td style="text-align:right">${p.career_av}</td>
        <td style="text-align:right">${p.pro_bowls || '—'}</td>
        <td style="color:#7a8caa;font-size:12px">${p.notes}</td>
      </tr>`).join('');

    document.getElementById('db-count').textContent =
      `${total.toLocaleString()} pick${total !== 1 ? 's' : ''}`;

    renderPagination(pages);
  }

  function renderPagination(pages) {
    const pg = document.getElementById('pagination');
    if (pages <= 1) { pg.innerHTML = ''; return; }
    const max = 7;
    let btns = '';
    for (let i = 1; i <= Math.min(pages, max); i++) {
      btns += `<button class="page-btn${i === _currentPage ? ' active' : ''}" data-p="${i}">${i}</button>`;
    }
    if (pages > max) btns += `<span style="color:#3d5070;padding:0 4px">…</span>
      <button class="page-btn${pages === _currentPage ? ' active' : ''}" data-p="${pages}">${pages}</button>`;
    pg.innerHTML = btns;
    pg.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => { _currentPage = +btn.dataset.p; renderDraftTable(); });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     TEAM HUB
  ═══════════════════════════════════════════════════════════════════ */
  function initTeamHub() {
    const sel     = document.getElementById('team-select');
    const cmpSel  = document.getElementById('team-compare-select');
    const statSel = document.getElementById('team-stat-select');
    if (sel.options.length === 1) {
      DraftData.franchiseTeams().forEach(t => {
        sel.add(new Option(t, t));
        cmpSel.add(new Option(t, t));
      });
    }
    const render = () => renderTeamHub(sel.value, cmpSel.value);
    sel.addEventListener('change', render);
    cmpSel.addEventListener('change', render);
    statSel.addEventListener('change', () => {
      if (sel.value) renderTeamStatChart(sel.value, statSel.value);
    });
    DraftData.loadTeamStats();
    DraftData.loadSalaries();
    if (sel.value) render();
  }

  function renderTeamHub(team, compareTeam = '') {
    if (!team) return;
    const teamPicks = DraftData.picks({ franchise: team });
    const r1        = teamPicks.filter(p => p.round === 1).length;
    const colleges  = new Set(teamPicks.map(p => p.college)).size;

    const posCount = {};
    teamPicks.forEach(p => posCount[p.pos_group] = (posCount[p.pos_group] || 0) + 1);
    const topPos = Object.entries(posCount).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';

    const rows     = DraftData.teamStandings(team);
    const totalW   = rows.reduce((s, r) => s + r.w, 0);
    const totalL   = rows.reduce((s, r) => s + r.l, 0);
    const winPct   = rows.length ? ((totalW / (totalW + totalL)) * 100).toFixed(1) + '%' : '—';
    const playoffs = rows.filter(r => r.playoff).length;
    const bestRow  = rows.slice().sort((a, b) => b.w - a.w)[0];
    const bestSeason = bestRow ? `${bestRow.year} (${bestRow.w}W)` : '—';

    document.getElementById('t-kpi-picks').textContent    = teamPicks.length;
    document.getElementById('t-kpi-r1').textContent       = r1;
    document.getElementById('t-kpi-colleges').textContent = colleges;
    document.getElementById('t-kpi-pos').textContent      = topPos;
    document.getElementById('t-kpi-winpct').textContent   = winPct;
    document.getElementById('t-kpi-playoffs').textContent = playoffs;
    document.getElementById('t-kpi-best').textContent     = bestSeason;

    const statSel = document.getElementById('team-stat-select');
    renderTeamStatChart(team, statSel.value);
    renderTeamSalary(team);

    const cmp = compareTeam || null;
    DraftCharts.winsPerYear(
      'chart-teamWins',
      DraftData.winsByYear(team),
      cmp ? DraftData.winsByYear(cmp) : null,
      team, cmp || ''
    );
    DraftCharts.picksPerYear('chart-teamPicksYear', DraftData.picksPerYear({ franchise: team }));
    DraftCharts.donut('chart-teamPosDonut', DraftData.byPosGroup({ franchise: team }), 'Picks');
    DraftCharts.vbar('chart-teamRoundBar', DraftData.teamByRound(team), null);
    DraftCharts.draftClassBar(
      'chart-teamDraftGrade',
      DraftData.teamDraftClassGrades(team),
      cmp ? DraftData.teamDraftClassGrades(cmp) : null,
      cmp || ''
    );
  }

  const STAT_LABELS = {
    points_for:     'Points For',
    points_against: 'Points Against',
    pass_yards:     'Pass Yards',
    rush_yards:     'Rush Yards',
    pass_tds:       'Pass TDs',
    rush_tds:       'Rush TDs',
  };

  async function renderTeamStatChart(team, stat) {
    await DraftData.loadTeamStats();
    const data = DraftData.teamSeasonStat(team, stat);
    if (!data.labels.length) return;
    DraftCharts.statLine('chart-teamSeasonStat', data, STAT_LABELS[stat] || stat);
  }

  async function renderTeamSalary(team) {
    await DraftData.loadSalaries();

    const capData = DraftData.teamCapSpace(team);
    if (capData.length) {
      DraftCharts.statLine('chart-teamCapSpace', {
        labels: capData.map(r => r.year),
        values: capData.map(r => +(r.cap_space / 1e6).toFixed(1)),
      }, 'Cap Space ($M)');
    }

    const earners = DraftData.teamTopEarners(team);
    if (earners.length) {
      DraftCharts.ghostLeaderboard('chart-teamTopEarners', {
        metricLabel: 'Cap Hit ($M)',
        xLabel:      'Cap Hit ($M)',
        labels: earners.map(e => e.pos ? `${e.player}  ·  ${e.pos}` : e.player),
        values: earners.map(e => +(e.cap_hit / 1e6).toFixed(1)),
        colors: earners.map(() => 'rgba(245,158,11,0.75)'),
        meta:   earners.map(() => ({})),
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     2026 DRAFT CLASS
  ═══════════════════════════════════════════════════════════════════ */
  function initClass2026() {
    const picks2026 = DraftData.picks({ year: 2026 });
    const r1        = picks2026.filter(p => p.round === 1).length;
    const teamCount = new Set(picks2026.map(p => p.team)).size;
    const colCount  = new Set(picks2026.map(p => p.college).filter(Boolean)).size;

    document.getElementById('c26-kpi-picks').textContent    = picks2026.length;
    document.getElementById('c26-kpi-teams').textContent    = teamCount;
    document.getElementById('c26-kpi-colleges').textContent = colCount;
    document.getElementById('c26-kpi-r1').textContent       = r1;

    DraftCharts.hbar('chart-c26-capital', DraftData.teamCapitalByYear(2026), '#3b82f6', 'Draft Capital Score');
    DraftCharts.donut('chart-c26-pos', DraftData.byPosGroup({ year: 2026 }), 'Picks');

    const ROUNDS = [1, 2, 3, 4, 5, 6, 7];
    DraftCharts.vbar('chart-c26-rounds', {
      labels: ROUNDS.map(r => `R${r}`),
      values: ROUNDS.map(r => picks2026.filter(p => p.round === r).length),
    });

    DraftCharts.hbar('chart-c26-colleges', DraftData.topColleges(20, { year: 2026 }));

    const rndSel  = document.getElementById('c26-rnd');
    const teamSel = document.getElementById('c26-team');
    const search  = document.getElementById('c26-search');

    if (rndSel.options.length === 1) {
      ROUNDS.forEach(r => rndSel.add(new Option(`Round ${r}`, r)));
      [...new Set(picks2026.map(p => p.team).filter(Boolean))].sort()
        .forEach(t => teamSel.add(new Option(t, t)));
      [rndSel, teamSel].forEach(el => el.addEventListener('change', renderBoard));
      search.addEventListener('input', renderBoard);
    }

    function renderBoard() {
      const r = rndSel.value  ? +rndSel.value : 0;
      const t = teamSel.value || '';
      const q = search.value.trim().toLowerCase();
      const filtered = picks2026.filter(p =>
        (!r || p.round === r) &&
        (!t || p.team  === t) &&
        (!q || p.player.toLowerCase().includes(q) || p.college.toLowerCase().includes(q))
      );
      document.getElementById('c26-board-count').textContent =
        `${filtered.length.toLocaleString()} pick${filtered.length !== 1 ? 's' : ''}`;
      document.getElementById('c26-board-body').innerHTML = filtered.map(p => `
        <tr>
          <td>${p.round}</td>
          <td>${p.pick}</td>
          <td>${p.team}</td>
          <td><strong>${p.player}</strong></td>
          <td><span class="pos-pill" style="background:${DraftData.posColor(p.pos_group)}22;color:${DraftData.posColor(p.pos_group)}">${p.pos || '—'}</span></td>
          <td>${p.college}</td>
          <td style="color:var(--text-muted);font-size:12px">${p.notes}</td>
        </tr>`).join('');
    }

    renderBoard();
  }

  /* ═══════════════════════════════════════════════════════════════════
     POSITION TRENDS
  ═══════════════════════════════════════════════════════════════════ */
  const ALL_GROUPS = ['QB','RB','WR','TE','OL','DL','LB','DB','ST'];
  let _activePosGroups = new Set(ALL_GROUPS);

  function initPositionTrends() {
    const container = document.getElementById('posToggleGroup');
    if (!container.children.length) {
      ALL_GROUPS.forEach(g => {
        const btn = document.createElement('button');
        btn.className = 'pos-toggle on';
        btn.textContent = g;
        btn.style.background   = DraftData.posColor(g);
        btn.style.borderColor  = DraftData.posColor(g);
        btn.dataset.group = g;
        btn.addEventListener('click', () => {
          if (_activePosGroups.has(g)) {
            if (_activePosGroups.size === 1) return;
            _activePosGroups.delete(g);
            btn.classList.remove('on');
            btn.style.background  = '';
            btn.style.borderColor = DraftData.posColor(g);
            btn.style.color       = DraftData.posColor(g);
          } else {
            _activePosGroups.add(g);
            btn.classList.add('on');
            btn.style.background  = DraftData.posColor(g);
            btn.style.borderColor = DraftData.posColor(g);
            btn.style.color       = '#000';
          }
          renderPosTrends();
        });
        container.appendChild(btn);
      });
    }
    renderPosTrends();
    renderR1Concentration();
  }

  function renderPosTrends() {
    const groups = ALL_GROUPS.filter(g => _activePosGroups.has(g));
    const share = DraftData.posGroupSharePerYear(groups);
    DraftCharts.multiLine('chart-posTrends', share.years, share.data, DraftData.posColor);
    const av = DraftData.posGroupAvPerYear(groups);
    DraftCharts.multiLine('chart-posAvPerYear', av.years, av.data, DraftData.posColor, 'Avg Career AV per Pick');
  }

  function renderR1Concentration() {
    const { years, data } = DraftData.posGroupSharePerYear(ALL_GROUPS.filter(g => ['QB','WR','OL','DL','DB'].includes(g)));
    const ctx = document.getElementById('chart-r1concentration');
    if (!ctx) return;
    const r1data = {};
    ALL_GROUPS.filter(g => ['QB','WR','OL','DL','DB'].includes(g)).forEach(g => { r1data[g] = []; });
    const meta2 = DraftData.meta();
    meta2.years.forEach(year => {
      const r1 = DraftData.picks({ year, round: 1 });
      const total = r1.length || 1;
      ALL_GROUPS.filter(g => ['QB','WR','OL','DL','DB'].includes(g)).forEach(g => {
        const cnt = r1.filter(p => p.pos_group === g).length;
        r1data[g].push(+(cnt / total * 100).toFixed(1));
      });
    });
    DraftCharts.multiLine('chart-r1concentration', meta2.years, r1data, DraftData.posColor);
  }

  /* ═══════════════════════════════════════════════════════════════════
     COLLEGE PIPELINE
  ═══════════════════════════════════════════════════════════════════ */
  function initCollegeFilters() {
    const posGrp  = document.getElementById('col-posgroup');
    const colTeam = document.getElementById('col-team');
    const yfrom   = document.getElementById('col-yearfrom');
    const yto     = document.getElementById('col-yearto');

    ALL_GROUPS.forEach(g => posGrp.add(new Option(g, g)));
    meta.teams.forEach(t => colTeam.add(new Option(t, t)));
    meta.years.forEach(y => { yfrom.add(new Option(y, y)); yto.add(new Option(y, y)); });
    yto.value = meta.years[meta.years.length - 1];

    document.getElementById('col-apply').addEventListener('click', renderCollegePipeline);
  }

  function renderCollegePipeline() {
    const filter = {
      pos_group: document.getElementById('col-posgroup').value || undefined,
      team:      document.getElementById('col-team').value     || undefined,
      yearFrom:  document.getElementById('col-yearfrom').value || undefined,
      yearTo:    document.getElementById('col-yearto').value   || undefined,
    };
    const minPicks = +document.getElementById('col-minpicks').value || 15;

    DraftCharts.hbar('chart-collegePipeline', DraftData.topColleges(25, filter));

    const efficient = DraftData.hiddenGemColleges(filter, minPicks, 25);
    DraftCharts.ghostLeaderboard('chart-collegeEfficiency', {
      labels:      efficient.map(c => c.college),
      values:      efficient.map(c => c.avgAV),
      metricLabel: 'Avg Career AV / Pick',
      xLabel:      'Average career AV per draft selection',
      meta:        efficient.map(c => ({
        totalPicks: c.totalPicks,
        totalAV:    c.totalAV,
        avgPB:      c.avgPB,
      })),
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     ATLAS
  ═══════════════════════════════════════════════════════════════════ */
  const ERA_RANGES = {
    all:   { yearFrom: 1994, yearTo: 2025 },
    '1990s': { yearFrom: 1994, yearTo: 1999 },
    '2000s': { yearFrom: 2000, yearTo: 2009 },
    '2010s': { yearFrom: 2010, yearTo: 2019 },
    '2020s': { yearFrom: 2020, yearTo: 2025 },
  };

  function initATLAS() {
    if (_atlasInited) return;

    const eraSel = document.getElementById('atlas-era-sel');
    eraSel.addEventListener('change', () => {
      if (_atlasTabInited.dynasty) {
        _atlasTabInited.dynasty = false;
      }
      if (document.querySelector('[data-atlas-panel="dynasty"]').classList.contains('active')) {
        renderDynastyIndex();
      }
    });

    function renderDynastyIndex() {
      const { yearFrom, yearTo } = ERA_RANGES[eraSel.value] || ERA_RANGES.all;
      const rows    = DraftData.dynastyIndex(yearFrom, yearTo);
      const q3score = rows[Math.floor(rows.length * 0.25)]?.score ?? 0;
      DraftCharts.atlasLeaderboard('chart-atlas-dynasty', {
        labels: rows.map(r => r.team),
        values: rows.map(r => r.score),
        colors: rows.map(r =>
          r.score >= q3score ? 'rgba(245,158,11,0.80)' : 'rgba(14,165,233,0.60)'
        ),
        meta: rows.map(r => ({
          winPct:      r.winPct,
          wins:        r.wins,
          seasons:     r.seasons,
          playoffs:    r.playoffs,
          playoffRate: r.playoffRate,
          draftEff:    r.draftEff,
        })),
      });
    }

    const trajSels = [
      document.getElementById('atlas-traj-t1'),
      document.getElementById('atlas-traj-t2'),
      document.getElementById('atlas-traj-t3'),
      document.getElementById('atlas-traj-t4'),
    ];

    if (trajSels[0].options.length === 1) {
      trajSels.forEach(sel => {
        DraftData.franchiseTeams().forEach(t => sel.add(new Option(t, t)));
        sel.addEventListener('change', () => {
          _atlasTabInited.trajectories = false;
          renderTrajectories();
          _atlasTabInited.trajectories = true;
        });
      });
    }

    function renderTrajectories() {
      const selected = trajSels.map(s => s.value).filter(Boolean);
      if (!selected.length) return;
      const series = selected.map(team => {
        const d = DraftData.winsByYear(team);
        return { label: team, labels: d.labels, values: d.values, playoffs: d.playoffs };
      });
      DraftCharts.trajectoryChart('chart-atlas-trajectories', series);
    }

    const dwLag   = document.getElementById('atlas-dw-lag');
    const dwYfrom = document.getElementById('atlas-dw-yfrom');
    const dwYto   = document.getElementById('atlas-dw-yto');

    /* default yearTo per lag window: need standings through yearTo+lagTo */
    const LAG_DEFAULTS = { '1|1': { yearTo: 2024 }, '3|5': { yearTo: 2020 } };

    if (dwYfrom.options.length === 0) {
      meta.years.filter(y => y <= 2024).forEach(y => {
        dwYfrom.add(new Option(y, y));
        dwYto.add(new Option(y, y));
      });
      dwYfrom.value = String(meta.years[0]);
      dwYto.value   = '2020';

      dwLag.addEventListener('change', () => {
        const def = LAG_DEFAULTS[dwLag.value];
        if (def) dwYto.value = String(def.yearTo);
        _atlasTabInited['draft-wins'] = false;
        renderDraftWins();
        _atlasTabInited['draft-wins'] = true;
      });
      [dwYfrom, dwYto].forEach(el => el.addEventListener('change', () => {
        _atlasTabInited['draft-wins'] = false;
        renderDraftWins();
        _atlasTabInited['draft-wins'] = true;
      }));
    }

    function renderDraftWins() {
      const [lagFrom, lagTo] = (dwLag.value || '3|5').split('|').map(Number);
      const data = DraftData.leagueDraftToWins(+dwYfrom.value, +dwYto.value, lagFrom, lagTo);
      const lagLabel = lagFrom === lagTo ? `Y+${lagFrom}` : `Y+${lagFrom}–Y+${lagTo}`;
      document.getElementById('atlas-dw-r2').textContent = `R² = ${data.r2}  ·  lag ${lagLabel}`;
      DraftCharts.leagueDraftWinsChart('chart-atlas-draft-wins', data);
    }

    const eraSortSel = document.getElementById('atlas-era-sort');
    const eraTopNSel = document.getElementById('atlas-era-topn');

    if (eraSortSel.dataset.wired !== 'true') {
      [eraSortSel, eraTopNSel].forEach(el => el.addEventListener('change', () => {
        _atlasTabInited.era = false;
        renderEraRankings();
        _atlasTabInited.era = true;
      }));
      eraSortSel.dataset.wired = 'true';
    }

    function renderEraRankings() {
      const { rows, eras } = DraftData.eraRankings();
      const sortKey = eraSortSel.value;
      const topN    = +eraTopNSel.value || 12;

      const sorted = rows
        .slice()
        .sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0))
        .slice(0, topN);

      const wrap = document.getElementById('atlas-era-wrap');
      if (wrap) wrap.style.height = `${Math.max(360, topN * 44)}px`;

      DraftCharts.eraRankingsChart('chart-atlas-era', sorted, eras);
    }

    const ATLAS_RENDERS = {
      dynasty:      renderDynastyIndex,
      trajectories: renderTrajectories,
      'draft-wins': renderDraftWins,
      era:          renderEraRankings,
    };

    function activateAtlasTab(id) {
      document.querySelectorAll('[data-atlas-tab]').forEach(t =>
        t.classList.toggle('active', t.dataset.atlasTab === id)
      );
      document.querySelectorAll('[data-atlas-panel]').forEach(p =>
        p.classList.toggle('active', p.dataset.atlasPanel === id)
      );
      if (!_atlasTabInited[id] && ATLAS_RENDERS[id]) {
        _atlasTabInited[id] = true;
        ATLAS_RENDERS[id]();
      }
    }

    document.querySelectorAll('[data-atlas-tab]').forEach(tab => {
      tab.addEventListener('click', () => activateAtlasTab(tab.dataset.atlasTab));
    });

    activateAtlasTab('dynasty');
    _atlasInited = true;
  }

  /* ═══════════════════════════════════════════════════════════════════
     SAGE
  ═══════════════════════════════════════════════════════════════════ */
  let _sageInited      = false;
  let _ghostInited     = false;
  let _ghostTabInited  = {};
  let _atlasInited     = false;
  let _atlasTabInited  = {};

  function initSAGE() {
    if (!_sageInited) {
      DraftCharts.pickValueLine('chart-pickValueCurve', DraftData.pickValueCurve());

      const capYearSel = document.getElementById('capital-year');
      meta.years.slice().reverse().forEach(y => capYearSel.add(new Option(y, y)));

      function renderCapitalRanking(year) {
        DraftCharts.hbar('chart-capitalRanking', DraftData.teamCapitalByYear(year), '#3b82f6', 'Draft Capital');
      }

      capYearSel.addEventListener('change', () => renderCapitalRanking(+capYearSel.value));
      renderCapitalRanking(+capYearSel.value);

      const effYearSel = document.getElementById('efficiency-year');
      meta.years.slice().reverse().forEach(y => effYearSel.add(new Option(y, y)));

      function renderRoundEfficiency(year) {
        DraftCharts.roundCapitalBar('chart-roundEfficiency', DraftData.teamRoundCapitalSplit(year));
      }

      effYearSel.addEventListener('change', () => renderRoundEfficiency(+effYearSel.value));
      renderRoundEfficiency(+effYearSel.value);

      // P2.1 — player vs slot grade
      const slotYfrom = document.getElementById('slot-grade-yfrom');
      const slotYto   = document.getElementById('slot-grade-yto');
      const slotPos   = document.getElementById('slot-grade-pos');

      meta.years.forEach(y => {
        slotYfrom.add(new Option(y, y));
        slotYto.add(new Option(y, y));
      });
      slotYfrom.value = String(meta.years[0]);
      slotYto.value   = String(Math.min(2022, meta.years[meta.years.length - 1]));

      const ALL_POS_GROUPS = ['QB','RB','WR','TE','OL','DL','LB','DB','ST'];

      function renderSlotGrade() {
        const filter = {
          yearFrom:  +slotYfrom.value || undefined,
          yearTo:    +slotYto.value   || undefined,
          pos_group: slotPos.value    || undefined,
        };
        const groups = slotPos.value ? [slotPos.value] : ALL_POS_GROUPS;
        DraftCharts.slotGradeChart('chart-slotGrade', DraftData.slotGradeScatter(filter), groups);
      }

      [slotYfrom, slotYto, slotPos].forEach(el => el.addEventListener('change', renderSlotGrade));
      renderSlotGrade();

      // P2.2 — team outcome efficiency
      const eff2Yfrom = document.getElementById('eff2-yfrom');
      const eff2Yto   = document.getElementById('eff2-yto');

      meta.years.forEach(y => {
        eff2Yfrom.add(new Option(y, y));
        eff2Yto.add(new Option(y, y));
      });
      eff2Yfrom.value = String(meta.years[0]);
      eff2Yto.value   = String(Math.min(2018, meta.years[meta.years.length - 1]));

      function renderTeamOutcomeEff() {
        const filter = {
          yearFrom: +eff2Yfrom.value || undefined,
          yearTo:   +eff2Yto.value   || undefined,
        };
        DraftCharts.efficiencyBar('chart-teamOutcomeEff', DraftData.teamOutcomeEfficiency(filter));
      }

      [eff2Yfrom, eff2Yto].forEach(el => el.addEventListener('change', renderTeamOutcomeEff));
      renderTeamOutcomeEff();

      // P2.3 — pro bowl rate by round
      const pbYfrom = document.getElementById('pb-yfrom');
      const pbYto   = document.getElementById('pb-yto');
      const pbPos   = document.getElementById('pb-pos');

      meta.years.forEach(y => {
        pbYfrom.add(new Option(y, y));
        pbYto.add(new Option(y, y));
      });
      pbYfrom.value = String(meta.years[0]);
      pbYto.value   = String(Math.min(2020, meta.years[meta.years.length - 1]));

      function renderProBowlRate() {
        const filter = {
          yearFrom:  +pbYfrom.value || undefined,
          yearTo:    +pbYto.value   || undefined,
          pos_group: pbPos.value    || undefined,
        };
        DraftCharts.proBowlBar('chart-proBowlRate', DraftData.proBowlRateByRound(filter));
      }

      [pbYfrom, pbYto, pbPos].forEach(el => el.addEventListener('change', renderProBowlRate));
      renderProBowlRate();

      DraftCharts.draftClassBar('chart-draftClassGrades', DraftData.draftClassGrades());
      DraftCharts.draftClassPosBar('chart-draftClassPos', DraftData.draftClassPosByYear());

      // Draft pick trade analysis
      const tradeYearSel = document.getElementById('trade-year');
      for (let y = 2026; y >= 2002; y--) tradeYearSel.add(new Option(y, y));
      tradeYearSel.value = '2026';

      const ROUND_MED = { 1:17, 2:49, 3:81, 4:113, 5:145, 6:177, 7:215 };
      const pickVal   = pick => +(100 * Math.pow(pick, -0.66)).toFixed(1);

      function tradeAssetHtml(asset, tradeSeason) {
        if (asset.type === 'pick') {
          const p     = asset.pick || ROUND_MED[asset.round] || 100;
          const v     = pickVal(p);
          const est   = asset.pick ? '' : '~';
          const cond  = asset.cond ? '?' : '';
          const diff  = asset.pick_season !== tradeSeason ? `${asset.pick_season} ` : '';
          return `<span class="trade-asset pick">${diff}R${asset.round}${asset.pick ? ` #${asset.pick}` : ''}${cond} <em>${est}${v}</em></span>`;
        }
        return `<span class="trade-asset player">${asset.player}</span>`;
      }

      function renderTradeCards(trades) {
        const list = document.getElementById('trade-list');
        if (!trades.length) {
          list.innerHTML = '<div class="trade-empty">No pick trades found for this year.</div>';
          return;
        }

        const html = trades.map(trade => {
          const teams = [...new Set(trade.assets.flatMap(a => [a.frm, a.to]))];
          if (teams.length !== 2) return '';
          const [tA, tB] = teams;
          const aAssets = trade.assets.filter(a => a.frm === tA);
          const bAssets = trade.assets.filter(a => a.frm === tB);

          const sideVal = assets => assets
            .filter(a => a.type === 'pick')
            .reduce((s, a) => s + +pickVal(a.pick || ROUND_MED[a.round] || 100), 0);

          const aVal   = +sideVal(aAssets).toFixed(1);
          const bVal   = +sideVal(bAssets).toFixed(1);
          const surplus = +(aVal - bVal).toFixed(1);
          const absS   = Math.abs(surplus);
          const winner = surplus > 0.5 ? tB : surplus < -0.5 ? tA : null;
          const cls    = absS < 5 ? 'even' : absS < 15 ? 'slight' : 'large';
          const badge  = winner ? `${winner} +${absS}` : 'EVEN';
          const mm     = trade.date ? trade.date.slice(5, 10).replace('-', '/') : '';

          return `<div class="trade-card">
            <span class="trade-date">${mm}</span>
            <div class="trade-body">
              <div class="trade-side">
                <span class="trade-team">${tA}</span>
                <div class="trade-assets">${aAssets.map(a => tradeAssetHtml(a, trade.season)).join('')}</div>
                <span class="trade-val">${aVal}</span>
              </div>
              <span class="trade-arrow">&#8644;</span>
              <div class="trade-side">
                <span class="trade-team">${tB}</span>
                <div class="trade-assets">${bAssets.map(a => tradeAssetHtml(a, trade.season)).join('')}</div>
                <span class="trade-val">${bVal}</span>
              </div>
            </div>
            <span class="trade-surplus ${cls}">${badge}</span>
          </div>`;
        }).join('');

        list.innerHTML = html || '<div class="trade-empty">No 2-team pick trades found.</div>';
      }

      async function renderTrades(year) {
        const list = document.getElementById('trade-list');
        list.innerHTML = '<div class="trade-empty">Loading…</div>';
        await DraftData.loadTrades();
        renderTradeCards(DraftData.tradesForYear(+year));
      }

      tradeYearSel.addEventListener('change', () => renderTrades(+tradeYearSel.value));
      renderTrades(2026);

      _sageInited = true;
    }

    const sel = document.getElementById('sage-team');
    if (sel.options.length === 1) {
      DraftData.franchiseTeams().forEach(t => sel.add(new Option(t, t)));
    }
    sel.addEventListener('change', () => renderSageScatter(sel.value));
    if (sel.value) renderSageScatter(sel.value);
  }

  function renderSageScatter(team) {
    const grid = document.getElementById('sage-chart-grid');
    if (!team) { grid.style.display = 'none'; return; }

    const points = DraftData.draftToWinsScatter(team);
    grid.style.display = '';
    DraftCharts.scatter('chart-sageScatter', points);
  }

  /* ═══════════════════════════════════════════════════════════════════
     GHOST
  ═══════════════════════════════════════════════════════════════════ */
  function initGHOST() {
    if (_ghostInited) return;

    const lrYfrom = document.getElementById('ghost-lr-yfrom');
    const lrYto   = document.getElementById('ghost-lr-yto');
    const lrPos   = document.getElementById('ghost-lr-pos');

    const ssYfrom = document.getElementById('ghost-ss-yfrom');
    const ssYto   = document.getElementById('ghost-ss-yto');
    const ssPos   = document.getElementById('ghost-ss-pos');

    const hgYfrom    = document.getElementById('ghost-hg-yfrom');
    const hgYto      = document.getElementById('ghost-hg-yto');
    const hgMinPicks = document.getElementById('ghost-hg-minpicks');

    const plYfrom = document.getElementById('ghost-pl-yfrom');
    const plYto   = document.getElementById('ghost-pl-yto');

    const teYfrom    = document.getElementById('ghost-te-yfrom');
    const teYto      = document.getElementById('ghost-te-yto');
    const teMinPicks = document.getElementById('ghost-te-minpicks');

    const ciYfrom    = document.getElementById('ghost-ci-yfrom');
    const ciYto      = document.getElementById('ghost-ci-yto');
    const ciMinPicks = document.getElementById('ghost-ci-minpicks');

    const mlMode  = document.getElementById('ghost-ml-mode');
    const mlYfrom = document.getElementById('ghost-ml-yfrom');
    const mlYto   = document.getElementById('ghost-ml-yto');
    const mlRound = document.getElementById('ghost-ml-round');
    const mlPos   = document.getElementById('ghost-ml-pos');

    meta.years.forEach(y => {
      lrYfrom.add(new Option(y, y));
      lrYto.add(new Option(y, y));
      ssYfrom.add(new Option(y, y));
      ssYto.add(new Option(y, y));
      hgYfrom.add(new Option(y, y));
      hgYto.add(new Option(y, y));
      plYfrom.add(new Option(y, y));
      plYto.add(new Option(y, y));
      teYfrom.add(new Option(y, y));
      teYto.add(new Option(y, y));
      ciYfrom.add(new Option(y, y));
      ciYto.add(new Option(y, y));
      mlYfrom.add(new Option(y, y));
      mlYto.add(new Option(y, y));
    });

    lrYfrom.value = String(meta.years[0]);
    lrYto.value   = String(Math.min(2020, meta.years[meta.years.length - 1]));
    ssYfrom.value = String(meta.years[0]);
    ssYto.value   = String(Math.min(2020, meta.years[meta.years.length - 1]));
    hgYfrom.value = String(meta.years[0]);
    hgYto.value   = String(meta.years[meta.years.length - 1]);
    plYfrom.value = String(meta.years[0]);
    plYto.value   = String(Math.min(2020, meta.years[meta.years.length - 1]));
    teYfrom.value = String(meta.years[0]);
    teYto.value   = String(Math.min(2020, meta.years[meta.years.length - 1]));
    ciYfrom.value = String(meta.years[0]);
    ciYto.value   = String(Math.min(2020, meta.years[meta.years.length - 1]));
    mlYfrom.value = String(meta.years[0]);
    mlYto.value   = String(meta.years[meta.years.length - 1]);

    function renderLateRoundSteals() {
      const filter = {
        yearFrom:  +lrYfrom.value || undefined,
        yearTo:    +lrYto.value   || undefined,
        pos_group: lrPos.value    || undefined,
      };
      const steals = DraftData.lateRoundSteals(filter, 30);
      DraftCharts.ghostLeaderboard('chart-lateRoundSteals', {
        labels:      steals.map(p => `${p.player} (${p.year})`),
        values:      steals.map(p => p.surplus),
        colors:      steals.map(p => DraftData.posColorAlpha(p.pos_group, 0.75)),
        metricLabel: 'AV Surplus vs Slot',
        xLabel:      'Draft AV above slot expectation',
        meta:        steals.map(p => ({
          team:      p.team,
          year:      p.year,
          pos:       p.pos,
          round:     p.round,
          pick:      p.pick,
          draft_av:  p.draft_av,
          career_av: p.career_av,
          surplus:   p.surplus,
        })),
      });
    }

    function renderSleeperScores() {
      const filter = {
        yearFrom:  +ssYfrom.value || undefined,
        yearTo:    +ssYto.value   || undefined,
        pos_group: ssPos.value    || undefined,
      };
      const sleepers = DraftData.sleeperScores(filter, 30);
      DraftCharts.ghostLeaderboard('chart-sleeperScores', {
        labels:      sleepers.map(p => `${p.player} (${p.year})`),
        values:      sleepers.map(p => p.score),
        colors:      sleepers.map(p => DraftData.posColorAlpha(p.pos_group, 0.75)),
        metricLabel: 'Sleeper Score',
        xLabel:      'AV surplus + Pro Bowl bonus (×10)',
        meta:        sleepers.map(p => ({
          team:      p.team,
          year:      p.year,
          pos:       p.pos,
          round:     p.round,
          pick:      p.pick,
          draft_av:  p.draft_av,
          career_av: p.career_av,
          pro_bowls: p.pro_bowls,
          surplus:   p.surplus,
        })),
      });
    }

    function renderHiddenGemColleges() {
      const filter = {
        yearFrom: +hgYfrom.value || undefined,
        yearTo:   +hgYto.value   || undefined,
      };
      const colleges = DraftData.hiddenGemColleges(filter, +hgMinPicks.value || 20, 30);
      DraftCharts.ghostLeaderboard('chart-hiddenGemColleges', {
        labels:      colleges.map(c => c.college),
        values:      colleges.map(c => c.avgAV),
        metricLabel: 'Avg Career AV / Pick',
        xLabel:      'Career AV per pick',
        meta:        colleges.map(c => ({
          totalPicks: c.totalPicks,
          totalAV:    c.totalAV,
          avgPB:      c.avgPB,
        })),
      });
    }

    function renderPosLateRoundBreakdown() {
      const filter = {
        yearFrom: +plYfrom.value || undefined,
        yearTo:   +plYto.value   || undefined,
      };
      const positions = DraftData.posLateRoundEfficiency(filter);
      DraftCharts.ghostLeaderboard('chart-posLateRoundBreakdown', {
        labels:      positions.map(p => p.pos_group),
        values:      positions.map(p => p.avgSurplus),
        colors:      positions.map(p => DraftData.posColorAlpha(p.pos_group, 0.75)),
        metricLabel: 'Avg AV Surplus / Pick',
        xLabel:      'Avg Draft AV above slot expectation per R4–R7 pick',
        meta:        positions.map(p => ({
          totalPicks: p.totalPicks,
          totalAV:    p.totalAV,
        })),
      });
    }

    function renderTeamLateRoundEff() {
      const filter = {
        yearFrom: +teYfrom.value || undefined,
        yearTo:   +teYto.value   || undefined,
      };
      const teams = DraftData.teamLateRoundEfficiency(filter, +teMinPicks.value || 10);
      DraftCharts.ghostLeaderboard('chart-teamLateRoundEff', {
        labels:      teams.map(t => t.team),
        values:      teams.map(t => t.avgSurplus),
        colors:      teams.map(t => t.avgSurplus >= 0 ? 'rgba(245,158,11,0.75)' : 'rgba(107,114,128,0.45)'),
        metricLabel: 'Avg AV Surplus / Pick',
        xLabel:      'Avg Draft AV above slot expectation per R4–R7 pick',
        meta:        teams.map(t => ({
          totalPicks: t.totalPicks,
          totalAV:    t.totalAV,
        })),
      });
    }

    function renderCollegeAvIndex() {
      const filter = {
        yearFrom: +ciYfrom.value || undefined,
        yearTo:   +ciYto.value   || undefined,
      };
      const colleges = DraftData.collegeSlotSurplus(filter, +ciMinPicks.value || 20, 30);
      DraftCharts.ghostLeaderboard('chart-collegeAvIndex', {
        labels:      colleges.map(c => c.college),
        values:      colleges.map(c => c.avgSurplus),
        colors:      colleges.map(c => c.avgSurplus >= 0 ? 'rgba(245,158,11,0.75)' : 'rgba(107,114,128,0.45)'),
        metricLabel: 'Avg Career AV Surplus vs Slot',
        xLabel:      'Avg career AV above slot expectation per pick',
        meta:        colleges.map(c => ({
          totalPicks: c.totalPicks,
          totalAV:    c.totalAV,
          avgPick:    c.avgPick,
        })),
      });
    }

    [lrYfrom, lrYto, lrPos].forEach(el => el.addEventListener('change', renderLateRoundSteals));
    [ssYfrom, ssYto, ssPos].forEach(el => el.addEventListener('change', renderSleeperScores));
    [hgYfrom, hgYto, hgMinPicks].forEach(el => el.addEventListener('change', renderHiddenGemColleges));
    [plYfrom, plYto].forEach(el => el.addEventListener('change', renderPosLateRoundBreakdown));
    [teYfrom, teYto, teMinPicks].forEach(el => el.addEventListener('change', renderTeamLateRoundEff));
    [ciYfrom, ciYto, ciMinPicks].forEach(el => el.addEventListener('change', renderCollegeAvIndex));

    async function renderMlRankings() {
      await DraftData.loadSleeperPredictions();
      const filter = {
        yearFrom:  +mlYfrom.value || undefined,
        yearTo:    +mlYto.value   || undefined,
        pos_group: mlPos.value    || undefined,
        round:     mlRound.value  || undefined,
      };
      const mode   = mlMode.value;
      const result = DraftData.sleeperModelRankings(filter, 30, mode);

      const rankLabel = mode === 'surprise' ? 'Actual − Predicted Surplus' : 'Predicted Career AV Surplus';
      const xLabel    = mode === 'surprise'
        ? 'Career AV above slot expectation minus model prediction'
        : 'Predicted career AV above slot expectation';

      DraftCharts.ghostLeaderboard('chart-mlRankings', {
        labels:      result.picks.map(p => `${p.player} (${p.year})`),
        values:      result.picks.map(p => p.displayScore),
        colors:      result.picks.map(p => DraftData.posColorAlpha(p.pos_group, 0.75)),
        metricLabel: rankLabel,
        xLabel,
        meta:        result.picks.map(p => ({
          team:               p.team,
          year:               p.year,
          pos:                p.pos,
          round:              p.round,
          pick:               p.pick,
          college:            p.college,
          draft_av:           p.draft_av,
          career_av:          p.career_av,
          pro_bowls:          p.pro_bowls,
          predicted_surplus:  p.predicted_surplus,
          actual_surplus:     p.actual_surplus,
          incomplete:         p.incomplete,
        })),
      });

      if (result.importances.length) {
        DraftCharts.ghostLeaderboard('chart-mlImportances', {
          labels:      result.importances.map(f => f.feature),
          values:      result.importances.map(f => f.importance),
          metricLabel: 'Importance',
          xLabel:      'Feature importance (sum = 1)',
          meta:        result.importances.map(f => ({ totalPicks: undefined, totalAV: undefined })),
        });
      }
    }

    [mlMode, mlYfrom, mlYto, mlRound, mlPos].forEach(el => el.addEventListener('change', renderMlRankings));

    const GHOST_RENDERS = {
      steals:       renderLateRoundSteals,
      sleeper:      renderSleeperScores,
      hidden:       renderHiddenGemColleges,
      pos:          renderPosLateRoundBreakdown,
      teams:        renderTeamLateRoundEff,
      'college-av': renderCollegeAvIndex,
      'ml':         renderMlRankings,
    };

    function activateGhostTab(id) {
      document.querySelectorAll('.ghost-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.ghostTab === id)
      );
      document.querySelectorAll('.ghost-panel').forEach(p =>
        p.classList.toggle('active', p.dataset.ghostPanel === id)
      );
      if (!_ghostTabInited[id]) {
        _ghostTabInited[id] = true;
        GHOST_RENDERS[id]();
      }
    }

    document.querySelectorAll('.ghost-tab').forEach(tab => {
      tab.addEventListener('click', () => activateGhostTab(tab.dataset.ghostTab));
    });

    activateGhostTab('steals');
    _ghostInited = true;
  }

  /* ── Theme toggle ─────────────────────────────────────────────────── */
  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    document.querySelectorAll('.theme-switch-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.t === theme);
    });
    localStorage.setItem('fi-theme', theme);
  }

  applyTheme(localStorage.getItem('fi-theme') || 'dark');

  document.querySelectorAll('.theme-switch-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.t);
      _sageInited     = false;
      _ghostInited    = false;
      _ghostTabInited = {};
      _atlasInited    = false;
      _atlasTabInited = {};
      showView(_currentView);
    });
  });

  /* ── Boot sequence ────────────────────────────────────────────────── */
  initCollegeFilters();
  showView('dashboard');
})();

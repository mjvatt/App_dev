/* app.js — navigation, filters, table, wiring */

(async () => {
  /* ── Load data ────────────────────────────────────────────────────── */
  let _meta;
  try {
    ({ meta: _meta } = await DraftData.load());
  } catch (err) {
    const overlay = document.getElementById('appLoading');
    if (overlay) {
      overlay.innerHTML = `<div class="app-loading-inner">
        <div class="app-loading-text" style="color:#ef4444">Failed to load draft data.</div>
        <div class="app-loading-text" style="font-size:12px">${(err && err.message) || err}</div>
      </div>`;
    }
    throw err;
  }
  const meta = _meta;
  document.getElementById('pickCount').textContent = `${meta.total_picks.toLocaleString()} picks`;
  // Fade out the loading overlay; CSS handles the transition.
  const _appLoading = document.getElementById('appLoading');
  if (_appLoading) {
    _appLoading.classList.add('hide');
    setTimeout(() => _appLoading.remove(), 400);
  }

  /* ── Navigation ───────────────────────────────────────────────────── */
  const VIEW_TITLES = {
    dashboard:  ['Dashboard',        `${meta.years.length} seasons · ${meta.total_picks.toLocaleString()} picks · all NFL teams`],
    draftboard: ['Draft Board',      'Search and filter every pick from 1994–2026'],
    teams:      ['Team Hub',         'Draft history and tendencies by franchise'],
    class2026:  ['2026 Draft Class', 'NFL Draft · April 24–26, 2026'],
    class2027:  ['2027 Draft Class', 'NFL Draft · April – May 2027'],
    positions:  ['Position Trends',  'How position drafting has evolved over 32 years'],
    colleges:   ['College Pipeline', 'Which programs feed the NFL draft'],
    'picks-calc': ['Pick Value Calc', 'Historical expected career AV by pick slot and position'],
    'class-strength': ['Class Strength', 'Realized first-team AV vs slot expectation, by draft year'],
    atlas:      ['ATLAS',            'Advanced Team Legacy Analytics System'],
    sage:       ['SAGE',             'Smart Analytics & Grade Engine'],
    ghost:      ['GHOST',            'Grading Hidden Opportunity & Sleeper Tracker'],
    oracle:     ['ORACLE',           'Optimized Regression & Analytical Championship Learning Engine'],
    playbook:   ['PLAYBOOK',         'Play-call Prediction Engine — multi-task LSTM with EPA head'],
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
    if (id === 'class2027')  initClass2027();
    if (id === 'picks-calc') initPicksCalc();
    if (id === 'class-strength') initClassStrength();
    if (id === 'atlas')      initATLAS();
    if (id === 'positions')  initPositionTrends();
    if (id === 'colleges')   renderCollegePipeline();
    if (id === 'draftboard') renderDraftTable();
    if (id === 'sage')       initSAGE();
    if (id === 'ghost')      initGHOST();
    if (id === 'oracle')     initORACLE();
    if (id === 'playbook')   initPlaybook();
  }

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); showView(el.dataset.view); });
  });

  /* ── Sidebar toggle ───────────────────────────────────────────────── */
  const sidebar = document.getElementById('sidebar');
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });

  /* ── Global player search ─────────────────────────────────────────── */
  const _searchInput   = document.getElementById('globalSearch');
  const _searchResults = document.getElementById('globalSearchResults');
  const _searchWrap    = document.getElementById('globalSearchWrap');
  const SEARCH_LIMIT   = 8;
  let   _searchActive  = -1;
  let   _searchMatches = [];

  function _escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function _hideSearchResults() {
    _searchResults.hidden = true;
    _searchActive = -1;
    _searchInput.setAttribute('aria-expanded', 'false');
  }

  function _renderSearchResults(matches, query) {
    _searchMatches = matches;
    _searchActive  = -1;
    if (!query) { _hideSearchResults(); return; }
    if (!matches.length) {
      _searchResults.innerHTML =
        `<div class="search-results-empty">No players match "${_escapeHtml(query)}"</div>`;
    } else {
      const rows = matches.map((p, i) => `
        <div class="search-result" role="option" data-year="${p.year}" data-pick="${p.pick}" data-idx="${i}" id="search-result-${i}">
          <div class="search-result-name">${_escapeHtml(p.player)}</div>
          <div class="search-result-pick">${p.year} · #${p.pick}</div>
          <div class="search-result-meta">${_escapeHtml(p.pos || p.pos_group || '')} · ${_escapeHtml(p.team)} · ${_escapeHtml(p.college || 'Unknown')}</div>
        </div>`).join('');
      _searchResults.innerHTML = rows +
        `<div class="search-results-hint">↑ ↓ to navigate · Enter to open · Esc to close</div>`;
    }
    _searchResults.hidden = false;
    _searchInput.setAttribute('aria-expanded', 'true');
  }

  function _runSearch(q) {
    if (!q) { _hideSearchResults(); return; }
    const ql   = q.toLowerCase();
    const all  = DraftData.picks();
    const yMin = (meta.years && meta.years.length) ? Math.min(...meta.years) : 1994;
    const out  = [];
    for (let i = 0; i < all.length; i++) {
      const p    = all[i];
      const name = (p.player  || '').toLowerCase();
      const team = (p.team    || '').toLowerCase();
      const coll = (p.college || '').toLowerCase();
      let score  = -1;
      if      (name === ql)              score = 2000;
      else if (name.startsWith(ql))      score = 1200;
      else if (name.includes(' ' + ql))  score = 600;
      else if (name.includes(ql))        score = 300;
      else if (team.includes(ql))        score = 90;
      else if (coll.includes(ql))        score = 70;
      if (score < 0) continue;
      // tie-breakers: more recent year, then earlier pick (more famous)
      score += ((p.year || yMin) - yMin) * 0.5;
      score += Math.max(0, 256 - (p.pick || 256)) * 0.005;
      out.push({ p, score });
    }
    out.sort((a, b) => b.score - a.score);
    _renderSearchResults(out.slice(0, SEARCH_LIMIT).map(s => s.p), q);
  }

  function _setActiveResult(idx) {
    const items = _searchResults.querySelectorAll('.search-result');
    if (!items.length) { _searchActive = -1; return; }
    const next = Math.max(0, Math.min(idx, items.length - 1));
    items.forEach(el => el.classList.remove('active'));
    items[next].classList.add('active');
    items[next].scrollIntoView({ block: 'nearest' });
    _searchInput.setAttribute('aria-activedescendant', `search-result-${next}`);
    _searchActive = next;
  }

  function _openSearchPick(pick) {
    if (!pick) return;
    openPlayerModal(+pick.year, +pick.pick);
    _searchInput.value = '';
    _hideSearchResults();
    _searchInput.removeAttribute('aria-activedescendant');
  }

  _searchInput.addEventListener('input', e => _runSearch(e.target.value.trim()));
  _searchInput.addEventListener('focus', e => {
    const q = e.target.value.trim();
    if (q) _runSearch(q);
  });
  _searchInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      if (_searchResults.hidden) {
        const q = _searchInput.value.trim();
        if (q) _runSearch(q);
        return;
      }
      e.preventDefault();
      _setActiveResult(_searchActive + 1);
    } else if (e.key === 'ArrowUp') {
      if (_searchResults.hidden) return;
      e.preventDefault();
      _setActiveResult(_searchActive - 1);
    } else if (e.key === 'Enter') {
      if (_searchResults.hidden || !_searchMatches.length) return;
      e.preventDefault();
      _openSearchPick(_searchMatches[_searchActive >= 0 ? _searchActive : 0]);
    } else if (e.key === 'Escape') {
      if (_searchResults.hidden) return;
      e.preventDefault();
      _hideSearchResults();
    }
  });

  _searchResults.addEventListener('mousedown', e => {
    // mousedown so the click fires before the input's blur hides the panel
    const item = e.target.closest('.search-result');
    if (!item) return;
    e.preventDefault();
    const idx = +item.dataset.idx;
    _openSearchPick(_searchMatches[idx]);
  });

  document.addEventListener('click', e => {
    if (!_searchWrap.contains(e.target)) _hideSearchResults();
  });

  /* ═══════════════════════════════════════════════════════════════════
     DASHBOARD
  ═══════════════════════════════════════════════════════════════════ */
  function initDashboard() {
    const refreshedSuffix = meta.built_at ? ` · data refreshed ${meta.built_at}` : '';
    document.getElementById('viewSub').textContent =
      `${meta.years.length} seasons · ${meta.total_picks.toLocaleString()} picks · all NFL teams${refreshedSuffix}`;
    document.getElementById('kpi-years').textContent    = meta.years.length;
    document.getElementById('kpi-picks').textContent    = meta.total_picks.toLocaleString();
    document.getElementById('kpi-teams').textContent    = meta.teams.length;
    document.getElementById('kpi-colleges').textContent = meta.colleges.length;

    const ppySub = document.getElementById('dashboard-picksPerYear-sub');
    if (ppySub && meta.years.length) {
      const yMin = Math.min(...meta.years);
      const yMax = Math.max(...meta.years);
      ppySub.textContent = `Total selections across all rounds, ${yMin}–${yMax}`;
    }

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
    tbody.innerHTML = slice.length
      ? slice.map(p => `
        <tr data-year="${p.year}" data-pick="${p.pick}">
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
        </tr>`).join('')
      : `<tr><td colspan="12" class="empty-state">No picks match the current filters.</td></tr>`;

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
    const totalT   = rows.reduce((s, r) => s + (r.t || 0), 0);
    const games    = totalW + totalL + totalT;
    // NFL win pct treats a tie as half a win, half a loss.
    const winPct   = games ? (((totalW + 0.5 * totalT) / games) * 100).toFixed(1) + '%' : '—';
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

    const alloc = DraftData.teamCapAllocation(team, 2025);
    if (alloc) {
      DraftCharts.donut('chart-teamCapAllocation', {
        labels: alloc.labels,
        values: alloc.values,
        colors: alloc.colors,
      }, `$${alloc.totalM}M total`);
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
      document.getElementById('c26-board-body').innerHTML = filtered.length
        ? filtered.map(p => `
          <tr data-year="${p.year}" data-pick="${p.pick}">
            <td>${p.round}</td>
            <td>${p.pick}</td>
            <td>${p.team}</td>
            <td><strong>${p.player}</strong></td>
            <td><span class="pos-pill" style="background:${DraftData.posColor(p.pos_group)}22;color:${DraftData.posColor(p.pos_group)}">${p.pos || '—'}</span></td>
            <td>${p.college}</td>
            <td style="color:var(--text-muted)">${p.pick > 0 ? DraftData.expectedAvForPick(p.pick, p.pos_group).toFixed(1) : '—'}</td>
            <td style="color:var(--text-muted);font-size:12px">${p.notes}</td>
          </tr>`).join('')
        : `<tr><td colspan="8" class="empty-state">No picks match the current filters.</td></tr>`;
    }

    renderBoard();
  }

  /* ═══════════════════════════════════════════════════════════════════
     2027 DRAFT CLASS
  ═══════════════════════════════════════════════════════════════════ */
  let _class2027Inited = false;

  function initClass2027() {
    if (_class2027Inited) return;
    _class2027Inited = true;

    const picks2027 = DraftData.picks({ year: 2027 });

    if (picks2027.length === 0) {
      // Pre-draft: show projected R1 order from 2025 standings
      document.getElementById('c27-predraft').style.display = '';
      document.getElementById('c27-live').style.display     = 'none';

      const rows2025 = DraftData.standings({ year: 2025 })
        .sort((a, b) => a.w - b.w || b.l - a.l);

      // Approximation: non-playoff teams ordered worst-record-first, then
      // playoff teams ordered best-record-last. The actual NFL rule for
      // picks 21-32 is by round of elimination (Wild Card losers, then
      // Divisional, then Conference, then Super Bowl), not regular-season
      // record. We don't have elimination-round data here, so record is
      // used as a stand-in. Tiebreakers (strength of schedule) are also
      // not modeled.
      const nonPlayoff = rows2025.filter(r => !r.playoff);
      const playoff    = rows2025.filter(r =>  r.playoff).reverse();
      const ordered    = [...nonPlayoff, ...playoff];

      document.getElementById('c27-proj-body').innerHTML = ordered.map((r, i) => `
        <tr>
          <td style="color:var(--text-muted);font-weight:600">${i + 1}</td>
          <td><strong>${r.franchise || r.team}</strong></td>
          <td style="color:var(--text-muted)">${r.conf}</td>
          <td style="color:var(--text-muted)">${r.div}</td>
          <td style="font-weight:600">${r.w}</td>
          <td style="color:var(--text-muted)">${r.l}</td>
          <td>${r.playoff
            ? '<span style="color:var(--accent)">Yes</span>'
            : '<span style="color:var(--text-muted)">No</span>'}</td>
          <td style="color:var(--text-muted)">${DraftData.expectedAvForPick(i + 1).toFixed(1)}</td>
        </tr>`).join('');
      return;
    }

    // Post-draft: full view identical to 2026 class
    document.getElementById('c27-predraft').style.display = 'none';
    document.getElementById('c27-live').style.display     = '';

    const r1        = picks2027.filter(p => p.round === 1).length;
    const teamCount = new Set(picks2027.map(p => p.team)).size;
    const colCount  = new Set(picks2027.map(p => p.college).filter(Boolean)).size;

    document.getElementById('c27-kpi-picks').textContent    = picks2027.length;
    document.getElementById('c27-kpi-teams').textContent    = teamCount;
    document.getElementById('c27-kpi-colleges').textContent = colCount;
    document.getElementById('c27-kpi-r1').textContent       = r1;

    DraftCharts.hbar('chart-c27-capital', DraftData.teamCapitalByYear(2027), '#3b82f6', 'Draft Capital Score');
    DraftCharts.donut('chart-c27-pos', DraftData.byPosGroup({ year: 2027 }), 'Picks');

    const ROUNDS = [1, 2, 3, 4, 5, 6, 7];
    DraftCharts.vbar('chart-c27-rounds', {
      labels: ROUNDS.map(r => `R${r}`),
      values: ROUNDS.map(r => picks2027.filter(p => p.round === r).length),
    });

    DraftCharts.hbar('chart-c27-colleges', DraftData.topColleges(20, { year: 2027 }));

    const rndSel  = document.getElementById('c27-rnd');
    const teamSel = document.getElementById('c27-team');
    const search  = document.getElementById('c27-search');

    if (rndSel.options.length === 1) {
      ROUNDS.forEach(r => rndSel.add(new Option(`Round ${r}`, r)));
      [...new Set(picks2027.map(p => p.team).filter(Boolean))].sort()
        .forEach(t => teamSel.add(new Option(t, t)));
      [rndSel, teamSel].forEach(el => el.addEventListener('change', renderBoard27));
      search.addEventListener('input', renderBoard27);
    }

    function renderBoard27() {
      const r = rndSel.value  ? +rndSel.value : 0;
      const t = teamSel.value || '';
      const q = search.value.trim().toLowerCase();
      const filtered = picks2027.filter(p =>
        (!r || p.round === r) &&
        (!t || p.team  === t) &&
        (!q || p.player.toLowerCase().includes(q) || p.college.toLowerCase().includes(q))
      );
      document.getElementById('c27-board-count').textContent =
        `${filtered.length.toLocaleString()} pick${filtered.length !== 1 ? 's' : ''}`;
      document.getElementById('c27-board-body').innerHTML = filtered.length
        ? filtered.map(p => `
          <tr data-year="${p.year}" data-pick="${p.pick}">
            <td>${p.round}</td>
            <td>${p.pick}</td>
            <td>${p.team}</td>
            <td><strong>${p.player}</strong></td>
            <td><span class="pos-pill" style="background:${DraftData.posColor(p.pos_group)}22;color:${DraftData.posColor(p.pos_group)}">${p.pos || '—'}</span></td>
            <td>${p.college}</td>
            <td style="color:var(--text-muted)">${p.pick > 0 ? DraftData.expectedAvForPick(p.pick, p.pos_group).toFixed(1) : '—'}</td>
            <td style="color:var(--text-muted);font-size:12px">${p.notes}</td>
          </tr>`).join('')
        : `<tr><td colspan="8" class="empty-state">No picks match the current filters.</td></tr>`;
    }

    renderBoard27();
  }

  /* ═══════════════════════════════════════════════════════════════════
     PICK VALUE CALCULATOR
  ═══════════════════════════════════════════════════════════════════ */
  let _picksCalcWired = false;
  function initPicksCalc() {
    const pickInput = document.getElementById('pc-pick');
    const prevBtn   = document.getElementById('pc-prev');
    const nextBtn   = document.getElementById('pc-next');
    if (!pickInput) return;

    if (!_picksCalcWired) {
      _picksCalcWired = true;
      pickInput.addEventListener('input',  renderPicksCalc);
      pickInput.addEventListener('change', renderPicksCalc);
      prevBtn.addEventListener('click', () => {
        const v = Math.max(1, (+pickInput.value || 1) - 1);
        pickInput.value = String(v);
        renderPicksCalc();
      });
      nextBtn.addEventListener('click', () => {
        const v = Math.min(256, (+pickInput.value || 1) + 1);
        pickInput.value = String(v);
        renderPicksCalc();
      });
    }
    renderPicksCalc();
  }

  function renderPicksCalc() {
    const pickInput = document.getElementById('pc-pick');
    let pickNum = Math.max(1, Math.min(256, +pickInput.value || 1));
    pickInput.value = String(pickNum);

    const POS = ['QB','RB','WR','TE','OL','DL','LB','DB','ST'];

    const pooledExp = DraftData.expectedAvForPick(pickNum);
    const pickValue = +(100 * Math.pow(pickNum, -0.66)).toFixed(1);

    // Approximate round (32 picks per round, post-1994 — close enough; some
    // years had compensatory variation but this is the conventional split).
    const round = Math.min(7, Math.ceil(pickNum / 32));

    // KPI strip — single source of truth
    const kpis = [
      { label: 'Pick #',                 val: pickNum,           accent: 'var(--text)' },
      { label: 'Round',                  val: round,             accent: 'var(--text-muted)' },
      { label: 'Power-law value',        val: pickValue,         accent: 'var(--accent)' },
      { label: 'Expected career AV',     val: pooledExp.toFixed(1), accent: 'var(--sage)' },
    ];
    document.getElementById('pc-kpis').innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-body">
          <span class="kpi-value" style="color:${k.accent}">${k.val}</span>
          <span class="kpi-label">${k.label}</span>
        </div>
      </div>`).join('');

    // Plain summary text — context for the slot
    document.getElementById('pc-summary').innerHTML = `
      <div style="font-size:13px;color:var(--text-sub);max-width:680px;line-height:1.6">
        <strong style="color:var(--text)">Pick #${pickNum}</strong> sits in
        <strong style="color:var(--text)">round ${round}</strong>. The power-law value
        is <strong style="color:var(--accent)">${pickValue}</strong> (relative to pick #1 = 100).
        Historical drafts (1994–2021) returned an average career AV of
        <strong style="color:var(--sage)">${pooledExp.toFixed(1)}</strong> at this slot pooled across positions.
        See the per-position breakdown below for how the expectation shifts by role.
      </div>`;

    // Per-position expected AV table
    const rows = POS.map(g => {
      const exp = DraftData.expectedAvForPick(pickNum, g);
      const delta = +(exp - pooledExp).toFixed(1);
      return { g, exp, delta };
    }).sort((a, b) => b.exp - a.exp);

    document.getElementById('pc-pos-table').innerHTML = `
      <div class="profile-av-bars">
        ${rows.map(r => {
          const max = Math.max(...rows.map(x => x.exp), 1);
          const pct = Math.round((r.exp / max) * 100);
          const sign = r.delta >= 0 ? '+' : '';
          const deltaColor = r.delta >= 0 ? 'var(--sage)' : '#ef4444';
          return `
            <div class="profile-av-bar-row">
              <span class="profile-av-bar-label" style="color:${DraftData.posColor(r.g)};font-weight:700">${r.g}</span>
              <div class="profile-av-bar-track">
                <div class="profile-av-bar-fill" style="width:${pct}%;background:${DraftData.posColor(r.g)}"></div>
              </div>
              <span class="profile-av-bar-val" style="min-width:80px">${r.exp.toFixed(1)} <span style="color:${deltaColor};font-weight:500;font-size:11px">${sign}${r.delta}</span></span>
            </div>`;
        }).join('')}
      </div>`;

    // Historical picks made at this exact slot
    document.getElementById('pc-picknum-label').textContent = String(pickNum);
    const history = DraftData.picks({})
      .filter(p => p.pick === pickNum && p.year >= 1994)
      .sort((a, b) => b.year - a.year);
    if (!history.length) {
      document.getElementById('pc-history-body').innerHTML =
        `<tr><td colspan="7" class="empty-state">No historical picks at this slot.</td></tr>`;
      return;
    }
    document.getElementById('pc-history-body').innerHTML = history.map(p => {
      const exp = DraftData.expectedAvForPick(p.pick, p.pos_group);
      const surplus = p.year <= 2021 ? +(p.career_av - exp).toFixed(1) : null;
      const surplusCell = surplus === null
        ? `<td style="text-align:right;color:var(--text-muted);font-size:11px">—</td>`
        : `<td style="text-align:right;color:${surplus >= 0 ? 'var(--sage)' : '#ef4444'}">${surplus >= 0 ? '+' : ''}${surplus}</td>`;
      return `
        <tr data-year="${p.year}" data-pick="${p.pick}">
          <td>${p.year}</td>
          <td>${p.team}</td>
          <td><strong>${p.player || '—'}</strong></td>
          <td><span class="pos-pill" style="background:${DraftData.posColor(p.pos_group)}22;color:${DraftData.posColor(p.pos_group)}">${p.pos || '—'}</span></td>
          <td>${p.college || '—'}</td>
          <td style="text-align:right">${p.career_av || '—'}</td>
          ${surplusCell}
        </tr>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════════════════════════════
     CLASS STRENGTH
  ═══════════════════════════════════════════════════════════════════ */
  let _csInited      = false;
  let _csSortCol     = 'surplusPerPick';
  let _csSortDir     = -1;  // -1 = desc by default
  let _csMetric      = 'surplusPerPick';
  let _csData        = null;

  function initClassStrength() {
    _csData = DraftData.draftClassStrength();

    const complete = _csData.filter(d => !d.incomplete && d.picks > 0);
    const ranked   = complete.slice().sort((a, b) => b.surplusPerPick - a.surplusPerPick);
    const best     = ranked[0];
    const worst    = ranked[ranked.length - 1];
    const meanPP   = complete.length
      ? +(complete.reduce((s, d) => s + d.surplusPerPick, 0) / complete.length).toFixed(2)
      : 0;

    const fmtSurplus = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
    const kpis = [
      { icon: 'fa-trophy',        label: 'Best class',   value: best  ? best.year  : '—',
        sub: best  ? `${fmtSurplus(best.surplusPerPick)} per pick`  : '' },
      { icon: 'fa-arrow-down',    label: 'Weakest class',value: worst ? worst.year : '—',
        sub: worst ? `${fmtSurplus(worst.surplusPerPick)} per pick` : '' },
      { icon: 'fa-chart-line',    label: 'Mean per-pick surplus',
        value: fmtSurplus(meanPP),
        sub: `across ${complete.length} complete classes` },
      { icon: 'fa-clock-rotate-left', label: 'Incomplete classes',
        value: _csData.filter(d => d.incomplete).length,
        sub: 'careers still accumulating' },
    ];
    document.getElementById('cs-kpis').innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-icon"><i class="fas ${k.icon}"></i></div>
        <div class="kpi-body">
          <span class="kpi-value">${k.value}</span>
          <span class="kpi-label">${k.label}</span>
          ${k.sub ? `<span class="kpi-label" style="font-size:11px;opacity:0.7">${k.sub}</span>` : ''}
        </div>
      </div>`).join('');

    if (!_csInited) {
      document.getElementById('cs-metric').addEventListener('change', e => {
        _csMetric = e.target.value;
        renderClassStrength();
      });
      document.querySelectorAll('#cs-table th[data-cs-sort]').forEach(th => {
        th.addEventListener('click', () => {
          const col = th.dataset.csSort;
          if (_csSortCol === col) _csSortDir *= -1;
          else { _csSortCol = col; _csSortDir = (col === 'year' ? 1 : -1); }
          document.querySelectorAll('#cs-table th').forEach(h => {
            h.classList.remove('sort-asc','sort-desc');
            const i = h.querySelector('i'); if (i) i.className = 'fas fa-sort';
          });
          th.classList.add(_csSortDir === 1 ? 'sort-asc' : 'sort-desc');
          const i = th.querySelector('i');
          if (i) i.className = `fas fa-sort-${_csSortDir === 1 ? 'up' : 'down'}`;
          renderClassStrengthTable();
        });
      });
      _csInited = true;
    }

    renderClassStrength();
  }

  function renderClassStrength() {
    const sorted = _csData.slice().sort((a, b) => a.year - b.year);
    DraftCharts.classStrengthBar('chart-classStrength', sorted, _csMetric);
    renderClassStrengthTable();
  }

  function renderClassStrengthTable() {
    const rows = _csData.slice().sort((a, b) => {
      const av = a[_csSortCol];
      const bv = b[_csSortCol];
      if (av < bv) return -_csSortDir;
      if (av > bv) return  _csSortDir;
      return a.year - b.year;
    });
    const tbody = document.getElementById('cs-table-body');
    tbody.innerHTML = rows.map(d => {
      const sp = d.surplusPerPick;
      const st = d.surplusTotal;
      const spColor = d.incomplete ? 'var(--text-muted)'
                    : sp >= 0      ? '#10b981' : '#ef4444';
      const stColor = d.incomplete ? 'var(--text-muted)'
                    : st >= 0      ? '#10b981' : '#ef4444';
      const bestCell = d.best
        ? `<a href="#" class="cs-best-link" data-year="${d.year}" data-pick="${d.best.pick}" style="color:var(--text);text-decoration:none">
             <strong>${_escapeHtml(d.best.player)}</strong>
             <span style="color:var(--text-muted);font-size:11px"> · #${d.best.pick} · ${_escapeHtml(d.best.team)} · ${d.best.career_av} AV</span>
           </a>`
        : '<span style="color:var(--text-muted)">—</span>';
      const yearCell = `<a href="#" class="cs-year-link" data-year="${d.year}" style="color:var(--text);text-decoration:none">
                          ${d.year}${d.incomplete ? ' <span style="color:var(--text-muted);font-size:10px">(incomplete)</span>' : ''}
                        </a>`;
      return `<tr>
        <td>${yearCell}</td>
        <td style="text-align:right">${d.picks}</td>
        <td style="text-align:right">${d.totalDraftAV.toLocaleString()}</td>
        <td style="text-align:right">${d.expectedAV.toLocaleString()}</td>
        <td style="text-align:right;color:${stColor};font-weight:600">${st >= 0 ? '+' : ''}${st.toFixed(0)}</td>
        <td style="text-align:right;color:${spColor};font-weight:600">${sp >= 0 ? '+' : ''}${sp.toFixed(2)}</td>
        <td>${bestCell}</td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.cs-year-link').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        showView('draftboard');
        document.getElementById('db-year').value = el.dataset.year;
        _currentPage = 1;
        filterAndRender();
      });
    });
    tbody.querySelectorAll('.cs-best-link').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        openPlayerModal(+el.dataset.year, +el.dataset.pick);
      });
    });
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
    const dwPos   = document.getElementById('atlas-dw-pos');

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
      [dwYfrom, dwYto, dwPos].forEach(el => el.addEventListener('change', () => {
        _atlasTabInited['draft-wins'] = false;
        renderDraftWins();
        _atlasTabInited['draft-wins'] = true;
      }));
    }

    function renderDraftWins() {
      const [lagFrom, lagTo] = (dwLag.value || '3|5').split('|').map(Number);
      const pos = dwPos && dwPos.value ? dwPos.value : null;
      const data = DraftData.leagueDraftToWins(+dwYfrom.value, +dwYto.value, lagFrom, lagTo, pos);
      const lagLabel = lagFrom === lagTo ? `Y+${lagFrom}` : `Y+${lagFrom}–Y+${lagTo}`;
      const posLabel = pos ? `${pos} only` : 'all positions';
      document.getElementById('atlas-dw-r2').textContent =
        `R² = ${data.r2}  ·  lag ${lagLabel}  ·  ${posLabel}  ·  n=${data.points.length}`;
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

    const bbYfrom = document.getElementById('atlas-bb-yfrom');
    const bbYto   = document.getElementById('atlas-bb-yto');

    if (bbYfrom.options.length === 0) {
      meta.years.filter(y => y <= 2025).forEach(y => {
        bbYfrom.add(new Option(y, y));
        bbYto.add(new Option(y, y));
      });
      bbYfrom.value = String(meta.years[0]);
      bbYto.value   = '2025';
      [bbYfrom, bbYto].forEach(el => el.addEventListener('change', () => {
        _atlasTabInited.variance = false;
        renderBoomBust();
        _atlasTabInited.variance = true;
      }));
    }

    function renderBoomBust() {
      const stats  = DraftData.boomBustStats(+bbYfrom.value, +bbYto.value);
      const median = stats[Math.floor(stats.length / 2)]?.stdDev ?? 0;
      DraftCharts.boomBustScatter('chart-atlas-bb-scatter', stats);
      DraftCharts.atlasLeaderboard('chart-atlas-bb-rank', {
        labels: stats.map(s => s.franchise),
        values: stats.map(s => s.stdDev),
        colors: stats.map(s =>
          s.stdDev >= median ? 'rgba(139,92,246,0.70)' : 'rgba(107,114,128,0.45)'
        ),
        xMin:   0,
        xLabel: 'Win Std Dev',
        meta: stats.map(s => ({
          avgWins:  s.avgWins,
          maxWin:   s.maxWin,
          minWin:   s.minWin,
          avgSwing: s.avgSwing,
          maxSwing: s.maxSwing,
          seasons:  s.seasons,
        })),
      });
    }

    const ATLAS_RENDERS = {
      dynasty:      renderDynastyIndex,
      trajectories: renderTrajectories,
      'draft-wins': renderDraftWins,
      era:          renderEraRankings,
      variance:     renderBoomBust,
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
  let _oracleInited    = false;
  let _playbookInited  = false;
  let _playbookBlob    = null;
  let _playbookCharts  = {};

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
      const slotCurvesBtn  = document.getElementById('slot-grade-curves-toggle');
      let _showPosCurves   = false;

      function renderSlotGrade() {
        const filter = {
          yearFrom:  +slotYfrom.value || undefined,
          yearTo:    +slotYto.value   || undefined,
          pos_group: slotPos.value    || undefined,
        };
        const groups = slotPos.value ? [slotPos.value] : ALL_POS_GROUPS;
        const data   = DraftData.slotGradeScatter(filter);
        // Position-curve overlay only applies when no specific position is filtered.
        if (slotPos.value || !_showPosCurves) data.curvesByPos = null;
        DraftCharts.slotGradeChart('chart-slotGrade', data, groups);

        // Toggle button reflects state + disables when a single position is filtered
        if (slotCurvesBtn) {
          slotCurvesBtn.disabled = !!slotPos.value;
          slotCurvesBtn.textContent = _showPosCurves
            ? 'Hide position curves'
            : 'Show position curves';
          slotCurvesBtn.classList.toggle('active', _showPosCurves && !slotPos.value);
        }
      }

      [slotYfrom, slotYto, slotPos].forEach(el => el.addEventListener('change', renderSlotGrade));
      if (slotCurvesBtn) slotCurvesBtn.addEventListener('click', () => {
        _showPosCurves = !_showPosCurves;
        renderSlotGrade();
      });
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

      /* Resolve an asset to {label, careerAV} given the year+pick the asset
         identifies. Returns null when the pick can't be resolved (future
         draft, missing year, etc.). */
      function _resolveAsset(asset) {
        if (asset.type === 'player') return { label: asset.player, careerAV: null };
        if (!asset.pick || !asset.pick_season) return null;
        const p = DraftData.picks({})
          .find(pk => pk.year === +asset.pick_season && pk.pick === +asset.pick);
        if (!p) return null;
        return {
          label: p.player,
          year: p.year,
          pick: p.pick,
          pos: p.pos,
          posGroup: p.pos_group,
          college: p.college,
          careerAV: p.career_av || 0,
          incomplete: p.year >= 2022,
        };
      }

      function _tradeDetailHtml(trade, tA, tB, aAssets, bAssets) {
        const renderSide = (team, assets) => {
          let avTotal = 0, anyIncomplete = false, anyUnresolved = false;
          const rows = assets.map(a => {
            const r = _resolveAsset(a);
            if (!r) { anyUnresolved = true;
              const lbl = a.type === 'player'
                ? a.player
                : `${a.pick_season || trade.season} R${a.round}${a.pick ? ' #'+a.pick : ''}${a.cond ? '?' : ''}`;
              return `<div class="trade-detail-row">
                <span class="trade-detail-pick">${lbl}</span>
                <span class="trade-detail-meta" style="color:var(--text-muted)">unresolved</span>
              </div>`;
            }
            if (r.careerAV !== null) avTotal += r.careerAV;
            if (r.incomplete) anyIncomplete = true;
            if (a.type === 'player') {
              return `<div class="trade-detail-row">
                <span class="trade-detail-pick">Player</span>
                <strong>${r.label}</strong>
              </div>`;
            }
            return `<div class="trade-detail-row" data-year="${r.year}" data-pick="${r.pick}">
              <span class="trade-detail-pick">${r.year} #${r.pick}</span>
              <strong>${r.label || '—'}</strong>
              <span class="trade-detail-meta">${r.pos || '—'} · ${r.college || ''}</span>
              <span class="trade-detail-av">${r.careerAV} AV${r.incomplete ? '*' : ''}</span>
            </div>`;
          }).join('');
          return { html: `
            <div class="trade-detail-side">
              <div class="trade-detail-team">${team} got</div>
              ${rows}
              <div class="trade-detail-total">Total career AV: <strong>${avTotal}${anyIncomplete ? '*' : ''}</strong></div>
            </div>`, avTotal, anyIncomplete, anyUnresolved };
        };
        // Side A "got" the assets they received (i.e., assets where to=A)
        const aGot = trade.assets.filter(x => x.to === tA);
        const bGot = trade.assets.filter(x => x.to === tB);
        const aSide = renderSide(tA, aGot);
        const bSide = renderSide(tB, bGot);

        const avDiff = +(aSide.avTotal - bSide.avTotal).toFixed(0);
        const anyIncomplete = aSide.anyIncomplete || bSide.anyIncomplete;
        const anyUnresolved = aSide.anyUnresolved || bSide.anyUnresolved;
        let winnerLabel;
        if (anyUnresolved) {
          winnerLabel = '<span class="trade-detail-winner-tag none">Career AV: incomplete</span>';
        } else if (Math.abs(avDiff) <= 5) {
          winnerLabel = `<span class="trade-detail-winner-tag even">Career AV: roughly even (Δ ${Math.abs(avDiff)})</span>`;
        } else {
          const winner = avDiff > 0 ? tA : tB;
          winnerLabel = `<span class="trade-detail-winner-tag">Career AV winner: <strong>${winner}</strong> (+${Math.abs(avDiff)})</span>`;
        }

        return `<div class="trade-detail">
          <div class="trade-detail-grid">${aSide.html}${bSide.html}</div>
          <div class="trade-detail-footer">
            ${winnerLabel}
            ${anyIncomplete ? '<span class="trade-detail-meta">* career still in progress (drafted 2022+)</span>' : ''}
          </div>
        </div>`;
      }

      function renderTradeCards(trades) {
        const list = document.getElementById('trade-list');
        if (!trades.length) {
          list.innerHTML = '<div class="trade-empty">No pick trades found for this year.</div>';
          return;
        }

        // Cache trades on the list element so the click handler can look them up.
        list._trades = trades;

        const html = trades.map((trade, idx) => {
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

          return `<div class="trade-card" data-trade-idx="${idx}">
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

        // Wire click handlers once via delegation.
        if (!list._wired) {
          list._wired = true;
          list.addEventListener('click', e => {
            // Resolved-pick row: open player modal.
            const detailRow = e.target.closest('.trade-detail-row[data-year]');
            if (detailRow) {
              const y = +detailRow.dataset.year;
              const pk = +detailRow.dataset.pick;
              if (y && pk) openPlayerModal(y, pk);
              return;
            }
            const card = e.target.closest('.trade-card');
            if (!card) return;
            const idx = +card.dataset.tradeIdx;
            const trade = list._trades[idx];
            if (!trade) return;

            // Toggle: if this card is already expanded, collapse it.
            const existing = card.nextElementSibling;
            if (existing && existing.classList && existing.classList.contains('trade-detail')) {
              existing.remove();
              card.classList.remove('expanded');
              return;
            }
            // Collapse any other expanded detail first.
            list.querySelectorAll('.trade-detail').forEach(d => d.remove());
            list.querySelectorAll('.trade-card.expanded').forEach(c => c.classList.remove('expanded'));

            const teams = [...new Set(trade.assets.flatMap(a => [a.frm, a.to]))];
            if (teams.length !== 2) return;
            const [tA, tB] = teams;
            const aAssets = trade.assets.filter(a => a.frm === tA);
            const bAssets = trade.assets.filter(a => a.frm === tB);
            card.insertAdjacentHTML('afterend', _tradeDetailHtml(trade, tA, tB, aAssets, bAssets));
            card.classList.add('expanded');
          });
        }
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

      const caveatEl = document.getElementById('ghost-ml-caveat');
      if (caveatEl) {
        const yfrom = +mlYfrom.value;
        const yto   = +mlYto.value;
        caveatEl.hidden = !(yfrom <= 2026 && yto >= 2026);
      }
      const mode   = mlMode.value;
      const result = DraftData.sleeperModelRankings(filter, 30, mode);

      const subtitleEl = document.getElementById('ghost-ml-subtitle');
      if (subtitleEl && result.modelMeta) {
        const m      = result.modelMeta;
        const auc    = m.cv_auc_mean;
        const ntrain = m.n_train;
        const thresh = m.hit_threshold;
        const hr     = m.hit_rate;
        if (auc !== undefined) {
          subtitleEl.textContent =
            `Picks ranked by predicted hit probability · GBR classifier · `
            + `trained on ${ntrain ? ntrain.toLocaleString() : '?'} picks `
            + `(${m.train_from}–${m.train_cutoff}) · `
            + `hit = career AV surplus > ${thresh} (base rate ${(hr * 100).toFixed(1)}%) · `
            + `held-out CV AUC = ${auc.toFixed(3)} · top 30`;
        }
      }

      const rankLabel = mode === 'surprise' ? 'Hit Surprise (actual − predicted)'
                      : mode === 'busts'    ? 'Bust Margin (predicted − actual)'
                      : 'Predicted Hit Probability';
      const xLabel    = mode === 'surprise' ? 'Completed picks: actual hit (1/0) minus predicted probability — high = model under-rated this hit'
                      : mode === 'busts'    ? 'Completed picks: predicted probability minus actual hit (1/0) — high = model over-rated this miss'
                      : 'Probability of exceeding slot expectation by the hit threshold';

      DraftCharts.ghostLeaderboard('chart-mlRankings', {
        labels:      result.picks.map(p => `${p.player} (${p.year})`),
        values:      result.picks.map(p => p.displayScore),
        colors:      result.picks.map(p => DraftData.posColorAlpha(p.pos_group, 0.75)),
        metricLabel: rankLabel,
        xLabel,
        meta:        result.picks.map(p => ({
          team:             p.team,
          year:             p.year,
          pos:              p.pos,
          round:            p.round,
          pick:             p.pick,
          college:          p.college,
          draft_av:         p.draft_av,
          career_av:        p.career_av,
          pro_bowls:        p.pro_bowls,
          predicted_prob:   p.predicted_prob,
          actual_surplus:   p.actual_surplus,
          actual_hit:       p.actual_hit,
          incomplete:       p.incomplete,
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

      _renderGhostDiagnostics();
    }

    /* Mann-Whitney AUC with average-rank tie handling.
       scores: array of numbers; labels: array of 0/1 (must match length).
       Returns null if either class is empty. */
    function _rocAuc(scores, labels) {
      const pairs = scores
        .map((s, i) => ({s, l: labels[i]}))
        .filter(p => p.l === 0 || p.l === 1)
        .sort((a, b) => a.s - b.s);
      const n = pairs.length;
      const pos = pairs.reduce((c, p) => c + p.l, 0);
      const neg = n - pos;
      if (pos === 0 || neg === 0) return null;
      let sumPosRanks = 0, i = 0;
      while (i < n) {
        let j = i;
        while (j < n && pairs[j].s === pairs[i].s) j++;
        const avgRank = (i + 1 + j) / 2;  // 1-indexed average of ranks i+1..j
        for (let k = i; k < j; k++) if (pairs[k].l === 1) sumPosRanks += avgRank;
        i = j;
      }
      return (sumPosRanks - pos * (pos + 1) / 2) / (pos * neg);
    }

    /* Compute and render per-position AUC + calibration from the predictions
       JSON. Runs once per GHOST init (data doesn't change unless the model
       is retrained, in which case the engine reloads). */
    let _diagnosticsRendered = false;
    function _renderGhostDiagnostics() {
      if (_diagnosticsRendered) return;
      _diagnosticsRendered = true;

      const all = (DraftData.getSleeperPredictions() || []).filter(p =>
        !p.incomplete && (p.actual_hit === true || p.actual_hit === false)
      );
      if (!all.length) return;

      // Per-position AUC
      const POS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];
      const aucs = POS.map(g => {
        const subset = all.filter(p => p.pos_group === g);
        return { pos: g, n: subset.length, auc: _rocAuc(
          subset.map(p => p.predicted_prob),
          subset.map(p => p.actual_hit ? 1 : 0),
        )};
      }).filter(r => r.auc !== null);
      // Sort highest AUC first; color positions where AUC < 0.55 muted.
      aucs.sort((a, b) => b.auc - a.auc);
      DraftCharts.hbar(
        'chart-mlAucByPos',
        {
          labels: aucs.map(r => `${r.pos} (n=${r.n})`),
          values: aucs.map(r => +r.auc.toFixed(3)),
        },
        aucs.map(r => r.auc >= 0.65 ? 'rgba(16,185,129,0.85)'
                    : r.auc >= 0.55 ? 'rgba(139,92,246,0.75)'
                    : 'rgba(107,114,128,0.55)'),
        'AUC',
      );

      // Calibration bins: 10 equal-width predicted_prob buckets.
      // Compute once for "all" + once per position group; cache in a closure
      // so the dropdown can re-render instantly without recomputing.
      const NBINS = 10;
      const _calibrationBins = subset => {
        const buckets = Array.from({length: NBINS}, () => ({sum: 0, hits: 0, n: 0}));
        subset.forEach(p => {
          const i = Math.min(NBINS - 1, Math.max(0, Math.floor(p.predicted_prob * NBINS)));
          buckets[i].sum  += p.predicted_prob;
          buckets[i].hits += p.actual_hit ? 1 : 0;
          buckets[i].n++;
        });
        return buckets
          .map(b => b.n > 0 ? {predMean: b.sum / b.n, actualRate: b.hits / b.n, n: b.n} : null)
          .filter(Boolean);
      };

      const binsByPos = { '': _calibrationBins(all) };
      POS.forEach(g => {
        const subset = all.filter(p => p.pos_group === g);
        if (subset.length >= 30) binsByPos[g] = _calibrationBins(subset);
      });

      const calSel = document.getElementById('ghost-cal-pos');
      const calSub = document.getElementById('ghost-cal-sub');
      const renderCal = () => {
        const pos  = calSel ? calSel.value : '';
        const bins = binsByPos[pos] || binsByPos[''];
        const n    = pos ? all.filter(p => p.pos_group === pos).length : all.length;
        DraftCharts.calibrationPlot('chart-mlCalibration', bins);
        if (calSub) {
          const where = pos ? `${pos} only · n=${n}` : `all positions · n=${n}`;
          calSub.textContent =
            `Predicted hit probability vs actual hit rate (${where}). `
            + `Diagonal = perfectly calibrated; below = under-confident, above = over-confident. `
            + `Bubble size ∝ √n.`;
        }
      };
      if (calSel) {
        calSel.addEventListener('change', renderCal);
        // Disable options where there's not enough data (n < 30).
        Array.from(calSel.options).forEach(opt => {
          if (opt.value && !(opt.value in binsByPos)) {
            opt.disabled = true;
            opt.text += ' (low n)';
          }
        });
      }
      renderCal();
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

  /* ═══════════════════════════════════════════════════════════════════
     ORACLE
  ═══════════════════════════════════════════════════════════════════ */
  async function initORACLE() {
    if (_oracleInited) return;
    _oracleInited = true;

    await DraftData.loadOraclePredictions();
    const data = DraftData.oracleData();
    if (!data || !data.forecast.length) return;

    const { forecast, backtest, importances, meta } = data;

    document.getElementById('oracle-r2').textContent      = meta.cv_r2_mean.toFixed(3);
    document.getElementById('oracle-n-train').textContent = meta.n_train.toLocaleString();
    const r2CalEl = document.getElementById('oracle-r2-cal');
    if (r2CalEl && meta.cv_r2_calibrated !== undefined) {
      r2CalEl.textContent = meta.cv_r2_calibrated.toFixed(3);
    }

    // ── Tab 1: Forecast bar chart + filter buttons ───────────────────
    const AFC_COLOR = '#3b82f6';
    const NFC_COLOR = '#ef4444';

    function renderForecast(subset) {
      const n    = subset.length;
      const wrap = document.getElementById('oracle-forecast-wrap');
      wrap.style.height = Math.max(200, Math.min(520, n * 22 + 60)) + 'px';

      const colors = subset.map(r => (r.conf === 'AFC' ? AFC_COLOR : NFC_COLOR) + 'cc');
      const labels = subset.map(r => r.made_playoffs ? `${r.franchise} ★` : r.franchise);

      DraftCharts.hbar(
        'chart-oracle-forecast',
        { labels, values: subset.map(r => r.predicted_wins) },
        colors,
        'Predicted Wins',
      );

      document.getElementById('oracle-forecast-body').innerHTML = subset.map((r, i) => `
        <tr>
          <td style="color:var(--text-muted)">${i + 1}</td>
          <td><strong>${r.franchise}</strong></td>
          <td><span style="color:${r.conf === 'AFC' ? AFC_COLOR : NFC_COLOR};font-weight:600;font-size:12px">${r.conf}</span></td>
          <td style="font-weight:600;color:var(--oracle)">${r.predicted_wins}</td>
          <td>${r.prior_wins}</td>
          <td>${r.made_playoffs ? '<span style="color:var(--accent)">Yes</span>' : '<span style="color:var(--text-muted)">No</span>'}</td>
          <td style="color:${r.point_diff_pg >= 0 ? '#10b981' : '#ef4444'}">${r.point_diff_pg >= 0 ? '+' : ''}${r.point_diff_pg.toFixed(2)}</td>
          <td style="color:var(--text-sub)">${r.draft_capital.toFixed(1)}</td>
          <td style="color:var(--text-sub)">${r.cap_space_m != null ? r.cap_space_m.toFixed(1) : '—'}</td>
        </tr>`).join('');
    }

    renderForecast(forecast);

    const filterBtns = document.querySelectorAll('.oracle-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const conf = btn.dataset.conf;
        const div  = btn.dataset.div;
        const label = btn.textContent.trim();
        const subset = forecast.filter(r =>
          (!conf || r.conf === conf) &&
          (!div  || r.div  === div)
        );
        const titleSuffix = conf && div
          ? label
          : conf
            ? `${conf} (${subset.length} team${subset.length !== 1 ? 's' : ''})`
            : `All ${subset.length} Franchises`;
        document.getElementById('oracle-forecast-title').textContent =
          `2026 Win Projections — ${titleSuffix}`;
        renderForecast(subset);
      });
    });

    // ── Tab 2: Backtest ──────────────────────────────────────────────
    DraftCharts.oracleBacktestScatter('chart-oracle-backtest', backtest);

    const teamSel = document.getElementById('oracle-team-sel');
    if (teamSel.options.length === 1) {
      [...new Set(backtest.map(r => r.franchise))].sort()
        .forEach(t => teamSel.add(new Option(t, t)));
      teamSel.addEventListener('change', () => {
        if (teamSel.value) DraftCharts.oracleTeamLine('chart-oracle-team-line', teamSel.value, backtest);
      });
    }

    // Error distribution bar
    const BUCKETS = [1, 2, 3, 4, 5];
    const counts  = BUCKETS.map(b => backtest.filter(r => Math.abs(r.error) <= b).length);
    const pcts    = counts.map(c => +((c / backtest.length) * 100).toFixed(1));
    DraftCharts.vbar('chart-oracle-error-dist', {
      labels: BUCKETS.map(b => `≤${b}W`),
      values: pcts,
      colors: ['#10b981cc', '#22c55ecc', '#f59e0bcc', '#f97316cc', '#ef4444cc'],
    });

    // ── Tab 3: Drivers ───────────────────────────────────────────────
    DraftCharts.hbar(
      'chart-oracle-importance',
      { labels: importances.map(f => f.feature), values: importances.map(f => f.importance) },
      '#f97316',
      'Importance',
    );

    const r2Cal = meta.cv_r2_calibrated;
    document.getElementById('oracle-model-notes').innerHTML = `
      <p><strong style="color:var(--text)">What this model does well:</strong> weights point differential as a better signal of true team quality than raw wins, incorporates draft capital as a forward-looking roster investment signal, and uses prior-year cap space as a measure of roster-building flexibility. Predictions are spread-calibrated (factor ${meta.spread_factor ?? '—'}) so the forecast distribution matches historical win variance rather than compressing toward the mean.</p>
      <p style="margin-top:10px"><strong style="color:var(--text)">How to read the two R² values:</strong> the <em>signal</em> R² (${meta.cv_r2_mean}) measures the rank/direction quality of the raw GBR predictions on held-out folds — useful for ordering teams. The <em>calibrated</em> R² (${r2Cal ?? '—'}) measures the absolute accuracy of the spread-calibrated predictions actually displayed. Calibration deliberately amplifies deviation from the mean to make the forecast visually realistic, which trades MSE accuracy for distributional realism. A negative calibrated R² is expected when the underlying signal is weak: a flat "everyone wins 8.5" prediction would score zero, and amplifying weak signal overshoots more often than not.</p>
      <p style="margin-top:10px"><strong style="color:var(--text)">Limitations:</strong> NFL year-over-year prediction is inherently noisy — coaching changes, injuries, and free agency are not modeled. Individual predictions carry ±4–5 wins of real-world uncertainty. Cap space data is available from 2013 onward; earlier seasons use a neutral fill. Treat the forecast as a probability-weighted central estimate of team strength ordering, not a precise win projection.</p>
      <p style="margin-top:10px"><strong style="color:var(--text)">Training data:</strong> ${meta.n_train.toLocaleString()} franchise-seasons, ${meta.train_from}–${meta.train_to}. Cap space feature: Spotrac, 2013–2025.</p>`;

    // ── Tab activation ───────────────────────────────────────────────
    function activateOracleTab(id) {
      document.querySelectorAll('[data-oracle-tab]').forEach(t =>
        t.classList.toggle('active', t.dataset.oracleTab === id)
      );
      document.querySelectorAll('[data-oracle-panel]').forEach(p =>
        p.classList.toggle('active', p.dataset.oraclePanel === id)
      );
    }

    document.querySelectorAll('[data-oracle-tab]').forEach(tab => {
      tab.addEventListener('click', () => activateOracleTab(tab.dataset.oracleTab));
    });

    activateOracleTab('forecast');
  }

  /* ── Player Profile Modal ────────────────────────────────────────── */
  const playerModal      = document.getElementById('playerModal');
  const playerModalClose = document.getElementById('playerModalClose');
  let _modalOpenerEl     = null;  // element to restore focus to on close
  let _suppressUrlPush   = false; // set during popstate / initial deep-link
  let _modalPrimaryKey   = null;  // `${year}|${pick}` of currently-open primary

  function _serializeModalUrl(year, pick, compareYear, comparePick) {
    const params = new URLSearchParams();
    params.set('player', `${+year}-${+pick}`);
    if (compareYear && comparePick) {
      params.set('vs', `${+compareYear}-${+comparePick}`);
    }
    return `${location.pathname}?${params.toString()}`;
  }

  function _parseModalUrl(search) {
    const params = new URLSearchParams(search);
    const player = params.get('player');
    if (!player) return null;
    const [py, pp] = player.split('-').map(n => parseInt(n, 10));
    if (!py || !pp) return null;
    const out = { year: py, pick: pp, compareYear: null, comparePick: null };
    const vs = params.get('vs');
    if (vs) {
      const [vy, vp] = vs.split('-').map(n => parseInt(n, 10));
      if (vy && vp) { out.compareYear = vy; out.comparePick = vp; }
    }
    return out;
  }

  function _clearModalUrl() {
    if (location.search) history.pushState({}, '', location.pathname);
  }

  function closePlayerModal() {
    if (!playerModal.classList.contains('open')) return;
    playerModal.classList.remove('open');
    _modalPrimaryKey = null;
    if (!_suppressUrlPush) _clearModalUrl();
    if (_modalOpenerEl && typeof _modalOpenerEl.focus === 'function') {
      _modalOpenerEl.focus();
      _modalOpenerEl = null;
    }
  }

  playerModalClose.addEventListener('click', closePlayerModal);
  playerModal.addEventListener('click', e => { if (e.target === playerModal) closePlayerModal(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!playerModal.classList.contains('open')) return;
    closePlayerModal();
  });

  window.addEventListener('popstate', () => {
    const parsed = _parseModalUrl(location.search);
    _suppressUrlPush = true;
    try {
      if (parsed) {
        openPlayerModal(parsed.year, parsed.pick, parsed.compareYear, parsed.comparePick);
      } else if (playerModal.classList.contains('open')) {
        closePlayerModal();
      }
    } finally {
      _suppressUrlPush = false;
    }
  });

  /* Tab-trap inside the modal so keyboard users can't escape into the
     dimmed background. Cycles between the first and last focusable
     element. Bound to the modal element directly so it only fires when
     the modal is open and focused. */
  playerModal.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !playerModal.classList.contains('open')) return;
    const focusables = Array.from(playerModal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]),'
      + ' select:not([disabled]), textarea:not([disabled]),'
      + ' [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null);  // visible only
    if (!focusables.length) return;
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !playerModal.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !playerModal.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  });

  /* Convert a height-in-inches number to a "ft'in"" display string. */
  function _ftIn(totalIn) {
    if (totalIn == null) return null;
    const n = Math.round(totalIn);
    return `${Math.floor(n / 12)}'${n % 12}"`;
  }

  /* Friendly labels for SHAP-attributed feature contributions. Each entry
     receives the raw feature value the model saw and returns a human label
     that includes the value inline. Position one-hots are generated below. */
  const _SHAP_LABELS = {
    pick:           v => `Pick slot (#${Math.round(v)})`,
    round:          v => `Round ${Math.round(v)}`,
    college_enc:    v => `College program signal (${(+v).toFixed(2)})`,
    age:            v => `Age at draft (${Math.round(v)})`,
    era:            v => `Era cohort (${Math.round(v)})`,
    ht_in:          v => `Height (${_ftIn(v) || `${Math.round(v)}"`})`,
    wt:             v => `Weight (${Math.round(v)} lb)`,
    forty:          v => `40-yard (${(+v).toFixed(2)}s)`,
    bench:          v => `Bench (${Math.round(v)} reps)`,
    vertical:       v => `Vertical (${(+v).toFixed(1)}")`,
    broad_jump:     v => `Broad jump (${_ftIn(v) || `${Math.round(v)}"`})`,
    cone:           v => `3-cone (${(+v).toFixed(2)}s)`,
    shuttle:        v => `Shuttle (${(+v).toFixed(2)}s)`,
    cfb_present:    v => v >= 1 ? 'College record present' : 'No college record',
    cfb_seasons:    v => `College seasons (${Math.round(v)})`,
    cfb_pos_volume: v => `College volume (${Math.round(v).toLocaleString()})`,
    cfb_pos_scoring: v => `College scoring (${Math.round(v)})`,
  };
  ['QB','RB','WR','TE','OL','DL','LB','DB','ST'].forEach(g => {
    _SHAP_LABELS[`pos_${g}`] = v => v >= 1 ? `Position: ${g}` : `Not ${g}`;
  });

  function _shapLabel(name, value) {
    const fn = _SHAP_LABELS[name];
    return fn ? fn(value) : `${name} (${value})`;
  }

  /* Render the per-pick "Why GHOST flagged this" panel. topFeatures comes
     from the trainer's SHAP attribution: top 3 features by |SHAP|, with raw
     SHAP value (log-odds) and the actual feature value the model saw. Bars
     are normalized to the largest |SHAP| in the set so the relative
     contribution is visible at a glance. */
  function _buildShapHtml(topFeatures) {
    if (!Array.isArray(topFeatures) || !topFeatures.length) return '';
    const maxAbs = Math.max(...topFeatures.map(f => Math.abs(+f.shap || 0)), 1e-6);
    const rows = topFeatures.map(f => {
      const shap = +f.shap || 0;
      const pct  = (Math.abs(shap) / maxAbs) * 100;
      const dir  = shap >= 0 ? '+' : '−';
      const color = shap >= 0 ? '#10b981' : '#ef4444';
      const label = _shapLabel(f.name, f.value);
      return `<div class="ghost-shap-row">
        <div class="ghost-shap-label">
          <span style="color:${color};font-weight:700;width:10px;display:inline-block">${dir}</span>
          <span>${label}</span>
        </div>
        <div class="ghost-shap-bar"><span style="width:${pct.toFixed(0)}%;background:${color}"></span></div>
      </div>`;
    }).join('');
    return `<div class="profile-shap">
      <div class="profile-shap-title">Why GHOST flagged this</div>
      ${rows}
      <div class="profile-shap-foot">Top 3 features by SHAP magnitude · green raised the hit probability, red lowered it</div>
    </div>`;
  }

  /* Build the inner HTML for a single player profile card. compareMode=true
     drops the Historical Comps and Combine & Bio sections to keep two
     side-by-side cards comparable in length. */
  function _buildProfileCardHtml(year, pick, mlResult, compareMode = false) {
    const profile = DraftData.playerProfile(year, pick);
    if (!profile) return null;

    const mlPick   = mlResult.picks.find(p => p.year === +year && p.pick === +pick);
    const p        = profile.pick;
    const incomplete = p.year >= 2022;
    const surplus    = profile.avSurplus;
    const ctx        = DraftData.playerContext(year, pick);

    const compsHtml = profile.comps.length
      ? profile.comps.map(c => `
          <div class="profile-comp-row">
            <span class="profile-comp-name">${c.player}</span>
            <span class="profile-comp-meta">${c.year} · ${c.franchise} · #${c.pick}</span>
            <span class="profile-comp-av">${c.career_av} AV</span>
          </div>`).join('')
      : '<div style="color:var(--text-muted);font-size:13px">No comps with complete data found</div>';

    const meta = mlResult.modelMeta || {};
    const hitThresh = meta.hit_threshold;
    const baseRate  = meta.hit_rate;

    // Percentile rank of this pick's predicted_prob across all scored picks.
    // O(n) single scan; modal opens are rare so no need to cache the sort.
    let percentileBadge = '';
    if (mlPick && mlPick.predicted_prob !== undefined) {
      const allProbs = (DraftData.getSleeperPredictions() || [])
        .map(p => p.predicted_prob)
        .filter(v => v !== undefined && v !== null);
      if (allProbs.length) {
        const target = mlPick.predicted_prob;
        const below  = allProbs.reduce((c, v) => c + (v < target ? 1 : 0), 0);
        const pct    = +(below / allProbs.length * 100).toFixed(1);
        let label, color;
        if      (pct >= 95) { label = 'Top 5%';   color = '#10b981'; }
        else if (pct >= 90) { label = 'Top 10%';  color = '#10b981'; }
        else if (pct >= 75) { label = 'Top 25%';  color = '#22c55e'; }
        else if (pct >= 50) { label = `${Math.round(pct)}th pct`; color = 'var(--text-muted)'; }
        else if (pct >= 25) { label = `${Math.round(pct)}th pct`; color = 'var(--text-muted)'; }
        else                { label = `Bottom ${Math.round(100 - pct) || 1}%`; color = '#9ca3af'; }
        percentileBadge = ` <span style="font-size:11px;font-weight:600;color:${color};margin-left:6px;letter-spacing:0.02em">${label}</span>`;
      }
    }

    // Data-availability indicator: tells the user what inputs the model
    // actually saw. Pre-2014 picks have no CFBD record and ride on
    // combine + age + slot only — the prediction is shakier.
    const cfbSeasons = p.cfb_seasons;
    const cfbHasData = cfbSeasons != null && cfbSeasons > 0;
    const cfbPill = cfbHasData
      ? `<span style="color:#10b981;font-weight:600">✓ college (${cfbSeasons} season${cfbSeasons !== 1 ? 's' : ''})</span>`
      : `<span style="color:var(--text-muted);font-weight:600">○ no college data</span>`;

    const shapHtml = mlPick ? _buildShapHtml(mlPick.top_features) : '';

    const mlHtml = mlPick && mlPick.predicted_prob !== undefined ? `
      <div class="profile-section">
        <h4>GHOST · Hit Probability</h4>
        <div class="profile-context-row">
          <span>Probability of exceeding slot by ${hitThresh ?? '—'} AV</span>
          <span class="profile-val">${(mlPick.predicted_prob * 100).toFixed(1)}%${percentileBadge}</span>
        </div>
        ${baseRate !== undefined ? `
        <div class="profile-context-row">
          <span>League base rate</span>
          <span class="profile-val">${(baseRate * 100).toFixed(1)}%</span>
        </div>` : ''}
        <div class="profile-context-row">
          <span>Model inputs</span>
          <span class="profile-val" style="font-weight:400;font-size:12px">${cfbPill}</span>
        </div>
        ${!mlPick.incomplete && mlPick.actual_hit !== null && mlPick.actual_hit !== undefined ? `
        <div class="profile-context-row">
          <span>Actual outcome</span>
          <span class="profile-val ${mlPick.actual_hit ? 'pos' : 'neg'}">
            ${mlPick.actual_hit ? 'Hit' : 'Miss'}
          </span>
        </div>` : ''}
        ${shapHtml}
      </div>` : '';

    /* Combine & Bio section — surfaces age + measurables that GHOST uses
       as features. Only rows with data render; section hides if all blank.
       In compare mode the section is suppressed; the comparison bars
       panel above the cards covers it. */
    const _bioRows = compareMode ? [] : [
      ['Age at draft',  p.age != null ? p.age : null],
      ['Height',        _ftIn(p.ht_in)],
      ['Weight',        p.wt != null ? `${Math.round(p.wt)} lb` : null],
      ['40-yard',       p.forty != null ? `${(+p.forty).toFixed(2)}s` : null],
      ['Vertical',      p.vertical != null ? `${(+p.vertical).toFixed(1)}"` : null],
      ['Broad jump',    _ftIn(p.broad_jump)],
      ['Bench',         p.bench != null ? `${Math.round(p.bench)} reps` : null],
      ['3-cone',        p.cone != null ? `${(+p.cone).toFixed(2)}s` : null],
      ['20-yd shuttle', p.shuttle != null ? `${(+p.shuttle).toFixed(2)}s` : null],
    ].filter(([, v]) => v !== null && v !== undefined && v !== '');
    const bioHtml = _bioRows.length ? `
      <div class="profile-section">
        <h4>Combine & Bio</h4>
        ${_bioRows.map(([label, val]) => `
          <div class="profile-context-row">
            <span>${label}</span>
            <span class="profile-val">${val}</span>
          </div>`).join('')}
      </div>` : '';

    let avBreakdownHtml = '';
    if (ctx && p.career_av > 0) {
      // Shared linear scale: scale_max ensures the player's own bars fit and
      // leaves headroom around the position median so the median tick lands
      // in a readable spot. A journeyman fills less than the median tick;
      // an All-Pro overflows past it. Scale resets the misleading
      // self-normalization where every player filled 100%.
      const median   = ctx.posMedianAv || 0;
      const scaleMax = Math.max(p.career_av, median * 2.5, 10);
      const earlyPct = Math.round(ctx.earlyAv / scaleMax * 100);
      const latePct  = Math.round(ctx.lateAv  / scaleMax * 100);
      const tickPct  = median > 0 ? Math.min(99, Math.round(median / scaleMax * 100)) : null;
      const tickHtml = tickPct !== null
        ? `<div class="profile-av-bar-tick" style="left:${tickPct}%" title="Position median career AV: ${median}"></div>`
        : '';
      const tickLegend = tickPct !== null
        ? `<div class="profile-av-bar-legend">Tick = median career AV for ${ctx.posGroup} (${median})</div>`
        : '';
      avBreakdownHtml = `
        <div class="profile-section">
          <h4>Career AV Breakdown</h4>
          <div class="profile-av-bars">
            <div class="profile-av-bar-row">
              <span class="profile-av-bar-label">Seasons 1–4</span>
              <div class="profile-av-bar-track">
                <div class="profile-av-bar-fill" style="width:${earlyPct}%;background:var(--ghost)"></div>
                ${tickHtml}
              </div>
              <span class="profile-av-bar-val">${ctx.earlyAv}</span>
            </div>
            <div class="profile-av-bar-row">
              <span class="profile-av-bar-label">Seasons 5+</span>
              <div class="profile-av-bar-track">
                <div class="profile-av-bar-fill" style="width:${latePct}%;background:var(--accent)"></div>
                ${tickHtml}
              </div>
              <span class="profile-av-bar-val">${ctx.lateAv}</span>
            </div>
          </div>
          ${tickLegend}
        </div>`;
    }

    let peerHtml = '';
    if (ctx && p.career_av > 0) {
      const peerSuffix = p.year >= 2022
        ? ' <span style="color:var(--text-muted);font-weight:400;font-size:11px">· class still accumulating AV</span>'
        : '';
      const classStr = ctx.classRank
        ? `#${ctx.classRank} of ${ctx.classRankTotal} <span style="color:var(--text-muted);font-weight:400">w/ AV</span>`
        : '—';
      const roundStr = ctx.roundRank
        ? `#${ctx.roundRank} of ${ctx.roundRankTotal} <span style="color:var(--text-muted);font-weight:400">w/ AV</span>`
        : '—';
      peerHtml = `
        <div class="profile-section">
          <h4>Peer Rankings${peerSuffix}</h4>
          <div class="profile-context-row">
            <span>AV per season</span>
            <span class="profile-val">${ctx.avPerSeason}</span>
          </div>
          ${ctx.starts ? `
          <div class="profile-context-row">
            <span>Career starts</span>
            <span class="profile-val">${ctx.starts}</span>
          </div>` : ''}
          <div class="profile-context-row">
            <span>${p.year} draft class rank</span>
            <span class="profile-val">${classStr}</span>
          </div>
          <div class="profile-context-row">
            <span>${p.year} Round ${p.round} rank</span>
            <span class="profile-val">${roundStr}</span>
          </div>
          ${ctx.posRank ? `
          <div class="profile-context-row">
            <span>All-time ${ctx.posGroup} rank (1994–2021)</span>
            <span class="profile-val">#${ctx.posRank} of ${ctx.posRankTotal}</span>
          </div>` : ''}
        </div>`;
    }

    const compsSection = compareMode ? '' : `
      <div class="profile-section">
        <h4>Historical Comps · ${p.pos_group} · Picks ${Math.max(1, p.pick - 25)}–${p.pick + 25} · ranked by career AV</h4>
        <div class="profile-comps">${compsHtml}</div>
      </div>`;

    return `
      <div class="profile-header">
        <div>
          <h2 class="profile-name">${p.player}</h2>
          <div class="profile-meta">${p.year} Draft · Round ${p.round} · Pick #${p.pick}</div>
          <div class="profile-meta">${p.franchise} · ${p.pos} · ${p.college}</div>
        </div>
        <span class="pos-pill" style="background:${DraftData.posColor(p.pos_group)}22;color:${DraftData.posColor(p.pos_group)};font-size:14px;padding:6px 14px">${p.pos_group}</span>
      </div>

      <div class="profile-section">
        <h4>Career Stats${incomplete ? ' <span class="profile-incomplete">· data still accumulating</span>' : ''}</h4>
        <div class="profile-stat-grid">
          <div class="profile-stat"><span class="profile-stat-val">${p.seasons}</span><span class="profile-stat-label">Seasons</span></div>
          <div class="profile-stat"><span class="profile-stat-val">${p.career_av}</span><span class="profile-stat-label">Career AV</span></div>
          <div class="profile-stat"><span class="profile-stat-val">${p.draft_av}</span><span class="profile-stat-label">Draft AV</span></div>
          <div class="profile-stat"><span class="profile-stat-val">${p.pro_bowls || '—'}</span><span class="profile-stat-label">Pro Bowls</span></div>
        </div>
      </div>

      ${bioHtml}

      ${avBreakdownHtml}

      <div class="profile-section">
        <h4>Pick Context</h4>
        <div class="profile-context-row">
          <span>Pick #${p.pick} power-law value</span>
          <span class="profile-val">${profile.pickValue}</span>
        </div>
        <div class="profile-context-row">
          <span>Slot avg career AV (1994–2021)</span>
          <span class="profile-val">${profile.slotAvg}</span>
        </div>
        <div class="profile-context-row">
          <span>AV surplus vs slot expectation</span>
          <span class="profile-val ${surplus >= 0 ? 'pos' : 'neg'}">${surplus >= 0 ? '+' : ''}${surplus}</span>
        </div>
      </div>

      ${peerHtml}

      ${mlHtml}

      ${compsSection}
    `;
  }

  /* Build the visual measurable-comparison panel shown above the two cards
     in compare mode. Bars are oriented so longer = better (lower-is-better
     measurables get inverted). Skips rows where neither player has data. */
  function _buildCompareBarsHtml(year1, pick1, year2, pick2) {
    const profile1 = DraftData.playerProfile(year1, pick1);
    const profile2 = DraftData.playerProfile(year2, pick2);
    if (!profile1 || !profile2) return '';
    const p1 = profile1.pick;
    const p2 = profile2.pick;

    // [absMin, absMax] are scale endpoints across all combine-tested NFL
    // draftees. lower=true means smaller values are better and the bar
    // gets inverted so longer bar = better mark.
    const BARS = [
      { key: 'age',        label: 'Age at draft', min: 20,  max: 27,  lower: true,  fmt: v => `${v}` },
      { key: 'forty',      label: '40-yard',      min: 4.2, max: 5.8, lower: true,  fmt: v => `${(+v).toFixed(2)}s` },
      { key: 'vertical',   label: 'Vertical',     min: 20,  max: 45,  lower: false, fmt: v => `${(+v).toFixed(1)}"` },
      { key: 'broad_jump', label: 'Broad jump',   min: 100, max: 140, lower: false, fmt: v => _ftIn(v) },
      { key: 'bench',      label: 'Bench',        min: 5,   max: 40,  lower: false, fmt: v => `${Math.round(v)} reps` },
      { key: 'cone',       label: '3-cone',       min: 6.6, max: 8.0, lower: true,  fmt: v => `${(+v).toFixed(2)}s` },
      { key: 'shuttle',    label: '20-yd shuttle', min: 3.8, max: 4.8, lower: true,  fmt: v => `${(+v).toFixed(2)}s` },
    ];

    const c1 = DraftData.posColor(p1.pos_group);
    // Disambiguate when both players are the same position.
    const c2 = p1.pos_group === p2.pos_group ? '#f59e0b' : DraftData.posColor(p2.pos_group);

    const pct = (v, b) => {
      if (v == null) return null;
      const cl = Math.max(0, Math.min(1, (v - b.min) / (b.max - b.min)));
      return Math.round((b.lower ? 1 - cl : cl) * 100);
    };

    const barRow = (b) => {
      const v1 = p1[b.key], v2 = p2[b.key];
      if (v1 == null && v2 == null) return '';
      const p1pct = pct(v1, b);
      const p2pct = pct(v2, b);
      const fill = (val, pctVal, color) => val == null
        ? '<div class="cmp-fill" style="width:0;background:transparent"></div>'
        : `<div class="cmp-fill" style="width:${pctVal}%;background:${color}"></div>`;
      return `
        <div class="cmp-row">
          <div class="cmp-label">${b.label}</div>
          <div class="cmp-twin">
            <div class="cmp-track">${fill(v1, p1pct, c1)}</div>
            <span class="cmp-val">${v1 != null ? b.fmt(v1) : '—'}</span>
          </div>
          <div class="cmp-twin">
            <div class="cmp-track">${fill(v2, p2pct, c2)}</div>
            <span class="cmp-val">${v2 != null ? b.fmt(v2) : '—'}</span>
          </div>
        </div>`;
    };

    const bioRow = (label, getVal, fmt) => {
      const v1 = getVal(p1), v2 = getVal(p2);
      if (v1 == null && v2 == null) return '';
      return `
        <div class="cmp-row cmp-bio">
          <div class="cmp-label">${label}</div>
          <div class="cmp-twin"><span class="cmp-val">${v1 != null ? fmt(v1) : '—'}</span></div>
          <div class="cmp-twin"><span class="cmp-val">${v2 != null ? fmt(v2) : '—'}</span></div>
        </div>`;
    };

    const bioHtml = bioRow('Height', p => p.ht_in, _ftIn)
                  + bioRow('Weight', p => p.wt, v => `${Math.round(v)} lb`);
    const barRows = BARS.map(barRow).join('');
    if (!bioHtml && !barRows) return '';

    return `
      <div class="profile-section profile-compare-bars">
        <h4>Combine & Bio Comparison</h4>
        <div class="cmp-headers">
          <div class="cmp-label"></div>
          <div class="cmp-twin"><span style="color:${c1};font-weight:700;font-size:12px">${p1.player}</span></div>
          <div class="cmp-twin"><span style="color:${c2};font-weight:700;font-size:12px">${p2.player}</span></div>
        </div>
        ${bioHtml}
        ${barRows}
      </div>`;
  }

  /* Open the player profile modal. comparePick is optional — when set, the
     modal renders two cards side-by-side. */
  async function openPlayerModal(year, pick, compareYear = null, comparePick = null) {
    await DraftData.loadSleeperPredictions();
    const mlResult = DraftData.sleeperModelRankings({}, 99999, 'predicted');

    const compareMode = !!(compareYear && comparePick);
    const primary = _buildProfileCardHtml(year, pick, mlResult, compareMode);
    if (!primary) return;
    const secondary = compareMode
      ? _buildProfileCardHtml(compareYear, comparePick, mlResult, true)
      : null;

    const toolbar = secondary
      ? `<div class="profile-toolbar">
           <button id="profileCompareClear" class="profile-compare-clear" title="Close comparison">× Close comparison</button>
         </div>`
      : `<div class="profile-toolbar">
           <input id="profileCompareSearch" type="search" class="profile-compare-search" placeholder="Compare to another player…" autocomplete="off" />
           <div id="profileCompareResults" class="profile-compare-results"></div>
         </div>`;

    const compareBars = secondary
      ? _buildCompareBarsHtml(year, pick, compareYear, comparePick)
      : '';

    const body = secondary
      ? `${compareBars}
         <div class="profile-compare-grid">
           <div class="profile-compare-card">${primary}</div>
           <div class="profile-compare-card">${secondary}</div>
         </div>`
      : primary;

    document.getElementById('playerModalContent').innerHTML = toolbar + body;

    // Toggle wider layout for compare mode
    const card = document.querySelector('.player-modal-card');
    if (card) card.classList.toggle('compare-mode', !!secondary);

    // Wire up either the clear button or the search input
    if (secondary) {
      const clearBtn = document.getElementById('profileCompareClear');
      if (clearBtn) clearBtn.addEventListener('click', () => openPlayerModal(year, pick));
    } else {
      _wireCompareSearch(year, pick);
    }

    const wasOpen = playerModal.classList.contains('open');
    playerModal.classList.add('open');

    const newPrimaryKey = `${+year}|${+pick}`;
    if (!_suppressUrlPush) {
      // Replace history when staying on the same primary pick (compare
      // add/remove/swap is an in-modal interaction). Push when opening fresh
      // or switching to a different player so back button still works.
      const samePrimary = wasOpen && _modalPrimaryKey === newPrimaryKey;
      const url = _serializeModalUrl(year, pick, compareYear, comparePick);
      if (samePrimary) history.replaceState({}, '', url);
      else             history.pushState({}, '', url);
    }
    _modalPrimaryKey = newPrimaryKey;

    // Focus management: in single mode, focus the search input so keyboard
    // users can immediately type a name. In compare mode, focus the clear
    // button. Skip if modal was already open (re-render mid-interaction).
    if (!wasOpen) {
      if (typeof document !== 'undefined' && document.activeElement &&
          document.activeElement !== document.body) {
        _modalOpenerEl = document.activeElement;
      }
    }
    requestAnimationFrame(() => {
      const target = secondary
        ? document.getElementById('profileCompareClear')
        : document.getElementById('profileCompareSearch');
      if (target && typeof target.focus === 'function') target.focus();
    });
  }

  function _wireCompareSearch(primaryYear, primaryPick) {
    const input   = document.getElementById('profileCompareSearch');
    const results = document.getElementById('profileCompareResults');
    if (!input || !results) return;

    let lastQ = '';
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (q === lastQ) return;
      lastQ = q;
      if (q.length < 2) { results.innerHTML = ''; return; }
      const matches = DraftData.picks({ search: q })
        .filter(p => !(p.year === +primaryYear && p.pick === +primaryPick))
        .slice(0, 12);
      if (!matches.length) {
        results.innerHTML = '<div class="profile-compare-empty">No matches</div>';
        return;
      }
      results.innerHTML = matches.map(p => `
        <div class="profile-compare-result" data-year="${p.year}" data-pick="${p.pick}">
          <strong>${p.player}</strong>
          <span class="profile-compare-result-meta">${p.year} · ${p.team} · ${p.pos} · ${p.college}</span>
        </div>`).join('');
      results.querySelectorAll('.profile-compare-result').forEach(el => {
        el.addEventListener('click', () => {
          openPlayerModal(primaryYear, primaryPick, +el.dataset.year, +el.dataset.pick);
        });
      });
    });

    // Close dropdown on outside click within the modal
    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !results.contains(e.target)) {
        results.innerHTML = '';
      }
    }, { once: true });
  }

  /* event delegation — works for both draft board and 2026 pick board */
  document.addEventListener('click', e => {
    const row = e.target.closest('tr[data-year][data-pick]');
    if (!row) return;
    const year = +row.dataset.year;
    const pick = +row.dataset.pick;
    if (year && pick) openPlayerModal(year, pick);
  });

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
      _sageInited       = false;
      _ghostInited      = false;
      _ghostTabInited   = {};
      _atlasInited      = false;
      _atlasTabInited   = {};
      _oracleInited     = false;
      _playbookInited   = false;
      Object.values(_playbookCharts).forEach(c => c?.destroy?.());
      _playbookCharts   = {};
      _class2027Inited  = false;
      showView(_currentView);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════
     PLAYBOOK — play-call prediction engine (LSTM + EPA head)
  ═══════════════════════════════════════════════════════════════════ */

  const PLAYBOOK_COLORS = {
    RUN:        '#f59e0b',
    SHORT_PASS: '#3b82f6',
    DEEP_PASS:  '#ef4444',
  };

  async function initPlaybook() {
    if (_playbookInited) {
      const sel = document.getElementById('playbook-scenario-sel');
      if (sel?.value) renderPlaybookScenario(sel.value);
      return;
    }

    const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
    const opts    = isLocal ? { cache: 'no-store' } : undefined;
    let blob;
    try {
      const resp = await fetch('data/playbook_predictions.json', opts);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      blob = await resp.json();
    } catch (err) {
      const desc = document.getElementById('playbook-scenario-desc');
      if (desc) {
        desc.textContent = 'PLAYBOOK predictions JSON not found. From the playbook venv, run: python build_predictions.py';
      }
      return;
    }

    _playbookBlob   = blob;
    _playbookInited = true;

    const m = blob.metrics || {};
    const fmt = v => (typeof v === 'number') ? v.toFixed(3) : '—';
    document.getElementById('playbook-n-train').textContent = '837k';
    document.getElementById('playbook-rmse').textContent    = fmt(m.test_epa_rmse);
    document.getElementById('playbook-acc').textContent     = fmt(m.test_accuracy);

    const sel = document.getElementById('playbook-scenario-sel');
    sel.innerHTML = '';
    blob.scenarios.forEach(sc => sel.add(new Option(sc.name, sc.id)));
    sel.addEventListener('change', () => renderPlaybookScenario(sel.value));

    document.getElementById('playbook-model-notes').innerHTML = `
      <ul style="margin:0;padding-left:20px">
        <li>Multi-task LSTM (~31k params) trained on nflverse play-by-play 1999–2023, held out 2024–2025. Per-step input is [play_label_emb · prev_yards_gained · prev_epa] over the last 5 plays in the current drive.</li>
        <li>Classification accuracy 0.59 — does not beat the LightGBM tabular baseline. The win is the joint output: a single forward pass returns calibrated P(play_type) plus expected EPA per play type.</li>
        <li>EPA RMSE 1.37 overall (per-class 1.0/1.4/1.9) is in the band of public play-by-play EPA models.</li>
        <li>Predictions on this view use a fixed PHI/NYG team pair so the answer reflects this-situation-not-this-team coaching insight. Different team identities would shift predictions slightly.</li>
        <li>The EPA head's "deep is highest-EV" verdict in many situations partly reflects selection bias: deep passes get called when the matchup invites them, and connect for big EPA. Treat counterfactual EPA as "if a coach decided to call deep here, expected outcome is..." not "deep is always the right call."</li>
      </ul>`;

    if (blob.scenarios.length) renderPlaybookScenario(blob.scenarios[0].id);
  }

  function renderPlaybookScenario(scenarioId) {
    const blob = _playbookBlob;
    if (!blob) return;
    const sc = blob.scenarios.find(s => s.id === scenarioId) || blob.scenarios[0];

    document.getElementById('playbook-scenario-desc').textContent = sc.description;

    const labels = blob.labels;
    const probs  = labels.map(l => +(sc.predictions[l].prob * 100).toFixed(1));
    const epas   = labels.map(l => +sc.predictions[l].epa.toFixed(3));
    const colors = labels.map(l => PLAYBOOK_COLORS[l] || '#888');
    const labelText = labels.map(l => l.replace('_', ' '));

    const tickColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-tick').trim() || '#777';
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.06)';
    const baseFont  = { family: getComputedStyle(document.body).fontFamily, size: 12 };

    _playbookCharts.prob?.destroy?.();
    _playbookCharts.prob = new Chart(document.getElementById('chart-playbook-prob'), {
      type: 'bar',
      data: {
        labels: labelText,
        datasets: [{ data: probs, backgroundColor: colors, borderWidth: 0, borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend:  { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.x.toFixed(1)}%` } },
        },
        scales: {
          x: { beginAtZero: true, max: 100, ticks: { color: tickColor, font: baseFont, callback: v => `${v}%` }, grid: { color: gridColor } },
          y: { ticks: { color: tickColor, font: baseFont }, grid: { display: false } },
        },
      },
    });

    const epaMax = Math.max(0.5, ...epas.map(Math.abs));
    _playbookCharts.epa?.destroy?.();
    _playbookCharts.epa = new Chart(document.getElementById('chart-playbook-epa'), {
      type: 'bar',
      data: {
        labels: labelText,
        datasets: [{ data: epas, backgroundColor: colors, borderWidth: 0, borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend:  { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.x >= 0 ? '+' : ''}${ctx.parsed.x.toFixed(2)} EPA` } },
        },
        scales: {
          x: { min: -epaMax, max: epaMax, ticks: { color: tickColor, font: baseFont, callback: v => v.toFixed(2) }, grid: { color: gridColor } },
          y: { ticks: { color: tickColor, font: baseFont }, grid: { display: false } },
        },
      },
    });

    const argmaxClassIdx = probs.indexOf(Math.max(...probs));
    const argmaxEpaIdx   = epas.indexOf(Math.max(...epas));
    const insightEl = document.getElementById('playbook-insight');
    if (argmaxClassIdx === argmaxEpaIdx) {
      insightEl.innerHTML = `<strong>Aligned.</strong> ${labelText[argmaxClassIdx]} is both the most likely call (P = ${probs[argmaxClassIdx].toFixed(0)}%) and the highest-EV play (EPA = ${epas[argmaxClassIdx] >= 0 ? '+' : ''}${epas[argmaxClassIdx].toFixed(2)}). The data and the model agree.`;
    } else {
      const probPct = probs[argmaxClassIdx].toFixed(0);
      const epaVal  = epas[argmaxEpaIdx];
      insightEl.innerHTML = `<strong>Most likely call:</strong> ${labelText[argmaxClassIdx]} (P = ${probPct}%). <strong>Highest expected EPA:</strong> ${labelText[argmaxEpaIdx]} (EPA = ${epaVal >= 0 ? '+' : ''}${epaVal.toFixed(2)}). The disagreement is the decision-support signal — ${labelText[argmaxEpaIdx]} is rarely the called play here, but the model's expected outcome on it is the best of the three options.`;
    }
  }

  /* ── Boot sequence ────────────────────────────────────────────────── */
  initCollegeFilters();
  showView('dashboard');

  // Deep-link: if the page loaded with ?player=YYYY-PP[&vs=YYYY-PP], open the
  // matching player modal. Suppress the URL push so the user's pasted link
  // stays intact in the address bar.
  const _initialModal = _parseModalUrl(location.search);
  if (_initialModal) {
    _suppressUrlPush = true;
    Promise.resolve(openPlayerModal(
      _initialModal.year,
      _initialModal.pick,
      _initialModal.compareYear,
      _initialModal.comparePick
    )).finally(() => { _suppressUrlPush = false; });
  }
})();

/* app.js — navigation, filters, table, wiring */

(async () => {
  /* ── Load data ────────────────────────────────────────────────────── */
  const { meta } = await DraftData.load();

  /* ── Navigation ───────────────────────────────────────────────────── */
  const VIEW_TITLES = {
    dashboard:  ['Dashboard',        '32 seasons · 8,116 picks · all NFL teams'],
    draftboard: ['Draft Board',      'Search and filter every pick from 1994–2025'],
    teams:      ['Team Hub',         'Draft history and tendencies by franchise'],
    positions:  ['Position Trends',  'How position drafting has evolved over 32 years'],
    colleges:   ['College Pipeline', 'Which programs feed the NFL draft'],
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
    if (id === 'positions')  initPositionTrends();
    if (id === 'colleges')   renderCollegePipeline();
    if (id === 'draftboard') renderDraftTable();
    if (id === 'sage')       initSAGE();
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
    /* KPIs */
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
    const sel = document.getElementById('team-select');
    if (sel.options.length === 1) {
      meta.teams.forEach(t => sel.add(new Option(t, t)));
    }
    sel.addEventListener('change', () => renderTeamHub(sel.value));
    if (sel.value) renderTeamHub(sel.value);
  }

  function renderTeamHub(team) {
    if (!team) return;
    const teamPicks = DraftData.picks({ team });
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

    DraftCharts.winsPerYear('chart-teamWins', DraftData.winsByYear(team));
    DraftCharts.picksPerYear('chart-teamPicksYear', DraftData.picksPerYear({ team }));
    DraftCharts.donut('chart-teamPosDonut', DraftData.byPosGroup({ team }), 'Picks');
    DraftCharts.vbar('chart-teamRoundBar', DraftData.teamByRound(team), null);
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
    const { years, data } = DraftData.posGroupSharePerYear(groups);
    DraftCharts.multiLine('chart-posTrends', years, data, DraftData.posColor);
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
    DraftCharts.hbar('chart-collegePipeline', DraftData.topColleges(25, filter));
  }

  /* ═══════════════════════════════════════════════════════════════════
     SAGE
  ═══════════════════════════════════════════════════════════════════ */
  let _sageInited = false;

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

      _sageInited = true;
    }

    const sel = document.getElementById('sage-team');
    if (sel.options.length === 1) {
      meta.teams.forEach(t => sel.add(new Option(t, t)));
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

  /* ── Theme toggle ─────────────────────────────────────────────────── */
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon   = document.getElementById('themeIcon');

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      themeIcon.className = 'fas fa-sun';
    } else {
      document.documentElement.removeAttribute('data-theme');
      themeIcon.className = 'fas fa-moon';
    }
    localStorage.setItem('fi-theme', theme);
  }

  applyTheme(localStorage.getItem('fi-theme') || 'dark');

  themeToggle.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    applyTheme(isLight ? 'dark' : 'light');
    _sageInited = false;
    showView(_currentView);
  });

  /* ── Boot sequence ────────────────────────────────────────────────── */
  initCollegeFilters();
  showView('dashboard');
})();

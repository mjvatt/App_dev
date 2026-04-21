/* charts.js — Chart.js initialization and update helpers */

const DraftCharts = (() => {
  const _charts = {};

  const GRID_COLOR  = 'rgba(26,37,64,.8)';
  const TICK_COLOR  = '#7a8caa';
  const FONT_FAMILY = 'Inter, system-ui, sans-serif';
  const ACCENT      = '#f59e0b';

  function _baseScales(xLabel = '', yLabel = '') {
    return {
      x: {
        grid: { color: GRID_COLOR },
        ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 }, maxRotation: 0 },
        title: xLabel ? { display: true, text: xLabel, color: TICK_COLOR, font: { size: 11 } } : undefined,
      },
      y: {
        grid: { color: GRID_COLOR },
        ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 } },
        title: yLabel ? { display: true, text: yLabel, color: TICK_COLOR, font: { size: 11 } } : undefined,
      },
    };
  }

  function _baseLegend(display = false) {
    return { display, labels: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 }, boxWidth: 12, padding: 16 } };
  }

  function _destroy(id) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  }

  /* ── Picks per year line chart ──────────────────────────────────── */
  function picksPerYear(canvasId, data) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(245,158,11,.25)');
    gradient.addColorStop(1, 'rgba(245,158,11,0)');

    _charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Picks',
          data: data.values,
          borderColor: ACCENT,
          backgroundColor: gradient,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: ACCENT,
          fill: true,
          tension: .35,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: _baseLegend(false), tooltip: _tooltip() },
        scales: _baseScales('Year', 'Picks'),
      },
    });
  }

  /* ── Donut ──────────────────────────────────────────────────────── */
  function donut(canvasId, data, label = '') {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    _charts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.labels,
        datasets: [{
          label,
          data: data.values,
          backgroundColor: data.colors,
          borderColor: '#111827',
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: _baseLegend(true),
          tooltip: _tooltip(),
        },
      },
    });
  }

  /* ── Horizontal bar ─────────────────────────────────────────────── */
  function hbar(canvasId, data, color = ACCENT) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Picks',
          data: data.values,
          backgroundColor: typeof color === 'string'
            ? data.labels.map(() => color + 'cc')
            : color,
          borderColor: typeof color === 'string'
            ? data.labels.map(() => color)
            : color,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: _baseLegend(false), tooltip: _tooltip() },
        scales: {
          x: { grid: { color: GRID_COLOR }, ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 } } },
          y: { grid: { display: false }, ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 } } },
        },
      },
    });
  }

  /* ── Vertical bar ───────────────────────────────────────────────── */
  function vbar(canvasId, data, colors = null) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Picks',
          data: data.values,
          backgroundColor: colors || data.colors || (ACCENT + 'cc'),
          borderColor: colors || data.colors || ACCENT,
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: _baseLegend(false), tooltip: _tooltip() },
        scales: _baseScales(),
      },
    });
  }

  /* ── Multi-line (position trends) ───────────────────────────────── */
  function multiLine(canvasId, years, seriesMap, colorFn) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    const datasets = Object.entries(seriesMap).map(([group, values]) => ({
      label: group,
      data: values,
      borderColor: colorFn(group),
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      tension: .35,
    }));
    _charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels: years, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: _baseLegend(true), tooltip: _tooltip() },
        scales: _baseScales('Year', '% of Picks'),
      },
    });
  }

  /* ── Tooltip defaults ───────────────────────────────────────────── */
  function _tooltip() {
    return {
      backgroundColor: '#0d1220',
      borderColor: '#1a2540',
      borderWidth: 1,
      titleColor: '#e2e8f4',
      bodyColor: '#7a8caa',
      padding: 10,
      titleFont: { family: FONT_FAMILY, size: 12, weight: '600' },
      bodyFont:  { family: FONT_FAMILY, size: 12 },
    };
  }

  /* ── Wins per season line (playoff years highlighted) ───────────── */
  function winsPerYear(canvasId, data) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    const pointColors = data.playoffs.map(p => p ? ACCENT : '#3b82f6');
    const pointRadii  = data.playoffs.map(p => p ? 5 : 3);

    _charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Wins',
          data: data.values,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,.1)',
          borderWidth: 2.5,
          pointBackgroundColor: pointColors,
          pointRadius: pointRadii,
          pointHoverRadius: 6,
          fill: true,
          tension: .3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: _baseLegend(false), tooltip: _tooltip() },
        scales: {
          x: {
            grid: { color: GRID_COLOR },
            ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 }, maxRotation: 0 },
            title: { display: true, text: 'Year', color: TICK_COLOR, font: { size: 11 } },
          },
          y: {
            grid: { color: GRID_COLOR },
            ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Wins', color: TICK_COLOR, font: { size: 11 } },
            suggestedMin: 0,
            suggestedMax: 17,
          },
        },
      },
    });
  }

  /* update helpers — replace dataset in place */
  function update(canvasId, newData) {
    const c = _charts[canvasId];
    if (!c) return;
    c.data.labels = newData.labels;
    c.data.datasets[0].data = newData.values;
    if (newData.colors) {
      c.data.datasets[0].backgroundColor = newData.colors;
      c.data.datasets[0].borderColor     = newData.colors;
    }
    c.update('active');
  }

  return { picksPerYear, winsPerYear, donut, hbar, vbar, multiLine, update };
})();

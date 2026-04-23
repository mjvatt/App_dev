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
  function hbar(canvasId, data, color = ACCENT, label = 'Picks') {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label,
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

  /* ── Scatter with linear trend line ────────────────────────────── */
  function scatter(canvasId, points) {
    _destroy(canvasId);
    if (!points.length) return;
    const ctx = document.getElementById(canvasId).getContext('2d');

    const n     = points.length;
    const sumX  = points.reduce((s, p) => s + p.x, 0);
    const sumY  = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX;
    const m = denom ? (n * sumXY - sumX * sumY) / denom : 0;
    const b = (sumY - m * sumX) / n;
    const xMin = Math.min(...points.map(p => p.x));
    const xMax = Math.max(...points.map(p => p.x));
    const trend = [
      { x: xMin, y: +(m * xMin + b).toFixed(2) },
      { x: xMax, y: +(m * xMax + b).toFixed(2) },
    ];

    _charts[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Season',
            data: points,
            backgroundColor: ACCENT + 'cc',
            borderColor: ACCENT,
            pointRadius: 6,
            pointHoverRadius: 8,
          },
          {
            label: 'Trend',
            data: trend,
            type: 'line',
            borderColor: '#3b82f6',
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(false),
          tooltip: {
            ..._tooltip(),
            callbacks: {
              label: item => {
                const p = item.raw;
                return p.year
                  ? `${p.year}: ${p.x} picks → ${p.y}W next season`
                  : `(${p.x}, ${(+p.y).toFixed(1)})`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: GRID_COLOR },
            ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Picks in Draft Year', color: TICK_COLOR, font: { size: 11 } },
          },
          y: {
            grid: { color: GRID_COLOR },
            ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Wins — Following Season', color: TICK_COLOR, font: { size: 11 } },
            suggestedMin: 0,
            suggestedMax: 17,
          },
        },
      },
    });
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

  /* ── Player vs slot grade scatter ──────────────────────────────── */
  function slotGradeChart(canvasId, data, visibleGroups) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const ROUND_STARTS = [1, 33, 65, 97, 129, 161, 193];

    const datasets = visibleGroups
      .filter(g => data.byGroup[g]?.points.length)
      .map(g => ({
        label: g,
        type: 'scatter',
        data: data.byGroup[g].points,
        backgroundColor: data.byGroup[g].colorAlpha,
        borderColor: 'transparent',
        pointRadius: 2.5,
        pointHoverRadius: 5,
        order: 1,
      }));

    datasets.push({
      label: 'Expected',
      type: 'line',
      data: data.curve,
      borderColor: 'rgba(255,255,255,0.25)',
      borderWidth: 2,
      borderDash: [5, 4],
      pointRadius: 0,
      fill: false,
      order: -1,
    });

    _charts[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        animation: false,
        plugins: {
          legend: _baseLegend(true),
          tooltip: {
            ..._tooltip(),
            filter: item => item.dataset.label !== 'Expected',
            callbacks: {
              title: () => '',
              label: item => {
                const p = item.raw;
                return [
                  `${p.player}  (${p.team}, ${p.year})`,
                  `Pick #${p.x}  ·  Draft AV: ${p.y}`,
                  `Pos: ${p.pos}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            min: 1,
            max: 256,
            grid: { color: GRID_COLOR },
            afterBuildTicks: scale => {
              scale.ticks = ROUND_STARTS.map(v => ({ value: v }));
            },
            ticks: {
              color: TICK_COLOR,
              font: { family: FONT_FAMILY, size: 11 },
              callback: val => {
                const ri = ROUND_STARTS.indexOf(val);
                return ri !== -1 ? `R${ri + 1}` : null;
              },
            },
            title: { display: true, text: 'Overall Pick', color: TICK_COLOR, font: { size: 11 } },
          },
          y: {
            grid: { color: GRID_COLOR },
            ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Draft AV', color: TICK_COLOR, font: { size: 11 } },
            suggestedMin: 0,
          },
        },
      },
      plugins: [{
        id: 'roundDividers',
        afterDraw(chart) {
          const { ctx: c, chartArea: { top, bottom }, scales: { x } } = chart;
          c.save();
          c.strokeStyle = 'rgba(255,255,255,0.07)';
          c.lineWidth = 1;
          c.setLineDash([4, 4]);
          [33, 65, 97, 129, 161, 193].forEach(pick => {
            const xPos = x.getPixelForValue(pick);
            c.beginPath();
            c.moveTo(xPos, top);
            c.lineTo(xPos, bottom);
            c.stroke();
          });
          c.setLineDash([]);
          c.restore();
        },
      }],
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

  /* ── Round capital split — stacked 100% hbar ────────────────────── */
  function roundCapitalBar(canvasId, data) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Round 1',
            data: data.r1,
            backgroundColor: '#3b82f6bb',
            borderWidth: 0,
          },
          {
            label: 'Rounds 2–3',
            data: data.r23,
            backgroundColor: '#f59e0bbb',
            borderWidth: 0,
          },
          {
            label: 'Rounds 4–7',
            data: data.r47,
            backgroundColor: '#3d5070cc',
            borderWidth: 0,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(true),
          tooltip: {
            ..._tooltip(),
            callbacks: {
              label: item => `${item.dataset.label}: ${item.raw}%`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            max: 100,
            grid: { color: GRID_COLOR },
            ticks: {
              color: TICK_COLOR,
              font: { family: FONT_FAMILY, size: 11 },
              callback: val => `${val}%`,
            },
            title: { display: true, text: '% of Draft Capital', color: TICK_COLOR, font: { size: 11 } },
          },
          y: {
            stacked: true,
            grid: { display: false },
            ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 } },
          },
        },
      },
    });
  }

  /* ── Pick value decay curve ─────────────────────────────────────── */
  function pickValueLine(canvasId, points) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(59,130,246,.28)');
    gradient.addColorStop(1, 'rgba(59,130,246,0)');

    const ROUND_STARTS = [1, 33, 65, 97, 129, 161, 193];

    _charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          label: 'Pick Value',
          data: points,
          borderColor: '#3b82f6',
          backgroundColor: gradient,
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        plugins: {
          legend: _baseLegend(false),
          tooltip: {
            ..._tooltip(),
            mode: 'nearest',
            intersect: false,
            callbacks: {
              title: items => {
                const pick = items[0]?.parsed?.x;
                if (!pick) return '';
                const round = ROUND_STARTS.filter(s => pick >= s).length;
                return `Pick #${pick} — Round ${round}`;
              },
              label: item => `Relative Value: ${item.parsed.y}`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            min: 1,
            max: 256,
            grid: { color: GRID_COLOR },
            afterBuildTicks: scale => {
              scale.ticks = ROUND_STARTS.map(v => ({ value: v }));
            },
            ticks: {
              color: TICK_COLOR,
              font: { family: FONT_FAMILY, size: 11 },
              callback: val => {
                const ri = ROUND_STARTS.indexOf(val);
                return ri !== -1 ? `R${ri + 1}` : null;
              },
            },
            title: { display: true, text: 'Overall Pick Number', color: TICK_COLOR, font: { size: 11 } },
          },
          y: {
            grid: { color: GRID_COLOR },
            ticks: { color: TICK_COLOR, font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Relative Value (pick #1 = 100)', color: TICK_COLOR, font: { size: 11 } },
            suggestedMin: 0,
            suggestedMax: 105,
          },
        },
      },
      plugins: [{
        id: 'roundDividers',
        afterDraw(chart) {
          const { ctx: c, chartArea: { top, bottom }, scales: { x } } = chart;
          c.save();
          c.strokeStyle = 'rgba(255,255,255,0.07)';
          c.lineWidth = 1;
          c.setLineDash([4, 4]);
          [33, 65, 97, 129, 161, 193].forEach(pick => {
            const xPos = x.getPixelForValue(pick);
            c.beginPath();
            c.moveTo(xPos, top);
            c.lineTo(xPos, bottom);
            c.stroke();
          });
          c.setLineDash([]);
          c.restore();
        },
      }],
    });
  }

  return { picksPerYear, winsPerYear, scatter, donut, hbar, vbar, multiLine, pickValueLine, roundCapitalBar, slotGradeChart, update };
})();

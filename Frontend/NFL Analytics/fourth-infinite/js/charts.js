/* charts.js — Chart.js initialization and update helpers */

const DraftCharts = (() => {
  const _charts = {};

  const _css        = prop => getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
  const GRID_COLOR  = () => _css('--chart-grid');
  const TICK_COLOR  = () => _css('--chart-tick');
  const FONT_FAMILY = 'Inter, system-ui, sans-serif';
  const ACCENT      = '#f59e0b';

  function _baseScales(xLabel = '', yLabel = '') {
    return {
      x: {
        grid: { color: GRID_COLOR() },
        ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 }, maxRotation: 0 },
        title: xLabel ? { display: true, text: xLabel, color: TICK_COLOR(), font: { size: 11 } } : undefined,
      },
      y: {
        grid: { color: GRID_COLOR() },
        ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
        title: yLabel ? { display: true, text: yLabel, color: TICK_COLOR(), font: { size: 11 } } : undefined,
      },
    };
  }

  function _baseLegend(display = false) {
    return { display, labels: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 }, boxWidth: 12, padding: 16 } };
  }

  function _destroy(id) {
    if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  }

  function _tooltip() {
    return {
      backgroundColor: _css('--chart-tooltip-bg'),
      borderColor:     _css('--chart-tooltip-bdr'),
      borderWidth: 1,
      titleColor:  _css('--chart-tooltip-title'),
      bodyColor:   _css('--chart-tooltip-body'),
      padding: 10,
      titleFont: { family: FONT_FAMILY, size: 12, weight: '600' },
      bodyFont:  { family: FONT_FAMILY, size: 12 },
    };
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
          borderColor: _css('--card'),
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
          x: { grid: { color: GRID_COLOR() }, ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } } },
          y: { grid: { display: false }, ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } } },
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
  function multiLine(canvasId, years, seriesMap, colorFn, yLabel = '% of Picks') {
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
        scales: _baseScales('Year', yLabel),
      },
    });
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
                  ? `${p.year}: ${p.x} capital → ${p.y}W next season`
                  : `(${p.x}, ${(+p.y).toFixed(1)})`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Draft Capital (pick value sum)', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Wins — Following Season', color: TICK_COLOR(), font: { size: 11 } },
            suggestedMin: 0,
            suggestedMax: 17,
          },
        },
      },
    });
  }

  /* ── Wins per season line (playoff years highlighted) ───────────── */
  function winsPerYear(canvasId, dataA, dataB = null, labelA = 'Wins', labelB = 'Compare') {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const pointColorsA = dataA.playoffs.map(p => p ? ACCENT : '#3b82f6');
    const pointRadiiA  = dataA.playoffs.map(p => p ? 5 : 3);

    const datasets = [{
      label: labelA,
      data: dataA.values,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,.1)',
      borderWidth: 2.5,
      pointBackgroundColor: pointColorsA,
      pointRadius: pointRadiiA,
      pointHoverRadius: 6,
      fill: true,
      tension: .3,
    }];

    if (dataB) {
      const COMPARE_COLOR = '#10b981';
      const bByYear = {};
      dataB.labels.forEach((y, i) => { bByYear[y] = { w: dataB.values[i], playoff: dataB.playoffs[i] }; });
      const bValues   = dataA.labels.map(y => bByYear[y]?.w   ?? null);
      const bPlayoffs = dataA.labels.map(y => bByYear[y]?.playoff ?? false);
      datasets.push({
        label: labelB,
        data: bValues,
        borderColor: COMPARE_COLOR,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 4],
        pointBackgroundColor: bPlayoffs.map(p => p ? ACCENT : COMPARE_COLOR),
        pointRadius: bPlayoffs.map(p => p ? 4 : 2),
        pointHoverRadius: 5,
        fill: false,
        tension: .3,
        spanGaps: true,
      });
    }

    _charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels: dataA.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: _baseLegend(dataB !== null), tooltip: _tooltip() },
        scales: {
          x: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 }, maxRotation: 0 },
            title: { display: true, text: 'Year', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Wins', color: TICK_COLOR(), font: { size: 11 } },
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

  /* ── Round capital split — stacked 100% hbar ────────────────────── */
  function roundCapitalBar(canvasId, data) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Round 1',     data: data.r1,  backgroundColor: '#3b82f6bb', borderWidth: 0 },
          { label: 'Rounds 2–3', data: data.r23, backgroundColor: '#f59e0bbb', borderWidth: 0 },
          { label: 'Rounds 4–7', data: data.r47, backgroundColor: '#6b7280bb', borderWidth: 0 },
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
            callbacks: { label: item => `${item.dataset.label}: ${item.raw}%` },
          },
        },
        scales: {
          x: {
            stacked: true,
            max: 100,
            grid: { color: GRID_COLOR() },
            ticks: {
              color: TICK_COLOR(),
              font: { family: FONT_FAMILY, size: 11 },
              callback: val => `${val}%`,
            },
            title: { display: true, text: '% of Draft Capital', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            stacked: true,
            grid: { display: false },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
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
    const dividerColor = _css('--chart-divider');

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
            grid: { color: GRID_COLOR() },
            afterBuildTicks: scale => {
              scale.ticks = ROUND_STARTS.map(v => ({ value: v }));
            },
            ticks: {
              color: TICK_COLOR(),
              font: { family: FONT_FAMILY, size: 11 },
              callback: val => {
                const ri = ROUND_STARTS.indexOf(val);
                return ri !== -1 ? `R${ri + 1}` : null;
              },
            },
            title: { display: true, text: 'Overall Pick Number', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Relative Value (pick #1 = 100)', color: TICK_COLOR(), font: { size: 11 } },
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
          c.strokeStyle = dividerColor;
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

  /* ── Player vs slot grade scatter ──────────────────────────────── */
  function slotGradeChart(canvasId, data, visibleGroups) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const ROUND_STARTS = [1, 33, 65, 97, 129, 161, 193];
    const dividerColor = _css('--chart-divider');

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
      borderColor: _css('--chart-expected-line'),
      borderWidth: 2,
      borderDash: [5, 4],
      pointRadius: 0,
      fill: false,
      order: -1,
    });

    // When data.curvesByPos is provided, overlay a thin curve per position
    // group at low opacity. Marked _isPosCurve so the legend filter below
    // can hide them — the curves carry the same colors as the scatter
    // datasets already in the legend, so listing them again is redundant.
    if (data.curvesByPos) {
      Object.entries(data.curvesByPos).forEach(([g, cd]) => {
        datasets.push({
          label: `${g} curve`,
          type: 'line',
          data: cd.points,
          borderColor: cd.color,
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          order: -2,
          _isPosCurve: true,
        });
      });
    }

    _charts[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        animation: false,
        plugins: {
          legend: {
            ..._baseLegend(true),
            // Per-position reference curves share scatter colors and would
            // duplicate legend entries — hide them.
            labels: {
              ..._baseLegend(true).labels,
              filter: (legendItem, chartData) => {
                const ds = chartData.datasets[legendItem.datasetIndex];
                return !ds || !ds._isPosCurve;
              },
            },
          },
          tooltip: {
            ..._tooltip(),
            // Only show tooltips on scatter points (not on the line curves).
            filter: item => item.dataset.label !== 'Expected' && !item.dataset._isPosCurve,
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
            grid: { color: GRID_COLOR() },
            afterBuildTicks: scale => {
              scale.ticks = ROUND_STARTS.map(v => ({ value: v }));
            },
            ticks: {
              color: TICK_COLOR(),
              font: { family: FONT_FAMILY, size: 11 },
              callback: val => {
                const ri = ROUND_STARTS.indexOf(val);
                return ri !== -1 ? `R${ri + 1}` : null;
              },
            },
            title: { display: true, text: 'Overall Pick', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Draft AV', color: TICK_COLOR(), font: { size: 11 } },
            suggestedMin: 0,
          },
        },
      },
      plugins: [{
        id: 'roundDividers',
        afterDraw(chart) {
          const { ctx: c, chartArea: { top, bottom }, scales: { x } } = chart;
          c.save();
          c.strokeStyle = dividerColor;
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

  /* ── Team outcome efficiency — ranked hbar with quartile coloring ── */
  function efficiencyBar(canvasId, data) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const sorted = [...data.values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];

    const barColors = data.values.map(v => {
      if (v >= q3) return '#f59e0bdd';
      if (v <= q1) return '#6b7280aa';
      return '#3b82f6cc';
    });

    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'AV / Capital',
          data: data.values,
          backgroundColor: barColors,
          borderWidth: 0,
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(false),
          tooltip: {
            ..._tooltip(),
            callbacks: {
              title: items => items[0]?.label || '',
              label: item => {
                const m = data.meta[item.dataIndex];
                return [
                  `Efficiency: ${m.efficiency} AV / capital unit`,
                  `Career AV: ${m.totalAV.toLocaleString()}`,
                  `Draft capital: ${m.capital}`,
                  `Picks: ${m.picks}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Career AV per draft capital unit', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
          },
        },
      },
    });
  }

  /* ── Pro Bowl rate by round — vertical bar ──────────────────────── */
  function proBowlBar(canvasId, data) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const maxRate = Math.max(...data.values);
    const barColors = data.values.map(v => {
      const t = maxRate > 0 ? v / maxRate : 0;
      if (t >= 0.66) return '#f59e0bdd';
      if (t >= 0.33) return '#3b82f6cc';
      return '#6b7280aa';
    });

    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Pro Bowl rate',
          data: data.values,
          backgroundColor: barColors,
          borderWidth: 0,
          borderRadius: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(false),
          tooltip: {
            ..._tooltip(),
            callbacks: {
              title: items => items[0]?.label || '',
              label: item => {
                const m = data.meta[item.dataIndex];
                return [
                  `Pro Bowl rate: ${m.rate}%`,
                  `Pro Bowlers: ${m.pb} of ${m.total} picks`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 12, weight: '600' } },
          },
          y: {
            grid: { color: GRID_COLOR() },
            ticks: {
              color: TICK_COLOR(),
              font: { family: FONT_FAMILY, size: 11 },
              callback: val => `${val}%`,
            },
            title: { display: true, text: '% of picks with ≥1 Pro Bowl', color: TICK_COLOR(), font: { size: 11 } },
            suggestedMin: 0,
          },
        },
      },
    });
  }

  /* ── Draft class grades — vertical bar by year ─────────────────── */
  function draftClassBar(canvasId, dataA, dataB = null, labelB = 'Compare') {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const complete = dataA.filter(d => !d.incomplete).map(d => d.grade).sort((a, b) => a - b);
    const q1 = complete[Math.floor(complete.length * 0.25)];
    const q3 = complete[Math.floor(complete.length * 0.75)];

    const colors = dataA.map(d => {
      if (d.incomplete)  return 'rgba(107,114,128,0.3)';
      if (d.grade >= q3) return '#f59e0bdd';
      if (d.grade <= q1) return '#6b728099';
      return '#3b82f6cc';
    });

    const datasets = [{
      label: 'Draft Class Grade',
      data:  dataA.map(d => d.grade),
      backgroundColor: colors,
      borderWidth: 0,
      borderRadius: 3,
    }];

    if (dataB) {
      const COMPARE_COLOR = '#10b981';
      const bByYear = {};
      dataB.forEach(d => { bByYear[d.year] = d; });
      datasets.push({
        type: 'line',
        label: labelB,
        data: dataA.map(d => bByYear[d.year]?.grade ?? null),
        borderColor: COMPARE_COLOR,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [4, 3],
        pointRadius: 3,
        pointBackgroundColor: COMPARE_COLOR,
        fill: false,
        tension: .3,
        spanGaps: true,
      });
    }

    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dataA.map(d => d.year),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(dataB !== null),
          tooltip: {
            ..._tooltip(),
            callbacks: {
              title: items => `${items[0]?.label} Draft Class`,
              label: item => {
                if (item.dataset.type === 'line') return `${item.dataset.label}: ${item.raw} AV/cap`;
                const d = dataA[item.dataIndex];
                const lines = [
                  `Grade: ${d.grade} AV / capital unit`,
                  `Career AV: ${d.totalAV.toLocaleString()}`,
                  `Draft capital: ${d.capital}`,
                  `Picks: ${d.picks}`,
                ];
                if (d.incomplete) lines.push('Note: career data incomplete');
                return lines;
              },
            },
          },
        },
        scales: _baseScales('Draft Year', 'Career AV per capital unit'),
      },
    });
  }

  /* ── Draft class position contribution — stacked 100% bar by year ─ */
  function draftClassPosBar(canvasId, data) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const datasets = data.groups.map(g => ({
      label: g,
      data:  data.data[g],
      backgroundColor: data.colors[g] + 'cc',
      borderColor: 'transparent',
      borderWidth: 0,
      stack: 'pos',
    }));

    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels: data.years, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(true),
          tooltip: {
            ..._tooltip(),
            mode: 'index',
            callbacks: {
              title: items => `${items[0]?.label} Draft Class`,
              label: item => `${item.dataset.label}: ${item.raw}%`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 }, maxRotation: 0 },
            title: { display: true, text: 'Draft Year', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            stacked: true,
            max: 100,
            grid: { color: GRID_COLOR() },
            ticks: {
              color: TICK_COLOR(),
              font: { family: FONT_FAMILY, size: 11 },
              callback: val => `${val}%`,
            },
            title: { display: true, text: '% of Class Career AV', color: TICK_COLOR(), font: { size: 11 } },
          },
        },
      },
    });
  }

  /* ── GHOST leaderboard — ranked hbar for player/college lists ──── */
  function ghostLeaderboard(canvasId, data) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: data.metricLabel || 'Score',
          data:  data.values,
          backgroundColor: data.colors || (ACCENT + 'cc'),
          borderWidth: 0,
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(false),
          tooltip: {
            ..._tooltip(),
            callbacks: {
              title: items => items[0]?.label || '',
              label: item => {
                const m = data.meta[item.dataIndex];
                if (!m) return String(item.raw);
                const lines = [`${data.metricLabel || 'Score'}: ${item.raw}`];
                if (m.team)       lines.push(`${m.team}  ·  ${m.year}  ·  ${m.pos || ''}`);
                if (m.round)      lines.push(`Round ${m.round}, Pick #${m.pick}`);
                if (m.draft_av !== undefined) lines.push(`Draft AV: ${m.draft_av}  ·  Career AV: ${m.career_av}`);
                if (m.pro_bowls)  lines.push(`Pro Bowls: ${m.pro_bowls}`);
                if (m.surplus !== undefined)  lines.push(`AV surplus vs slot: ${m.surplus}`);
                if (m.totalPicks) lines.push(`Picks: ${m.totalPicks}  ·  Total AV: ${m.totalAV}`);
                if (m.avgPick !== undefined) lines.push(`Avg draft slot: #${m.avgPick}`);
                if (m.avgPB !== undefined)    lines.push(`Avg Pro Bowls/pick: ${m.avgPB}`);
                if (m.college)               lines.push(`College: ${m.college}`);
                if (m.predicted_prob !== undefined) lines.push(`Predicted hit probability: ${(m.predicted_prob * 100).toFixed(1)}%`);
                if (m.predicted_surplus !== undefined) lines.push(`Predicted surplus: ${m.predicted_surplus}`);
                if (m.actual_surplus !== undefined && !m.incomplete) lines.push(`Actual surplus: ${m.actual_surplus}`);
                if (m.actual_hit !== undefined && m.actual_hit !== null && !m.incomplete) {
                  lines.push(`Actual outcome: ${m.actual_hit ? 'Hit' : 'Miss'}`);
                }
                if (m.incomplete) lines.push('Career data incomplete (2022+)');
                return lines;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: data.xLabel ? { display: true, text: data.xLabel, color: TICK_COLOR(), font: { size: 11 } } : undefined,
          },
          y: {
            grid: { display: false },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 10 } },
          },
        },
      },
    });
  }

  /* ── ATLAS Boom & Bust quadrant scatter ────────────────────────── */
  function boomBustScatter(canvasId, stats) {
    _destroy(canvasId);
    if (!stats.length) return;
    const ctx = document.getElementById(canvasId).getContext('2d');

    const meanWins = stats.reduce((s, p) => s + p.avgWins, 0) / stats.length;
    const meanStd  = stats.reduce((s, p) => s + p.stdDev,  0) / stats.length;
    const maxStd   = Math.max(...stats.map(p => p.stdDev))  + 0.3;
    const maxWins  = Math.max(...stats.map(p => p.avgWins)) + 0.5;

    const quadrantColor = p => {
      const hi = p.avgWins >= meanWins;
      const vol = p.stdDev  >= meanStd;
      if  (hi && !vol) return 'rgba(245,158,11,0.85)';  // consistent winners
      if  (hi &&  vol) return 'rgba(239,68,68,0.75)';   // high avg, volatile
      if (!hi &&  vol) return 'rgba(139,92,246,0.75)';  // low avg, volatile
      return                  'rgba(107,114,128,0.60)'; // consistently mediocre
    };

    // Inline plugin: draws quadrant labels at the midpoint of each region
    // defined by the mean-wins / mean-std crosshairs. Lets the user read
    // the chart at a glance without decoding the dot colors.
    const quadrantLabelsPlugin = {
      id: 'bbQuadrantLabels',
      afterDraw(chart) {
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        const ca     = chart.chartArea;
        if (!xScale || !yScale || !ca) return;
        const cx     = xScale.getPixelForValue(meanWins);
        const cy     = yScale.getPixelForValue(meanStd);
        const labels = [
          { x: (ca.left  + cx) / 2, y: (ca.top    + cy) / 2, text: 'Volatile Strugglers' },
          { x: (ca.right + cx) / 2, y: (ca.top    + cy) / 2, text: 'Volatile Contenders' },
          { x: (ca.left  + cx) / 2, y: (ca.bottom + cy) / 2, text: 'Stable Bottom-Feeders' },
          { x: (ca.right + cx) / 2, y: (ca.bottom + cy) / 2, text: 'Stable Winners' },
        ];
        const ctx2 = chart.ctx;
        ctx2.save();
        ctx2.font = '600 11px Inter, system-ui, sans-serif';
        ctx2.fillStyle = TICK_COLOR();
        ctx2.globalAlpha = 0.55;
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        labels.forEach(l => ctx2.fillText(l.text, l.x, l.y));
        ctx2.restore();
      },
    };

    _charts[canvasId] = new Chart(ctx, {
      type: 'scatter',
      plugins: [quadrantLabelsPlugin],
      data: {
        datasets: [
          {
            label: 'Franchise',
            data: stats.map(p => ({
              x: p.avgWins, y: p.stdDev,
              franchise: p.franchise, maxWin: p.maxWin, minWin: p.minWin,
              avgSwing: p.avgSwing, maxSwing: p.maxSwing, seasons: p.seasons,
            })),
            backgroundColor: stats.map(quadrantColor),
            borderColor:     stats.map(quadrantColor),
            pointRadius: 6,
            pointHoverRadius: 8,
          },
          {
            label: `Avg wins (${meanWins.toFixed(1)})`,
            data: [{ x: meanWins, y: 0 }, { x: meanWins, y: maxStd }],
            type: 'line',
            borderColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1,
            borderDash: [5, 4],
            pointRadius: 0,
            fill: false,
          },
          {
            label: `Avg std dev (${meanStd.toFixed(2)})`,
            data: [{ x: 0, y: meanStd }, { x: maxWins, y: meanStd }],
            type: 'line',
            borderColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1,
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
            filter: item => item.datasetIndex === 0,
            callbacks: {
              title: () => '',
              label: item => {
                const p = item.raw;
                return [
                  p.franchise,
                  `Avg wins: ${p.x}  ·  Std dev: ${p.y}`,
                  `Best: ${p.maxWin}W  ·  Worst: ${p.minWin}W`,
                  `Avg YoY swing: ${p.avgSwing}W  ·  Biggest swing: ${p.maxSwing}W`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid:  { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Average Wins Per Season  →', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid:  { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Win Std Dev (Volatility)  →', color: TICK_COLOR(), font: { size: 11 } },
            suggestedMin: 0,
          },
        },
      },
    });
  }

  /* ── ATLAS Era Rankings — grouped hbar by era ──────────────────── */
  function eraRankingsChart(canvasId, rows, eras) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const ERA_COLORS = {
      '1990s': 'rgba(16,185,129,0.75)',
      '2000s': 'rgba(59,130,246,0.75)',
      '2010s': 'rgba(245,158,11,0.75)',
      '2020s': 'rgba(139,92,246,0.75)',
    };

    const datasets = eras.map(era => ({
      label: era,
      data:  rows.map(r => r[era] ?? 0),
      backgroundColor: ERA_COLORS[era] || 'rgba(107,114,128,0.6)',
      borderRadius: 3,
      borderWidth: 0,
    }));

    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels: rows.map(r => r.franchise), datasets },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(true),
          tooltip: {
            ..._tooltip(),
            callbacks: {
              label: item => `${item.dataset.label}: ${item.raw}% win rate`,
            },
          },
        },
        scales: {
          x: {
            grid:  { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Win %', color: TICK_COLOR(), font: { size: 11 } },
            min: 0,
            max: 85,
          },
          y: {
            grid:  { display: false },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 10 } },
          },
        },
      },
    });
  }

  /* ── ATLAS Draft Capital → Next-Season Wins (league-wide scatter) ── */
  function leagueDraftWinsChart(canvasId, data) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const trend = [
      { x: data.xMin, y: +(data.m * data.xMin + data.b).toFixed(2) },
      { x: data.xMax, y: +(data.m * data.xMax + data.b).toFixed(2) },
    ];

    _charts[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Franchise-Season',
            data: data.points.map(p => ({ x: p.capital, y: p.wins, franchise: p.franchise, year: p.year })),
            backgroundColor: 'rgba(14,165,233,0.40)',
            borderColor:     'rgba(14,165,233,0.70)',
            borderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: `Trend  (R² = ${data.r2})  ·  n = ${data.points.length} team-seasons`,
            data: trend,
            type: 'line',
            borderColor: ACCENT,
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(true),
          tooltip: {
            ..._tooltip(),
            filter: item => item.datasetIndex === 0,
            callbacks: {
              title: () => '',
              label: item => {
                const p   = item.raw;
                const lf  = data.lagFrom;
                const lt  = data.lagTo;
                const lag = lf === lt ? `Y+${lf} wins` : `avg wins Y+${lf}–Y+${lt}`;
                return [
                  `${p.franchise}  ·  ${p.year} draft`,
                  `Capital: ${p.x}  →  ${lag}: ${p.y}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid:  { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Draft Capital Score (Year Y)', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid:  { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Wins (Year Y+1)', color: TICK_COLOR(), font: { size: 11 } },
            suggestedMin: 0,
            suggestedMax: 17,
          },
        },
      },
    });
  }

  /* ── ATLAS Win Trajectories — up to 4 teams ────────────────────── */
  function trajectoryChart(canvasId, series) {
    _destroy(canvasId);
    if (!series.length) return;
    const ctx = document.getElementById(canvasId).getContext('2d');

    const COLORS = ['#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];
    const allYears = [...new Set(series.flatMap(s => s.labels))].sort((a, b) => a - b);

    const datasets = series.map((s, i) => {
      const color  = COLORS[i % COLORS.length];
      const byYear = {};
      s.labels.forEach((y, j) => { byYear[y] = { w: s.values[j], playoff: s.playoffs[j] }; });
      const vals     = allYears.map(y => byYear[y]?.w       ?? null);
      const playoffs = allYears.map(y => byYear[y]?.playoff ?? false);
      return {
        label:              s.label,
        data:               vals,
        borderColor:        color,
        backgroundColor:    i === 0 ? color + '18' : 'transparent',
        borderWidth:        2.5,
        pointBackgroundColor: playoffs.map(p => p ? ACCENT : color),
        pointRadius:          playoffs.map(p => p ? 5 : 2.5),
        pointHoverRadius:     6,
        fill:    i === 0,
        tension: 0.3,
        spanGaps: true,
      };
    });

    _charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels: allYears, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: _baseLegend(true), tooltip: _tooltip() },
        scales: {
          x: {
            grid:  { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 }, maxRotation: 0 },
            title: { display: true, text: 'Season', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid:  { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Wins', color: TICK_COLOR(), font: { size: 11 } },
            suggestedMin: 0,
            suggestedMax: 17,
          },
        },
      },
    });
  }

  /* ── ATLAS Dynasty leaderboard ─────────────────────────────────── */
  function atlasLeaderboard(canvasId, data) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Legacy Score',
          data:  data.values,
          backgroundColor: data.colors || (ACCENT + 'cc'),
          borderWidth: 0,
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(false),
          tooltip: {
            ..._tooltip(),
            callbacks: {
              title: items => items[0]?.label || '',
              label: item => {
                const m = data.meta[item.dataIndex];
                if (!m) return `${item.raw}`;
                if (m.avgWins !== undefined) {
                  return [
                    `Std Dev: ${item.raw}`,
                    `Avg wins: ${m.avgWins}  ·  Best: ${m.maxWin}W  ·  Worst: ${m.minWin}W`,
                    `Avg YoY swing: ${m.avgSwing}W  ·  Biggest swing: ${m.maxSwing}W`,
                    `${m.seasons} seasons`,
                  ];
                }
                return [
                  `Legacy Score: ${item.raw}`,
                  `Win %: ${(m.winPct * 100).toFixed(1)}%  ·  ${m.wins}W over ${m.seasons} seasons`,
                  `Playoffs: ${m.playoffs} of ${m.seasons} seasons (${(m.playoffRate * 100).toFixed(0)}%)`,
                  `Draft Eff: ${m.draftEff}  (AV per capital unit · picks ≤ 2020)`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            min: data.xMin ?? 0,
            max: data.xMax ?? undefined,
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: data.xLabel || 'Legacy Score (0–100)', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 10 } },
          },
        },
      },
    });
  }

  /* ── ORACLE predicted vs actual scatter ────────────────────────── */
  function oracleBacktestScatter(canvasId, backtest) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const absErrors = backtest.map(r => Math.abs(r.error));
    const maxErr    = Math.max(...absErrors);

    const colorPoint = err => {
      const t = maxErr > 0 ? Math.abs(err) / maxErr : 0;
      if (t < 0.25) return 'rgba(16,185,129,0.65)';
      if (t < 0.55) return 'rgba(245,158,11,0.65)';
      return 'rgba(239,68,68,0.60)';
    };

    const mn = Math.min(...backtest.map(r => Math.min(r.actual_wins, r.predicted_wins))) - 0.5;
    const mx = Math.max(...backtest.map(r => Math.max(r.actual_wins, r.predicted_wins))) + 0.5;

    _charts[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Season',
            data: backtest.map(r => ({
              x: r.predicted_wins, y: r.actual_wins,
              franchise: r.franchise, year: r.year, error: r.error,
            })),
            backgroundColor: backtest.map(r => colorPoint(r.error)),
            borderColor:     'transparent',
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: 'Perfect prediction',
            data: [{ x: mn, y: mn }, { x: mx, y: mx }],
            type: 'line',
            borderColor: 'rgba(255,255,255,0.18)',
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
            filter: item => item.datasetIndex === 0,
            callbacks: {
              title: () => '',
              label: item => {
                const p = item.raw;
                const sign = p.error >= 0 ? '+' : '';
                return [
                  `${p.franchise}  ·  ${p.year}`,
                  `Predicted: ${p.x}W  ·  Actual: ${p.y}W  (${sign}${p.error})`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Predicted Wins', color: TICK_COLOR(), font: { size: 11 } },
            suggestedMin: 0, suggestedMax: 17,
          },
          y: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Actual Wins', color: TICK_COLOR(), font: { size: 11 } },
            suggestedMin: 0, suggestedMax: 17,
          },
        },
      },
    });
  }

  /* ── ORACLE predicted vs actual by year for one franchise ───────── */
  function oracleTeamLine(canvasId, franchise, backtest) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const rows = backtest
      .filter(r => r.franchise === franchise)
      .sort((a, b) => a.year - b.year);

    if (!rows.length) return;

    const ORACLE_COLOR = '#f97316';

    _charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: rows.map(r => r.year),
        datasets: [
          {
            label: 'Actual Wins',
            data:  rows.map(r => r.actual_wins),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,.1)',
            borderWidth: 2.5,
            pointRadius: 3,
            fill: true,
            tension: .3,
          },
          {
            label: 'Predicted',
            data:  rows.map(r => r.predicted_wins),
            borderColor: ORACLE_COLOR,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 2,
            fill: false,
            tension: .3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: _baseLegend(true), tooltip: _tooltip() },
        scales: {
          x: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 }, maxRotation: 0 },
          },
          y: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Wins', color: TICK_COLOR(), font: { size: 11 } },
            suggestedMin: 0, suggestedMax: 17,
          },
        },
      },
    });
  }

  /* ── Season stat line ───────────────────────────────────────────── */
  function statLine(canvasId, data, yLabel = '') {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(59,130,246,.25)');
    gradient.addColorStop(1, 'rgba(59,130,246,0)');

    _charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: yLabel,
          data:  data.values,
          borderColor: '#3b82f6',
          backgroundColor: gradient,
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: '#3b82f6',
          fill: true,
          tension: .35,
          spanGaps: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: _baseLegend(false), tooltip: _tooltip() },
        scales: _baseScales('Year', yLabel),
      },
    });
  }

  /* ── Calibration plot: predicted prob bins vs actual hit rate ─────── */
  function calibrationPlot(canvasId, bins) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');
    const points    = bins.map(b => ({ x: +b.predMean.toFixed(3), y: +b.actualRate.toFixed(3), n: b.n }));
    const reference = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

    _charts[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Observed',
            data: points,
            backgroundColor: 'rgba(139,92,246,0.85)',
            borderColor: 'rgba(139,92,246,1)',
            pointRadius:    points.map(p => Math.max(4, Math.min(14, Math.sqrt(p.n) * 1.4))),
            pointHoverRadius: points.map(p => Math.max(5, Math.min(16, Math.sqrt(p.n) * 1.6))),
          },
          {
            label: 'Perfect calibration',
            type: 'line',
            data: reference,
            borderColor: TICK_COLOR(),
            borderDash: [4, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(true),
          tooltip: {
            ..._tooltip(),
            callbacks: {
              label: item => {
                if (item.datasetIndex !== 0) return null;
                const p = points[item.dataIndex];
                return [
                  `Predicted ${(p.x * 100).toFixed(1)}%`,
                  `Actual    ${(p.y * 100).toFixed(1)}%`,
                  `n = ${p.n}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            min: 0, max: 1,
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Predicted hit probability', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            min: 0, max: 1,
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Actual hit rate', color: TICK_COLOR(), font: { size: 11 } },
          },
        },
      },
    });
  }

  /* ── Class strength bar — divergent (positive vs negative surplus) ── */
  function classStrengthBar(canvasId, data, metric = 'surplusPerPick', opts = {}) {
    _destroy(canvasId);
    const ctx = document.getElementById(canvasId).getContext('2d');

    const POS = '#10b981';   // emerald
    const NEG = '#ef4444';   // red
    const INC = 'rgba(107,114,128,0.4)';
    const DIM_POS = 'rgba(16,185,129,0.18)';
    const DIM_NEG = 'rgba(239,68,68,0.18)';
    const DIM_INC = 'rgba(107,114,128,0.15)';

    // When highlightYears is provided, non-highlighted bars dim; the two selected
    // years stay at full intensity to anchor the side-by-side compare view.
    const highlight = new Set((opts.highlightYears || []).map(Number));
    const isFocus   = d => highlight.size === 0 || highlight.has(+d.year);

    const values = data.map(d => d[metric]);
    const colors = data.map(d => {
      if (!isFocus(d)) return d.incomplete ? DIM_INC : ((d[metric] || 0) >= 0 ? DIM_POS : DIM_NEG);
      if (d.incomplete) return INC;
      return (d[metric] || 0) >= 0 ? POS + 'cc' : NEG + 'cc';
    });
    const borders = data.map(d => {
      if (!isFocus(d)) return d.incomplete ? DIM_INC : ((d[metric] || 0) >= 0 ? DIM_POS : DIM_NEG);
      if (d.incomplete) return INC;
      return (d[metric] || 0) >= 0 ? POS : NEG;
    });

    const yLabel = metric === 'surplusPerPick'
      ? 'Surplus AV per pick'
      : 'Total surplus AV';

    _charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.year),
        datasets: [{
          label: yLabel,
          data: values,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: _baseLegend(false),
          tooltip: {
            ..._tooltip(),
            callbacks: {
              title: items => `${items[0]?.label} Draft Class`,
              label: item => {
                const d = data[item.dataIndex];
                const sign = d.surplusTotal >= 0 ? '+' : '';
                const lines = [
                  `${sign}${d.surplusPerPick.toFixed(2)} surplus AV per pick`,
                  `${sign}${d.surplusTotal.toFixed(0)} total surplus AV`,
                  `${d.picks} picks · ${d.totalDraftAV.toLocaleString()} first-team AV`,
                ];
                if (d.best) {
                  lines.push(`Best: ${d.best.player} (#${d.best.pick}, ${d.best.team}) — ${d.best.career_av} career AV`);
                }
                if (d.incomplete) lines.push('Note: career data incomplete');
                return lines;
              },
            },
          },
        },
        scales: _baseScales('Draft Year', yLabel),
      },
    });
  }

  /* ── Generic labeled scatter with regression line ─────────────────── */
  function genericScatter(canvasId, points, xLabel, yLabel, color = ACCENT) {
    _destroy(canvasId);
    if (!points.length) return;
    const ctx = document.getElementById(canvasId).getContext('2d');

    const n     = points.length;
    const sumX  = points.reduce((s, p) => s + p.x, 0);
    const sumY  = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX;
    const slope = denom ? (n * sumXY - sumX * sumY) / denom : 0;
    const intercept = (sumY - slope * sumX) / n;
    const xMin = Math.min(...points.map(p => p.x));
    const xMax = Math.max(...points.map(p => p.x));
    const trend = [
      { x: xMin, y: +(slope * xMin + intercept).toFixed(2) },
      { x: xMax, y: +(slope * xMax + intercept).toFixed(2) },
    ];

    _charts[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: yLabel,
            data: points,
            backgroundColor: color + 'cc',
            borderColor: color,
            pointRadius: 5,
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
                if (!p.label) return `(${p.x}, ${p.y})`;
                return `${p.label} — ${xLabel}: ${p.x}, ${yLabel}: ${p.y}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: xLabel, color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: yLabel, color: TICK_COLOR(), font: { size: 11 } },
          },
        },
      },
    });
  }

  function divergentScatter(canvasId, points, xLabel, yLabel, opts = {}) {
    _destroy(canvasId);
    if (!points.length) return;
    const ctx = document.getElementById(canvasId).getContext('2d');
    const onPointClick = opts.onPointClick;

    const maxAbs = Math.max(1, ...points.map(p => Math.abs(p.y)));
    const colorFor = (y) => {
      const intensity = Math.min(1, Math.abs(y) / maxAbs);
      const a = 0.35 + 0.55 * intensity;
      return y >= 0
        ? `rgba(16, 185, 129, ${a})`
        : `rgba(239, 68, 68, ${a})`;
    };
    const borderFor = (y) => y >= 0 ? '#10b981' : '#ef4444';
    const pointBg     = points.map(p => colorFor(p.y));
    const pointBorder = points.map(p => borderFor(p.y));

    _charts[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: yLabel,
          data: points,
          backgroundColor: pointBg,
          borderColor: pointBorder,
          pointRadius: 4,
          pointHoverRadius: 7,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: onPointClick ? (evt, elements) => {
          if (!elements.length) return;
          const pt = points[elements[0].index];
          if (pt) onPointClick(pt);
        } : undefined,
        plugins: {
          legend: _baseLegend(false),
          tooltip: {
            ..._tooltip(),
            callbacks: {
              label: item => {
                const p = item.raw;
                const sign = p.y >= 0 ? '+' : '';
                if (!p.label) return `(${p.x}, ${sign}${p.y})`;
                return `${p.label} — ${xLabel}: ${p.x}, ${yLabel}: ${sign}${p.y}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: xLabel, color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: yLabel, color: TICK_COLOR(), font: { size: 11 } },
          },
        },
      },
    });
  }

  return { picksPerYear, winsPerYear, trajectoryChart, leagueDraftWinsChart, eraRankingsChart, boomBustScatter, scatter, genericScatter, divergentScatter, donut, hbar, vbar, multiLine, pickValueLine, roundCapitalBar, slotGradeChart, efficiencyBar, proBowlBar, draftClassBar, classStrengthBar, draftClassPosBar, ghostLeaderboard, atlasLeaderboard, oracleBacktestScatter, oracleTeamLine, statLine, calibrationPlot, update };
})();

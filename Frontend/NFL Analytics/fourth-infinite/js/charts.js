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
                if (m.predicted_surplus !== undefined) lines.push(`Predicted surplus: ${m.predicted_surplus}`);
                if (m.actual_surplus !== undefined && !m.incomplete) lines.push(`Actual surplus: ${m.actual_surplus}`);
                if (m.incomplete) lines.push('Career data incomplete (2021+)');
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
                if (!m) return `Legacy Score: ${item.raw}`;
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
            min: 0,
            max: 100,
            grid: { color: GRID_COLOR() },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 11 } },
            title: { display: true, text: 'Legacy Score (0–100)', color: TICK_COLOR(), font: { size: 11 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: TICK_COLOR(), font: { family: FONT_FAMILY, size: 10 } },
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

  return { picksPerYear, winsPerYear, scatter, donut, hbar, vbar, multiLine, pickValueLine, roundCapitalBar, slotGradeChart, efficiencyBar, proBowlBar, draftClassBar, draftClassPosBar, ghostLeaderboard, atlasLeaderboard, statLine, update };
})();

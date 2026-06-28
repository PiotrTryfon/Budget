var _chartInstances = {};

const MONTHS_PL = ['Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];

// ─── Screen render ────────────────────────────────────────────────────────

function renderCharts(container) {
  _destroyAllCharts();
  container.innerHTML = `
    <h2>Wykresy</h2>
    <button id="btn-add-chart" style="margin-bottom:1rem">+ Dodaj widok</button>
    <div id="chart-builder"></div>
    <div id="chart-grid"></div>
  `;
  _renderChartGrid(container);
  container.querySelector('#btn-add-chart')
    .addEventListener('click', () => _showChartBuilder(null, container));
}

// ─── Grid ─────────────────────────────────────────────────────────────────

function _renderChartGrid(container) {
  const views = getChartViews();
  const grid  = container.querySelector('#chart-grid');

  if (views.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted);margin-top:0.5rem">
      Brak widoków. Kliknij "+ Dodaj widok" aby stworzyć pierwszy wykres.</p>`;
    return;
  }

  grid.innerHTML = `<div class="chart-grid">
    ${views.map(v => `
      <div class="chart-card" id="chart-card-${v.id}">
        <div class="chart-card-header">
          <span class="chart-card-title">${_cEsc(v.name)}</span>
          <span class="chart-card-meta">${_periodLabel(v.period)}</span>
          <div class="chart-card-actions">
            <button class="btn-ghost btn-edit-chart" data-id="${v.id}"
              style="padding:0.2rem 0.55rem;font-size:0.78rem">Edytuj</button>
            <button class="btn-danger btn-del-chart" data-id="${v.id}"
              style="padding:0.2rem 0.55rem;font-size:0.78rem">Usuń</button>
          </div>
        </div>
        <div class="chart-canvas-wrap" id="wrap-${v.id}">
          <canvas id="canvas-${v.id}"></canvas>
        </div>
      </div>
    `).join('')}
  </div>`;

  views.forEach(v => _renderOneChart(v));

  grid.querySelectorAll('.btn-edit-chart').forEach(btn =>
    btn.addEventListener('click', e => _showChartBuilder(e.target.dataset.id, container)));
  grid.querySelectorAll('.btn-del-chart').forEach(btn =>
    btn.addEventListener('click', e => {
      const id = e.target.dataset.id;
      if (_chartInstances[id]) { _chartInstances[id].destroy(); delete _chartInstances[id]; }
      deleteChartView(id);
      _renderChartGrid(container);
    }));
}

// ─── Builder form ─────────────────────────────────────────────────────────

function _showChartBuilder(id, container) {
  const existing = id ? getChartViews().find(v => v.id === id) : null;
  const cats     = getCategories();
  const builder  = container.querySelector('#chart-builder');

  builder.innerHTML = `
    <div class="panel" style="max-width:540px;margin-bottom:1.5rem">
      <h4>${existing ? 'Edytuj' : 'Nowy'} widok</h4>

      <label>Nazwa <input type="text" id="cb-name" value="${_cEsc(existing?.name || '')}"
        placeholder="np. Wydatki czerwiec"></label>

      <label>Typ wykresu
        <select id="cb-type">
          <option value="bar-category"        ${existing?.type === 'bar-category'        ? 'selected':''}>Wydatki wg kategorii (słupki poziome)</option>
          <option value="monthly-comparison"  ${existing?.type === 'monthly-comparison'  ? 'selected':''}>Przychody vs wydatki (miesiącami)</option>
          <option value="category-trend"      ${existing?.type === 'category-trend'      ? 'selected':''}>Trend kategorii (linie)</option>
        </select>
      </label>

      <label>Okres
        <select id="cb-period">
          <option value="this-month" ${existing?.period === 'this-month' ? 'selected':''}>Bieżący miesiąc</option>
          <option value="last-3"     ${existing?.period === 'last-3'     ? 'selected':''}>Ostatnie 3 miesiące</option>
          <option value="last-6"     ${existing?.period === 'last-6'     ? 'selected':''}>Ostatnie 6 miesięcy</option>
          <option value="last-12"    ${existing?.period === 'last-12'    ? 'selected':''}>Ostatnie 12 miesięcy</option>
        </select>
      </label>

      <div id="cb-cats-wrap">
        <div class="setting-label" style="margin-bottom:0.4rem">Kategorie (dla Trendu — zaznacz które śledzić)</div>
        <div class="chart-cat-list">
          ${cats.map(c => `
            <label class="chart-cat-item">
              <input type="checkbox" value="${c.id}" class="cb-cat"
                ${(existing?.categoryIds || []).includes(c.id) ? 'checked' : ''}>
              <span class="account-dot" style="background:${c.color}"></span>
              ${_cEsc(c.name)}
            </label>`).join('')}
        </div>
      </div>

      <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
        <button id="cb-save">Zapisz</button>
        <button id="cb-cancel" class="btn-ghost">Anuluj</button>
      </div>
    </div>
  `;

  const typeEl     = builder.querySelector('#cb-type');
  const catsWrapEl = builder.querySelector('#cb-cats-wrap');
  const toggleCats = () => {
    catsWrapEl.style.display = typeEl.value === 'category-trend' ? '' : 'none';
  };
  toggleCats();
  typeEl.addEventListener('change', toggleCats);

  builder.querySelector('#cb-cancel').addEventListener('click', () => { builder.innerHTML = ''; });
  builder.querySelector('#cb-save').addEventListener('click', () => {
    const name        = builder.querySelector('#cb-name').value.trim();
    const type        = builder.querySelector('#cb-type').value;
    const period      = builder.querySelector('#cb-period').value;
    const categoryIds = [...builder.querySelectorAll('.cb-cat:checked')].map(el => el.value);
    if (!name) { alert('Podaj nazwę widoku.'); return; }
    upsertChartView(existing
      ? { ...existing, name, type, period, categoryIds }
      : createChartView(name, type, period, categoryIds));
    builder.innerHTML = '';
    _renderChartGrid(container);
  });
}

// ─── Chart rendering ──────────────────────────────────────────────────────

function _renderOneChart(view) {
  const canvas = document.getElementById(`canvas-${view.id}`);
  const wrap   = document.getElementById(`wrap-${view.id}`);
  if (!canvas || !wrap) return;

  if (_chartInstances[view.id]) {
    _chartInstances[view.id].destroy();
    delete _chartInstances[view.id];
  }

  const txs  = getTransactions().filter(t => !t.isInternalTransfer);
  const cats = getCategories();

  if (view.type === 'bar-category')       _chartBarCategory(canvas, wrap, view, txs, cats);
  else if (view.type === 'monthly-comparison') _chartMonthly(canvas, wrap, view, txs);
  else if (view.type === 'category-trend') _chartTrend(canvas, wrap, view, txs, cats);
}

// Wydatki wg kategorii — horizontal bar
function _chartBarCategory(canvas, wrap, view, txs, cats) {
  const months = _periodMonths(view.period);
  const monthSet = new Set(months);
  const filtered = txs.filter(t => monthSet.has(t.monthKey) && t.amount < 0);

  const byId = {};
  for (const t of filtered) {
    const k = t.categoryId || '__none__';
    byId[k] = (byId[k] || 0) + Math.abs(t.amount);
  }

  const catMap = Object.fromEntries(cats.map(c => [c.id, c]));
  const rows = Object.entries(byId)
    .map(([id, amt]) => ({
      label: id === '__none__' ? 'Bez kategorii' : (catMap[id]?.name || '?'),
      amt:   parseFloat(amt.toFixed(2)),
      color: id === '__none__' ? '#94a3b8' : (catMap[id]?.color || '#8b5cf6'),
    }))
    .sort((a, b) => b.amt - a.amt);

  if (!rows.length) { _emptyChart(wrap); return; }

  wrap.style.height = Math.max(180, rows.length * 38 + 40) + 'px';

  _chartInstances[view.id] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels:   rows.map(r => r.label),
      datasets: [{
        data:            rows.map(r => r.amt),
        backgroundColor: rows.map(r => r.color + 'bb'),
        borderColor:     rows.map(r => r.color),
        borderWidth:     1,
        borderRadius:    4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x.toFixed(2)} zł` } },
      },
      scales: {
        x: { beginAtZero: true, ticks: { callback: v => v + ' zł' }, grid: { color: '#f1f5f9' } },
        y: { grid: { display: false } },
      },
    },
  });
}

// Przychody vs wydatki — grouped bar per month
function _chartMonthly(canvas, wrap, view, txs) {
  const months = _periodMonths(view.period);
  const income = {}, expense = {};
  months.forEach(m => { income[m] = 0; expense[m] = 0; });

  for (const t of txs) {
    if (!income.hasOwnProperty(t.monthKey)) continue;
    if (t.amount > 0) income[t.monthKey]  += t.amount;
    else              expense[t.monthKey] += Math.abs(t.amount);
  }

  wrap.style.height = '300px';

  _chartInstances[view.id] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months.map(_fmtMonth),
      datasets: [
        {
          label: 'Przychody',
          data:  months.map(m => parseFloat(income[m].toFixed(2))),
          backgroundColor: '#10b98166',
          borderColor:     '#10b981',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Wydatki',
          data:  months.map(m => parseFloat(expense[m].toFixed(2))),
          backgroundColor: '#ef444466',
          borderColor:     '#ef4444',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} zł` } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + ' zł' }, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false } },
      },
    },
  });
}

// Trend kategorii — multi-line
function _chartTrend(canvas, wrap, view, txs, cats) {
  const catIds = view.categoryIds || [];
  if (!catIds.length) { _emptyChart(wrap, 'Brak wybranych kategorii — edytuj widok i zaznacz kategorie.'); return; }

  const months = _periodMonths(view.period);
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]));

  const datasets = catIds.map(cid => {
    const cat  = catMap[cid];
    const data = months.map(m =>
      parseFloat(txs
        .filter(t => t.monthKey === m && t.categoryId === cid && t.amount < 0)
        .reduce((s, t) => s + Math.abs(t.amount), 0)
        .toFixed(2)));
    return {
      label:           cat?.name || cid,
      data,
      borderColor:     cat?.color || '#8b5cf6',
      backgroundColor: (cat?.color || '#8b5cf6') + '22',
      borderWidth: 2,
      pointRadius: 4,
      tension: 0.3,
      fill: false,
    };
  });

  wrap.style.height = '300px';

  _chartInstances[view.id] = new Chart(canvas, {
    type: 'line',
    data: { labels: months.map(_fmtMonth), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} zł` } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v + ' zł' }, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false } },
      },
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function _periodMonths(period) {
  const n = { 'this-month': 1, 'last-3': 3, 'last-6': 6, 'last-12': 12 }[period] || 6;
  const months = [];
  const now    = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function _fmtMonth(key) {
  const [y, m] = key.split('-');
  return `${MONTHS_PL[parseInt(m, 10) - 1]} ${y}`;
}

function _periodLabel(period) {
  return { 'this-month': 'bieżący miesiąc', 'last-3': 'ostatnie 3 mies.', 'last-6': 'ostatnie 6 mies.', 'last-12': 'ostatnie 12 mies.' }[period] || period;
}

function _emptyChart(wrap, msg) {
  wrap.innerHTML = `<p class="chart-empty">${msg || 'Brak danych dla wybranego okresu.'}</p>`;
}

function _destroyAllCharts() {
  Object.values(_chartInstances).forEach(c => { try { c.destroy(); } catch(e) {} });
  _chartInstances = {};
}

function _cEsc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

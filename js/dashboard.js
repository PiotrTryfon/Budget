var DASH_PERIODS = [
  { label: '1M',  n: 1  },
  { label: '2M',  n: 2  },
  { label: '3M',  n: 3  },
  { label: '6M',  n: 6  },
  { label: 'Rok', n: 12 },
];

function renderDashboard(container) {
  const allTransactions = getTransactions();

  // ── Empty state ──
  if (allTransactions.length === 0) {
    container.innerHTML = `
      <h2>Dashboard</h2>
      <div class="empty-state">
        <div class="empty-icon">₿</div>
        <h3>Brak transakcji</h3>
        <p>Zaimportuj pierwszy wyciąg bankowy, aby zobaczyć podsumowanie budżetu.</p>
        <button id="btn-go-import">Importuj wyciąg →</button>
      </div>
    `;
    container.querySelector('#btn-go-import').addEventListener('click', () => navigate('import'));
    return;
  }

  const months = [...new Set(allTransactions.map(t => t.monthKey))].sort().reverse();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let anchorIdx = months.indexOf(currentMonth);
  if (anchorIdx < 0) anchorIdx = 0;
  let periodN = 1;

  container.innerHTML = `
    <h2>Dashboard</h2>
    <div class="dash-controls">
      <div class="period-tabs">
        ${DASH_PERIODS.map(p =>
          `<button class="period-tab${p.n === 1 ? ' active' : ''}" data-n="${p.n}">${p.label}</button>`
        ).join('')}
      </div>
      <div id="month-nav">
        <button id="prev-month">&#8249;</button>
        <span id="month-label"></span>
        <button id="next-month">&#8250;</button>
      </div>
    </div>
    <div id="summary-cards"></div>
    <div id="month-breakdown"></div>
    <div id="category-breakdown"></div>
  `;

  container.querySelectorAll('.period-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      periodN = parseInt(btn.dataset.n);
      container.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDash();
    });
  });

  container.querySelector('#prev-month').addEventListener('click', () => {
    if (anchorIdx < months.length - 1) { anchorIdx++; renderDash(); }
  });
  container.querySelector('#next-month').addEventListener('click', () => {
    if (anchorIdx > 0) { anchorIdx--; renderDash(); }
  });

  function renderDash() {
    const windowMonths = months.slice(anchorIdx, anchorIdx + periodN);
    const oldestIdx    = Math.min(anchorIdx + periodN - 1, months.length - 1);

    container.querySelector('#prev-month').disabled = oldestIdx >= months.length - 1;
    container.querySelector('#next-month').disabled = anchorIdx <= 0;

    if (windowMonths.length === 0) {
      container.querySelector('#month-label').textContent = '—';
      container.querySelector('#summary-cards').innerHTML =
        '<p style="color:var(--text-muted)">Brak danych.</p>';
      container.querySelector('#month-breakdown').innerHTML  = '';
      container.querySelector('#category-breakdown').innerHTML = '';
      return;
    }

    container.querySelector('#month-label').textContent = windowMonths.length === 1
      ? windowMonths[0]
      : `${windowMonths[windowMonths.length - 1]} – ${windowMonths[0]}`;

    renderSummary(windowMonths, periodN, container);
  }

  renderDash();
}

// ── Previous-period helper ────────────────────────────────────────────────

function _prevWindowMonths(windowMonths) {
  const n = windowMonths.length;
  return windowMonths.map(m => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 - n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

function _fmtDelta(curr, prev, lowerIsBetter) {
  if (Math.abs(prev) < 0.01) return '';
  const diff = curr - prev;
  if (Math.abs(diff) < 0.01) return '';
  const pct = Math.round(Math.abs(diff / prev) * 100);
  const up  = diff > 0;
  const pos = lowerIsBetter ? !up : up;
  return `<span class="card-delta ${pos ? 'delta-pos' : 'delta-neg'}">${up ? '▲' : '▼'} ${pct}%</span>`;
}

function _budgetBar(spent, budget) {
  const pct = Math.min((spent / budget) * 100, 100);
  const color = pct >= 100 ? '#ef4444' : pct >= 75 ? '#f97316' : '#22c55e';
  const remaining = budget - spent;
  const remainStr = remaining >= 0
    ? `pozostało ${remaining.toFixed(0)} zł`
    : `przekroczone o ${Math.abs(remaining).toFixed(0)} zł`;
  return `
    <div class="budget-wrap">
      <div class="budget-bar-track">
        <div class="budget-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="budget-label">${spent.toFixed(0)} / ${budget} zł · ${remainStr}</span>
    </div>`;
}

// ── Summary ───────────────────────────────────────────────────────────────

function renderSummary(windowMonths, periodN, container) {
  const allTx  = getTransactions();
  const catMap = Object.fromEntries(getCategories().map(c => [c.id, c]));
  const all    = allTx.filter(t => windowMonths.includes(t.monthKey) && !t.isInternalTransfer);

  const income   = all.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expenses = all.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const balance  = income + expenses;
  const savings  = income + expenses; // same as balance
  const savingsRate = income > 0 ? (savings / income * 100) : null;

  // Previous period for deltas
  const prevMonths  = _prevWindowMonths(windowMonths);
  const prevAll     = allTx.filter(t => prevMonths.includes(t.monthKey) && !t.isInternalTransfer);
  const prevIncome  = prevAll.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const prevExpense = prevAll.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const prevBalance = prevIncome + prevExpense;

  // ── Summary cards ──
  container.querySelector('#summary-cards').innerHTML = `
    <div class="cards">
      <div class="card income">
        <div class="card-label">Przychody ${_fmtDelta(income, prevIncome, false)}</div>
        <div class="card-value">+${income.toFixed(2)} zł</div>
      </div>
      <div class="card expenses">
        <div class="card-label">Wydatki ${_fmtDelta(Math.abs(expenses), Math.abs(prevExpense), true)}</div>
        <div class="card-value">${expenses.toFixed(2)} zł</div>
      </div>
      <div class="card balance ${balance >= 0 ? 'positive' : 'negative'}">
        <div class="card-label">Bilans ${_fmtDelta(balance, prevBalance, false)}</div>
        <div class="card-value">${balance >= 0 ? '+' : ''}${balance.toFixed(2)} zł</div>
      </div>
      <div class="card ${savings >= 0 ? 'positive' : 'negative'}">
        <div class="card-label">Oszczędności</div>
        <div class="card-value">
          ${savings >= 0 ? '+' : ''}${savings.toFixed(2)} zł
          ${savingsRate !== null ? `<span class="savings-rate">${savingsRate.toFixed(0)}%</span>` : ''}
        </div>
      </div>
    </div>
  `;

  // ── Per-month table (multi-month only) ──
  if (windowMonths.length > 1) {
    const monthRows = [...windowMonths].sort().reverse().map(m => {
      const mTx  = allTx.filter(t => t.monthKey === m && !t.isInternalTransfer);
      const mInc = mTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const mExp = mTx.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
      const mBal = mInc + mExp;
      return { m, mInc, mExp, mBal };
    });

    container.querySelector('#month-breakdown').innerHTML = `
      <h4 style="margin:1.25rem 0 0.5rem;font-size:0.85rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">
        Zestawienie miesięczne
      </h4>
      <div class="table-wrap" style="margin-bottom:1.5rem">
        <table>
          <thead>
            <tr>
              <th>Miesiąc</th>
              <th>Przychody</th>
              <th>Wydatki</th>
              <th>Bilans</th>
            </tr>
          </thead>
          <tbody>
            ${monthRows.map(r => `
              <tr>
                <td style="font-variant-numeric:tabular-nums">${r.m}</td>
                <td class="amount-pos">+${r.mInc.toFixed(2)} zł</td>
                <td class="amount-neg">${r.mExp.toFixed(2)} zł</td>
                <td class="${r.mBal >= 0 ? 'amount-pos' : 'amount-neg'}">
                  ${r.mBal >= 0 ? '+' : ''}${r.mBal.toFixed(2)} zł
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    container.querySelector('#month-breakdown').innerHTML = '';
  }

  // ── Category breakdown ──
  const expenseOnly   = all.filter(t => t.amount < 0);
  const totalExpenses = Math.abs(expenses);

  const byCategory = {};
  expenseOnly.forEach(t => {
    const key = t.categoryId || '__none__';
    byCategory[key] = (byCategory[key] || 0) + Math.abs(t.amount);
  });

  const rows = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([catId, amount]) => ({
      cat:    catMap[catId],
      amount,
      pct:    totalExpenses > 0 ? ((amount / totalExpenses) * 100).toFixed(1) : '0.0',
    }));

  const uncategorized = expenseOnly.filter(t => !t.categoryId).length;
  const sectionLabel  = windowMonths.length > 1 ? 'w tym okresie' : 'w tym miesiącu';
  const isOneMonth    = windowMonths.length === 1;
  const hasBudgets    = isOneMonth && rows.some(r => r.cat?.monthlyBudget > 0);

  container.querySelector('#category-breakdown').innerHTML = rows.length === 0
    ? `<p style="color:var(--text-muted)">Brak wydatków ${sectionLabel}.</p>`
    : `
      ${uncategorized > 0
        ? `<div class="msg-warning">&#9888; ${uncategorized} wydatk${uncategorized === 1 ? '' : 'ów'} bez kategorii</div>`
        : ''}
      <h4 style="margin:0.25rem 0 0.5rem;font-size:0.85rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">
        Wydatki wg kategorii
      </h4>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Kategoria</th><th>Kwota</th>
            ${hasBudgets ? '<th>Budżet</th>' : ''}
            <th>Udział</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.cat
                  ? `<span style="color:${r.cat.color}">&#9632;</span> ${escHtml(r.cat.name)}`
                  : '<span class="uncategorized">Bez kategorii</span>'}</td>
                <td class="amount-neg">${r.amount.toFixed(2)} zł</td>
                ${hasBudgets ? `<td>${r.cat?.monthlyBudget > 0 ? _budgetBar(r.amount, r.cat.monthlyBudget) : '—'}</td>` : ''}
                <td>
                  <div style="display:flex;align-items:center;gap:0.5rem">
                    <div style="background:${r.cat?.color || '#94a3b8'};height:6px;border-radius:3px;width:${r.pct}px;max-width:80px;min-width:3px"></div>
                    ${r.pct}%
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
}

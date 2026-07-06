var _lastDeletedTx  = null;
var _undoTimer      = null;
var _txSortCol      = 'date';
var _txSortDir      = 'desc';
var _selectedTxIds  = new Set();

function renderTransactions(container) {
  _selectedTxIds = new Set();
  const transactions = getTransactions();
  const months = [...new Set(transactions.map(t => t.monthKey))].sort().reverse();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const defaultMonth = months.includes(currentMonth) ? currentMonth : (months[0] || currentMonth);

  container.innerHTML = `
    <h2>Transakcje</h2>
    <div class="filters">
      <select id="filter-month">
        ${months.map(m => `<option value="${m}" ${m === defaultMonth ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
      <select id="filter-category">
        <option value="">Wszystkie kategorie</option>
        <option value="__none__">Bez kategorii</option>
        ${getCategories().map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
      </select>
      <input type="text" id="filter-search" placeholder="Szukaj w opisie…" style="flex:1;min-width:120px;max-width:240px">
      <label>
        <input type="checkbox" id="filter-transfers"> Pokaż transfery wewn.
      </label>
    </div>
    <div id="tx-table-wrap"></div>
    <button id="btn-add-manual" style="margin-top:1rem">+ Dodaj ręcznie</button>
    <div id="manual-form"></div>
    <div class="bulk-bar" id="tx-bulk-bar"></div>
  `;

  const doRender = () => renderTxTable(container);
  container.querySelector('#filter-month').addEventListener('change', doRender);
  container.querySelector('#filter-category').addEventListener('change', doRender);
  container.querySelector('#filter-transfers').addEventListener('change', doRender);
  container.querySelector('#filter-search').addEventListener('input', doRender);
  container.querySelector('#btn-add-manual').addEventListener('click', () => renderManualForm(container, doRender));

  doRender();
}

function renderTxTable(container) {
  _selectedTxIds = new Set();

  const month         = container.querySelector('#filter-month').value;
  const catFilter     = container.querySelector('#filter-category').value;
  const showTransfers = container.querySelector('#filter-transfers').checked;
  const searchTerm    = (container.querySelector('#filter-search').value || '').toLowerCase().trim();

  let rows = getTransactions().filter(t => t.monthKey === month);
  if (!showTransfers) rows = rows.filter(t => !t.isInternalTransfer);
  if (catFilter === '__none__') {
    rows = rows.filter(t => !t.categoryId && !(t.extraCategoryIds?.length));
  } else if (catFilter) {
    rows = rows.filter(t =>
      t.categoryId === catFilter || (t.extraCategoryIds || []).includes(catFilter)
    );
  }
  if (searchTerm) {
    rows = rows.filter(t => (t.description || '').toLowerCase().includes(searchTerm));
  }

  // Sort
  rows.sort((a, b) => {
    let cmp = 0;
    if (_txSortCol === 'date')   cmp = a.date.localeCompare(b.date);
    if (_txSortCol === 'amount') cmp = a.amount - b.amount;
    if (_txSortCol === 'desc')   cmp = (a.description || '').localeCompare(b.description || '');
    return _txSortDir === 'asc' ? cmp : -cmp;
  });

  const catMap = Object.fromEntries(getCategories().map(c => [c.id, c]));

  function sortIcon(col) {
    if (_txSortCol !== col) return ' <span class="sort-hint">⇅</span>';
    return _txSortDir === 'asc' ? ' ↑' : ' ↓';
  }

  const tableHtml = rows.length === 0
    ? '<p style="color:var(--text-muted);margin-top:1rem">Brak transakcji.</p>'
    : `<div class="table-wrap"><table>
        <thead>
          <tr>
            <th><input type="checkbox" id="chk-select-all" title="Zaznacz wszystkie"></th>
            <th class="th-sort${_txSortCol === 'date' ? ' sort-active' : ''}" data-col="date">Data${sortIcon('date')}</th>
            <th class="th-sort${_txSortCol === 'amount' ? ' sort-active' : ''}" data-col="amount">Kwota${sortIcon('amount')}</th>
            <th class="th-sort${_txSortCol === 'desc' ? ' sort-active' : ''}" data-col="desc">Opis${sortIcon('desc')}</th>
            <th>Kategorie</th><th>Transfer</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(t => {
            const allCatIds = [t.categoryId, ...(t.extraCategoryIds || [])].filter(Boolean);
            return `<tr class="${t.needsReview ? 'row-review' : ''}">
              <td><input type="checkbox" class="chk-bulk" data-id="${t.id}"></td>
              <td>${t.date}</td>
              <td class="${t.amount < 0 ? 'amount-neg' : 'amount-pos'}">${t.amount.toFixed(2)}</td>
              <td class="cell-desc${t.rawRow ? ' has-raw' : ''}" data-id="${t.id}"
                title="${t.rawRow ? 'Kliknij aby zobaczyć dane oryginalne' : ''}"
              >${escHtml(t.description)}</td>
              <td class="cell-category" data-id="${t.id}">
                ${allCatIds.length
                  ? allCatIds.map(id => {
                      const c = catMap[id];
                      return c
                        ? `<span class="cat-chip" style="background:${c.color}18;border-color:${c.color}55;color:${c.color}">${escHtml(c.name)}</span>`
                        : '';
                    }).join('')
                  : '<span class="uncategorized">+ dodaj</span>'}
                <span class="cat-edit-icon">✎</span>
              </td>
              <td><input type="checkbox" class="chk-transfer" data-id="${t.id}" ${t.isInternalTransfer ? 'checked' : ''}></td>
              <td><button class="btn-del-tx btn-danger" data-id="${t.id}" style="padding:0.2rem 0.5rem;font-size:0.75rem">✕</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;

  container.querySelector('#tx-table-wrap').innerHTML = tableHtml;

  // ── Sort headers ──
  container.querySelectorAll('.th-sort').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (_txSortCol === col) {
        _txSortDir = _txSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        _txSortCol = col;
        _txSortDir = col === 'date' ? 'desc' : 'asc';
      }
      renderTxTable(container);
    });
  });

  // ── Select all ──
  const selectAllChk = container.querySelector('#chk-select-all');
  if (selectAllChk) {
    selectAllChk.addEventListener('change', () => {
      if (selectAllChk.checked) {
        rows.forEach(t => _selectedTxIds.add(t.id));
      } else {
        _selectedTxIds = new Set();
      }
      container.querySelectorAll('.chk-bulk').forEach(c => { c.checked = _selectedTxIds.has(c.dataset.id); });
      updateBulkBar(container);
    });
  }

  // ── Row checkboxes ──
  container.querySelectorAll('.chk-bulk').forEach(chk => {
    chk.addEventListener('change', () => {
      if (chk.checked) _selectedTxIds.add(chk.dataset.id);
      else             _selectedTxIds.delete(chk.dataset.id);
      updateBulkBar(container);
    });
  });

  // ── Category editor ──
  container.querySelectorAll('.cell-category').forEach(cell => {
    cell.addEventListener('click', e => {
      if (document.querySelector('.cat-multi-popup')) return;
      const tx = getTransactions().find(t => t.id === cell.dataset.id);
      if (tx) openCategoryEditor(cell, tx, () => { renderTxTable(container); updateReviewBadge(); });
    });
  });

  // ── Transfer checkbox ──
  container.querySelectorAll('.chk-transfer').forEach(chk => {
    chk.addEventListener('change', e => {
      const tx = getTransactions().find(t => t.id === e.target.dataset.id);
      if (tx) upsertTransaction({ ...tx, isInternalTransfer: e.target.checked, transferSource: 'manual' });
    });
  });

  // ── Delete ──
  container.querySelectorAll('.btn-del-tx').forEach(btn => {
    btn.addEventListener('click', e => {
      const { confirmDelete } = getSettings();
      if (confirmDelete && !confirm('Usunąć tę transakcję?')) return;
      _lastDeletedTx = getTransactions().find(t => t.id === e.target.dataset.id);
      deleteTransaction(e.target.dataset.id);
      renderTxTable(container);
      showUndoToast(container);
    });
  });

  // ── Raw data popup ──
  container.querySelectorAll('.cell-desc.has-raw').forEach(cell => {
    cell.addEventListener('click', () => {
      const tx = getTransactions().find(t => t.id === cell.dataset.id);
      if (tx?.rawRow) showRawDataPopup(tx);
    });
  });

  updateBulkBar(container);
}

// ── Bulk action bar ────────────────────────────────────────────────────────

function updateBulkBar(container) {
  const bar  = container.querySelector('#tx-bulk-bar');
  if (!bar) return;
  const n    = _selectedTxIds.size;
  const cats = getCategories();

  if (n === 0) {
    bar.classList.remove('visible');
    bar.innerHTML = '';
    return;
  }

  bar.classList.add('visible');
  bar.innerHTML = `
    <span class="bulk-count">${n} zaznaczon${n === 1 ? 'a' : 'ych'}</span>
    <select id="bulk-cat-sel">
      <option value="">-- wybierz kategorię --</option>
      ${cats.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
    </select>
    <button id="btn-bulk-apply">Zastosuj kategorię</button>
    <button id="btn-bulk-clear" class="btn-ghost">Odznacz wszystkie</button>
  `;

  bar.querySelector('#btn-bulk-apply').addEventListener('click', () => {
    const catId = bar.querySelector('#bulk-cat-sel').value;
    if (!catId) { alert('Wybierz kategorię.'); return; }
    const txs = getTransactions();
    _selectedTxIds.forEach(id => {
      const tx = txs.find(t => t.id === id);
      if (tx) upsertTransaction({ ...tx, categoryId: catId, extraCategoryIds: [], categorySource: 'manual', needsReview: false });
    });
    _selectedTxIds = new Set();
    renderTxTable(container);
    updateReviewBadge();
  });

  bar.querySelector('#btn-bulk-clear').addEventListener('click', () => {
    _selectedTxIds = new Set();
    renderTxTable(container);
  });
}

// ── Raw data popup ─────────────────────────────────────────────────────────

function showRawDataPopup(tx) {
  const overlay = document.createElement('div');
  overlay.className = 'raw-popup-overlay';
  const rows = Object.entries(tx.rawRow)
    .map(([k, v]) => `<tr><th>${escHtml(k)}</th><td>${escHtml(String(v ?? ''))}</td></tr>`)
    .join('');
  overlay.innerHTML = `
    <div class="raw-popup">
      <div class="raw-popup-header">
        <strong>Dane oryginalne</strong>
        <button class="raw-popup-close btn-ghost" style="padding:0.2rem 0.5rem">✕ Zamknij</button>
      </div>
      <table class="raw-popup-table">${rows}</table>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.raw-popup-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ─── Multi-category editor ────────────────────────────────────────────────

function openCategoryEditor(cell, tx, onDone) {
  const cats = getCategories();
  let selected = [tx.categoryId, ...(tx.extraCategoryIds || [])].filter(Boolean);

  const overlay = document.createElement('div');
  overlay.className = 'cat-editor-overlay';

  const popup = document.createElement('div');
  popup.className = 'cat-multi-popup';

  const rect = cell.getBoundingClientRect();
  popup.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  popup.style.left = `${rect.left   + window.scrollX}px`;

  function close() {
    overlay.remove();
    onDone();
  }

  function save() {
    const [newPrimary = null, ...newExtras] = selected;
    upsertTransaction({
      ...tx,
      categoryId:       newPrimary,
      extraCategoryIds: newExtras,
      categorySource:   selected.length > 0 ? 'manual' : 'none',
      needsReview:      false,
    });
  }

  function renderChips() {
    popup.innerHTML = `
      <div class="cat-popup-header">
        <span class="cat-popup-title">Kategorie</span>
        <button class="cat-popup-done">Gotowe</button>
      </div>
      <div class="cat-chip-picker">
        ${cats.map(c => `
          <button class="cat-pick-chip${selected.includes(c.id) ? ' selected' : ''}"
            data-id="${c.id}" style="--cc:${c.color}">
            ${escHtml(c.name)}
          </button>
        `).join('')}
        ${selected.length > 0 ? `<button class="cat-pick-clear">✕ Wyczyść</button>` : ''}
      </div>
    `;
    popup.querySelector('.cat-popup-done').addEventListener('click', close);
    const clearBtn = popup.querySelector('.cat-pick-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      selected = [];
      save();
      renderChips();
    });
    popup.querySelectorAll('.cat-pick-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        selected = selected.includes(id)
          ? selected.filter(x => x !== id)
          : [...selected, id];
        save();
        renderChips();
      });
    });
  }

  renderChips();
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) close();
  });
}

// ─── Manual form ──────────────────────────────────────────────────────────

function renderManualForm(container, onSave) {
  const form = container.querySelector('#manual-form');
  const cats = getCategories();

  form.innerHTML = `
    <div class="panel" style="max-width:420px;margin-top:1rem">
      <h4>Dodaj ręcznie</h4>
      <label>Data <input type="date" id="m-date" value="${new Date().toISOString().slice(0,10)}"></label>
      <label>Kwota (ujemna = wydatek) <input type="number" id="m-amount" step="0.01" placeholder="-50.00"></label>
      <label>Opis <input type="text" id="m-desc" placeholder="np. Kiosk, gotówka"></label>
      <div class="m-cat-label">Kategorie</div>
      <div class="cat-chip-picker cat-chip-picker--form" id="m-cat-picker">
        ${cats.map(c => `
          <button type="button" class="cat-pick-chip" data-id="${c.id}" style="--cc:${c.color}">
            ${escHtml(c.name)}
          </button>
        `).join('')}
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
        <button id="m-save">Zapisz</button>
        <button id="m-cancel" class="btn-ghost">Anuluj</button>
      </div>
    </div>
  `;

  form.querySelectorAll('#m-cat-picker .cat-pick-chip').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('selected'));
  });

  form.querySelector('#m-cancel').addEventListener('click', () => { form.innerHTML = ''; });
  form.querySelector('#m-save').addEventListener('click', () => {
    const date        = form.querySelector('#m-date').value;
    const amount      = parseFloat(form.querySelector('#m-amount').value);
    const description = form.querySelector('#m-desc').value.trim();
    const checked     = [...form.querySelectorAll('#m-cat-picker .cat-pick-chip.selected')].map(b => b.dataset.id);
    if (!date || isNaN(amount) || !description) { alert('Wypełnij datę, kwotę i opis.'); return; }

    const [primaryCat = null, ...extraCats] = checked;
    upsertTransaction({
      id:                 'tx_manual_' + generateId(),
      date, amount, description,
      bank:               'manual',
      sourceType:         'manual',
      rawRow:             null,
      categoryId:         primaryCat,
      extraCategoryIds:   extraCats,
      categorySource:     primaryCat ? 'manual' : 'none',
      isInternalTransfer: false,
      transferSource:     'none',
      importBatchId:      null,
      monthKey:           date.slice(0, 7),
      needsReview:        false,
    });
    form.innerHTML = '';
    onSave();
  });
}

// ─── Undo toast ───────────────────────────────────────────────────────────

function showUndoToast(container) {
  clearTimeout(_undoTimer);

  let toast = document.getElementById('undo-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'undo-toast';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `<span>Transakcja usunięta</span><button id="btn-undo">Cofnij</button>`;
  toast.classList.add('visible');

  document.getElementById('btn-undo').addEventListener('click', () => {
    clearTimeout(_undoTimer);
    if (_lastDeletedTx) {
      upsertTransaction(_lastDeletedTx);
      _lastDeletedTx = null;
    }
    toast.classList.remove('visible');
    if (!container.classList.contains('hidden')) renderTxTable(container);
  });

  _undoTimer = setTimeout(() => {
    toast.classList.remove('visible');
    _lastDeletedTx = null;
  }, 5000);
}

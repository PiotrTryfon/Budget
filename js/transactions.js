var _lastDeletedTx = null;
var _undoTimer     = null;

function renderTransactions(container) {
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
      <label>
        <input type="checkbox" id="filter-transfers"> Pokaż transfery wewn.
      </label>
    </div>
    <div id="tx-table-wrap"></div>
    <button id="btn-add-manual" style="margin-top:1rem">+ Dodaj ręcznie</button>
    <div id="manual-form"></div>
  `;

  const doRender = () => renderTxTable(container);
  container.querySelector('#filter-month').addEventListener('change', doRender);
  container.querySelector('#filter-category').addEventListener('change', doRender);
  container.querySelector('#filter-transfers').addEventListener('change', doRender);
  container.querySelector('#btn-add-manual').addEventListener('click', () => renderManualForm(container, doRender));

  doRender();
}

function renderTxTable(container) {
  const month         = container.querySelector('#filter-month').value;
  const catFilter     = container.querySelector('#filter-category').value;
  const showTransfers = container.querySelector('#filter-transfers').checked;

  let rows = getTransactions().filter(t => t.monthKey === month);
  if (!showTransfers) rows = rows.filter(t => !t.isInternalTransfer);

  if (catFilter === '__none__') {
    rows = rows.filter(t => !t.categoryId && !(t.extraCategoryIds?.length));
  } else if (catFilter) {
    rows = rows.filter(t =>
      t.categoryId === catFilter || (t.extraCategoryIds || []).includes(catFilter)
    );
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));

  const catMap = Object.fromEntries(getCategories().map(c => [c.id, c]));

  container.querySelector('#tx-table-wrap').innerHTML = rows.length === 0
    ? '<p style="color:var(--text-muted);margin-top:1rem">Brak transakcji.</p>'
    : `<div class="table-wrap"><table>
        <thead>
          <tr>
            <th>Data</th><th>Kwota</th><th>Opis</th>
            <th>Kategorie</th><th>Transfer</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(t => {
            const allCatIds = [t.categoryId, ...(t.extraCategoryIds || [])].filter(Boolean);
            return `<tr class="${t.needsReview ? 'row-review' : ''}">
              <td>${t.date}</td>
              <td class="${t.amount < 0 ? 'amount-neg' : 'amount-pos'}">${t.amount.toFixed(2)}</td>
              <td>${escHtml(t.description)}</td>
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

  container.querySelectorAll('.cell-category').forEach(cell => {
    cell.addEventListener('click', e => {
      if (document.querySelector('.cat-multi-popup')) return;
      const tx = getTransactions().find(t => t.id === cell.dataset.id);
      if (tx) openCategoryEditor(cell, tx, () => renderTxTable(container));
    });
  });
  container.querySelectorAll('.chk-transfer').forEach(chk => {
    chk.addEventListener('change', e => {
      const tx = getTransactions().find(t => t.id === e.target.dataset.id);
      if (tx) upsertTransaction({ ...tx, isInternalTransfer: e.target.checked });
    });
  });
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
}

// ─── Multi-category editor ────────────────────────────────────────────────

function openCategoryEditor(cell, tx, onDone) {
  const cats = getCategories();
  let selected = [tx.categoryId, ...(tx.extraCategoryIds || [])].filter(Boolean);

  // Overlay so tapping outside on mobile closes the popup reliably
  const overlay = document.createElement('div');
  overlay.className = 'cat-editor-overlay';

  const popup = document.createElement('div');
  popup.className = 'cat-multi-popup';

  // Position below cell on desktop; CSS overrides to bottom sheet on mobile
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

  // Toggle chips in form
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


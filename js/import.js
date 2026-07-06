var _pendingRows      = [];
var _pendingFileName  = '';
var _pendingAccountId = null;
var _accountAutoDetected = false;

// ─── Main render ──────────────────────────────────────────────────────────

function renderImport(container) {
  container.innerHTML = `
    <h2>Import</h2>
    <div id="import-drop-area"></div>
    <div id="import-table-area"></div>
  `;
  renderDropZone(container);
  if (_pendingRows.length > 0) renderEditableTable(container);
}

// ─── Step 1: file picker ──────────────────────────────────────────────────

function renderDropZone(container) {
  const area = container.querySelector('#import-drop-area');
  area.innerHTML = `
    <div id="drop-zone">
      <div>Przeciągnij plik CSV lub PDF tutaj</div>
      <span class="drop-hint">lub kliknij aby wybrać plik · CSV (Pekao) · PDF (PKO BP)</span>
    </div>
    <input type="file" id="file-input" accept=".csv,.pdf" style="display:none">
  `;

  const dropZone  = area.querySelector('#drop-zone');
  const fileInput = area.querySelector('#file-input');

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0], container);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => handleFile(e.target.files[0], container));
}

function handleFile(file, container) {
  if (!file) return;
  if (file.name.toLowerCase().endsWith('.pdf')) {
    handlePdfFile(file, container);
  } else {
    const reader = new FileReader();
    reader.onload = e => parseFile(e.target.result, file.name, container);
    reader.readAsText(file, ENCODING);
  }
}

async function handlePdfFile(file, container) {
  if (typeof pdfjsLib === 'undefined') {
    showImportMsg(container, 'error',
      'Biblioteka PDF.js niedostępna. Sprawdź połączenie z internetem i odśwież stronę.');
    return;
  }
  const tableArea = container.querySelector('#import-table-area');
  if (tableArea) tableArea.innerHTML =
    '<p style="padding:1.5rem;color:var(--text-muted)">Wczytuję PDF…</p>';

  try {
    let arrayBuffer;
    if (typeof file.arrayBuffer === 'function') {
      arrayBuffer = await file.arrayBuffer();
    } else {
      arrayBuffer = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = e => res(e.target.result);
        r.onerror = rej;
        r.readAsArrayBuffer(file);
      });
    }
    const text = await extractPdfText(arrayBuffer);
    parsePdfFile(text, file.name, container);
  } catch (err) {
    showImportMsg(container, 'error', 'Błąd odczytu PDF: ' + err.message);
  }
}

function parseFile(rawText, fileName, container) {
  if (!detectBankA(rawText)) {
    showImportMsg(container, 'error', 'Nierozpoznany format pliku. Obsługiwany jest eksport CSV z Pekao.');
    return;
  }

  let parsed;
  try { parsed = parseBankA(rawText); }
  catch (err) { showImportMsg(container, 'error', err.message); return; }

  if (parsed.length === 0) {
    showImportMsg(container, 'error', 'Plik nie zawiera transakcji.');
    return;
  }

  const rules      = getCategoryRules();
  const categories = getCategories();
  const accounts   = getAccounts();

  _pendingFileName  = fileName;
  const detected    = detectAccount(rawText, fileName, accounts);
  _pendingAccountId = detected ? detected.id : null;
  _accountAutoDetected = !!detected;

  _pendingRows = parsed.map(raw => {
    let { categoryId, categorySource, matchedRule } = categorizeTransaction(raw.description, rules);
    if (!categoryId && raw.bankCategory) {
      const matched = resolveBankCategory(raw.bankCategory, categories);
      if (matched) { categoryId = matched.id; categorySource = 'auto'; matchedRule = null; }
    }

    const category         = categories.find(c => c.id === categoryId);
    const needsReview      = !!(matchedRule?.requiresConfirmation || category?.requiresConfirmation);
    const isInternalTransfer = applyTransferRules(raw.description, rules);

    return {
      date:               raw.date,
      amount:             raw.amount,
      description:        raw.description,
      bank:               'bankA',
      sourceType:         'csv',
      rawRow:             raw.rawRow,
      bankCategory:       raw.bankCategory,
      categoryId,
      categorySource,
      accountId:          _pendingAccountId,
      isInternalTransfer,
      transferSource:     isInternalTransfer ? 'auto' : 'none',
      importBatchId:      null,
      needsReview,
      extraCategoryIds:   [],
      id:                 '',
      _isDuplicate:       false,
    };
  });

  recalcPendingIds();
  renderEditableTable(container);
}

function parsePdfFile(text, fileName, container) {
  if (!detectBankB(text)) {
    showImportMsg(container, 'error', 'Nierozpoznany format PDF. Obsługiwany jest wyciąg PKO BP.');
    return;
  }

  let parsed;
  try { parsed = parseBankB(text); }
  catch (err) { showImportMsg(container, 'error', 'Błąd parsowania PDF: ' + err.message); return; }

  if (parsed.length === 0) {
    showImportMsg(container, 'error',
      'Nie znaleziono transakcji w pliku. Sprawdź czy to wyciąg PKO BP w formacie PDF.');
    return;
  }

  const rules      = getCategoryRules();
  const categories = getCategories();
  const accounts   = getAccounts();

  _pendingFileName     = fileName;
  const detected       = detectAccount(text, fileName, accounts);
  _pendingAccountId    = detected ? detected.id : null;
  _accountAutoDetected = !!detected;

  _pendingRows = parsed.map(raw => {
    const { categoryId, categorySource, matchedRule } = categorizeTransaction(raw.description, rules);
    const category         = categories.find(c => c.id === categoryId);
    const needsReview      = !!(matchedRule?.requiresConfirmation || category?.requiresConfirmation);
    const isInternalTransfer = applyTransferRules(raw.description, rules);

    return {
      date:               raw.date,
      amount:             raw.amount,
      description:        raw.description,
      bank:               'bankB',
      sourceType:         'pdf',
      rawRow:             raw.rawRow,
      bankCategory:       null,
      categoryId,
      categorySource,
      accountId:          _pendingAccountId,
      isInternalTransfer,
      transferSource:     isInternalTransfer ? 'auto' : 'none',
      importBatchId:      null,
      needsReview,
      extraCategoryIds:   [],
      id:                 '',
      _isDuplicate:       false,
    };
  });

  recalcPendingIds();
  renderEditableTable(container);
}

// ─── Recalculate IDs + duplicate flags after any edit ────────────────────

function recalcPendingIds() {
  const existingIds = new Set(getTransactions().map(t => t.id));
  const counts      = {};

  _pendingRows.forEach(row => {
    const base = `${row.date}|${row.amount}|${row.description}`;
    if (counts[base] === undefined) counts[base] = 0;
    const occ    = counts[base]++;
    row.id       = buildTransactionId(row.date, row.amount, row.description, occ);
    row.monthKey = (row.date || '').slice(0, 7);
    row._isDuplicate = existingIds.has(row.id);
  });
}

// ─── Step 2: editable table ───────────────────────────────────────────────

function renderEditableTable(container) {
  const newCount     = _pendingRows.filter(r => !r._isDuplicate).length;
  const dupCount     = _pendingRows.length - newCount;
  const reviewCount  = _pendingRows.filter(r => r.needsReview && !r._isDuplicate).length;
  const tableArea    = container.querySelector('#import-table-area');

  const cats     = getCategories();
  const accs     = getAccounts();
  const catOptions = `<option value="">-- brak --</option>` +
    cats.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  const accOptions = `<option value="">-- nieznane --</option>` +
    accs.map(a => `<option value="${a.id}" ${a.id === _pendingAccountId ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('');

  tableArea.innerHTML = `
    <div class="import-bar">
      <div>
        <span class="import-stats">
          <strong>${escHtml(_pendingFileName)}</strong>
          &nbsp;·&nbsp; ${_pendingRows.length} wierszy
          &nbsp;·&nbsp; <span class="amount-pos">${newCount} nowych</span>
          ${dupCount    > 0 ? `&nbsp;·&nbsp; <span class="dup-count">${dupCount} duplikatów</span>` : ''}
          ${reviewCount > 0 ? `&nbsp;·&nbsp; <span class="review-count">&#9888; ${reviewCount} do sprawdzenia</span>` : ''}
        </span>
        <div class="account-bar">
          <span class="account-bar-label">Konto:</span>
          <select id="import-account-select" class="account-bar-select">
            ${accOptions}
          </select>
          ${_accountAutoDetected ? '<span class="badge-detected">wykryto automatycznie</span>' : ''}
          ${!_pendingAccountId ? `<span class="badge-warning">nie wykryto</span>
            <button id="btn-new-account-inline" class="btn-ghost" style="padding:0.2rem 0.5rem;font-size:0.78rem">+ Nowe konto</button>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:0.5rem;align-self:flex-start">
        <button id="btn-load-another" class="btn-ghost">Wczytaj inny plik</button>
        <button id="btn-cancel-import" class="btn-ghost">Anuluj</button>
        <button id="btn-confirm-import">Zatwierdź import (${newCount})</button>
      </div>
    </div>

    <div id="inline-account-area"></div>
    <div class="table-wrap" style="margin-top:0.75rem">
      <table id="import-table">
        <thead>
          <tr>
            <th style="width:1.5rem"></th>
            <th>Data</th>
            <th>Kwota</th>
            <th>Opis</th>
            <th>Kategoria</th>
            <th style="width:2rem"></th>
          </tr>
        </thead>
        <tbody>
          ${_pendingRows.map((row, i) => {
            const rowClass = row._isDuplicate ? 'row-duplicate' : (row.needsReview ? 'row-review' : '');
            return `
            <tr class="${rowClass}" data-idx="${i}">
              <td>${row._isDuplicate
                ? '<span class="badge badge-dup" title="Już istnieje w bazie">dup</span>'
                : row.needsReview
                  ? '<span class="badge badge-review" title="Wymaga potwierdzenia kategorii">&#9888;</span>'
                  : '<span class="badge badge-new">nowy</span>'}</td>
              <td><input class="cell-input" type="date"   data-idx="${i}" data-field="date"        value="${row.date}"></td>
              <td><input class="cell-input" type="number" data-idx="${i}" data-field="amount"      value="${row.amount}" step="0.01" style="width:90px"></td>
              <td><input class="cell-input" type="text"   data-idx="${i}" data-field="description" value="${escHtml(row.description)}" style="width:100%"></td>
              <td class="${row.needsReview && !row._isDuplicate ? 'cell-review' : ''}">
                <select class="cell-input" data-idx="${i}" data-field="categoryId">
                  ${catOptions}
                </select>
              </td>
              <td><button class="btn-danger btn-remove-row" data-idx="${i}" style="padding:0.2rem 0.45rem;font-size:0.75rem">✕</button></td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Set category selects to current values (can't do it via HTML attribute easily)
  _pendingRows.forEach((row, i) => {
    const sel = tableArea.querySelector(`select[data-idx="${i}"]`);
    if (sel && row.categoryId) sel.value = row.categoryId;
  });

  // Account selector — update all rows when user picks a different account
  const accSel = tableArea.querySelector('#import-account-select');
  if (accSel) {
    accSel.addEventListener('change', e => {
      _pendingAccountId = e.target.value || null;
      _accountAutoDetected = false;
      _pendingRows.forEach(r => { r.accountId = _pendingAccountId; });
    });
  }

  const newAccBtn = tableArea.querySelector('#btn-new-account-inline');
  if (newAccBtn) newAccBtn.addEventListener('click', () => showInlineAccountForm(tableArea, container));

  // Field edits — update in-memory row, recalc IDs on key fields
  tableArea.querySelectorAll('.cell-input').forEach(input => {
    input.addEventListener('change', e => {
      const idx   = parseInt(e.target.dataset.idx);
      const field = e.target.dataset.field;
      const val   = field === 'amount' ? parseFloat(e.target.value) : e.target.value;
      _pendingRows[idx][field] = val;
      if (field === 'categoryId') _pendingRows[idx].needsReview = false;

      if (['date', 'amount', 'description'].includes(field)) {
        recalcPendingIds();
        // Refresh status badge for this row only
        const badge = tableArea.querySelector(`tr[data-idx="${idx}"] .badge`);
        if (badge) {
          badge.className = _pendingRows[idx]._isDuplicate ? 'badge badge-dup' : 'badge badge-new';
          badge.textContent = _pendingRows[idx]._isDuplicate ? 'dup' : 'nowy';
          badge.title = _pendingRows[idx]._isDuplicate ? 'Już istnieje w bazie' : '';
        }
        // Refresh stats bar count
        const newCnt = _pendingRows.filter(r => !r._isDuplicate).length;
        const btnConfirm = tableArea.querySelector('#btn-confirm-import');
        if (btnConfirm) btnConfirm.textContent = `Zatwierdź import (${newCnt})`;
      }
    });
  });

  // Row deletion
  tableArea.querySelectorAll('.btn-remove-row').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.target.dataset.idx);
      _pendingRows.splice(idx, 1);
      recalcPendingIds();
      renderEditableTable(container);
    });
  });

  // Cancel — discard pending rows and return to drop zone
  tableArea.querySelector('#btn-cancel-import').addEventListener('click', () => {
    _pendingRows     = [];
    _pendingFileName = '';
    renderImport(container);
  });

  // Load another file
  tableArea.querySelector('#btn-load-another').addEventListener('click', () => {
    _pendingRows     = [];
    _pendingFileName = '';
    tableArea.innerHTML = '';
    // Re-trigger file picker
    const fileInput = container.querySelector('#file-input');
    if (fileInput) fileInput.click();
    else renderDropZone(container);
  });

  // Confirm — save everything that's not a duplicate (or all if user kept duplicates)
  tableArea.querySelector('#btn-confirm-import').addEventListener('click', () => {
    saveImport(container, tableArea);
  });
}

// ─── Step 3: save ─────────────────────────────────────────────────────────

function saveImport(container, tableArea) {
  const toSave = _pendingRows.filter(r => !r._isDuplicate);
  const dupSkipped = _pendingRows.filter(r => r._isDuplicate).length;

  if (toSave.length === 0) {
    showImportMsg(container, 'error', 'Brak nowych transakcji do zapisania.');
    return;
  }

  const batch = createImportBatch({
    bank:              toSave[0]?.bank       || 'unknown',
    sourceType:        toSave[0]?.sourceType || 'unknown',
    fileName:          _pendingFileName,
    rowCount:          toSave.length,
    duplicatesSkipped: dupSkipped,
  });

  toSave.forEach(row => {
    const tx = Object.assign({}, row);
    delete tx._isDuplicate;
    delete tx.bankCategory;
    tx.importBatchId = batch.id;
    upsertTransaction(tx);
  });
  saveImportBatch(batch);

  _pendingRows     = [];
  _pendingFileName = '';

  tableArea.innerHTML = `
    <div class="panel" style="margin-top:1rem">
      <p class="msg-success">&#10003; Zapisano ${toSave.length} transakcji.
        ${dupSkipped > 0 ? `Pominięto ${dupSkipped} duplikatów.` : ''}
      </p>
      <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap">
        <button id="btn-import-another" class="btn-ghost">Importuj kolejny plik</button>
        <button id="btn-go-transactions">Przejdź do transakcji →</button>
      </div>
    </div>
  `;

  tableArea.querySelector('#btn-import-another').addEventListener('click', () => {
    tableArea.innerHTML = '';
    renderDropZone(container);
  });
  tableArea.querySelector('#btn-go-transactions').addEventListener('click', () => navigate('transactions'));
}

// ─── Inline account creation ──────────────────────────────────────────────

function showInlineAccountForm(tableArea, container) {
  const area = tableArea.querySelector('#inline-account-area');
  if (!area) return;
  area.innerHTML = `
    <div class="panel" style="margin-top:0.75rem;max-width:440px">
      <h4>Nowe konto</h4>
      <label>Nazwa <input type="text" id="iaf-name" placeholder="np. Konto Pekao"></label>
      <label>Kolor <input type="color" id="iaf-color" value="#3b82f6"></label>
      <label>
        Identyfikatory
        <span class="setting-desc" style="display:block;margin:0.2rem 0 0.4rem">
          Jeden per linia. Fragment numeru IBAN lub nazwy pliku z tego konta.
        </span>
        <textarea id="iaf-ids" rows="3" style="font-family:monospace;font-size:0.82rem"
          placeholder="PL12 3456 7890...&#10;pekao.csv"></textarea>
      </label>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
        <button id="iaf-save">Dodaj i wybierz</button>
        <button id="iaf-cancel" class="btn-ghost">Anuluj</button>
      </div>
    </div>
  `;
  area.querySelector('#iaf-cancel').addEventListener('click', () => { area.innerHTML = ''; });
  area.querySelector('#iaf-save').addEventListener('click', () => {
    const name        = area.querySelector('#iaf-name').value.trim();
    const color       = area.querySelector('#iaf-color').value;
    const identifiers = area.querySelector('#iaf-ids').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    if (!name) { alert('Podaj nazwę konta.'); return; }
    const acc = createAccount(name, identifiers, color);
    upsertAccount(acc);
    _pendingAccountId    = acc.id;
    _accountAutoDetected = false;
    _pendingRows.forEach(r => { r.accountId = acc.id; });
    renderEditableTable(container);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function showImportMsg(container, type, msg) {
  container.querySelector('#import-table-area').innerHTML =
    `<div class="panel" style="margin-top:1rem"><p class="msg-${type}">${escHtml(msg)}</p></div>`;
}


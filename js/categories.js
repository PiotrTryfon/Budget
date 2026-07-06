const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
  '#f43f5e', '#84cc16', '#0ea5e9', '#14b8a6', '#fb923c',
];

function nextAvailableColor() {
  const used = new Set(getCategories().map(c => c.color.toLowerCase()));
  const free = COLOR_PALETTE.find(c => !used.has(c));
  // if all taken, pick by index so it at least cycles through palette
  return free || COLOR_PALETTE[getCategories().length % COLOR_PALETTE.length];
}

function renderCategories(container) {
  container.innerHTML = `
    <h2>Kategorie i reguły</h2>
    <div class="two-col">
      <div>
        <h3>Kategorie</h3>
        <div id="categories-list"></div>
        <button id="btn-add-cat" style="margin-top:0.75rem">+ Dodaj kategorię</button>
        <div id="cat-form"></div>
      </div>
      <div>
        <h3>Reguły kategoryzacji</h3>
        <div id="rules-list"></div>
        <button id="btn-add-rule" style="margin-top:0.75rem">+ Dodaj regułę</button>
        <div id="rule-form"></div>
        <div class="rules-io-bar">
          <button id="btn-export-rules" class="btn-ghost">&#8595; Eksportuj reguły</button>
          <label class="btn-ghost rules-import-label">
            &#8593; Importuj reguły
            <input type="file" id="rules-import-file" accept=".json" style="display:none">
          </label>
        </div>
        <div id="rules-import-preview"></div>
      </div>
    </div>
  `;

  renderCatList(container);
  renderRuleList(container);
  container.querySelector('#btn-add-cat').addEventListener('click', () => showCatForm(null, container));
  container.querySelector('#btn-add-rule').addEventListener('click', () => showRuleForm(null, container));
  container.querySelector('#btn-export-rules').addEventListener('click', exportRules);
  container.querySelector('#rules-import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) previewRulesImport(file, container);
    e.target.value = '';
  });
}

function renderCatList(container) {
  const cats = getCategories();
  const list = container.querySelector('#categories-list');
  if (cats.length === 0) { list.innerHTML = '<p style="color:var(--text-muted)">Brak kategorii.</p>'; return; }

  list.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Kolor</th><th>Nazwa</th><th></th></tr></thead>
    <tbody>
      ${cats.map(c => `
        <tr>
          <td><input type="color" value="${c.color}" data-id="${c.id}" class="color-picker" style="width:2rem;height:1.5rem;border:none;cursor:pointer;background:none;padding:0"></td>
          <td><strong>${escHtml(c.name)}</strong></td>
          <td style="white-space:nowrap">
            <button class="btn-edit-cat" data-id="${c.id}" style="padding:0.3rem 0.6rem;font-size:0.78rem">Edytuj</button>
            <button class="btn-del-cat btn-danger" data-id="${c.id}" style="padding:0.3rem 0.6rem;font-size:0.78rem;margin-left:0.25rem">Usuń</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table></div>`;

  list.querySelectorAll('.color-picker').forEach(input => {
    input.addEventListener('change', e => {
      const cat = getCategories().find(c => c.id === e.target.dataset.id);
      if (cat) { upsertCategory({ ...cat, color: e.target.value }); renderCatList(container); }
    });
  });
  list.querySelectorAll('.btn-edit-cat').forEach(btn => {
    btn.addEventListener('click', e => showCatForm(e.target.dataset.id, container));
  });
  list.querySelectorAll('.btn-del-cat').forEach(btn => {
    btn.addEventListener('click', e => {
      if (!confirm('Usunąć kategorię? Transakcje z tą kategorią stracą przypisanie.')) return;
      deleteCategory(e.target.dataset.id);
      recalculateAll();
      renderCatList(container);
      renderRuleList(container);
    });
  });
}

function showCatForm(id, container) {
  const existing = id ? getCategories().find(c => c.id === id) : null;
  const form = container.querySelector('#cat-form');
  form.innerHTML = `
    <div class="panel" style="margin-top:0.75rem;max-width:320px">
      <h4>${existing ? 'Edytuj' : 'Nowa'} kategoria</h4>
      <label>Nazwa <input type="text" id="cf-name" value="${escHtml(existing?.name || '')}"></label>
      <label>Kolor <input type="color" id="cf-color" value="${existing?.color || nextAvailableColor()}"></label>
      <div class="toggle-row">
        <label class="toggle-label" for="cf-review">Wymaga potwierdzenia przy imporcie</label>
        <label class="toggle">
          <input type="checkbox" id="cf-review" ${existing?.requiresConfirmation ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div style="display:flex;gap:0.5rem">
        <button id="cf-save">Zapisz</button>
        <button id="cf-cancel" class="btn-ghost">Anuluj</button>
      </div>
    </div>
  `;
  form.querySelector('#cf-cancel').addEventListener('click', () => { form.innerHTML = ''; });
  form.querySelector('#cf-save').addEventListener('click', () => {
    const name                = form.querySelector('#cf-name').value.trim();
    const color               = form.querySelector('#cf-color').value;
    const requiresConfirmation = form.querySelector('#cf-review').checked;
    if (!name) { alert('Podaj nazwę.'); return; }
    upsertCategory(existing
      ? { ...existing, name, color, requiresConfirmation }
      : { ...createCategory(name, color), requiresConfirmation });
    form.innerHTML = '';
    renderCatList(container);
  });
}

function renderRuleList(container) {
  const rules  = getCategoryRules().sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length);
  const catMap = Object.fromEntries(getCategories().map(c => [c.id, c.name]));
  const list   = container.querySelector('#rules-list');

  if (rules.length === 0) { list.innerHTML = '<p style="color:var(--text-muted)">Brak reguł. Dodaj reguły, aby transakcje były automatycznie kategoryzowane.</p>'; return; }

  list.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Pattern</th><th>Typ</th><th>Kategoria</th><th>Prior.</th><th></th></tr></thead>
    <tbody>
      ${rules.map(r => `
        <tr>
          <td><code style="font-size:0.8rem">${escHtml(r.pattern)}</code></td>
          <td style="color:var(--text-muted);font-size:0.8rem">${r.matchType}</td>
          <td>${escHtml(catMap[r.categoryId] || '?')}</td>
          <td>${r.priority}</td>
          <td style="white-space:nowrap">
            <button class="btn-edit-rule" data-id="${r.id}" style="padding:0.3rem 0.6rem;font-size:0.78rem">Edytuj</button>
            <button class="btn-del-rule btn-danger" data-id="${r.id}" style="padding:0.3rem 0.6rem;font-size:0.78rem;margin-left:0.25rem">Usuń</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table></div>`;

  list.querySelectorAll('.btn-edit-rule').forEach(btn => {
    btn.addEventListener('click', e => showRuleForm(e.target.dataset.id, container));
  });
  list.querySelectorAll('.btn-del-rule').forEach(btn => {
    btn.addEventListener('click', e => {
      deleteCategoryRule(e.target.dataset.id);
      recalculateAll();
      renderRuleList(container);
    });
  });
}

function showRuleForm(id, container) {
  const existing = id ? getCategoryRules().find(r => r.id === id) : null;
  const cats = getCategories();
  const form = container.querySelector('#rule-form');
  form.innerHTML = `
    <div class="panel" style="margin-top:0.75rem;max-width:360px">
      <h4>${existing ? 'Edytuj' : 'Nowa'} reguła</h4>
      <label>Pattern <input type="text" id="rf-pattern" value="${escHtml(existing?.pattern || '')}" placeholder="np. Glovo"></label>
      <label>Typ dopasowania
        <select id="rf-type">
          <option value="contains"   ${existing?.matchType === 'contains'   ? 'selected' : ''}>zawiera (contains)</option>
          <option value="startsWith" ${existing?.matchType === 'startsWith' ? 'selected' : ''}>zaczyna się od</option>
          <option value="exact"      ${existing?.matchType === 'exact'      ? 'selected' : ''}>dokładne (exact)</option>
        </select>
      </label>
      <label>Kategoria
        <select id="rf-cat">
          ${cats.map(c => `<option value="${c.id}" ${existing?.categoryId === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}
        </select>
      </label>
      <label>Priorytet <input type="number" id="rf-priority" value="${existing?.priority ?? 0}"></label>
      <div class="toggle-row">
        <label class="toggle-label" for="rf-review">Wymaga potwierdzenia przy imporcie</label>
        <label class="toggle">
          <input type="checkbox" id="rf-review" ${existing?.requiresConfirmation ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </div>
      <div style="display:flex;gap:0.5rem">
        <button id="rf-save">Zapisz</button>
        <button id="rf-cancel" class="btn-ghost">Anuluj</button>
      </div>
    </div>
  `;
  form.querySelector('#rf-cancel').addEventListener('click', () => { form.innerHTML = ''; });
  form.querySelector('#rf-save').addEventListener('click', () => {
    const pattern             = form.querySelector('#rf-pattern').value.trim();
    const matchType           = form.querySelector('#rf-type').value;
    const categoryId          = form.querySelector('#rf-cat').value;
    const priority            = parseInt(form.querySelector('#rf-priority').value) || 0;
    const requiresConfirmation = form.querySelector('#rf-review').checked;
    if (!pattern || !categoryId) { alert('Wypełnij pattern i kategorię.'); return; }
    upsertCategoryRule(existing
      ? { ...existing, pattern, matchType, categoryId, priority, requiresConfirmation }
      : { ...createCategoryRule(pattern, matchType, categoryId, priority), requiresConfirmation });
    recalculateAll();
    form.innerHTML = '';
    renderRuleList(container);
  });
}

// ─── Rules export / import ────────────────────────────────────────────────

async function exportRules() {
  const rules = getCategoryRules();
  const cats  = getCategories();
  const usedCatIds = new Set(rules.map(r => r.categoryId));
  const referencedCats = cats.filter(c => usedCatIds.has(c.id));

  const payload = {
    version:     1,
    type:        'rules',
    exportedAt:  new Date().toISOString(),
    categories:  referencedCats.map(({ id, name, color }) => ({ id, name, color })),
    rules,
  };

  const json      = JSON.stringify(payload, null, 2);
  const fileName  = `budzet-rules-${new Date().toISOString().slice(0, 10)}.json`;
  const ruleCount = rules.length;

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle   = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const w = await handle.createWritable();
      await w.write(json);
      await w.close();
      logEvent('rules-export', { ruleCount });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  fallbackDownload(json, fileName);
  logEvent('rules-export', { ruleCount });
}

function fallbackDownload(content, fileName) {
  const a  = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function previewRulesImport(file, container) {
  const previewEl = container.querySelector('#rules-import-preview');
  previewEl.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Wczytywanie…</p>';

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.type !== 'rules' || !Array.isArray(data.rules)) {
        previewEl.innerHTML = '<p class="msg-error">Błąd: to nie jest plik eksportu reguł.</p>';
        return;
      }

      const localCats    = getCategories();
      const existingRules = getCategoryRules();

      // Build category id mapping (imported id → local id) and track what needs creating
      const idMap   = {};
      const newCats = []; // {imported} objects not yet in local

      (data.categories || []).forEach(imp => {
        const match = localCats.find(c => c.name.toLowerCase() === imp.name.toLowerCase());
        if (match) {
          idMap[imp.id] = match.id;
        } else {
          idMap[imp.id] = null; // will be created on confirm
          newCats.push(imp);
        }
      });

      // Classify each rule
      const items = data.rules.map(r => {
        const mappedCatId   = idMap[r.categoryId] || null;
        const mappedCatName = mappedCatId
          ? (localCats.find(c => c.id === mappedCatId)?.name || '?')
          : (data.categories?.find(c => c.id === r.categoryId)?.name || '?');

        const importedCatName = data.categories?.find(c => c.id === r.categoryId)?.name || '?';

        const duplicate = existingRules.find(ex =>
          ex.pattern    === r.pattern &&
          ex.matchType  === r.matchType &&
          ex.categoryId === mappedCatId
        );
        const conflict = !duplicate && existingRules.find(ex =>
          ex.pattern   === r.pattern &&
          ex.matchType === r.matchType
        );

        const status = duplicate ? 'duplicate' : conflict ? 'conflict' : 'new';

        return {
          rule: r,
          mappedCatId,
          mappedCatName,
          importedCatName,
          status,
          conflictWith: conflict || null,
          // defaults: new=checked, conflict=unchecked, duplicate=n/a
          include: status === 'new',
          replace: false, // for conflicts: replace existing?
        };
      });

      renderImportPreview(items, newCats, data.categories || [], container);
    } catch {
      previewEl.innerHTML = '<p class="msg-error">Błąd: nie udało się odczytać pliku JSON.</p>';
    }
  };
  reader.readAsText(file);
}

function renderImportPreview(items, newCats, importedCats, container) {
  const previewEl  = container.querySelector('#rules-import-preview');
  const localCats  = getCategories();
  const catMap     = Object.fromEntries(localCats.map(c => [c.id, c]));

  const newCount  = items.filter(i => i.status === 'new').length;
  const dupCount  = items.filter(i => i.status === 'duplicate').length;
  const confCount = items.filter(i => i.status === 'conflict').length;

  function checkedCount() {
    return items.filter(i =>
      (i.status === 'new'      && i.include) ||
      (i.status === 'conflict' && i.include)
    ).length;
  }

  function renderTable() {
    const rows = items.map((item, idx) => {
      const { rule, status, mappedCatName, conflictWith } = item;
      const existingCatName = conflictWith
        ? (catMap[conflictWith.categoryId]?.name || '?')
        : '';

      if (status === 'duplicate') {
        return `
          <tr class="import-row-dup">
            <td><span class="import-status-badge badge-dup">duplikat</span></td>
            <td><code>${escHtml(rule.pattern)}</code></td>
            <td class="text-muted">${rule.matchType}</td>
            <td class="text-muted">${escHtml(mappedCatName)}</td>
            <td class="text-muted" style="font-size:0.78rem">bez zmian</td>
          </tr>`;
      }

      if (status === 'conflict') {
        return `
          <tr class="import-row-conflict" data-idx="${idx}">
            <td><span class="import-status-badge badge-conflict">konflikt</span></td>
            <td><code>${escHtml(rule.pattern)}</code></td>
            <td class="text-muted">${rule.matchType}</td>
            <td>
              <span style="color:var(--orange)">${escHtml(mappedCatName)}</span>
              <span class="text-muted" style="font-size:0.78rem"> ↔ obecna: ${escHtml(existingCatName)}</span>
            </td>
            <td>
              <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;white-space:nowrap">
                <input type="checkbox" class="chk-conflict" data-idx="${idx}" ${item.include ? 'checked' : ''}>
                Zastąp istniejącą
              </label>
            </td>
          </tr>`;
      }

      // new
      return `
        <tr class="import-row-new" data-idx="${idx}">
          <td><span class="import-status-badge badge-new-rule">nowa</span></td>
          <td><code>${escHtml(rule.pattern)}</code></td>
          <td class="text-muted">${rule.matchType}</td>
          <td>${escHtml(mappedCatName)}</td>
          <td>
            <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem">
              <input type="checkbox" class="chk-new" data-idx="${idx}" ${item.include ? 'checked' : ''}>
              Dodaj
            </label>
          </td>
        </tr>`;
    }).join('');

    const newCatNote = newCats.length
      ? `<p class="import-newcats-note">&#9432; Zostaną utworzone nowe kategorie: ${newCats.map(c => `<strong>${escHtml(c.name)}</strong>`).join(', ')}</p>`
      : '';

    previewEl.innerHTML = `
      <div class="panel" style="margin-top:1rem">
        <h4>Podgląd importu
          <span class="text-muted" style="font-weight:400;font-size:0.85rem">
            — ${items.length} reguł
            (${newCount} nowych, ${confCount} konfliktów, ${dupCount} duplikatów)
          </span>
        </h4>
        ${newCatNote}
        <div class="table-wrap" style="margin:0.75rem 0">
          <table>
            <thead>
              <tr>
                <th>Status</th><th>Pattern</th><th>Typ</th><th>Kategoria</th><th>Akcja</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
          <button id="btn-confirm-import">Importuj zaznaczone (<span id="checked-count">${checkedCount()}</span>)</button>
          <button id="btn-cancel-preview" class="btn-ghost">Anuluj</button>
        </div>
      </div>
    `;

    previewEl.querySelectorAll('.chk-new').forEach(chk => {
      chk.addEventListener('change', () => {
        items[+chk.dataset.idx].include = chk.checked;
        previewEl.querySelector('#checked-count').textContent = checkedCount();
      });
    });
    previewEl.querySelectorAll('.chk-conflict').forEach(chk => {
      chk.addEventListener('change', () => {
        items[+chk.dataset.idx].include = chk.checked;
        previewEl.querySelector('#checked-count').textContent = checkedCount();
      });
    });

    previewEl.querySelector('#btn-cancel-preview').addEventListener('click', () => {
      previewEl.innerHTML = '';
    });
    previewEl.querySelector('#btn-confirm-import').addEventListener('click', () => {
      executeRulesImport(items, newCats, importedCats, container);
    });
  }

  renderTable();
}

function executeRulesImport(items, newCats, importedCats, container) {
  const localCats = getCategories();
  const idMap     = {};

  // Map existing categories by name
  localCats.forEach(c => { idMap[c.name.toLowerCase()] = c.id; });

  // Create missing categories
  let catsCreated = 0;
  newCats.forEach(imp => {
    if (!idMap[imp.name.toLowerCase()]) {
      const newCat = createCategory(imp.name, imp.color || nextAvailableColor());
      upsertCategory(newCat);
      idMap[imp.name.toLowerCase()] = newCat.id;
      catsCreated++;
    }
  });

  // Build importedId → localId map
  const importedIdMap = {};
  importedCats.forEach(imp => {
    importedIdMap[imp.id] = idMap[imp.name.toLowerCase()] || imp.id;
  });

  let added = 0, replaced = 0, skipped = 0;

  items.forEach(item => {
    const mappedCatId = importedIdMap[item.rule.categoryId] || item.rule.categoryId;

    if (item.status === 'duplicate') { skipped++; return; }

    if (item.status === 'conflict') {
      if (!item.include) { skipped++; return; }
      // Remove the conflicting existing rule
      if (item.conflictWith) deleteCategoryRule(item.conflictWith.id);
      upsertCategoryRule({ ...item.rule, id: generateId(), categoryId: mappedCatId });
      replaced++;
      return;
    }

    // new
    if (!item.include) { skipped++; return; }
    upsertCategoryRule({ ...item.rule, id: generateId(), categoryId: mappedCatId });
    added++;
  });

  logEvent('rules-import', { added, replaced, skipped, catsCreated });
  recalculateAll();
  renderCatList(container);
  renderRuleList(container);

  const parts = [];
  if (added)       parts.push(`dodano ${added}`);
  if (replaced)    parts.push(`zastąpiono ${replaced}`);
  if (skipped)     parts.push(`pominięto ${skipped}`);
  if (catsCreated) parts.push(`utworzono ${catsCreated} kategorii`);

  const previewEl = container.querySelector('#rules-import-preview');
  previewEl.innerHTML = `<p class="msg-success" style="margin-top:0.75rem">&#10003; Import zakończony: ${parts.join(', ')}.</p>`;
}


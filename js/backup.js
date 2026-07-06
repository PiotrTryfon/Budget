function renderBackup(container) {
  container.innerHTML = `
    <h2>Backup</h2>
    <div class="backup-section">
      <div class="panel">
        <h4>Eksport JSON (pełny backup)</h4>
        <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1rem">
          Zapisuje wszystkie transakcje, kategorie, reguły i historię importów jako plik JSON.
          Zapisz do folderu <code>backup/</code> obok aplikacji.
          Przeglądarka zapamięta wybrany folder na następny raz.
        </p>
        <button id="btn-export">Eksportuj backup (JSON)</button>
      </div>

      <div class="panel" style="margin-top:1rem">
        <h4>Eksport CSV</h4>
        <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1rem">
          Pobiera wszystkie transakcje jako plik CSV — otwieralny w Excel lub Google Sheets.
        </p>
        <button id="btn-export-csv">Pobierz CSV</button>
      </div>

      <div class="panel" style="margin-top:1rem">
        <h4>Import backupu</h4>
        <div class="msg-warning">Wczytanie backupu <strong>zastąpi</strong> wszystkie obecne dane.</div>
        <input type="file" id="backup-file" accept=".json" style="margin-bottom:0.75rem;display:block">
        <button id="btn-import">Wczytaj i zastąp dane</button>
        <p id="import-status" style="margin-top:0.75rem"></p>
      </div>
    </div>
  `;

  container.querySelector('#btn-export').addEventListener('click', quickExport);
  container.querySelector('#btn-export-csv').addEventListener('click', exportCsv);
  container.querySelector('#btn-import').addEventListener('click', () => {
    const file     = container.querySelector('#backup-file').files[0];
    const statusEl = container.querySelector('#import-status');
    if (!file) { statusEl.textContent = 'Wybierz plik JSON.'; return; }
    if (!confirm('To zastąpi wszystkie obecne dane. Kontynuować?')) return;
    restoreBackup(file, statusEl);
  });
}

function exportCsv() {
  const txs  = getTransactions().sort((a, b) => a.date.localeCompare(b.date));
  const cats = Object.fromEntries(getCategories().map(c => [c.id, c.name]));
  const accs = Object.fromEntries(getAccounts().map(a => [a.id, a.name]));

  const csvCell = v => {
    const s = String(v ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const header = ['Data', 'Kwota', 'Opis', 'Kategoria', 'Konto', 'Transfer wewnętrzny', 'Źródło kategorii'];
  const rows   = txs.map(t => [
    t.date,
    t.amount.toFixed(2),
    t.description || '',
    cats[t.categoryId] || '',
    accs[t.accountId]  || '',
    t.isInternalTransfer ? 'tak' : 'nie',
    t.categorySource || '',
  ]);

  const csv  = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `budzet-transakcje-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function quickExport() {
  const data       = exportAll();
  const json       = JSON.stringify(data, null, 2);
  const fileName   = `budzet-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const logDetails = { txCount: (data.transactions || []).length, catCount: (data.categories || []).length };

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle   = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      logEvent('backup-export', logDetails);
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logEvent('backup-export', logDetails);
}

function restoreBackup(file, statusEl) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.version || !Array.isArray(data.transactions)) {
        statusEl.textContent = 'Błąd: nieprawidłowy format pliku backup.';
        return;
      }
      importAll(data);
      logEvent('backup-restore', {
        txCount:  (data.transactions || []).length,
        catCount: (data.categories   || []).length,
      });
      navigate('dashboard');
    } catch {
      statusEl.className = 'msg-error';
      statusEl.textContent = 'Błąd: nie udało się odczytać pliku JSON.';
    }
  };
  reader.readAsText(file);
}

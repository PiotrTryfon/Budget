function renderBackup(container) {
  container.innerHTML = `
    <h2>Backup</h2>
    <div class="backup-section">
      <div class="panel">
        <h4>Eksport</h4>
        <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1rem">
          Zapisuje wszystkie transakcje, kategorie, reguły i historię importów jako plik JSON.
          Zapisz do folderu <code>backup/</code> obok aplikacji.
          Przeglądarka zapamięta wybrany folder na następny raz.
        </p>
        <button id="btn-export">Eksportuj backup (JSON)</button>
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
  container.querySelector('#btn-import').addEventListener('click', () => {
    const file     = container.querySelector('#backup-file').files[0];
    const statusEl = container.querySelector('#import-status');
    if (!file) { statusEl.textContent = 'Wybierz plik JSON.'; return; }
    if (!confirm('To zastąpi wszystkie obecne dane. Kontynuować?')) return;
    restoreBackup(file, statusEl);
  });
}

async function quickExport() {
  const json     = JSON.stringify(exportAll(), null, 2);
  const fileName = `budzet-backup-${new Date().toISOString().slice(0, 10)}.json`;

  // File System Access API — opens native save dialog, remembers last folder
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled the dialog
      // fall through to anchor fallback
    }
  }

  // Fallback: anchor download (goes to browser default downloads folder)
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
      statusEl.className = 'msg-success';
      const txCount  = (data.transactions || []).length;
      const catCount = (data.categories  || []).length;
      statusEl.textContent = `Backup wczytany (${txCount} transakcji, ${catCount} kategorii). Odśwież stronę.`;
    } catch {
      statusEl.className = 'msg-error';
      statusEl.textContent = 'Błąd: nie udało się odczytać pliku JSON.';
    }
  };
  reader.readAsText(file);
}

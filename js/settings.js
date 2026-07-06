function renderSettings(container) {
  const s = getSettings();
  container.innerHTML = `
    <h2>Ustawienia</h2>

    <div class="panel" style="max-width:520px">
      <h4>Motyw</h4>
      <div class="theme-picker" id="theme-picker">
        <button class="theme-btn" data-t="light">
          <span class="theme-swatch theme-swatch-light"></span>
          <span>Jasny</span>
        </button>
        <button class="theme-btn" data-t="dark">
          <span class="theme-swatch theme-swatch-dark"></span>
          <span>Ciemny</span>
        </button>
        <button class="theme-btn" data-t="vivid">
          <span class="theme-swatch theme-swatch-vivid"></span>
          <span>Vivid</span>
        </button>
      </div>
    </div>

    <div class="panel" style="max-width:520px;margin-top:1.25rem">
      <h4>Transakcje</h4>
      <div class="setting-row">
        <div>
          <div class="setting-label">Potwierdzenie kasowania</div>
          <div class="setting-desc">Pytaj "czy na pewno?" przed usunięciem transakcji</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="tog-confirm" ${s.confirmDelete ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </div>
    </div>

    <div class="panel" style="max-width:520px;margin-top:1.25rem">
      <h4>Konta bankowe</h4>
      <p class="setting-desc" style="margin-bottom:0.75rem">
        Konto jest rozpoznawane automatycznie przy imporcie — szukamy identyfikatorów
        (np. numer IBAN, fragment nazwy pliku) w treści wczytywanego pliku.
        Możesz też wybrać konto ręcznie podczas importu.
      </p>
      <div id="accounts-list"></div>
      <button id="btn-add-account" style="margin-top:0.75rem">+ Dodaj konto</button>
      <div id="account-form"></div>
    </div>

    <div class="panel" style="max-width:520px;margin-top:1.25rem">
      <h4>Blokada PIN</h4>
      <div id="pin-settings-wrap"></div>
    </div>

    <div class="panel panel-danger" style="max-width:520px;margin-top:1.25rem">
      <h4>Strefa niebezpieczna</h4>
      <div class="setting-row" style="align-items:flex-start">
        <div>
          <div class="setting-label">Wyczyść dane profilu</div>
          <div class="setting-desc">
            Usuwa wszystkie transakcje, reguły, konta i wsady importu.
            Kategorie wracają do domyślnych. Tej operacji nie można cofnąć.
          </div>
        </div>
        <button id="btn-wipe" class="btn-danger" style="white-space:nowrap;flex-shrink:0">Wyczyść profil</button>
      </div>
      <div id="wipe-confirm"></div>
    </div>
  `;

  // Theme picker
  var currentTheme = getTheme();
  container.querySelectorAll('.theme-btn').forEach(function(btn) {
    if (btn.dataset.t === currentTheme) btn.classList.add('active');
    btn.addEventListener('click', function() {
      setTheme(btn.dataset.t);
      container.querySelectorAll('.theme-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  container.querySelector('#tog-confirm').addEventListener('change', e => {
    saveSettings({ ...getSettings(), confirmDelete: e.target.checked });
  });

  container.querySelector('#btn-wipe').addEventListener('click', () => showWipeConfirm(container));

  renderPinSettings(container.querySelector('#pin-settings-wrap'));

  renderAccountList(container);
  container.querySelector('#btn-add-account').addEventListener('click', () => showAccountForm(null, container));
}

function renderAccountList(container) {
  const accs = getAccounts();
  const list = container.querySelector('#accounts-list');

  if (accs.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Brak kont. Dodaj pierwsze konto, aby włączyć automatyczne rozpoznawanie przy imporcie.</p>';
    return;
  }

  list.innerHTML = `<div class="table-wrap"><table>
    <thead>
      <tr><th>Konto</th><th>Identyfikatory</th><th></th></tr>
    </thead>
    <tbody>
      ${accs.map(a => `
        <tr>
          <td>
            <span class="account-dot" style="background:${a.color}"></span>
            <strong>${escHtml(a.name)}</strong>
          </td>
          <td>
            ${(a.identifiers || []).length > 0
              ? (a.identifiers).map(id => `<span class="tag-chip">${escHtml(id)}</span>`).join(' ')
              : '<span style="color:var(--text-muted);font-size:0.8rem">brak</span>'}
          </td>
          <td style="white-space:nowrap">
            <button class="btn-edit-acc" data-id="${a.id}" style="padding:0.3rem 0.6rem;font-size:0.78rem">Edytuj</button>
            <button class="btn-del-acc btn-danger"  data-id="${a.id}" style="padding:0.3rem 0.6rem;font-size:0.78rem;margin-left:0.25rem">Usuń</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table></div>`;

  list.querySelectorAll('.btn-edit-acc').forEach(btn => {
    btn.addEventListener('click', e => showAccountForm(e.target.dataset.id, container));
  });
  list.querySelectorAll('.btn-del-acc').forEach(btn => {
    btn.addEventListener('click', e => {
      if (getSettings().confirmDelete && !confirm('Usunąć konto?')) return;
      deleteAccount(e.target.dataset.id);
      renderAccountList(container);
    });
  });
}

function showAccountForm(id, container) {
  const existing = id ? getAccounts().find(a => a.id === id) : null;
  const form = container.querySelector('#account-form');
  const identifiersStr = (existing?.identifiers || []).join('\n');

  form.innerHTML = `
    <div class="panel" style="margin-top:0.75rem;max-width:440px">
      <h4>${existing ? 'Edytuj' : 'Nowe'} konto</h4>
      <label>Nazwa <input type="text" id="af-name" value="${escHtml(existing?.name || '')}" placeholder="np. Konto prywatne Pekao"></label>
      <label>Kolor <input type="color" id="af-color" value="${existing?.color || '#3b82f6'}"></label>
      <label>
        Identyfikatory
        <span class="setting-desc" style="display:block;margin:0.2rem 0 0.4rem">
          Jeden per linia. Wpisz numer IBAN, fragment nazwy pliku CSV
          lub dowolny tekst, który pojawia się w wyeksportowanym pliku tylko dla tego konta.
        </span>
        <textarea id="af-ids" rows="5" style="font-family:monospace;font-size:0.82rem" placeholder="PL12 3456 7890 1234 5678 9012 3456&#10;prywatne.csv">${escHtml(identifiersStr)}</textarea>
      </label>
      <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
        <button id="af-save">Zapisz</button>
        <button id="af-cancel" class="btn-ghost">Anuluj</button>
      </div>
    </div>
  `;

  form.querySelector('#af-cancel').addEventListener('click', () => { form.innerHTML = ''; });
  form.querySelector('#af-save').addEventListener('click', () => {
    const name        = form.querySelector('#af-name').value.trim();
    const color       = form.querySelector('#af-color').value;
    const identifiers = form.querySelector('#af-ids').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    if (!name) { alert('Podaj nazwę konta.'); return; }
    upsertAccount(existing
      ? { ...existing, name, color, identifiers }
      : createAccount(name, identifiers, color));
    form.innerHTML = '';
    renderAccountList(container);
  });
}

function showWipeConfirm(container) {
  const profile = getProfiles().find(p => p.id === getActiveProfileId());
  const name    = escHtml(profile?.name || 'ten profil');
  const box     = container.querySelector('#wipe-confirm');

  box.innerHTML = `
    <div class="wipe-confirm-box">
      <p>Na pewno wyczyścić wszystkie dane profilu <strong>${name}</strong>?<br>
      Transakcje, reguły, konta i wsady importu zostaną trwale usunięte.</p>
      <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
        <button id="btn-wipe-yes" class="btn-danger">Tak, wyczyść wszystko</button>
        <button id="btn-wipe-no" class="btn-ghost">Anuluj</button>
      </div>
    </div>
  `;

  box.querySelector('#btn-wipe-no').addEventListener('click', () => { box.innerHTML = ''; });
  box.querySelector('#btn-wipe-yes').addEventListener('click', () => {
    const profile = getProfiles().find(p => p.id === getActiveProfileId());
    logEvent('wipe', { profileName: profile?.name || '?' });
    wipeProfileData();
    box.innerHTML = '';
    navigate('dashboard');
  });
}


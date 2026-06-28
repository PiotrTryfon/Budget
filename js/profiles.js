function showProfileScreen(onSelect) {
  const screen = document.getElementById('profile-screen');
  screen.classList.remove('hidden');
  renderProfilePicker(screen, onSelect);
}

function hideProfileScreen() {
  document.getElementById('profile-screen').classList.add('hidden');
}

function renderProfilePicker(screen, onSelect) {
  screen.innerHTML = `
    <div class="profile-picker">
      <div class="profile-picker-logo">
        <div class="brand-icon">₿</div>
        <span class="brand-text">Budżet</span>
      </div>
      <p>Wybierz profil</p>
      <div class="profile-grid" id="profile-grid"></div>
    </div>
  `;
  renderProfileCards(screen, onSelect);
}

function renderProfileCards(screen, onSelect) {
  const profiles = getProfiles();
  const grid     = screen.querySelector('#profile-grid');

  grid.innerHTML = profiles.map(p => `
    <div class="profile-card" data-id="${p.id}" tabindex="0">
      <button class="btn-rename-profile" data-id="${p.id}" title="Zmień nazwę">✎</button>
      <div class="profile-avatar">${escHtmlProf(p.name.charAt(0).toUpperCase())}</div>
      <div class="profile-card-name">${escHtmlProf(p.name)}</div>
    </div>
  `).join('') + `
    <div class="profile-card profile-card-new" id="btn-new-profile" tabindex="0">
      <div class="new-icon">+</div>
      <div>Nowy profil</div>
    </div>
  `;

  // Select profile on click
  grid.querySelectorAll('.profile-card:not(.profile-card-new)').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.btn-rename-profile')) return;
      selectProfile(card.dataset.id, onSelect);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter') selectProfile(card.dataset.id, onSelect);
    });
  });

  // Rename
  grid.querySelectorAll('.btn-rename-profile').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      showRenameForm(btn.dataset.id, grid, screen, onSelect);
    });
  });

  // New profile
  const newBtn = grid.querySelector('#btn-new-profile');
  newBtn.addEventListener('click', () => showNewProfileForm(grid, screen, onSelect));
  newBtn.addEventListener('keydown', e => {
    if (e.key === 'Enter') showNewProfileForm(grid, screen, onSelect);
  });
}

function selectProfile(id, onSelect) {
  setActiveProfile(id);
  hideProfileScreen();
  updateSidebarProfile();
  onSelect(id);
}

function showNewProfileForm(grid, screen, onSelect) {
  // Replace the "+" card with an inline form
  const newCard = grid.querySelector('#btn-new-profile');
  const form = document.createElement('div');
  form.className = 'profile-new-form';
  form.innerHTML = `
    <input type="text" id="new-profile-name" placeholder="Nazwa profilu" maxlength="32">
    <div style="display:flex;gap:0.5rem">
      <button id="btn-create-confirm">Utwórz</button>
      <button id="btn-create-cancel" class="btn-ghost">Anuluj</button>
    </div>
  `;
  grid.replaceChild(form, newCard);
  form.querySelector('#new-profile-name').focus();

  const confirm = () => {
    const name = form.querySelector('#new-profile-name').value.trim();
    if (!name) { form.querySelector('#new-profile-name').focus(); return; }
    createProfileEntry(name);
    renderProfileCards(screen, onSelect);
  };

  form.querySelector('#btn-create-confirm').addEventListener('click', confirm);
  form.querySelector('#btn-create-cancel').addEventListener('click', () => renderProfileCards(screen, onSelect));
  form.querySelector('#new-profile-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') renderProfileCards(screen, onSelect);
  });
}

function showRenameForm(id, grid, screen, onSelect) {
  const card     = grid.querySelector(`.profile-card[data-id="${id}"]`);
  const profile  = getProfiles().find(p => p.id === id);
  const nameEl   = card.querySelector('.profile-card-name');
  const original = profile.name;

  const input = document.createElement('input');
  input.type  = 'text';
  input.value = original;
  input.maxLength = 32;
  input.className = 'rename-input';
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const save = () => {
    const name = input.value.trim();
    if (name && name !== original) renameProfile(id, name);
    renderProfileCards(screen, onSelect);
    updateSidebarProfile();
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); save(); }
    if (e.key === 'Escape') { input.value = original; input.blur(); }
  });
}

function updateSidebarProfile() {
  const id      = getActiveProfileId();
  const profile = getProfiles().find(p => p.id === id);
  if (!profile) return;

  const nameEl    = document.getElementById('sidebar-profile-name');
  const initialEl = document.getElementById('sidebar-profile-initial');
  if (nameEl)    nameEl.textContent    = profile.name;
  if (initialEl) initialEl.textContent = profile.name.charAt(0).toUpperCase();
}

function escHtmlProf(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

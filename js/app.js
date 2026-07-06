const SCREENS = {
  dashboard:    renderDashboard,
  import:       renderImport,
  transactions: renderTransactions,
  categories:   renderCategories,
  charts:       renderCharts,
  log:          renderLog,
  backup:       renderBackup,
  settings:     renderSettings,
};

// ─── Mobile sidebar ───────────────────────────────────────────────────────

var _sidebarEl = document.querySelector('.sidebar');
var _overlayEl = document.getElementById('sidebar-overlay');

function openSidebar() {
  _sidebarEl.classList.add('open');
  _overlayEl.classList.add('visible');
}

function closeSidebar() {
  _sidebarEl.classList.remove('open');
  _overlayEl.classList.remove('visible');
}

document.getElementById('btn-menu').addEventListener('click', function() {
  _sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar();
});

_overlayEl.addEventListener('click', closeSidebar);

// ─── Navigation ───────────────────────────────────────────────────────────

function navigate(screenName) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const screen = document.getElementById(`screen-${screenName}`);
  if (screen) screen.classList.remove('hidden');

  const link = document.querySelector(`[data-screen="${screenName}"]`);
  if (link) link.classList.add('active');

  closeSidebar();
  updateReviewBadge();

  if (SCREENS[screenName]) SCREENS[screenName](screen);
}

function loadProfile(id) {
  setActiveProfile(id);
  initDB();
  updateSidebarProfile();
  navigate('dashboard');
}

function updateReviewBadge() {
  const badge = document.getElementById('nav-badge-review');
  if (!badge) return;
  try {
    const count = getTransactions().filter(t => t.needsReview && !t.isInternalTransfer).length;
    badge.textContent  = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  } catch (e) {
    badge.style.display = 'none';
  }
}

// ─── Nav links ────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    navigate(link.dataset.screen);
  });
});

document.getElementById('btn-backup-quick').addEventListener('click', quickExport);

document.getElementById('sidebar-profile-wrap').addEventListener('click', () => {
  showProfileScreen(id => loadProfile(id));
});

// ─── Init ─────────────────────────────────────────────────────────────────

function _doInit() {
  var migrated = migrateOldData();
  if (migrated) {
    updateSidebarProfile();
    navigate('dashboard');
    return;
  }
  // Auto-restore last used profile so refresh doesn't lose context
  var lastId   = getLastProfileId();
  var profiles = getProfiles();
  if (lastId && profiles.find(function(p) { return p.id === lastId; })) {
    loadProfile(lastId);
    return;
  }
  showProfileScreen(function(id) { loadProfile(id); });
}

(function init() {
  if (isPinSet() && !isSessionUnlocked()) {
    renderPinGate(_doInit);
  } else {
    _doInit();
  }
})();

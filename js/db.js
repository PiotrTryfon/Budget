var _profileId = null;

// ─── Profile key helpers ───────────────────────────────────────────────────

function setActiveProfile(id) {
  _profileId = id;
  localStorage.setItem('budzet_current_profile', id);
}

function getActiveProfileId() { return _profileId; }
function getLastProfileId()   { return localStorage.getItem('budzet_current_profile'); }

function pk(key) {
  if (!_profileId) throw new Error('No active profile — call setActiveProfile() first');
  return `budzet_p${_profileId}_${key}`;
}

// ─── Generic helpers ───────────────────────────────────────────────────────

function dbLoad(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function dbSave(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Profile list (not scoped — global) ───────────────────────────────────

function getProfiles() {
  try { return JSON.parse(localStorage.getItem('budzet_profiles') || '[]'); }
  catch { return []; }
}

function saveProfiles(profiles) {
  localStorage.setItem('budzet_profiles', JSON.stringify(profiles));
}

function createProfileEntry(name) {
  const p = { id: generateId(), name: name.trim(), createdAt: new Date().toISOString() };
  const all = getProfiles();
  all.push(p);
  saveProfiles(all);
  return p;
}

function renameProfile(id, name) {
  const all = getProfiles();
  const p   = all.find(p => p.id === id);
  if (p) { p.name = name.trim(); saveProfiles(all); }
}

function deleteProfile(id) {
  saveProfiles(getProfiles().filter(p => p.id !== id));
  const prefix = `budzet_p${id}_`;
  Object.keys(localStorage)
    .filter(k => k.startsWith(prefix))
    .forEach(k => localStorage.removeItem(k));
  if (localStorage.getItem('budzet_current_profile') === id) {
    localStorage.removeItem('budzet_current_profile');
  }
}

// ─── Migration from pre-profile format ────────────────────────────────────

function migrateOldData() {
  if (getProfiles().length > 0) return null;
  const hasOld = ['transactions','categories','rules','batches']
    .some(k => localStorage.getItem(`budzet_${k}`) !== null);
  if (!hasOld) return null;

  const profile = createProfileEntry('Moje');
  setActiveProfile(profile.id);
  ['transactions','categories','rules','batches','settings'].forEach(key => {
    const val = localStorage.getItem(`budzet_${key}`);
    if (val) localStorage.setItem(pk(key), val);
  });
  return profile;
}

// ─── DB init ──────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = { confirmDelete: true };

function initDB() {
  if (getCategories().length === 0) {
    saveCategories(DEFAULT_CATEGORIES.map(c => createCategory(c.name, c.color)));
  }
}

// ─── Transactions ─────────────────────────────────────────────────────────

function getTransactions()       { return dbLoad(pk('transactions')); }
function saveTransactions(txs)   { dbSave(pk('transactions'), txs); }

function upsertTransaction(tx) {
  const all = getTransactions();
  const idx = all.findIndex(t => t.id === tx.id);
  if (idx >= 0) all[idx] = tx; else all.push(tx);
  saveTransactions(all);
}

function deleteTransaction(id) {
  saveTransactions(getTransactions().filter(t => t.id !== id));
}

// ─── Categories ───────────────────────────────────────────────────────────

function getCategories()       { return dbLoad(pk('categories')); }
function saveCategories(cats)  { dbSave(pk('categories'), cats); }

function upsertCategory(cat) {
  const all = getCategories();
  const idx = all.findIndex(c => c.id === cat.id);
  if (idx >= 0) all[idx] = cat; else all.push(cat);
  saveCategories(all);
}

function deleteCategory(id) {
  saveCategories(getCategories().filter(c => c.id !== id));
}

function moveCategoryUp(id) {
  const cats = getCategories();
  const idx  = cats.findIndex(c => c.id === id);
  if (idx > 0) {
    [cats[idx - 1], cats[idx]] = [cats[idx], cats[idx - 1]];
    saveCategories(cats);
  }
}

function moveCategoryDown(id) {
  const cats = getCategories();
  const idx  = cats.findIndex(c => c.id === id);
  if (idx >= 0 && idx < cats.length - 1) {
    [cats[idx], cats[idx + 1]] = [cats[idx + 1], cats[idx]];
    saveCategories(cats);
  }
}

// ─── Rules ────────────────────────────────────────────────────────────────

function getCategoryRules()          { return dbLoad(pk('rules')); }
function saveCategoryRules(rules)    { dbSave(pk('rules'), rules); }

function upsertCategoryRule(rule) {
  const all = getCategoryRules();
  const idx = all.findIndex(r => r.id === rule.id);
  if (idx >= 0) all[idx] = rule; else all.push(rule);
  saveCategoryRules(all);
}

function deleteCategoryRule(id) {
  saveCategoryRules(getCategoryRules().filter(r => r.id !== id));
}

// ─── Chart views ──────────────────────────────────────────────────────────

function getChartViews()       { return dbLoad(pk('charts')); }
function saveChartViews(views) { dbSave(pk('charts'), views); }

function upsertChartView(view) {
  const all = getChartViews();
  const idx = all.findIndex(v => v.id === view.id);
  if (idx >= 0) all[idx] = view; else all.push(view);
  saveChartViews(all);
}

function deleteChartView(id) {
  saveChartViews(getChartViews().filter(v => v.id !== id));
}

// ─── Accounts ─────────────────────────────────────────────────────────────

function getAccounts()      { return dbLoad(pk('accounts')); }
function saveAccounts(accs) { dbSave(pk('accounts'), accs); }

function upsertAccount(acc) {
  const all = getAccounts();
  const idx = all.findIndex(a => a.id === acc.id);
  if (idx >= 0) all[idx] = acc; else all.push(acc);
  saveAccounts(all);
}

function deleteAccount(id) {
  saveAccounts(getAccounts().filter(a => a.id !== id));
}

// ─── Import batches ───────────────────────────────────────────────────────

function getImportBatches() { return dbLoad(pk('batches')); }

function saveImportBatch(batch) {
  const all = getImportBatches();
  all.push(batch);
  dbSave(pk('batches'), all);
}

// ─── Settings ─────────────────────────────────────────────────────────────

function getSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(pk('settings')) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(s) {
  localStorage.setItem(pk('settings'), JSON.stringify(s));
}

function wipeProfileData() {
  saveTransactions([]);
  saveCategoryRules([]);
  saveAccounts([]);
  saveChartViews([]);
  dbSave(pk('batches'), []);
  saveCategories(DEFAULT_CATEGORIES.map(c => createCategory(c.name, c.color)));
}

// ─── Event log ────────────────────────────────────────────────────────────

function getEventLog()        { return dbLoad(pk('eventlog')); }
function saveEventLog(events) { dbSave(pk('eventlog'), events); }

function logEvent(type, details) {
  const events = getEventLog();
  events.push({ id: generateId(), type, timestamp: new Date().toISOString(), details: details || {} });
  saveEventLog(events);
}

// ─── Backup / restore ─────────────────────────────────────────────────────

function exportAll() {
  const profile = getProfiles().find(p => p.id === _profileId);
  return {
    version: 1,
    exportedAt:  new Date().toISOString(),
    profileName: profile?.name || 'unknown',
    transactions: getTransactions(),
    categories:   getCategories(),
    rules:        getCategoryRules(),
    batches:      getImportBatches(),
    accounts:     getAccounts(),
    charts:       getChartViews(),
  };
}

function importAll(data) {
  dbSave(pk('transactions'), data.transactions || []);
  dbSave(pk('categories'),   data.categories   || []);
  dbSave(pk('rules'),        data.rules        || []);
  dbSave(pk('batches'),      data.batches      || []);
  dbSave(pk('accounts'),     data.accounts     || []);
  dbSave(pk('charts'),       data.charts       || []);
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateId() {
  // crypto.randomUUID() requires secure context — fallback for file:// in older browsers
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function buildTransactionId(date, amount, description, occurrenceIndex) {
  const raw = `${date}|${amount}|${description}|${occurrenceIndex}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h) ^ raw.charCodeAt(i);
    h |= 0;
  }
  return `tx_${Math.abs(h).toString(36)}_${occurrenceIndex}`;
}

function getMonthKey(dateStr) {
  return dateStr.slice(0, 7);
}

const DEFAULT_CATEGORIES = [
  { name: 'Jedzenie',     color: '#ef4444' },  // red
  { name: 'Transport',    color: '#3b82f6' },  // blue
  { name: 'Rachunki',     color: '#6366f1' },  // indigo
  { name: 'Zdrowie',      color: '#22c55e' },  // green
  { name: 'Rozrywka',     color: '#f97316' },  // orange
  { name: 'Zakupy',       color: '#06b6d4' },  // cyan
  { name: 'Inne',         color: '#eab308' },  // yellow
];

function createCategory(name, color) {
  return {
    id: generateId(),
    name,
    color,
    requiresConfirmation: false,
    createdAt: new Date().toISOString(),
  };
}

function createCategoryRule(pattern, matchType, categoryId, priority = 0) {
  return {
    id: generateId(),
    pattern,
    matchType,
    categoryId,
    priority,
    requiresConfirmation: false,
  };
}

function createAccount(name, identifiers = [], color = '#3b82f6') {
  return {
    id: generateId(),
    name,
    identifiers,
    color,
    createdAt: new Date().toISOString(),
  };
}

function createChartView(name, type, period, categoryIds = []) {
  return {
    id: generateId(),
    name,
    type,
    period,
    categoryIds,
    createdAt: new Date().toISOString(),
  };
}

function createImportBatch({ bank, sourceType, fileName, rowCount, duplicatesSkipped }) {
  return {
    id: generateId(),
    bank,
    sourceType,
    fileName,
    importedAt: new Date().toISOString(),
    rowCount,
    duplicatesSkipped,
  };
}

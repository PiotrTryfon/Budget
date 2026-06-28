// Bank A: Pekao S.A.
// Encoding:  Windows-1250
// Separator: comma, quoted fields
// Date:      DD.MM.YYYY
// Amount:    "-55,00" → -55.00

const ENCODING = 'windows-1250';

// Maps Pekao's own category strings to our default category names.
// Keys are lowercase substrings to match against bank category.
const PEKAO_CATEGORY_MAP = [
  ['restauracje', 'Jedzenie'],
  ['kawiarnie',   'Jedzenie'],
  ['żywność',     'Jedzenie'],
  ['jedzenie',    'Jedzenie'],
  ['spożyw',      'Jedzenie'],
  ['lekarstwa',   'Zdrowie'],
  ['apteka',      'Zdrowie'],
  ['zdrowie',     'Zdrowie'],
  ['medyczn',     'Zdrowie'],
  ['transport',   'Transport'],
  ['paliwo',      'Transport'],
  ['komunikacja', 'Transport'],
  ['taxi',        'Transport'],
  ['uber',        'Transport'],
  ['ubrania',     'Zakupy'],
  ['odzież',      'Zakupy'],
  ['elektronika', 'Zakupy'],
  ['sklep',       'Zakupy'],
  ['zakupy',      'Zakupy'],
  ['rozrywka',    'Rozrywka'],
  ['kultura',     'Rozrywka'],
  ['sport',       'Rozrywka'],
  ['hobby',       'Rozrywka'],
  ['rachunki',    'Rachunki'],
  ['opłaty',      'Rachunki'],
  ['subskrypcje', 'Rachunki'],
  ['finanse',     'Rachunki'],
];

// Searches raw file content + filename against each account's identifiers.
// Returns matched Account object or null.
function detectAccount(rawText, fileName, accounts) {
  const haystack = (rawText + '\n' + (fileName || '')).toLowerCase();
  for (const acc of accounts) {
    for (const id of (acc.identifiers || [])) {
      if (id.trim() && haystack.includes(id.trim().toLowerCase())) return acc;
    }
  }
  return null;
}

function detectBankA(rawText) {
  const first = rawText.split(/\r?\n/)[0];
  return first.includes('Kwota operacji') && first.includes('Numer referencyjny');
}

function parseBankA(rawText) {
  const rows = parseCSV(rawText);
  if (rows.length < 2) return [];

  const header = rows[0].map(h => h.trim());

  const idx = {
    date:        header.findIndex(h => h.startsWith('Data')),
    recipient:   header.findIndex(h => h === 'Nadawca / Odbiorca'),
    title:       header.findIndex(h => h.includes('em')),        // Tytułem
    amount:      header.findIndex(h => h === 'Kwota operacji'),
    bankCat:     header.findIndex(h => h === 'Kategoria'),
  };

  if (idx.date      < 0) idx.date      = 0;
  if (idx.recipient < 0) idx.recipient = 2;
  if (idx.title     < 0) idx.title     = 6;
  if (idx.amount    < 0) idx.amount    = 7;
  if (idx.bankCat   < 0) idx.bankCat   = 11;

  return rows.slice(1)
    .filter(row => row.length > idx.amount && row[idx.amount]?.trim())
    .map(row => {
      const date        = parseDatePL((row[idx.date]      || '').trim());
      const recipient   = (row[idx.recipient] || '').trim();
      const title       = (row[idx.title]     || '').trim();
      const amount      = parseAmountPL((row[idx.amount]  || '').trim());
      const bankCat     = (row[idx.bankCat]   || '').trim();
      const description = buildDescription(recipient, title);

      return {
        date,
        amount,
        description,
        bankCategory: bankCat,
        rawRow: Object.fromEntries(header.map((h, i) => [h, (row[i] || '').trim()])),
      };
    })
    .filter(t => t.date && !isNaN(t.amount));
}

// Looks up our category name for a given Pekao bank category string.
// Returns category name (string) or null.
function resolveBankCategory(bankCatStr, categories) {
  if (!bankCatStr) return null;
  const lower = bankCatStr.toLowerCase();

  for (const [keyword, catName] of PEKAO_CATEGORY_MAP) {
    if (lower.includes(keyword)) {
      const cat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
      if (cat) return cat;
    }
  }
  return null;
}

// "DD.MM.YYYY" → "YYYY-MM-DD"
function parseDatePL(str) {
  const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// '"-55,00"' → -55.00
function parseAmountPL(str) {
  return parseFloat(str.replace(/"/g, '').replace(/\s/g, '').replace(',', '.'));
}

function buildDescription(recipient, title) {
  if (!recipient && !title) return '(brak opisu)';
  if (!recipient) return title;
  const junk = !title
    || /^\*+[\d*]+$/.test(title)
    || /^BLIK\s+REF\s+\d+$/i.test(title)
    || /^\d{10,}$/.test(title);
  return junk ? recipient : `${recipient} — ${title}`;
}

function parseCSV(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(parseCSVLine(line));
  }
  return rows;
}

function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

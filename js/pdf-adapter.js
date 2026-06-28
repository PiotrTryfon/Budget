// Bank B: PKO BP S.A.
// Source: PDF bank statement ("Wyciąg")
// Requires PDF.js loaded globally as pdfjsLib

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ─── Text extraction ──────────────────────────────────────────────────────

async function extractPdfText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pageLines = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Group items by Y position (3-unit tolerance bands)
    const byY = new Map();
    for (const item of content.items) {
      if (typeof item.str !== 'string' || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push({ str: item.str, x: item.transform[4], w: item.width || 0 });
    }

    // Sort Y descending (PDF origin = bottom, so higher Y = top of page)
    const ys = [...byY.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const items = byY.get(y).sort((a, b) => a.x - b.x);
      let line = '';
      for (let i = 0; i < items.length; i++) {
        if (i > 0) {
          const prev = items[i - 1];
          const gap  = items[i].x - (prev.x + prev.w);
          if (gap > 3) line += ' ';
        }
        line += items[i].str;
      }
      line = line.trim();
      if (line) pageLines.push(line);
    }
  }

  return pageLines.join('\n');
}

// ─── Detection ────────────────────────────────────────────────────────────

function detectBankB(text) {
  const u = text.toUpperCase();
  return u.includes('PKO BP') || u.includes('PKOBP') || u.includes('POWSZECHNA KASA');
}

// ─── Parser ───────────────────────────────────────────────────────────────

// Returns [{date, amount, description, bankCategory, rawRow}] — same shape as parseBankA.
function parseBankB(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Full row: DD.MM.YYYY  ID(5+ alphanum)  TYPE  AMOUNT  BALANCE
  const FULL_RE = /^(\d{2}\.\d{2}\.\d{4})\s+([A-Za-z0-9]{5,})\s+(.+?)\s+(-?\d[\d ]*,\d{2})\s+(\d[\d ]*,\d{2})\s*$/;
  // Partial row: TYPE  AMOUNT  BALANCE  (no date/ID — occurs in batch payment sub-rows)
  const PART_RE = /^(.+?)\s+(-?\d[\d ]*,\d{2})\s+(\d[\d ]*,\d{2})\s*$/;
  // Value-date / description line
  const VDATE_RE = /^(\d{2}\.\d{2}\.\d{4})\s*(.*)/;
  // Fused date+ID with no space: "31.03.20261232132123"
  const FUSED_RE = /^(\d{2}\.\d{2}\.\d{4})([A-Za-z0-9]{5,})\s*(.*)/;

  // Known PKO BP operation keywords — covers ASCII and missing-glyph variants
  const isOpType = s =>
    /\b(PRZELEW|OP.ATA|PRZEJ.CIE|WYP.ATA|ZWROT|PROWIZJA|SKARBOWY|VAT)\b/i.test(s);

  const results = [];
  let lastDate = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let date, id = '', type, amtStr;

    const fm = FULL_RE.exec(line);
    if (fm) {
      [, date, id, type, amtStr] = fm;
      lastDate = date;
      i++;
    } else {
      const pm = PART_RE.exec(line);
      if (pm && isOpType(pm[1])) {
        type   = pm[1];
        amtStr = pm[2];
        date   = lastDate;
        i++;
      } else {
        i++;
        continue;
      }
    }

    // ── Collect description from following non-transaction lines ──
    const descParts = [];
    while (i < lines.length) {
      const next = lines[i];
      if (FULL_RE.test(next)) break;
      const npm = PART_RE.exec(next);
      if (npm && isOpType(npm[1])) break;

      // Fused date+ID line (e.g. "31.03.20261232132123 TEXT")
      const fused = FUSED_RE.exec(next);
      if (fused) {
        if (!date) date = fused[1];
        if (!id)   id   = fused[2];
        if (fused[3]) descParts.push(fused[3].trim());
        i++;
        continue;
      }

      // Normal value-date line: "31.03.2026  some description text"
      const vd = VDATE_RE.exec(next);
      if (vd) {
        const rest = vd[2].trim();
        // If no id yet and rest looks like a bare ID, treat it as ID
        if (!id && /^[A-Za-z0-9]{5,}$/.test(rest)) {
          id = rest;
        } else if (rest) {
          descParts.push(rest);
        }
        i++;
        continue;
      }

      // Plain continuation line
      descParts.push(next);
      i++;
    }

    if (!date || !amtStr) continue;
    const parsedDate = parseDatePL(date);
    const amount     = parseAmountPL(amtStr);
    if (!parsedDate || isNaN(amount)) continue;

    results.push({
      date:        parsedDate,
      amount,
      description: buildDescriptionB(type.trim(), descParts.join(' ').trim()),
      bankCategory: null,
      rawRow: { date, id, type: type.trim(), amount: amtStr, rawDesc: descParts.join(' ') },
    });
  }

  return results;
}

// ─── Description cleanup ──────────────────────────────────────────────────

function buildDescriptionB(type, rawDesc) {
  if (!rawDesc) return type;

  // Strip SWIFT routing codes: /OPT/X/////, /INV/PK/, BPID:XXXXXXX
  const cleaned = rawDesc
    .replace(/\/[A-Z0-9]+\/[A-Z0-9\/]*/g, '')
    .replace(/\bBPID:[A-Za-z0-9]+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || type;
}

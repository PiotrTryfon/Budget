# Budget Analysis App — CLAUDE.md

## What this is
Personal expense tracking web app for two users (family). Browser-only, no backend, no server.
Used roughly once a month to import bank transactions, categorize them, and see where money went.
Hosted on GitHub Pages. Data stays in each browser's localStorage — never sent anywhere.

## Tech decisions (settled, do not revisit)
- Plain `<script>` tags, global functions — NO ES modules (`type="module"` breaks on `file://`)
- No bundler, no npm, no node_modules
- `localStorage` for all persistence, namespaced per profile: `budzet_p{profileId}_{key}`
- Chart.js 4.4.1 (UMD build from cdnjs) — loaded with SRI hash
- PDF.js 3.11.174 (UMD build from cdnjs) — loaded with SRI hash
- No TypeScript, no React/Vue/Angular
- No backend, no fetch() calls to any server

## File structure
```
index.html              — shell, mobile topbar, sidebar, screen containers
css/app.css             — all styles, including responsive/mobile
js/
  app.js                — init, navigation, mobile sidebar toggle
  db.js                 — localStorage CRUD, exportAll/importAll, wipeProfileData
  models.js             — generateId, buildTransactionId, getMonthKey, DEFAULT_CATEGORIES, factory fns
  categorizer.js        — categorizeTransaction(), recalculateAll()
  csv-adapter.js        — Bank A (Pekao) CSV parser, detectAccount()
  pdf-adapter.js        — Bank B (PKO BP) PDF parser via PDF.js
  import.js             — import screen: file pick/drop, parse, dedup, preview table, save
  transactions.js       — transaction list: filters, multi-category editor, manual add, undo
  categories.js         — category CRUD + rule CRUD + rules export/import
  dashboard.js          — multi-period summary: cards + per-month table + category breakdown
  charts.js             — chart builder: bar/monthly/trend views via Chart.js
  backup.js             — JSON full export (quickExport) + JSON restore
  settings.js           — settings toggles, account management, profile wipe
  profiles.js           — profile picker overlay, create/rename profiles
```

## Navigation / screen pattern
Each screen module has a `render(container)` function. `app.js` calls it on navigation.
Screens re-render fully on each navigation — no virtual DOM, no diffing. Acceptable at this scale.
Script load order matters — db.js must load before anything that calls getTransactions(), etc.

## Data model
- **Transaction** — id (hash), date, amount, description, bank, sourceType, categoryId, extraCategoryIds[], categorySource, isInternalTransfer, importBatchId, monthKey, needsReview, rawRow, accountId
- **Category** — id, name, color, requiresConfirmation, createdAt
- **CategoryRule** — id, pattern, matchType (contains/exact/startsWith), categoryId, priority, requiresConfirmation
- **ImportBatch** — id, bank, sourceType, fileName, importedAt, rowCount, duplicatesSkipped
- **Account** — id, name, color, identifiers[] (IBAN fragments / filename substrings for auto-detection)
- **ChartView** — id, name, type (bar-category/monthly/trend), period, categoryIds[]

## Key invariants (never break these)
- `categorySource === "manual"` → never overwritten by recalculateAll() or auto-cat
- Dedup ID = `buildTransactionId(date, amount, description, occurrenceIndex)` — same transaction twice in one day is NOT a duplicate (occurrenceIndex increments)
- `recalculateAll()` must be called after: rule add/edit/delete, category delete
- `isInternalTransfer: true` → visible in transaction list, excluded from all sums and dashboard totals
- `categoryId` is the primary category used in all financial calculations (dashboard, breakdown)
- `extraCategoryIds[]` are secondary categories — display and filtering only, not counted in sums
- SRI hashes on CDN scripts must be kept in sync if library versions are ever updated

## Multi-profile
- Profile list stored globally at `budzet_profiles` in localStorage
- All other data scoped to `budzet_p{profileId}_{key}`
- `setActiveProfile(id)` / `getActiveProfileId()` in db.js
- No authentication — anyone with browser access can switch profiles

## Banks supported
- **Bank A — Pekao**: CSV, Windows-1250, comma separator, DD.MM.YYYY dates
- **Bank B — PKO BP**: PDF via PDF.js, complex 2-row structure, handles batch payment sub-rows

## Account detection
`detectAccount(rawText, fileName, accounts)` — case-insensitive substring search of file content + filename against user-defined account identifiers. Called during import for both CSV and PDF.

## Security notes
- All `escHtml()` functions escape `&`, `<`, `>`, `"` — safe for both innerHTML and attribute value contexts
- `escAttr()` in import.js additionally escapes `"` (used specifically in input value= attributes)
- CDN scripts loaded with SRI `integrity=` hashes — prevents supply-chain attacks
- localStorage is unencrypted — anyone with DevTools access on the device can read financial data
- Backup JSON files are plaintext — treat them as sensitive, do not store in shared/public locations
- No PIN or authentication on profile selection — physical device security is the only barrier

## What NOT to do
- No pie charts
- No Tesseract.js / OCR
- No bundler, no npm install
- No frameworks
- No inline event handlers in HTML (JS stays in JS files)
- No automatic rule learning from corrections
- Do NOT add `type="module"` to any script tag — breaks on file:// protocol
- Do NOT use ES module syntax (import/export) — all functions are global
- Do NOT load new CDN libraries without adding SRI hash

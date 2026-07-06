const _LOG_META = {
  'import':         { icon: '↑', label: 'Import',              cls: 'log-import'  },
  'backup-export':  { icon: '⇓', label: 'Eksport backup',      cls: 'log-export'  },
  'backup-restore': { icon: '↺', label: 'Przywrócono backup',  cls: 'log-restore' },
  'rules-export':   { icon: '⇓', label: 'Eksport reguł',       cls: 'log-export'  },
  'rules-import':   { icon: '↑', label: 'Import reguł',        cls: 'log-import'  },
  'wipe':           { icon: '✕', label: 'Wyczyszczono profil', cls: 'log-danger'  },
};

function renderLog(container) {
  const batches = getImportBatches().map(b => ({ _ts: b.importedAt, _kind: 'import', _data: b         }));
  const events  = getEventLog().map(e =>      ({ _ts: e.timestamp,  _kind: e.type,   _data: e.details }));
  const items   = [...batches, ...events].sort((a, b) => b._ts.localeCompare(a._ts));

  container.innerHTML = `
    <h2>Historia</h2>
    ${items.length === 0
      ? '<p style="color:var(--text-muted)">Brak zdarzeń do wyświetlenia.</p>'
      : `<div class="log-list">${items.map(_renderLogItem).join('')}</div>`}
  `;
}

function _renderLogItem(item) {
  const ts      = new Date(item._ts);
  const dateStr = ts.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = ts.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const meta    = _LOG_META[item._kind] || { icon: '·', label: item._kind, cls: '' };
  const d       = item._data;
  let   title   = meta.label;
  let   detail  = '';

  if (item._kind === 'import') {
    const bankLabel = d.bank === 'bankA' ? 'Pekao CSV' : d.bank === 'bankB' ? 'PKO BP PDF' : (d.bank || '');
    title  = `Import — ${escHtml(d.fileName || '')}`;
    detail = `${bankLabel} · ${d.rowCount} transakcji${d.duplicatesSkipped ? `, ${d.duplicatesSkipped} duplikatów` : ''}`;
  } else if (item._kind === 'backup-export') {
    detail = `${d.txCount} transakcji, ${d.catCount} kategorii`;
  } else if (item._kind === 'backup-restore') {
    detail = `${d.txCount} transakcji, ${d.catCount} kategorii`;
  } else if (item._kind === 'rules-export') {
    detail = `${d.ruleCount} reguł`;
  } else if (item._kind === 'rules-import') {
    const parts = [];
    if (d.added)       parts.push(`+${d.added} dodano`);
    if (d.replaced)    parts.push(`${d.replaced} zastąpiono`);
    if (d.skipped)     parts.push(`${d.skipped} pominięto`);
    if (d.catsCreated) parts.push(`${d.catsCreated} nowych kategorii`);
    detail = parts.join(', ');
  } else if (item._kind === 'wipe') {
    detail = escHtml(d.profileName || '');
  }

  return `
    <div class="log-item">
      <div class="log-icon ${meta.cls}">${meta.icon}</div>
      <div class="log-body">
        <div class="log-title">${title}</div>
        <div class="log-meta">${dateStr}, ${timeStr}${detail ? ` · ${detail}` : ''}</div>
      </div>
    </div>
  `;
}

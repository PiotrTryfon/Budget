function categorizeTransaction(description, rules) {
  const sorted = [...rules]
    .filter(r => !r.isTransferRule)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.pattern.length - a.pattern.length;
    });

  for (const rule of sorted) {
    if (matchesRule(description, rule)) {
      return { categoryId: rule.categoryId, categorySource: 'auto', matchedRule: rule };
    }
  }
  return { categoryId: null, categorySource: 'none', matchedRule: null };
}

function applyTransferRules(description, rules) {
  return rules.filter(r => r.isTransferRule).some(r => matchesRule(description, r));
}

function matchesRule(description, rule) {
  const desc    = description.toLowerCase();
  const pattern = rule.pattern.toLowerCase();
  switch (rule.matchType) {
    case 'contains':   return desc.includes(pattern);
    case 'exact':      return desc === pattern;
    case 'startsWith': return desc.startsWith(pattern);
    default:           return false;
  }
}

function recalculateAll() {
  const transactions = getTransactions();
  const rules        = getCategoryRules();

  const updated = transactions.map(tx => {
    let result = tx;

    if (tx.categorySource !== 'manual') {
      const { categoryId, categorySource } = categorizeTransaction(tx.description, rules);
      result = { ...result, categoryId, categorySource };
    }

    if (tx.transferSource !== 'manual') {
      const isTransfer = applyTransferRules(tx.description, rules);
      result = { ...result, isInternalTransfer: isTransfer, transferSource: isTransfer ? 'auto' : 'none' };
    }

    return result;
  });

  saveTransactions(updated);
}

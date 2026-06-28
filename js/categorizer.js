function categorizeTransaction(description, rules) {
  const sorted = [...rules].sort((a, b) => {
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

function matchesRule(description, rule) {
  const desc = description.toLowerCase();
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
  const rules = getCategoryRules();

  const updated = transactions.map(tx => {
    if (tx.categorySource === 'manual') return tx;
    const { categoryId, categorySource } = categorizeTransaction(tx.description, rules);
    return { ...tx, categoryId, categorySource };
  });

  saveTransactions(updated);
}

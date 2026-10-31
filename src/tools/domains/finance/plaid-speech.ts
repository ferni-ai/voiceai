/**
 * Plaid accounts and transactions, summed and said out loud: the pure half of
 * the Plaid tools (plaid.ts), moved here unchanged so plaid.ts could shrink.
 *
 * @module tools/domains/finance/plaid-speech
 */

export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name?: string;
  type: 'depository' | 'credit' | 'loan' | 'investment' | 'other';
  subtype?: string;
  balances: {
    available?: number;
    current?: number;
    limit?: number;
    iso_currency_code?: string;
  };
  mask?: string; // Last 4 digits
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name?: string;
  category?: string[];
  pending: boolean;
  payment_channel: 'online' | 'in store' | 'other';
  location?: {
    city?: string;
    region?: string;
  };
}

/**
 * Analyze spending by category
 */
export function analyzeSpending(transactions: PlaidTransaction[]): {
  byCategory: Record<string, { total: number; count: number; transactions: string[] }>;
  totalSpending: number;
  largestExpenses: Array<{ name: string; amount: number; date: string }>;
  averageTransactionSize: number;
  recurringExpenses: Array<{ name: string; amount: number; frequency: string }>;
} {
  const byCategory: Record<string, { total: number; count: number; transactions: string[] }> = {};
  let totalSpending = 0;

  // Filter to spending only (positive amounts = money out in Plaid)
  const spendingTxns = transactions.filter((t) => t.amount > 0 && !t.pending);

  for (const txn of spendingTxns) {
    const category = txn.category?.[0] || 'Uncategorized';
    totalSpending += txn.amount;

    if (!byCategory[category]) {
      byCategory[category] = { total: 0, count: 0, transactions: [] };
    }
    byCategory[category].total += txn.amount;
    byCategory[category].count++;
    if (byCategory[category].transactions.length < 3) {
      byCategory[category].transactions.push(txn.merchant_name || txn.name);
    }
  }

  // Find largest expenses
  const largestExpenses = [...spendingTxns]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((t) => ({
      name: t.merchant_name || t.name,
      amount: t.amount,
      date: t.date,
    }));

  // Detect recurring expenses (same merchant, similar amounts)
  const merchantCounts: Record<string, { amounts: number[]; dates: string[] }> = {};
  for (const txn of spendingTxns) {
    const key = (txn.merchant_name || txn.name).toLowerCase();
    if (!merchantCounts[key]) {
      merchantCounts[key] = { amounts: [], dates: [] };
    }
    merchantCounts[key].amounts.push(txn.amount);
    merchantCounts[key].dates.push(txn.date);
  }

  const recurringExpenses = Object.entries(merchantCounts)
    .filter(([_, data]) => data.amounts.length >= 2)
    .map(([name, data]) => {
      const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length;
      const frequency =
        data.amounts.length >= 4 ? 'weekly' : data.amounts.length >= 2 ? 'monthly' : 'occasional';
      return { name, amount: Math.round(avgAmount * 100) / 100, frequency };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  return {
    byCategory,
    totalSpending: Math.round(totalSpending * 100) / 100,
    largestExpenses,
    averageTransactionSize:
      spendingTxns.length > 0 ? Math.round((totalSpending / spendingTxns.length) * 100) / 100 : 0,
    recurringExpenses,
  };
}

/**
 * Format account balances for natural speech
 */
export function formatBalancesForSpeech(accounts: PlaidAccount[]): string {
  if (accounts.length === 0) {
    return "I don't see any linked accounts yet.";
  }

  const lines: string[] = [];
  let totalChecking = 0;
  let totalSavings = 0;
  let totalCredit = 0;
  let totalCreditLimit = 0;

  for (const account of accounts) {
    const balance = account.balances.current || account.balances.available || 0;
    const { name } = account;
    const lastFour = account.mask ? ` (***${account.mask})` : '';

    if (account.type === 'depository') {
      if (account.subtype === 'checking') {
        totalChecking += balance;
        lines.push(`• ${name}${lastFour}: $${balance.toLocaleString()} checking`);
      } else if (account.subtype === 'savings') {
        totalSavings += balance;
        lines.push(`• ${name}${lastFour}: $${balance.toLocaleString()} savings`);
      } else {
        lines.push(`• ${name}${lastFour}: $${balance.toLocaleString()}`);
      }
    } else if (account.type === 'credit') {
      totalCredit += balance;
      if (account.balances.limit) {
        totalCreditLimit += account.balances.limit;
        const utilization = Math.round((balance / account.balances.limit) * 100);
        lines.push(
          `• ${name}${lastFour}: $${balance.toLocaleString()} balance (${utilization}% of $${account.balances.limit.toLocaleString()} limit)`
        );
      } else {
        lines.push(`• ${name}${lastFour}: $${balance.toLocaleString()} balance`);
      }
    }
  }

  const summary: string[] = [];
  if (totalChecking > 0 || totalSavings > 0) {
    const totalCash = totalChecking + totalSavings;
    summary.push(`Total cash: $${totalCash.toLocaleString()}`);
  }
  if (totalCredit > 0) {
    const overallUtilization =
      totalCreditLimit > 0
        ? ` (${Math.round((totalCredit / totalCreditLimit) * 100)}% utilization)`
        : '';
    summary.push(`Credit card debt: $${totalCredit.toLocaleString()}${overallUtilization}`);
  }

  return `${lines.join('\n')}\n\n${summary.join(' | ')}`;
}

/**
 * Format spending analysis for natural speech
 */
export function formatSpendingForSpeech(
  analysis: ReturnType<typeof analyzeSpending>,
  period: string
): string {
  const { byCategory, totalSpending, largestExpenses, recurringExpenses } = analysis;

  const lines: string[] = [];
  lines.push(`📊 Your spending for ${period}: $${totalSpending.toLocaleString()}`);
  lines.push('');

  // Top categories
  const sortedCategories = Object.entries(byCategory)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);

  if (sortedCategories.length > 0) {
    lines.push('**By Category:**');
    for (const [category, data] of sortedCategories) {
      const pct = Math.round((data.total / totalSpending) * 100);
      lines.push(
        `• ${category}: $${data.total.toLocaleString()} (${pct}%) - ${data.count} transactions`
      );
    }
    lines.push('');
  }

  // Largest expenses
  if (largestExpenses.length > 0) {
    lines.push('**Biggest Expenses:**');
    for (const expense of largestExpenses.slice(0, 3)) {
      lines.push(`• ${expense.name}: $${expense.amount.toLocaleString()} on ${expense.date}`);
    }
    lines.push('');
  }

  // Recurring
  if (recurringExpenses.length > 0) {
    lines.push('**Recurring Expenses I Noticed:**');
    for (const recurring of recurringExpenses.slice(0, 5)) {
      lines.push(`• ${recurring.name}: ~$${recurring.amount} ${recurring.frequency}`);
    }
  }

  return lines.join('\n');
}

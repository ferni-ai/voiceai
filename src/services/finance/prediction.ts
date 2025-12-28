/**
 * Financial Prediction Service
 *
 * Builds on Plaid integration to provide "Better than Human" financial foresight.
 *
 * Superhuman Capabilities:
 * - Cash flow forecasting (bills, income timing)
 * - Spending pattern anomaly detection
 * - Subscription creep identification
 * - Savings goal progress with predictions
 * - Proactive money stress awareness
 *
 * @module services/finance/prediction
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getStoredAccessToken,
  getAccountBalances,
  getTransactions,
  analyzeSpending,
} from '../../tools/domains/finance/plaid.js';

const log = createLogger({ module: 'FinancePrediction' });

// ============================================================================
// TYPES
// ============================================================================

export interface Bill {
  name: string;
  amount: number;
  dueDate: Date;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
  category: string;
  isRecurring: boolean;
  confidence: number;
}

export interface IncomeSource {
  name: string;
  amount: number;
  nextExpected: Date;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  confidence: number;
}

export interface CashFlowForecast {
  currentBalance: number;
  projectedBalance: number;
  daysOut: number;
  inflows: Array<{ date: Date; amount: number; source: string }>;
  outflows: Array<{ date: Date; amount: number; description: string }>;
  warnings: CashFlowWarning[];
  projectedLow: { date: Date; balance: number };
}

export interface CashFlowWarning {
  type: 'low_balance' | 'overdraft_risk' | 'large_bill' | 'unusual_timing';
  severity: 'info' | 'warning' | 'alert';
  message: string;
  date: Date;
  amount?: number;
}

export interface SpendingAnomaly {
  type: 'spike' | 'unusual_merchant' | 'category_increase' | 'time_anomaly';
  description: string;
  amount: number;
  percentAboveNormal: number;
  category?: string;
  merchant?: string;
  date: Date;
}

export interface SubscriptionCreep {
  totalMonthly: number;
  previousMonthly: number;
  changePercent: number;
  subscriptions: Array<{
    name: string;
    amount: number;
    firstSeen: Date;
    status: 'active' | 'new' | 'cancelled';
  }>;
  newSubscriptions: Array<{ name: string; amount: number; firstSeen: Date }>;
  potentialSavings: number;
  unusedSuggestions: string[];
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  monthlyContribution: number;
}

export interface GoalProgress {
  goal: SavingsGoal;
  percentComplete: number;
  onTrack: boolean;
  projectedCompletion: Date;
  monthlyNeeded: number;
  surplus: number; // Positive = ahead, negative = behind
  message: string;
}

export interface FinancialInsight {
  type: 'cash_flow' | 'anomaly' | 'subscription' | 'goal' | 'stress';
  severity: 'info' | 'warning' | 'alert';
  insight: string;
  suggestion?: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// STATE
// ============================================================================

interface UserFinancialState {
  userId: string;
  lastSync: Date;
  bills: Bill[];
  income: IncomeSource[];
  subscriptions: SubscriptionCreep | null;
  goals: SavingsGoal[];
  baselineSpending: Record<string, number>; // category -> avg monthly
  anomalies: SpendingAnomaly[];
}

const userFinancialState = new Map<string, UserFinancialState>();

// ============================================================================
// BILL DETECTION
// ============================================================================

/**
 * Detect recurring bills from transaction history
 */
export async function detectBills(userId: string): Promise<Bill[]> {
  const accessToken = getStoredAccessToken(userId);
  if (!accessToken) return [];

  try {
    // Get 90 days of transactions
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const transactions = await getTransactions(
      accessToken,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      500
    );

    // Group by merchant and look for recurring patterns
    const merchantGroups: Record<
      string,
      Array<{ amount: number; date: Date; category: string }>
    > = {};

    for (const txn of transactions) {
      if (txn.amount <= 0) continue; // Only outflows

      const key = (txn.merchant_name || txn.name).toLowerCase();
      if (!merchantGroups[key]) {
        merchantGroups[key] = [];
      }
      merchantGroups[key].push({
        amount: txn.amount,
        date: new Date(txn.date),
        category: txn.category?.[0] || 'Other',
      });
    }

    const bills: Bill[] = [];

    for (const [merchant, txns] of Object.entries(merchantGroups)) {
      if (txns.length < 2) continue;

      // Sort by date
      txns.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Check for recurring pattern
      const intervals: number[] = [];
      for (let i = 1; i < txns.length; i++) {
        const days = Math.round(
          (txns[i].date.getTime() - txns[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)
        );
        intervals.push(days);
      }

      // Determine frequency
      const avgInterval =
        intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;

      let frequency: Bill['frequency'] | null = null;
      let confidence = 0;

      if (avgInterval >= 6 && avgInterval <= 8) {
        frequency = 'weekly';
        confidence = calculateRecurringConfidence(intervals, 7);
      } else if (avgInterval >= 13 && avgInterval <= 16) {
        frequency = 'biweekly';
        confidence = calculateRecurringConfidence(intervals, 14);
      } else if (avgInterval >= 27 && avgInterval <= 35) {
        frequency = 'monthly';
        confidence = calculateRecurringConfidence(intervals, 30);
      } else if (avgInterval >= 85 && avgInterval <= 100) {
        frequency = 'quarterly';
        confidence = calculateRecurringConfidence(intervals, 90);
      }

      if (frequency && confidence >= 0.6) {
        // Calculate average amount
        const avgAmount = txns.reduce((sum, t) => sum + t.amount, 0) / txns.length;

        // Predict next due date
        const lastDate = txns[txns.length - 1].date;
        const nextDate = new Date(lastDate);
        switch (frequency) {
          case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
          case 'biweekly':
            nextDate.setDate(nextDate.getDate() + 14);
            break;
          case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
          case 'quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
        }

        bills.push({
          name: merchant,
          amount: Math.round(avgAmount * 100) / 100,
          dueDate: nextDate,
          frequency,
          category: txns[0].category,
          isRecurring: true,
          confidence,
        });
      }
    }

    // Update state
    const state = getOrCreateState(userId);
    state.bills = bills;
    state.lastSync = new Date();

    log.debug({ userId, billCount: bills.length }, 'Bills detected');
    return bills;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Bill detection failed');
    return [];
  }
}

function calculateRecurringConfidence(intervals: number[], expected: number): number {
  if (intervals.length === 0) return 0;
  const variance = intervals.reduce((sum, i) => sum + Math.abs(i - expected), 0) / intervals.length;
  // Lower variance = higher confidence
  return Math.max(0, 1 - variance / expected);
}

// ============================================================================
// INCOME DETECTION
// ============================================================================

/**
 * Detect recurring income from transaction history
 */
export async function detectIncome(userId: string): Promise<IncomeSource[]> {
  const accessToken = getStoredAccessToken(userId);
  if (!accessToken) return [];

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const transactions = await getTransactions(
      accessToken,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      500
    );

    // Look for deposits (negative amounts in Plaid = money in)
    const deposits = transactions.filter((t) => t.amount < 0);

    const sourceGroups: Record<string, Array<{ amount: number; date: Date }>> = {};

    for (const txn of deposits) {
      const key = (txn.merchant_name || txn.name).toLowerCase();
      if (!sourceGroups[key]) {
        sourceGroups[key] = [];
      }
      sourceGroups[key].push({
        amount: Math.abs(txn.amount),
        date: new Date(txn.date),
      });
    }

    const income: IncomeSource[] = [];

    for (const [source, txns] of Object.entries(sourceGroups)) {
      if (txns.length < 2) continue;

      txns.sort((a, b) => a.date.getTime() - b.date.getTime());

      const intervals: number[] = [];
      for (let i = 1; i < txns.length; i++) {
        const days = Math.round(
          (txns[i].date.getTime() - txns[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)
        );
        intervals.push(days);
      }

      const avgInterval =
        intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;

      let frequency: IncomeSource['frequency'] | null = null;
      let confidence = 0;

      if (avgInterval >= 6 && avgInterval <= 8) {
        frequency = 'weekly';
        confidence = calculateRecurringConfidence(intervals, 7);
      } else if (avgInterval >= 13 && avgInterval <= 16) {
        frequency = 'biweekly';
        confidence = calculateRecurringConfidence(intervals, 14);
      } else if (avgInterval >= 27 && avgInterval <= 35) {
        frequency = 'monthly';
        confidence = calculateRecurringConfidence(intervals, 30);
      }

      if (frequency && confidence >= 0.5) {
        const avgAmount = txns.reduce((sum, t) => sum + t.amount, 0) / txns.length;

        const lastDate = txns[txns.length - 1].date;
        const nextExpected = new Date(lastDate);
        switch (frequency) {
          case 'weekly':
            nextExpected.setDate(nextExpected.getDate() + 7);
            break;
          case 'biweekly':
            nextExpected.setDate(nextExpected.getDate() + 14);
            break;
          case 'monthly':
            nextExpected.setMonth(nextExpected.getMonth() + 1);
            break;
        }

        income.push({
          name: source,
          amount: Math.round(avgAmount * 100) / 100,
          nextExpected,
          frequency,
          confidence,
        });
      }
    }

    const state = getOrCreateState(userId);
    state.income = income;

    log.debug({ userId, incomeCount: income.length }, 'Income sources detected');
    return income;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Income detection failed');
    return [];
  }
}

// ============================================================================
// CASH FLOW FORECASTING
// ============================================================================

/**
 * Predict cash flow for upcoming days
 */
export async function predictCashFlow(
  userId: string,
  daysOut = 14
): Promise<CashFlowForecast | null> {
  const accessToken = getStoredAccessToken(userId);
  if (!accessToken) return null;

  try {
    // Get current balances
    const accounts = await getAccountBalances(accessToken);
    const currentBalance = accounts
      .filter((a) => a.type === 'depository')
      .reduce((sum, a) => sum + (a.balances.available || a.balances.current || 0), 0);

    // Ensure bills and income are detected
    const state = getOrCreateState(userId);
    if (state.bills.length === 0) {
      await detectBills(userId);
    }
    if (state.income.length === 0) {
      await detectIncome(userId);
    }

    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + daysOut);

    const inflows: CashFlowForecast['inflows'] = [];
    const outflows: CashFlowForecast['outflows'] = [];
    const warnings: CashFlowWarning[] = [];

    // Project income
    for (const inc of state.income) {
      const nextDate = new Date(inc.nextExpected);
      while (nextDate <= endDate) {
        if (nextDate >= today) {
          inflows.push({
            date: new Date(nextDate),
            amount: inc.amount,
            source: inc.name,
          });
        }
        // Advance to next occurrence
        switch (inc.frequency) {
          case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
          case 'biweekly':
            nextDate.setDate(nextDate.getDate() + 14);
            break;
          case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
        }
      }
    }

    // Project bills
    for (const bill of state.bills) {
      const nextDate = new Date(bill.dueDate);
      while (nextDate <= endDate) {
        if (nextDate >= today) {
          outflows.push({
            date: new Date(nextDate),
            amount: bill.amount,
            description: bill.name,
          });
        }
        switch (bill.frequency) {
          case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
          case 'biweekly':
            nextDate.setDate(nextDate.getDate() + 14);
            break;
          case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
          case 'quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
          case 'annual':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
        }
      }
    }

    // Calculate daily balances to find projected low
    const dailyBalances: Array<{ date: Date; balance: number }> = [];
    let runningBalance = currentBalance;
    let projectedLow = { date: today, balance: currentBalance };

    for (let d = 0; d <= daysOut; d++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + d);

      // Add inflows for this day
      for (const inflow of inflows) {
        if (isSameDay(inflow.date, checkDate)) {
          runningBalance += inflow.amount;
        }
      }

      // Subtract outflows for this day
      for (const outflow of outflows) {
        if (isSameDay(outflow.date, checkDate)) {
          runningBalance -= outflow.amount;
        }
      }

      dailyBalances.push({ date: new Date(checkDate), balance: runningBalance });

      if (runningBalance < projectedLow.balance) {
        projectedLow = { date: new Date(checkDate), balance: runningBalance };
      }
    }

    // Generate warnings
    if (projectedLow.balance < 0) {
      warnings.push({
        type: 'overdraft_risk',
        severity: 'alert',
        message: `Balance could go negative (~$${Math.abs(projectedLow.balance).toFixed(0)}) around ${formatDate(projectedLow.date)}`,
        date: projectedLow.date,
        amount: projectedLow.balance,
      });
    } else if (projectedLow.balance < 100) {
      warnings.push({
        type: 'low_balance',
        severity: 'warning',
        message: `Balance could drop to $${projectedLow.balance.toFixed(0)} around ${formatDate(projectedLow.date)}`,
        date: projectedLow.date,
        amount: projectedLow.balance,
      });
    }

    // Check for large upcoming bills
    const largeBills = outflows.filter((o) => o.amount > currentBalance * 0.3);
    for (const bill of largeBills) {
      warnings.push({
        type: 'large_bill',
        severity: 'info',
        message: `${bill.description} ($${bill.amount.toFixed(0)}) due ${formatDate(bill.date)}`,
        date: bill.date,
        amount: bill.amount,
      });
    }

    const projectedBalance = dailyBalances[dailyBalances.length - 1]?.balance || currentBalance;

    return {
      currentBalance,
      projectedBalance,
      daysOut,
      inflows,
      outflows,
      warnings,
      projectedLow,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Cash flow prediction failed');
    return null;
  }
}

// ============================================================================
// SPENDING ANOMALY DETECTION
// ============================================================================

/**
 * Detect unusual spending patterns
 */
export async function detectAnomalies(userId: string): Promise<SpendingAnomaly[]> {
  const accessToken = getStoredAccessToken(userId);
  if (!accessToken) return [];

  try {
    // Get 60 days of transactions
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 60);

    const transactions = await getTransactions(
      accessToken,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      500
    );

    const anomalies: SpendingAnomaly[] = [];

    // Split into two periods for comparison
    const midpoint = new Date();
    midpoint.setDate(midpoint.getDate() - 30);

    const recentTxns = transactions.filter((t) => new Date(t.date) >= midpoint);
    const historicalTxns = transactions.filter((t) => new Date(t.date) < midpoint);

    // Analyze category spending
    const recentAnalysis = analyzeSpending(recentTxns);
    const historicalAnalysis = analyzeSpending(historicalTxns);

    // Compare categories
    for (const [category, recent] of Object.entries(recentAnalysis.byCategory)) {
      const historical = historicalAnalysis.byCategory[category];
      if (!historical) {
        // New category
        if (recent.total > 100) {
          anomalies.push({
            type: 'category_increase',
            description: `New spending category: ${category}`,
            amount: recent.total,
            percentAboveNormal: 100,
            category,
            date: new Date(),
          });
        }
      } else {
        // Compare to historical
        const increase = ((recent.total - historical.total) / historical.total) * 100;
        if (increase > 50 && recent.total - historical.total > 100) {
          anomalies.push({
            type: 'category_increase',
            description: `${category} spending up ${Math.round(increase)}% from last month`,
            amount: recent.total,
            percentAboveNormal: increase,
            category,
            date: new Date(),
          });
        }
      }
    }

    // Detect individual large transactions (spikes)
    const avgTxnSize =
      recentAnalysis.totalSpending / (recentTxns.filter((t) => t.amount > 0).length || 1);

    for (const txn of recentTxns) {
      if (txn.amount > avgTxnSize * 5 && txn.amount > 200) {
        anomalies.push({
          type: 'spike',
          description: `Large purchase: ${txn.merchant_name || txn.name}`,
          amount: txn.amount,
          percentAboveNormal: ((txn.amount - avgTxnSize) / avgTxnSize) * 100,
          merchant: txn.merchant_name || txn.name,
          date: new Date(txn.date),
        });
      }
    }

    // Update state
    const state = getOrCreateState(userId);
    state.anomalies = anomalies;
    state.baselineSpending = Object.fromEntries(
      Object.entries(historicalAnalysis.byCategory).map(([k, v]) => [k, v.total])
    );

    log.debug({ userId, anomalyCount: anomalies.length }, 'Anomalies detected');
    return anomalies;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Anomaly detection failed');
    return [];
  }
}

// ============================================================================
// SUBSCRIPTION CREEP
// ============================================================================

/**
 * Detect subscription services and creep over time
 */
export async function detectSubscriptionCreep(userId: string): Promise<SubscriptionCreep | null> {
  const accessToken = getStoredAccessToken(userId);
  if (!accessToken) return null;

  try {
    // Get 90 days for subscription detection
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const transactions = await getTransactions(
      accessToken,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      500
    );

    // Find recurring small charges (likely subscriptions)
    const merchantGroups: Record<string, Array<{ amount: number; date: Date }>> = {};

    for (const txn of transactions) {
      if (txn.amount <= 0 || txn.amount > 200) continue; // Skip income and large purchases

      const key = (txn.merchant_name || txn.name).toLowerCase();
      if (!merchantGroups[key]) {
        merchantGroups[key] = [];
      }
      merchantGroups[key].push({
        amount: txn.amount,
        date: new Date(txn.date),
      });
    }

    const subscriptions: SubscriptionCreep['subscriptions'] = [];
    const newSubscriptions: SubscriptionCreep['newSubscriptions'] = [];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    for (const [merchant, txns] of Object.entries(merchantGroups)) {
      if (txns.length < 2) continue;

      // Check if it's monthly recurring
      const intervals: number[] = [];
      txns.sort((a, b) => a.date.getTime() - b.date.getTime());
      for (let i = 1; i < txns.length; i++) {
        const days = Math.round(
          (txns[i].date.getTime() - txns[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)
        );
        intervals.push(days);
      }

      const avgInterval =
        intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;

      if (avgInterval >= 25 && avgInterval <= 35) {
        const avgAmount = txns.reduce((sum, t) => sum + t.amount, 0) / txns.length;
        const firstSeen = txns[0].date;

        const sub = {
          name: merchant,
          amount: Math.round(avgAmount * 100) / 100,
          firstSeen,
          status: 'active' as const,
        };

        subscriptions.push(sub);

        // Check if it's new (first seen in last 60 days)
        if (firstSeen >= sixtyDaysAgo) {
          newSubscriptions.push(sub);
        }
      }
    }

    // Calculate totals
    const totalMonthly = subscriptions.reduce((sum, s) => sum + s.amount, 0);
    const newTotal = newSubscriptions.reduce((sum, s) => sum + s.amount, 0);

    // Estimate previous monthly (current - new)
    const previousMonthly = totalMonthly - newTotal;
    const changePercent =
      previousMonthly > 0 ? ((totalMonthly - previousMonthly) / previousMonthly) * 100 : 0;

    // Suggest potential savings (streaming services, duplicates)
    const unusedSuggestions: string[] = [];
    const streamingServices = subscriptions.filter((s) =>
      /netflix|hulu|disney|hbo|paramount|peacock|spotify|apple music|youtube/i.test(s.name)
    );
    if (streamingServices.length > 3) {
      unusedSuggestions.push(
        `You have ${streamingServices.length} streaming services - consider rotating them seasonally`
      );
    }

    const potentialSavings =
      streamingServices.length > 3
        ? streamingServices.slice(2).reduce((sum, s) => sum + s.amount, 0)
        : 0;

    const result: SubscriptionCreep = {
      totalMonthly: Math.round(totalMonthly * 100) / 100,
      previousMonthly: Math.round(previousMonthly * 100) / 100,
      changePercent: Math.round(changePercent * 10) / 10,
      subscriptions,
      newSubscriptions,
      potentialSavings: Math.round(potentialSavings * 100) / 100,
      unusedSuggestions,
    };

    const state = getOrCreateState(userId);
    state.subscriptions = result;

    log.debug(
      { userId, subCount: subscriptions.length, total: totalMonthly },
      'Subscription creep analyzed'
    );
    return result;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Subscription detection failed');
    return null;
  }
}

// ============================================================================
// SAVINGS GOALS
// ============================================================================

/**
 * Create a savings goal
 */
export function createSavingsGoal(
  userId: string,
  name: string,
  targetAmount: number,
  targetDate: Date,
  currentAmount = 0
): SavingsGoal {
  const state = getOrCreateState(userId);

  const goal: SavingsGoal = {
    id: `goal_${Date.now()}`,
    name,
    targetAmount,
    currentAmount,
    targetDate,
    monthlyContribution: 0,
  };

  // Calculate needed monthly contribution
  const monthsRemaining = Math.max(
    1,
    (targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)
  );
  goal.monthlyContribution = (targetAmount - currentAmount) / monthsRemaining;

  state.goals.push(goal);
  log.debug({ userId, goalId: goal.id, name }, 'Savings goal created');

  return goal;
}

/**
 * Update progress on a savings goal
 */
export function updateGoalProgress(
  userId: string,
  goalId: string,
  newAmount: number
): GoalProgress | null {
  const state = userFinancialState.get(userId);
  if (!state) return null;

  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return null;

  goal.currentAmount = newAmount;
  return calculateGoalProgress(goal);
}

/**
 * Calculate progress and projections for a goal
 */
function calculateGoalProgress(goal: SavingsGoal): GoalProgress {
  const percentComplete = (goal.currentAmount / goal.targetAmount) * 100;
  const remaining = goal.targetAmount - goal.currentAmount;

  const monthsRemaining = Math.max(
    0.1,
    (goal.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)
  );
  const monthlyNeeded = remaining / monthsRemaining;

  const onTrack = goal.monthlyContribution >= monthlyNeeded;

  // Project completion based on current contribution rate
  const monthsToComplete =
    goal.monthlyContribution > 0 ? remaining / goal.monthlyContribution : Infinity;

  const projectedCompletion = new Date();
  projectedCompletion.setMonth(projectedCompletion.getMonth() + Math.ceil(monthsToComplete));

  const surplus = goal.monthlyContribution - monthlyNeeded;

  let message: string;
  if (percentComplete >= 100) {
    message = `Congratulations! You've reached your ${goal.name} goal!`;
  } else if (onTrack) {
    message = `You're on track! At this rate, you'll reach your ${goal.name} goal ${Math.round(monthsToComplete)} months early.`;
  } else {
    const behindBy = Math.round(-surplus);
    message = `To reach your ${goal.name} goal on time, you'd need to save $${behindBy} more per month.`;
  }

  return {
    goal,
    percentComplete: Math.round(percentComplete * 10) / 10,
    onTrack,
    projectedCompletion,
    monthlyNeeded: Math.round(monthlyNeeded * 100) / 100,
    surplus: Math.round(surplus * 100) / 100,
    message,
  };
}

// ============================================================================
// CONTEXT BUILDER HELPERS
// ============================================================================

/**
 * Generate financial insight for context injection
 */
export async function generateFinancialInsight(userId: string): Promise<FinancialInsight | null> {
  // Check cash flow first
  const cashFlow = await predictCashFlow(userId, 7);
  if (cashFlow && cashFlow.warnings.length > 0) {
    const warning = cashFlow.warnings[0];
    return {
      type: 'cash_flow',
      severity: warning.severity,
      insight: warning.message,
      suggestion:
        warning.type === 'overdraft_risk'
          ? 'This might be a good time to review upcoming expenses.'
          : undefined,
      data: { cashFlow },
    };
  }

  // Check for anomalies
  const state = userFinancialState.get(userId);
  if (state?.anomalies && state.anomalies.length > 0) {
    const anomaly = state.anomalies[0];
    return {
      type: 'anomaly',
      severity: anomaly.percentAboveNormal > 100 ? 'warning' : 'info',
      insight: anomaly.description,
      suggestion:
        anomaly.type === 'category_increase'
          ? "Want to talk about what's driving this?"
          : undefined,
      data: { anomaly },
    };
  }

  // Check subscription creep
  if (state?.subscriptions && state.subscriptions.changePercent > 20) {
    return {
      type: 'subscription',
      severity: 'info',
      insight: `Your subscriptions have increased ${state.subscriptions.changePercent}% recently (now $${state.subscriptions.totalMonthly}/month).`,
      suggestion: 'Would you like to review your subscriptions?',
      data: { subscriptions: state.subscriptions },
    };
  }

  return null;
}

/**
 * Generate superhuman financial moment
 */
export function generateSuperhumanMoment(userId: string): string | null {
  const state = userFinancialState.get(userId);
  if (!state) return null;

  const moments: string[] = [];

  // Upcoming bill awareness
  const upcomingBills = state.bills.filter((b) => {
    const daysUntil = Math.ceil((b.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntil > 0 && daysUntil <= 3;
  });

  if (upcomingBills.length > 0) {
    const bill = upcomingBills[0];
    moments.push(
      `${bill.name} ($${bill.amount}) hits in ${Math.ceil((bill.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days - just wanted you to know.`
    );
  }

  // Spending pattern awareness
  if (state.anomalies.length > 0) {
    const anomaly = state.anomalies[0];
    if (anomaly.type === 'category_increase' && anomaly.category) {
      moments.push(
        `You've spent ${Math.round(anomaly.percentAboveNormal)}% more on ${anomaly.category} this month - stress spending?`
      );
    }
  }

  // Goal progress
  for (const goal of state.goals) {
    const progress = calculateGoalProgress(goal);
    if (progress.percentComplete >= 90 && progress.percentComplete < 100) {
      moments.push(
        `You're ${Math.round(progress.percentComplete)}% to your ${goal.name} goal - so close!`
      );
    }
  }

  return moments.length > 0 ? moments[Math.floor(Math.random() * moments.length)] : null;
}

// ============================================================================
// UTILITIES
// ============================================================================

function getOrCreateState(userId: string): UserFinancialState {
  let state = userFinancialState.get(userId);
  if (!state) {
    state = {
      userId,
      lastSync: new Date(0),
      bills: [],
      income: [],
      subscriptions: null,
      goals: [],
      baselineSpending: {},
      anomalies: [],
    };
    userFinancialState.set(userId, state);
  }
  return state;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

export default {
  detectBills,
  detectIncome,
  predictCashFlow,
  detectAnomalies,
  detectSubscriptionCreep,
  createSavingsGoal,
  updateGoalProgress,
  generateFinancialInsight,
  generateSuperhumanMoment,
};

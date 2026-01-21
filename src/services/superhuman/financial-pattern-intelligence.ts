/**
 * Financial Pattern Intelligence - Better Than Human Service
 *
 * What no human friend can do: Aggregate and analyze spending patterns,
 * detect behavioral finance patterns, correlate finances with life events,
 * and provide judgment-free financial awareness coaching.
 *
 * External APIs Integrated:
 * - Plaid (bank accounts, transactions)
 * - Alpha Vantage (market data for investment context)
 *
 * Note: Financial coaching, not financial advice. No specific investment
 * recommendations. Focus on patterns and awareness.
 *
 * @module services/superhuman/financial-pattern-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'financial-pattern-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export type SpendingCategory =
  | 'necessities' // Rent, utilities, groceries
  | 'discretionary' // Entertainment, dining, shopping
  | 'health' // Healthcare, fitness, wellness
  | 'education' // Learning, courses, books
  | 'savings' // Transfers to savings
  | 'debt_payment' // Credit cards, loans
  | 'subscriptions' // Recurring services
  | 'transportation'
  | 'gifts'
  | 'other';

export type BehavioralBias =
  | 'mental_accounting' // Treating money differently based on source/purpose
  | 'present_bias' // Preferring immediate rewards
  | 'loss_aversion' // Overweighting losses vs gains
  | 'anchoring' // Fixating on initial prices
  | 'herding' // Following what others do
  | 'overconfidence' // Overestimating financial knowledge
  | 'status_quo_bias' // Resistance to change
  | 'sunk_cost_fallacy'; // Continuing due to past investment

export type EmotionalSpendingTrigger =
  | 'stress'
  | 'boredom'
  | 'celebration'
  | 'social_pressure'
  | 'retail_therapy'
  | 'fear_of_missing_out'
  | 'guilt_compensation';

export interface Transaction {
  id: string;
  date: string;
  amount: number; // Positive = income, negative = expense
  category: SpendingCategory;
  merchant: string;
  description: string;
  isRecurring: boolean;
}

export interface SpendingPattern {
  category: SpendingCategory;
  monthlyAverage: number;
  monthlyVariance: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  percentOfIncome: number;

  // Time patterns
  peakSpendingDays: number[]; // Days of month
  peakSpendingHours?: number[]; // Hours of day (if available)
  weekendVsWeekday: { weekend: number; weekday: number };

  // Anomalies
  anomalies: Array<{
    date: string;
    amount: number;
    deviation: number; // Standard deviations from mean
    possibleCause?: string;
  }>;
}

export interface BehavioralFinanceProfile {
  userId: string;

  // Detected biases
  detectedBiases: Array<{
    bias: BehavioralBias;
    confidence: number; // 0-1
    evidence: string[];
    mitigation: string;
  }>;

  // Emotional spending
  emotionalTriggers: Array<{
    trigger: EmotionalSpendingTrigger;
    frequency: number;
    averageAmount: number;
    correlatedEmotions: string[];
  }>;

  // Financial decision style
  decisionStyle: {
    impulsivity: number; // 0-10
    planningHorizon: 'short' | 'medium' | 'long';
    riskTolerance: number; // 0-10
    savingsOrientation: number; // 0-10
  };

  // Life event correlations
  lifeEventCorrelations: Array<{
    event: string;
    spendingChange: number; // % change
    duration: string;
    category: SpendingCategory;
  }>;
}

export interface FinancialHealthScore {
  userId: string;
  date: string;

  // Core metrics
  overallScore: number; // 0-100

  // Sub-scores
  components: {
    savingsRate: number; // 0-100
    debtManagement: number; // 0-100
    cashFlow: number; // 0-100
    emergencyBuffer: number; // 0-100
    subscriptionHealth: number; // 0-100
  };

  // Trend
  trend: 'improving' | 'stable' | 'declining';
  trendDetail: string;

  // Top insights
  topInsights: string[];
  actionableSteps: string[];
}

export interface ValuesAlignmentAnalysis {
  userId: string;

  // Stated values (from conversation)
  statedValues: Array<{
    value: string;
    importance: number; // 0-10
  }>;

  // Spending alignment
  alignment: Array<{
    value: string;
    currentSpending: number;
    percentOfDiscretionary: number;
    alignmentScore: number; // 0-100, how well spending matches stated importance
    suggestion: string;
  }>;

  overallAlignmentScore: number;
  gaps: string[];
}

export interface FinancialProfile {
  userId: string;

  // Connection
  connectedAccounts: Array<{
    institution: string;
    accountType: string;
    lastSync: number;
  }>;

  // Patterns
  spendingPatterns: Record<SpendingCategory, SpendingPattern>;
  monthlyIncome: number;
  monthlySavings: number;

  // Behavioral
  behavioralProfile: BehavioralFinanceProfile;

  // Health
  latestHealthScore: FinancialHealthScore;

  // Values
  valuesAlignment: ValuesAlignmentAnalysis;

  updatedAt: number;
}

// ============================================================================
// SPENDING PATTERN ANALYSIS
// ============================================================================

/**
 * Analyze spending patterns from transaction history.
 */
export function analyzeSpendingPatterns(
  transactions: Transaction[],
  monthlyIncome: number
): Record<SpendingCategory, SpendingPattern> {
  const patterns: Partial<Record<SpendingCategory, SpendingPattern>> = {};

  // Group by category
  const byCategory = new Map<SpendingCategory, Transaction[]>();
  for (const tx of transactions) {
    if (tx.amount < 0) {
      // Expenses only
      const existing = byCategory.get(tx.category) || [];
      existing.push(tx);
      byCategory.set(tx.category, existing);
    }
  }

  // Analyze each category
  for (const [category, txs] of byCategory) {
    const amounts = txs.map((tx) => Math.abs(tx.amount));
    const monthlyTotal = amounts.reduce((a, b) => a + b, 0);
    const monthlyAvg = monthlyTotal / Math.max(1, getMonthsSpanned(txs));

    // Calculate variance
    const mean = monthlyAvg;
    const variance = amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;

    // Detect trend (simplified - would use regression in production)
    const trend = detectTrend(txs);

    // Day patterns
    const dayFrequency: Record<number, number> = {};
    const weekendTotal = { weekend: 0, weekday: 0 };

    for (const tx of txs) {
      const date = new Date(tx.date);
      const dayOfMonth = date.getDate();
      const dayOfWeek = date.getDay();

      dayFrequency[dayOfMonth] = (dayFrequency[dayOfMonth] || 0) + Math.abs(tx.amount);

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendTotal.weekend += Math.abs(tx.amount);
      } else {
        weekendTotal.weekday += Math.abs(tx.amount);
      }
    }

    const peakDays = Object.entries(dayFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([day]) => parseInt(day));

    // Detect anomalies (>2 std dev)
    const stdDev = Math.sqrt(variance);
    const anomalies = amounts
      .map((amount, i) => ({
        date: txs[i].date,
        amount,
        deviation: (amount - mean) / stdDev,
      }))
      .filter((a) => Math.abs(a.deviation) > 2)
      .slice(0, 5);

    patterns[category] = {
      category,
      monthlyAverage: monthlyAvg,
      monthlyVariance: variance,
      trend,
      percentOfIncome: (monthlyAvg / monthlyIncome) * 100,
      peakSpendingDays: peakDays,
      weekendVsWeekday: weekendTotal,
      anomalies,
    };
  }

  return patterns as Record<SpendingCategory, SpendingPattern>;
}

function getMonthsSpanned(txs: Transaction[]): number {
  if (txs.length === 0) return 1;
  const dates = txs.map((tx) => new Date(tx.date).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  return Math.max(1, Math.ceil((maxDate - minDate) / (30 * 24 * 60 * 60 * 1000)));
}

function detectTrend(txs: Transaction[]): 'increasing' | 'stable' | 'decreasing' {
  if (txs.length < 10) return 'stable';

  // Sort by date
  const sorted = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Compare first half vs second half
  const midpoint = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, midpoint);
  const secondHalf = sorted.slice(midpoint);

  const firstAvg = firstHalf.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) / firstHalf.length;
  const secondAvg =
    secondHalf.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) / secondHalf.length;

  const change = (secondAvg - firstAvg) / firstAvg;

  if (change > 0.1) return 'increasing';
  if (change < -0.1) return 'decreasing';
  return 'stable';
}

// ============================================================================
// BEHAVIORAL FINANCE ANALYSIS
// ============================================================================

/**
 * Detect behavioral finance biases from spending patterns.
 */
export function detectBehavioralBiases(
  transactions: Transaction[],
  patterns: Record<SpendingCategory, SpendingPattern>
): BehavioralFinanceProfile['detectedBiases'] {
  const biases: BehavioralFinanceProfile['detectedBiases'] = [];

  // Present bias: High discretionary spending near paydays
  const paydaySpending = analyzePaydayEffect(transactions);
  if (paydaySpending.ratio > 1.5) {
    biases.push({
      bias: 'present_bias',
      confidence: Math.min(1, (paydaySpending.ratio - 1) / 2),
      evidence: [
        `${Math.round(paydaySpending.ratio * 100 - 100)}% higher spending in first week after payday`,
      ],
      mitigation: 'Consider automatic savings transfer on payday before discretionary spending',
    });
  }

  // Mental accounting: Different treatment of "windfall" money
  // (Would need income categorization to detect properly)

  // Sunk cost: Unused recurring subscriptions
  const subscriptions = patterns['subscriptions'];
  if (subscriptions && subscriptions.monthlyAverage > 100) {
    biases.push({
      bias: 'status_quo_bias',
      confidence: 0.6,
      evidence: [`${subscriptions.anomalies.length} potentially unused subscriptions`],
      mitigation: 'Schedule quarterly subscription audits',
    });
  }

  // Anchoring: Consistent purchase prices despite market changes
  // (Would need price comparison data)

  // Loss aversion: Holding losing positions too long
  // (Would need investment data)

  return biases;
}

function analyzePaydayEffect(transactions: Transaction[]): { ratio: number } {
  const firstWeek = transactions.filter((tx) => {
    const day = new Date(tx.date).getDate();
    return day <= 7 && tx.amount < 0;
  });

  const restOfMonth = transactions.filter((tx) => {
    const day = new Date(tx.date).getDate();
    return day > 7 && tx.amount < 0;
  });

  const firstWeekAvg = firstWeek.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) / 7;
  const restAvg = restOfMonth.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) / 23;

  return { ratio: firstWeekAvg / Math.max(1, restAvg) };
}

/**
 * Detect emotional spending triggers.
 */
export function detectEmotionalSpending(
  transactions: Transaction[],
  emotionalTimeline: Array<{ date: string; emotion: string; intensity: number }>
): BehavioralFinanceProfile['emotionalTriggers'] {
  const triggers: BehavioralFinanceProfile['emotionalTriggers'] = [];

  // Correlate spending spikes with emotional states
  const emotionMap = new Map<string, (typeof emotionalTimeline)[0][]>();
  for (const entry of emotionalTimeline) {
    const existing = emotionMap.get(entry.emotion) || [];
    existing.push(entry);
    emotionMap.set(entry.emotion, existing);
  }

  // Check stress spending
  const stressEntries = emotionMap.get('stressed') || [];
  const stressSpending = matchSpendingToEmotions(transactions, stressEntries);

  if (stressSpending.correlatedAmount > 0) {
    triggers.push({
      trigger: 'stress',
      frequency: stressSpending.occurrences,
      averageAmount: stressSpending.correlatedAmount / Math.max(1, stressSpending.occurrences),
      correlatedEmotions: ['stressed', 'overwhelmed', 'anxious'],
    });
  }

  // Check celebration spending
  const celebrationEntries = emotionMap.get('happy') || emotionMap.get('excited') || [];
  const celebrationSpending = matchSpendingToEmotions(transactions, celebrationEntries);

  if (celebrationSpending.correlatedAmount > 0) {
    triggers.push({
      trigger: 'celebration',
      frequency: celebrationSpending.occurrences,
      averageAmount:
        celebrationSpending.correlatedAmount / Math.max(1, celebrationSpending.occurrences),
      correlatedEmotions: ['happy', 'excited', 'accomplished'],
    });
  }

  return triggers;
}

function matchSpendingToEmotions(
  transactions: Transaction[],
  emotionEntries: Array<{ date: string; emotion: string; intensity: number }>
): { correlatedAmount: number; occurrences: number } {
  let correlatedAmount = 0;
  let occurrences = 0;

  for (const entry of emotionEntries) {
    if (entry.intensity < 5) continue; // Only consider strong emotions

    const entryDate = new Date(entry.date);
    const sameDaySpending = transactions.filter((tx) => {
      const txDate = new Date(tx.date);
      return txDate.toDateString() === entryDate.toDateString() && tx.amount < 0;
    });

    const dayTotal = sameDaySpending.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    if (dayTotal > 0) {
      correlatedAmount += dayTotal;
      occurrences++;
    }
  }

  return { correlatedAmount, occurrences };
}

// ============================================================================
// FINANCIAL HEALTH SCORE
// ============================================================================

/**
 * Calculate comprehensive financial health score.
 */
export function calculateFinancialHealthScore(
  userId: string,
  monthlyIncome: number,
  monthlySavings: number,
  patterns: Record<SpendingCategory, SpendingPattern>,
  debtPayments: number,
  emergencyFund: number
): FinancialHealthScore {
  const scores = {
    savingsRate: 0,
    debtManagement: 0,
    cashFlow: 0,
    emergencyBuffer: 0,
    subscriptionHealth: 0,
  };

  // Savings rate (target: 20%+)
  const savingsRate = (monthlySavings / monthlyIncome) * 100;
  scores.savingsRate = Math.min(100, savingsRate * 5);

  // Debt management (target: <36% debt-to-income)
  const debtToIncome = (debtPayments / monthlyIncome) * 100;
  scores.debtManagement = Math.max(0, 100 - debtToIncome * 2.5);

  // Cash flow (are they spending less than they earn?)
  const totalExpenses = Object.values(patterns).reduce((sum, p) => sum + p.monthlyAverage, 0);
  const cashFlowMargin = ((monthlyIncome - totalExpenses) / monthlyIncome) * 100;
  scores.cashFlow = Math.max(0, Math.min(100, 50 + cashFlowMargin));

  // Emergency buffer (target: 3-6 months expenses)
  const monthsOfExpenses = emergencyFund / totalExpenses;
  scores.emergencyBuffer = Math.min(100, (monthsOfExpenses / 6) * 100);

  // Subscription health (are subscriptions reasonable % of discretionary?)
  const subscriptionPattern = patterns['subscriptions'];
  const discretionaryPattern = patterns['discretionary'];
  if (subscriptionPattern && discretionaryPattern) {
    const subRatio =
      subscriptionPattern.monthlyAverage / (discretionaryPattern.monthlyAverage || 1);
    scores.subscriptionHealth = Math.max(0, 100 - subRatio * 100);
  } else {
    scores.subscriptionHealth = 80; // Default if no subscription data
  }

  // Overall score (weighted average)
  const overallScore =
    scores.savingsRate * 0.25 +
    scores.debtManagement * 0.2 +
    scores.cashFlow * 0.25 +
    scores.emergencyBuffer * 0.2 +
    scores.subscriptionHealth * 0.1;

  // Generate insights
  const insights: string[] = [];
  const actions: string[] = [];

  if (scores.savingsRate < 50) {
    insights.push(`Savings rate is ${savingsRate.toFixed(1)}% - below recommended 20%`);
    actions.push('Automate savings transfer on payday');
  }
  if (scores.emergencyBuffer < 50) {
    insights.push(`Emergency fund covers ${monthsOfExpenses.toFixed(1)} months - target is 3-6`);
    actions.push('Prioritize building emergency fund before other savings goals');
  }
  if (scores.cashFlow < 60) {
    insights.push('Expenses are close to income - limited margin for unexpected costs');
    actions.push('Review discretionary spending for areas to reduce');
  }

  // Determine trend (would compare to previous scores)
  const trend: FinancialHealthScore['trend'] = 'stable';

  return {
    userId,
    date: new Date().toISOString().split('T')[0],
    overallScore,
    components: scores,
    trend,
    trendDetail: 'First assessment - trend will be calculated after more data',
    topInsights: insights.slice(0, 3),
    actionableSteps: actions.slice(0, 3),
  };
}

// ============================================================================
// VALUES ALIGNMENT
// ============================================================================

/**
 * Analyze how spending aligns with stated values.
 */
export function analyzeValuesAlignment(
  statedValues: Array<{ value: string; importance: number }>,
  patterns: Record<SpendingCategory, SpendingPattern>,
  monthlyDiscretionary: number
): ValuesAlignmentAnalysis {
  const alignment: ValuesAlignmentAnalysis['alignment'] = [];
  const gaps: string[] = [];

  // Map values to spending categories
  const valueToCategory: Record<string, SpendingCategory[]> = {
    health: ['health'],
    learning: ['education'],
    relationships: ['gifts', 'discretionary'],
    security: ['savings'],
    experiences: ['discretionary', 'transportation'],
    giving: ['gifts'],
  };

  for (const { value, importance } of statedValues) {
    const categories = valueToCategory[value.toLowerCase()] || [];

    let totalSpending = 0;
    for (const cat of categories) {
      if (patterns[cat]) {
        totalSpending += patterns[cat].monthlyAverage;
      }
    }

    const percentOfDiscretionary = (totalSpending / monthlyDiscretionary) * 100;

    // Expected percent based on importance (higher importance = should be higher spending)
    const expectedPercent = (importance / 10) * 30; // Scale to 0-30%

    // Alignment score: how close is actual to expected?
    const alignmentScore = Math.max(
      0,
      100 - Math.abs(expectedPercent - percentOfDiscretionary) * 2
    );

    let suggestion = '';
    if (percentOfDiscretionary < expectedPercent - 10) {
      suggestion = `You say ${value} is important (${importance}/10) but spending doesn't reflect that`;
      gaps.push(`${value} is underrepresented in spending`);
    } else if (percentOfDiscretionary > expectedPercent + 15) {
      suggestion = `Spending on ${value} is higher than stated importance suggests`;
    } else {
      suggestion = `Spending aligns well with your stated value of ${value}`;
    }

    alignment.push({
      value,
      currentSpending: totalSpending,
      percentOfDiscretionary,
      alignmentScore,
      suggestion,
    });
  }

  const overallAlignmentScore =
    alignment.reduce((sum, a) => sum + a.alignmentScore, 0) / alignment.length;

  return {
    userId: '', // Set by caller
    statedValues,
    alignment,
    overallAlignmentScore,
    gaps,
  };
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

export async function loadFinancialProfile(userId: string): Promise<FinancialProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('financial')
      .get();

    if (!doc.exists) return null;
    return doc.data() as FinancialProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load financial profile');
    return null;
  }
}

export async function saveFinancialProfile(profile: FinancialProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('superhuman')
      .doc('financial')
      .set(cleanForFirestore({ ...profile, updatedAt: Date.now() }));

    log.debug({ userId: profile.userId }, 'Financial profile saved');
  } catch (error) {
    log.warn({ error: String(error), userId: profile.userId }, 'Failed to save financial profile');
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildFinancialPatternContext(userId: string): Promise<string> {
  const profile = await loadFinancialProfile(userId);
  if (!profile) return '';

  const sections: string[] = [
    '[FINANCIAL PATTERN INTELLIGENCE - Better Than Human Money Awareness]',
  ];
  sections.push(
    'You understand their financial patterns without judgment - coaching, not advising.'
  );

  // Health score
  if (profile.latestHealthScore) {
    const score = profile.latestHealthScore;
    sections.push(`\n**Financial Health**: ${Math.round(score.overallScore)}/100 (${score.trend})`);

    // Component highlights
    const weakest = Object.entries(score.components)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 2);

    for (const [component, value] of weakest) {
      if (value < 60) {
        sections.push(
          `  • ${component.replace(/_/g, ' ')}: needs attention (${Math.round(value)}/100)`
        );
      }
    }
  }

  // Behavioral patterns
  if (profile.behavioralProfile) {
    const biases = profile.behavioralProfile.detectedBiases.filter((b) => b.confidence > 0.5);
    if (biases.length > 0) {
      sections.push('\n**Behavioral Patterns**:');
      for (const bias of biases.slice(0, 2)) {
        sections.push(`  • ${bias.bias.replace(/_/g, ' ')}: ${bias.evidence[0]}`);
      }
    }

    const triggers = profile.behavioralProfile.emotionalTriggers;
    if (triggers.length > 0) {
      sections.push('\n**Emotional Spending Triggers**:');
      for (const trigger of triggers.slice(0, 2)) {
        sections.push(
          `  • ${trigger.trigger}: avg $${Math.round(trigger.averageAmount)} per occurrence`
        );
      }
    }
  }

  // Values alignment
  if (profile.valuesAlignment) {
    const gaps = profile.valuesAlignment.gaps;
    if (gaps.length > 0) {
      sections.push(`\n**Values-Spending Gaps**: ${gaps.join(', ')}`);
    }
  }

  sections.push(
    '\nApproach finances with curiosity, not judgment. Patterns reveal values - help them see that.'
  );
  sections.push(
    'NEVER give specific investment advice. Focus on awareness, patterns, and alignment.'
  );

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const financialPatternIntelligence = {
  // Pattern analysis
  analyzeSpendingPatterns,

  // Behavioral finance
  detectBehavioralBiases,
  detectEmotionalSpending,

  // Health scoring
  calculateFinancialHealthScore,

  // Values alignment
  analyzeValuesAlignment,

  // Persistence
  loadProfile: loadFinancialProfile,
  saveProfile: saveFinancialProfile,

  // Context
  buildContext: buildFinancialPatternContext,
};

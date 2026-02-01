/**
 * Compound Effect Modeling - Long-Term Habit Impact Projections
 *
 * Models the compound effects of habits, behaviors, and decisions over time.
 * Inspired by "The Compound Effect" by Darren Hardy.
 *
 * Key insight: Small, consistent actions create exponential results over time.
 * This service quantifies and visualizes that for users.
 *
 * @module services/superhuman/compound-effects
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'CompoundEffects' });

// ============================================================================
// Types
// ============================================================================

export interface HabitCompoundModel {
  habitId: string;
  habitName: string;
  category: HabitCategory;

  // Current state
  currentConsistency: number; // 0-100
  currentStreak: number;
  totalDaysTracked: number;

  // Compound factors
  dailyEffect: number; // Small daily impact
  compoundRate: number; // How fast effects multiply
  decayRate: number; // How fast effects decay without practice

  // Projections
  projections: TimeProjection[];

  // Comparisons
  alternativeScenarios: AlternativeScenario[];

  // Dependencies
  synergies: Synergy[];
  conflicts: Conflict[];
}

export type HabitCategory =
  | 'health'
  | 'fitness'
  | 'nutrition'
  | 'sleep'
  | 'mindfulness'
  | 'learning'
  | 'creativity'
  | 'relationships'
  | 'finance'
  | 'productivity'
  | 'environment';

export interface TimeProjection {
  timeframe: string; // "1 month", "6 months", "1 year", etc.
  days: number;

  // Projected metrics
  projectedValue: number; // Normalized 0-100 scale
  confidenceInterval: { low: number; high: number };

  // Concrete outcomes
  outcomes: string[];

  // Milestones reachable
  milestones: string[];
}

export interface AlternativeScenario {
  name: string;
  consistencyChange: number; // e.g., +20 means 20% more consistent
  description: string;
  projectedDifference: {
    oneMonth: number;
    sixMonths: number;
    oneYear: number;
    fiveYears: number;
  };
  keyDifferences: string[];
}

export interface Synergy {
  habitId: string;
  habitName: string;
  multiplierEffect: number; // e.g., 1.3 means 30% boost when combined
  explanation: string;
}

export interface Conflict {
  habitId: string;
  habitName: string;
  conflictType: 'time' | 'energy' | 'cognitive' | 'motivation';
  impact: number; // Negative impact when both attempted
  resolution?: string;
}

export interface FinancialCompoundModel {
  type: 'saving' | 'investing' | 'debt_payoff' | 'income_growth';
  currentAmount: number;
  monthlyContribution: number;
  annualRate: number; // Growth or interest rate

  projections: FinancialProjection[];
  alternativeScenarios: FinancialScenario[];
}

export interface FinancialProjection {
  year: number;
  projectedValue: number;
  totalContributed: number;
  compoundGains: number;
  milestone?: string;
}

export interface FinancialScenario {
  name: string;
  change: string;
  impact: number; // Difference at year 10
}

// ============================================================================
// Compound Effect Formulas
// ============================================================================

/**
 * Calculate compound effect over time
 * Based on exponential growth with decay factor for inconsistency
 */
function calculateCompoundEffect(
  dailyEffect: number,
  days: number,
  consistency: number, // 0-100
  compoundRate: number = 0.001, // Daily compound rate
  decayRate: number = 0.0005 // Daily decay rate
): number {
  const effectiveRate = compoundRate * (consistency / 100);
  const effectiveDecay = decayRate * ((100 - consistency) / 100);
  const netRate = effectiveRate - effectiveDecay;

  // Compound formula: P * e^(rt)
  const baseEffect = dailyEffect * days;
  const compoundMultiplier = Math.exp(netRate * days);

  return baseEffect * compoundMultiplier;
}

/**
 * Get habit-specific parameters
 */
function getHabitParameters(category: HabitCategory): {
  dailyEffect: number;
  compoundRate: number;
  decayRate: number;
  outcomes: Record<string, string[]>;
} {
  const params: Record<
    HabitCategory,
    {
      dailyEffect: number;
      compoundRate: number;
      decayRate: number;
      outcomes: Record<string, string[]>;
    }
  > = {
    fitness: {
      dailyEffect: 0.5,
      compoundRate: 0.0015,
      decayRate: 0.001,
      outcomes: {
        '30': ['Noticeable energy increase', 'Better mood regulation', 'Initial strength gains'],
        '90': [
          'Visible body composition changes',
          'Significantly improved stamina',
          'Better sleep quality',
        ],
        '180': [
          'Substantial fitness transformation',
          'Reduced resting heart rate',
          'Higher baseline energy',
        ],
        '365': [
          'Peak physical condition achievable',
          'Chronic disease risk reduced',
          'Athletic performance unlocked',
        ],
        '1825': [
          'Optimal physical health for your age',
          'Decades added to healthspan',
          'Fitness as identity',
        ],
      },
    },
    nutrition: {
      dailyEffect: 0.4,
      compoundRate: 0.001,
      decayRate: 0.0008,
      outcomes: {
        '30': ['Reduced inflammation', 'Stable blood sugar', 'Clearer thinking'],
        '90': ['Weight stabilization', 'Improved gut health', 'Better skin'],
        '180': ['Optimized cholesterol', 'Reduced cravings', 'Sustained energy'],
        '365': ['Reversed metabolic markers', 'Strong immune system', 'Intuitive eating'],
        '1825': ['Minimized disease risk', 'Optimal biomarkers', 'Food as fuel mastery'],
      },
    },
    sleep: {
      dailyEffect: 0.6,
      compoundRate: 0.002,
      decayRate: 0.0015,
      outcomes: {
        '30': ['Improved focus', 'Better emotional regulation', 'Increased willpower'],
        '90': ['Memory consolidation improved', 'Stress resilience', 'Optimized hormones'],
        '180': ['Cognitive enhancement', 'Reduced disease markers', 'Peak performance baseline'],
        '365': ['Brain health protected', 'Optimal recovery', 'Sleep as superpower'],
        '1825': ['Cognitive aging slowed', "Alzheimer's risk reduced", 'Lifetime mental clarity'],
      },
    },
    mindfulness: {
      dailyEffect: 0.3,
      compoundRate: 0.0012,
      decayRate: 0.0006,
      outcomes: {
        '30': ['Reduced anxiety', 'Better response to stress', 'Increased awareness'],
        '90': [
          'Changed relationship with thoughts',
          'Improved focus',
          'Emotional intelligence boost',
        ],
        '180': ['Lasting neural changes', 'Default calm state', 'Compassion increase'],
        '365': ['Transformed stress response', 'Deep self-knowledge', 'Presence as default'],
        '1825': ['Wisdom cultivation', 'Emotional mastery', 'Profound inner peace'],
      },
    },
    learning: {
      dailyEffect: 0.4,
      compoundRate: 0.0018,
      decayRate: 0.0004,
      outcomes: {
        '30': ['New knowledge foundation', 'Expanded vocabulary', 'Novel connections'],
        '90': ['Competence in new area', 'Improved critical thinking', 'Better conversations'],
        '180': ['Expertise emerging', 'Cross-domain insights', 'Teaching ability'],
        '365': ['Expert-level knowledge', 'Unique perspective', 'Career opportunities'],
        '1825': ['Polymath capabilities', 'Thought leadership', 'Legacy of wisdom'],
      },
    },
    finance: {
      dailyEffect: 0.3,
      compoundRate: 0.002,
      decayRate: 0.0003,
      outcomes: {
        '30': ['Budget awareness', 'Spending patterns visible', 'Emergency fund started'],
        '90': ['Financial habits formed', 'Debt reduction visible', 'Savings growing'],
        '180': ['Financial security increasing', 'Investment knowledge', 'Options expanding'],
        '365': ['Significant net worth growth', 'Financial confidence', 'Goal funding possible'],
        '1825': ['Financial independence path', 'Wealth building momentum', 'Generational impact'],
      },
    },
    productivity: {
      dailyEffect: 0.35,
      compoundRate: 0.0014,
      decayRate: 0.001,
      outcomes: {
        '30': ['Better time awareness', 'Reduced procrastination', 'Daily wins'],
        '90': ['Systems established', 'Consistent output', 'Project completion'],
        '180': ['Productivity as identity', 'Major goals achieved', 'Career advancement'],
        '365': ['Elite performance level', 'Significant accomplishments', 'Industry recognition'],
        '1825': ['Exceptional body of work', 'Multiple major achievements', 'Legacy building'],
      },
    },
    relationships: {
      dailyEffect: 0.25,
      compoundRate: 0.001,
      decayRate: 0.0012,
      outcomes: {
        '30': ['Improved communication', 'Increased connection moments', 'Trust building'],
        '90': ['Deeper bonds', 'Better conflict resolution', 'Expanded network'],
        '180': ['Strong inner circle', 'Support system solid', 'Emotional intimacy'],
        '365': ['Transformative relationships', 'Community of growth', 'Love deepened'],
        '1825': ['Lifelong friendships', 'Rich social life', 'Legacy relationships'],
      },
    },
    health: {
      dailyEffect: 0.45,
      compoundRate: 0.0013,
      decayRate: 0.001,
      outcomes: {
        '30': ['Baseline health established', 'Awareness increased', 'Small improvements'],
        '90': ['Measurable health gains', 'Energy normalized', 'Vitality returning'],
        '180': ['Health transformation', 'Optimal baseline', 'Reduced sick days'],
        '365': ['Peak health achievable', 'Disease prevention active', 'Health as wealth'],
        '1825': ['Extended healthspan', 'Biological age reduction', 'Vibrant aging'],
      },
    },
    creativity: {
      dailyEffect: 0.35,
      compoundRate: 0.0016,
      decayRate: 0.0005,
      outcomes: {
        '30': ['Creative confidence building', 'New ideas flowing', 'Skill development'],
        '90': ['Creative voice emerging', 'Portfolio growing', 'Novel combinations'],
        '180': ['Distinctive style', 'Creative problem-solving', 'Artistic growth'],
        '365': ['Creative excellence', 'Recognition possible', 'Mastery developing'],
        '1825': ['Artistic mastery', 'Creative legacy', 'Unique contribution'],
      },
    },
    environment: {
      dailyEffect: 0.2,
      compoundRate: 0.0008,
      decayRate: 0.0006,
      outcomes: {
        '30': ['Cleaner spaces', 'Reduced clutter', 'Better organization'],
        '90': ['Optimized environment', 'Systems working', 'Stress reduction'],
        '180': ['Sanctuary created', 'Productivity boost from space', 'Calm default'],
        '365': ['Perfect environment', 'Guests impressed', 'Peace at home'],
        '1825': ['Dream living space', 'Environment supports all goals', 'Lifestyle optimized'],
      },
    },
  };

  return params[category] || params.health;
}

// ============================================================================
// Model Generation
// ============================================================================

/**
 * Generate a compound effect model for a habit
 */
export function generateHabitCompoundModel(habit: {
  id: string;
  name: string;
  category: HabitCategory;
  consistency: number;
  streak: number;
  totalDays?: number;
}): HabitCompoundModel {
  const params = getHabitParameters(habit.category);
  const timeframes = [
    { label: '1 month', days: 30 },
    { label: '3 months', days: 90 },
    { label: '6 months', days: 180 },
    { label: '1 year', days: 365 },
    { label: '5 years', days: 1825 },
  ];

  const projections: TimeProjection[] = timeframes.map((tf) => {
    const projectedValue = calculateCompoundEffect(
      params.dailyEffect,
      tf.days,
      habit.consistency,
      params.compoundRate,
      params.decayRate
    );

    // Normalize to 0-100 scale with diminishing returns
    const normalizedValue = Math.min(100, Math.log10(projectedValue + 1) * 30);

    // Confidence interval widens with time
    const uncertaintyFactor = 0.1 + tf.days / 3650; // 10% to 60%
    const low = normalizedValue * (1 - uncertaintyFactor);
    const high = Math.min(100, normalizedValue * (1 + uncertaintyFactor));

    const outcomes = params.outcomes[String(tf.days)] || ['Continued progress'];

    return {
      timeframe: tf.label,
      days: tf.days,
      projectedValue: Math.round(normalizedValue),
      confidenceInterval: { low: Math.round(low), high: Math.round(high) },
      outcomes: outcomes.slice(0, 3),
      milestones: outcomes.slice(3),
    };
  });

  // Generate alternative scenarios
  const alternativeScenarios: AlternativeScenario[] = [
    {
      name: 'Perfect Consistency',
      consistencyChange: 100 - habit.consistency,
      description: 'What if you were 100% consistent?',
      projectedDifference: {
        oneMonth: calculateDifference(params, 30, habit.consistency, 100),
        sixMonths: calculateDifference(params, 180, habit.consistency, 100),
        oneYear: calculateDifference(params, 365, habit.consistency, 100),
        fiveYears: calculateDifference(params, 1825, habit.consistency, 100),
      },
      keyDifferences: [
        'Maximum compound benefits realized',
        'No decay from missed days',
        'Habit becomes automatic',
      ],
    },
    {
      name: 'Slight Improvement (+10%)',
      consistencyChange: 10,
      description: 'What if you improved consistency by just 10%?',
      projectedDifference: {
        oneMonth: calculateDifference(params, 30, habit.consistency, habit.consistency + 10),
        sixMonths: calculateDifference(params, 180, habit.consistency, habit.consistency + 10),
        oneYear: calculateDifference(params, 365, habit.consistency, habit.consistency + 10),
        fiveYears: calculateDifference(params, 1825, habit.consistency, habit.consistency + 10),
      },
      keyDifferences: [
        'Achievable improvement target',
        'Noticeable cumulative effect',
        'Builds momentum for more',
      ],
    },
    {
      name: 'Current Path Decline (-20%)',
      consistencyChange: -20,
      description: 'What if consistency drops 20%?',
      projectedDifference: {
        oneMonth: calculateDifference(
          params,
          30,
          habit.consistency,
          Math.max(0, habit.consistency - 20)
        ),
        sixMonths: calculateDifference(
          params,
          180,
          habit.consistency,
          Math.max(0, habit.consistency - 20)
        ),
        oneYear: calculateDifference(
          params,
          365,
          habit.consistency,
          Math.max(0, habit.consistency - 20)
        ),
        fiveYears: calculateDifference(
          params,
          1825,
          habit.consistency,
          Math.max(0, habit.consistency - 20)
        ),
      },
      keyDifferences: [
        'Significant loss of momentum',
        'Decay overtakes gains',
        'Previous progress at risk',
      ],
    },
  ];

  return {
    habitId: habit.id,
    habitName: habit.name,
    category: habit.category,
    currentConsistency: habit.consistency,
    currentStreak: habit.streak,
    totalDaysTracked: habit.totalDays || 0,
    dailyEffect: params.dailyEffect,
    compoundRate: params.compoundRate,
    decayRate: params.decayRate,
    projections,
    alternativeScenarios,
    synergies: getHabitSynergies(habit.category),
    conflicts: getHabitConflicts(habit.category),
  };
}

/**
 * Calculate difference between two consistency levels
 */
function calculateDifference(
  params: ReturnType<typeof getHabitParameters>,
  days: number,
  currentConsistency: number,
  newConsistency: number
): number {
  const current = calculateCompoundEffect(
    params.dailyEffect,
    days,
    currentConsistency,
    params.compoundRate,
    params.decayRate
  );
  const newValue = calculateCompoundEffect(
    params.dailyEffect,
    days,
    newConsistency,
    params.compoundRate,
    params.decayRate
  );
  const percentDiff = ((newValue - current) / current) * 100;
  return Math.round(percentDiff);
}

/**
 * Get synergies for a habit category
 */
function getHabitSynergies(category: HabitCategory): Synergy[] {
  const synergies: Record<HabitCategory, Synergy[]> = {
    fitness: [
      {
        habitId: 'sleep',
        habitName: 'Sleep',
        multiplierEffect: 1.4,
        explanation: 'Recovery happens during sleep',
      },
      {
        habitId: 'nutrition',
        habitName: 'Nutrition',
        multiplierEffect: 1.3,
        explanation: 'Fuel for workouts',
      },
    ],
    nutrition: [
      {
        habitId: 'mindfulness',
        habitName: 'Mindfulness',
        multiplierEffect: 1.2,
        explanation: 'Mindful eating',
      },
    ],
    sleep: [
      {
        habitId: 'fitness',
        habitName: 'Exercise',
        multiplierEffect: 1.3,
        explanation: 'Exercise improves sleep',
      },
    ],
    mindfulness: [
      {
        habitId: 'sleep',
        habitName: 'Sleep',
        multiplierEffect: 1.2,
        explanation: 'Calm mind sleeps better',
      },
    ],
    learning: [
      {
        habitId: 'sleep',
        habitName: 'Sleep',
        multiplierEffect: 1.4,
        explanation: 'Memory consolidation',
      },
    ],
    finance: [
      {
        habitId: 'productivity',
        habitName: 'Productivity',
        multiplierEffect: 1.2,
        explanation: 'Earn more, save more',
      },
    ],
    productivity: [
      {
        habitId: 'sleep',
        habitName: 'Sleep',
        multiplierEffect: 1.3,
        explanation: 'Rest enables focus',
      },
    ],
    relationships: [
      {
        habitId: 'mindfulness',
        habitName: 'Mindfulness',
        multiplierEffect: 1.3,
        explanation: 'Presence in conversations',
      },
    ],
    health: [
      {
        habitId: 'fitness',
        habitName: 'Exercise',
        multiplierEffect: 1.4,
        explanation: 'Foundation of health',
      },
      {
        habitId: 'nutrition',
        habitName: 'Nutrition',
        multiplierEffect: 1.3,
        explanation: 'You are what you eat',
      },
    ],
    creativity: [
      {
        habitId: 'learning',
        habitName: 'Learning',
        multiplierEffect: 1.3,
        explanation: 'Ideas combine',
      },
    ],
    environment: [
      {
        habitId: 'mindfulness',
        habitName: 'Mindfulness',
        multiplierEffect: 1.1,
        explanation: 'Space reflects mind',
      },
    ],
  };

  return synergies[category] || [];
}

/**
 * Get conflicts for a habit category
 */
function getHabitConflicts(category: HabitCategory): Conflict[] {
  const conflicts: Record<HabitCategory, Conflict[]> = {
    fitness: [
      {
        habitId: 'work_overtime',
        habitName: 'Working overtime',
        conflictType: 'time',
        impact: -0.3,
        resolution: 'Schedule workouts like meetings',
      },
    ],
    sleep: [
      {
        habitId: 'late_night_work',
        habitName: 'Late night work',
        conflictType: 'time',
        impact: -0.5,
        resolution: 'Set a hard stop time',
      },
    ],
    learning: [],
    nutrition: [],
    mindfulness: [],
    finance: [],
    productivity: [],
    relationships: [],
    health: [],
    creativity: [],
    environment: [],
  };

  return conflicts[category] || [];
}

/**
 * Generate financial compound model
 */
export function generateFinancialCompoundModel(
  type: FinancialCompoundModel['type'],
  currentAmount: number,
  monthlyContribution: number,
  annualRate: number
): FinancialCompoundModel {
  const projections: FinancialProjection[] = [];

  // Project for years 1, 5, 10, 20, 30
  const years = [1, 5, 10, 20, 30];
  const monthlyRate = annualRate / 12;

  for (const year of years) {
    const months = year * 12;
    // Future value formula with regular contributions
    // FV = P*(1+r)^n + PMT*((1+r)^n - 1)/r
    const growthFactor = Math.pow(1 + monthlyRate, months);
    const contributionGrowth =
      monthlyRate > 0
        ? monthlyContribution * ((growthFactor - 1) / monthlyRate)
        : monthlyContribution * months;
    const projectedValue = currentAmount * growthFactor + contributionGrowth;
    const totalContributed = currentAmount + monthlyContribution * months;
    const compoundGains = projectedValue - totalContributed;

    let milestone: string | undefined;
    if (
      projectedValue >= 1000000 &&
      (projections.length === 0 || projections[projections.length - 1].projectedValue < 1000000)
    ) {
      milestone = 'Millionaire status';
    } else if (
      projectedValue >= 100000 &&
      (projections.length === 0 || projections[projections.length - 1].projectedValue < 100000)
    ) {
      milestone = 'Six figures milestone';
    }

    projections.push({
      year,
      projectedValue: Math.round(projectedValue),
      totalContributed: Math.round(totalContributed),
      compoundGains: Math.round(compoundGains),
      milestone,
    });
  }

  // Generate alternative scenarios
  const alternativeScenarios: FinancialScenario[] = [
    {
      name: 'Double monthly contribution',
      change: `$${monthlyContribution} → $${monthlyContribution * 2}/month`,
      impact:
        calculateFinancialDifference(currentAmount, monthlyContribution * 2, annualRate, 10) -
        (projections.find((p) => p.year === 10)?.projectedValue || 0),
    },
    {
      name: 'Start 5 years earlier equivalent',
      change: 'Time value of starting now',
      impact: Math.round(currentAmount * Math.pow(1 + annualRate, 5) - currentAmount),
    },
    {
      name: '1% higher return',
      change: `${(annualRate * 100).toFixed(1)}% → ${((annualRate + 0.01) * 100).toFixed(1)}% annual`,
      impact:
        calculateFinancialDifference(currentAmount, monthlyContribution, annualRate + 0.01, 10) -
        (projections.find((p) => p.year === 10)?.projectedValue || 0),
    },
  ];

  return {
    type,
    currentAmount,
    monthlyContribution,
    annualRate,
    projections,
    alternativeScenarios,
  };
}

/**
 * Calculate financial value at year N
 */
function calculateFinancialDifference(
  principal: number,
  monthlyContrib: number,
  annualRate: number,
  years: number
): number {
  const monthlyRate = annualRate / 12;
  const months = years * 12;
  const growthFactor = Math.pow(1 + monthlyRate, months);
  const contributionGrowth =
    monthlyRate > 0 ? monthlyContrib * ((growthFactor - 1) / monthlyRate) : monthlyContrib * months;
  return Math.round(principal * growthFactor + contributionGrowth);
}

/**
 * Get all habit compound models for a user
 */
export async function getUserCompoundModels(userId: string): Promise<HabitCompoundModel[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db.collection('bogle_users').doc(userId).collection('habits').get();

    return snapshot.docs.map((doc) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const h = doc.data() as any;
      return generateHabitCompoundModel({
        id: h.id || doc.id,
        name: h.name || 'Habit',
        category: h.category || 'health',
        consistency: h.consistency || 50,
        streak: h.streak || 0,
        totalDays: h.totalDays,
      });
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user compound models');
    return [];
  }
}

// ============================================================================
// Exports
// ============================================================================

export const compoundEffects = {
  generateHabitModel: generateHabitCompoundModel,
  generateFinancialModel: generateFinancialCompoundModel,
  getUserModels: getUserCompoundModels,
};

export default compoundEffects;

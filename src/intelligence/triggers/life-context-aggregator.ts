/**
 * Life Context Aggregator
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * Aggregates data from all domain collectors into a unified life context
 * snapshot. Computes stress indicators, overall load scores, and detects
 * cross-domain patterns.
 *
 * This is NOT reactive to words, but to LIFE CONTEXT.
 *
 * Example pattern:
 * - Maya sees poor sleep + Alex sees packed calendar + Peter sees market anxiety
 *   → Synthesis: "You're carrying a lot right now"
 *
 * @module life-context-aggregator
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  LifeContextSnapshot,
  DomainStressIndicator,
  SleepDomainData,
  CalendarDomainData,
  FinanceDomainData,
  GoalsDomainData,
  RelationshipDomainData,
  HabitsDomainData,
  AggregatorConfig,
} from './life-context-snapshot.js';
import { collectAllDomainData } from './domain-data-collectors.js';

const log = createLogger({ module: 'life-context-aggregator' });

// ============================================================================
// STRESS INDICATOR COMPUTATION
// ============================================================================

/**
 * Compute stress level for sleep domain
 */
function computeSleepStress(data: SleepDomainData): DomainStressIndicator | null {
  if (data.confidence < 0.3) return null;

  let stressLevel = 0;
  const reasons: string[] = [];

  // Poor sleep hours
  if (data.averageSleepHours < 5) {
    stressLevel += 0.4;
    reasons.push('severe sleep deficit');
  } else if (data.averageSleepHours < 6) {
    stressLevel += 0.25;
    reasons.push('inadequate sleep');
  } else if (data.averageSleepHours < 7) {
    stressLevel += 0.1;
    reasons.push('slightly low sleep');
  }

  // Multiple poor nights
  if (data.poorSleepNights > 3) {
    stressLevel += 0.2;
    reasons.push('multiple poor nights');
  }

  // Declining trend
  if (data.trend === 'declining') {
    stressLevel += 0.15;
    reasons.push('sleep declining');
  }

  // Mentioned fatigue
  if (data.mentionedFatigue) {
    stressLevel += 0.1;
    reasons.push('expressed tiredness');
  }

  return {
    domain: 'sleep',
    stressLevel: Math.min(1, stressLevel),
    reason: reasons.length > 0 ? reasons.join(', ') : 'sleep adequate',
    sourcePersona: 'maya',
  };
}

/**
 * Compute stress level for calendar domain
 */
function computeCalendarStress(data: CalendarDomainData): DomainStressIndicator | null {
  if (data.confidence < 0.3) return null;

  let stressLevel = 0;
  const reasons: string[] = [];

  // High schedule density
  if (data.scheduleDensity > 90) {
    stressLevel += 0.4;
    reasons.push('extremely packed schedule');
  } else if (data.scheduleDensity > 70) {
    stressLevel += 0.25;
    reasons.push('high schedule density');
  } else if (data.scheduleDensity > 50) {
    stressLevel += 0.1;
    reasons.push('moderately busy');
  }

  // Back-to-back meetings
  if (data.backToBackChains > 5) {
    stressLevel += 0.2;
    reasons.push('many back-to-back meetings');
  } else if (data.backToBackChains > 2) {
    stressLevel += 0.1;
    reasons.push('some back-to-back meetings');
  }

  // Upcoming deadline
  if (data.upcomingDeadline.exists && data.upcomingDeadline.daysUntil !== undefined) {
    if (data.upcomingDeadline.daysUntil <= 1) {
      stressLevel += 0.3;
      reasons.push('imminent deadline');
    } else if (data.upcomingDeadline.daysUntil <= 3) {
      stressLevel += 0.15;
      reasons.push('deadline approaching');
    }
  }

  // Low free time
  if (data.freeTimeHours < 1) {
    stressLevel += 0.15;
    reasons.push('no free time');
  }

  // Overall overloaded flag
  if (data.isOverloaded) {
    stressLevel += 0.1;
  }

  return {
    domain: 'calendar',
    stressLevel: Math.min(1, stressLevel),
    reason: reasons.length > 0 ? reasons.join(', ') : 'manageable schedule',
    sourcePersona: 'alex',
  };
}

/**
 * Compute stress level for finance domain
 */
function computeFinanceStress(data: FinanceDomainData): DomainStressIndicator | null {
  if (data.confidence < 0.3) return null;

  let stressLevel = 0;
  const reasons: string[] = [];

  // Overall stress level from data
  if (data.stressLevel === 'high') {
    stressLevel += 0.4;
    reasons.push('high financial stress');
  } else if (data.stressLevel === 'moderate') {
    stressLevel += 0.2;
    reasons.push('moderate financial concern');
  }

  // Expressed anxiety
  if (data.expressedAnxiety) {
    stressLevel += 0.2;
    reasons.push('expressed financial anxiety');
  }

  // High check frequency (obsessive monitoring)
  if (data.checkFrequency > 10) {
    stressLevel += 0.15;
    reasons.push('frequent financial checking');
  }

  // Pending decision
  if (data.pendingDecision.exists) {
    if (data.pendingDecision.urgency === 'high') {
      stressLevel += 0.2;
      reasons.push('urgent financial decision');
    } else {
      stressLevel += 0.1;
      reasons.push('pending financial decision');
    }
  }

  // Specific concern topics
  if (data.concernTopics.includes('debt')) {
    stressLevel += 0.1;
    reasons.push('debt concerns');
  }

  return {
    domain: 'finance',
    stressLevel: Math.min(1, stressLevel),
    reason: reasons.length > 0 ? reasons.join(', ') : 'finances stable',
    sourcePersona: 'peter',
  };
}

/**
 * Compute stress level for goals domain
 */
function computeGoalsStress(data: GoalsDomainData): DomainStressIndicator | null {
  if (data.confidence < 0.3) return null;

  let stressLevel = 0;
  const reasons: string[] = [];

  // Goals at risk
  if (data.goalsAtRisk > 2) {
    stressLevel += 0.3;
    reasons.push('multiple goals at risk');
  } else if (data.goalsAtRisk > 0) {
    stressLevel += 0.15;
    reasons.push('goals at risk');
  }

  // Overall progress behind
  if (data.overallProgress === 'behind') {
    stressLevel += 0.2;
    reasons.push('falling behind on goals');
  }

  // Low motivation
  if (data.motivationLevel === 'low') {
    stressLevel += 0.25;
    reasons.push('low motivation');
  }

  // Recent setbacks
  if (data.recentSetbacks.length > 2) {
    stressLevel += 0.2;
    reasons.push('multiple setbacks');
  } else if (data.recentSetbacks.length > 0) {
    stressLevel += 0.1;
    reasons.push('recent setback');
  }

  // Upcoming milestone pressure
  if (data.upcomingMilestone.exists && data.upcomingMilestone.daysUntil !== undefined) {
    if (data.upcomingMilestone.daysUntil <= 3 && data.overallProgress === 'behind') {
      stressLevel += 0.2;
      reasons.push('milestone approaching while behind');
    }
  }

  return {
    domain: 'goals',
    stressLevel: Math.min(1, stressLevel),
    reason: reasons.length > 0 ? reasons.join(', ') : 'goals on track',
    sourcePersona: 'jordan',
  };
}

/**
 * Compute stress level for relationships domain
 */
function computeRelationshipStress(data: RelationshipDomainData): DomainStressIndicator | null {
  if (data.confidence < 0.3) return null;

  let stressLevel = 0;
  const reasons: string[] = [];

  // Relationship health
  if (data.relationshipHealth === 'strained') {
    stressLevel += 0.3;
    reasons.push('strained relationships');
  }

  // Specific concerns
  if (data.relationshipConcerns.length > 2) {
    stressLevel += 0.25;
    reasons.push('multiple relationship concerns');
  } else if (data.relationshipConcerns.length > 0) {
    stressLevel += 0.1;
    reasons.push('relationship concern');
  }

  // Isolation signals
  if (data.isolationSignals) {
    stressLevel += 0.3;
    reasons.push('feeling isolated');
  }

  // Existential themes (can be growth or stress)
  if (data.existentialThemes.includes('nihilism')) {
    stressLevel += 0.2;
    reasons.push('questioning meaning');
  }
  if (data.existentialThemes.includes('mortality')) {
    stressLevel += 0.15;
    reasons.push('mortality concerns');
  }

  return {
    domain: 'relationships',
    stressLevel: Math.min(1, stressLevel),
    reason: reasons.length > 0 ? reasons.join(', ') : 'relationships healthy',
    sourcePersona: 'nayan',
  };
}

/**
 * Compute stress level for habits domain
 */
function computeHabitsStress(data: HabitsDomainData): DomainStressIndicator | null {
  if (data.confidence < 0.3) return null;

  let stressLevel = 0;
  const reasons: string[] = [];

  // In a slump
  if (data.inSlump) {
    stressLevel += 0.3;
    reasons.push('in habit slump');
  }

  // Low adherence
  if (data.adherencePercent < 30) {
    stressLevel += 0.25;
    reasons.push('very low habit adherence');
  } else if (data.adherencePercent < 50) {
    stressLevel += 0.15;
    reasons.push('low habit adherence');
  }

  // Streaks at risk
  if (data.streaksAtRisk > 2) {
    stressLevel += 0.15;
    reasons.push('multiple streaks at risk');
  } else if (data.streaksAtRisk > 0) {
    stressLevel += 0.05;
    reasons.push('streak at risk');
  }

  return {
    domain: 'habits',
    stressLevel: Math.min(1, stressLevel),
    reason: reasons.length > 0 ? reasons.join(', ') : 'habits on track',
    sourcePersona: 'maya',
  };
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

export interface DetectedPattern {
  description: string;
  domains: string[];
  impact: 'positive' | 'negative' | 'neutral';
}

/**
 * Detect cross-domain patterns from collected data
 */
function detectCrossDomainPatterns(
  domains: LifeContextSnapshot['domains'],
  stressIndicators: DomainStressIndicator[]
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Calculate total stress for pattern detection
  const totalStress = stressIndicators.reduce((sum, ind) => sum + ind.stressLevel, 0);
  const highStressDomains = stressIndicators.filter((ind) => ind.stressLevel > 0.5);

  // Pattern: Overwhelm cascade (multiple high stress domains)
  if (highStressDomains.length >= 3) {
    patterns.push({
      description: 'Carrying a lot across multiple life areas',
      domains: highStressDomains.map((d) => d.domain),
      impact: 'negative',
    });
  }

  // Pattern: Sleep + Calendar collision
  if (domains.sleep && domains.calendar) {
    if (domains.sleep.averageSleepHours < 6 && domains.calendar.scheduleDensity > 60) {
      patterns.push({
        description: 'Sleep deprivation combined with packed schedule',
        domains: ['sleep', 'calendar'],
        impact: 'negative',
      });
    }
  }

  // Pattern: Financial anxiety + Sleep disruption
  if (domains.finance && domains.sleep) {
    if (domains.finance.expressedAnxiety && domains.sleep.trend === 'declining') {
      patterns.push({
        description: 'Financial worry may be affecting sleep',
        domains: ['finance', 'sleep'],
        impact: 'negative',
      });
    }
  }

  // Pattern: Isolation + Low motivation
  if (domains.relationships && domains.goals) {
    if (domains.relationships.isolationSignals && domains.goals.motivationLevel === 'low') {
      patterns.push({
        description: 'Isolation may be contributing to low motivation',
        domains: ['relationships', 'goals'],
        impact: 'negative',
      });
    }
  }

  // Pattern: Goals behind + Habits slump
  if (domains.goals && domains.habits) {
    if (domains.goals.overallProgress === 'behind' && domains.habits.inSlump) {
      patterns.push({
        description: 'Goal struggles and habit slump reinforcing each other',
        domains: ['goals', 'habits'],
        impact: 'negative',
      });
    }
  }

  // Pattern: Calendar overload + Relationship strain
  if (domains.calendar && domains.relationships) {
    if (domains.calendar.isOverloaded && domains.relationships.relationshipHealth === 'strained') {
      patterns.push({
        description: 'Busy schedule may be straining relationships',
        domains: ['calendar', 'relationships'],
        impact: 'negative',
      });
    }
  }

  // POSITIVE patterns

  // Pattern: Good sleep + Active habits
  if (domains.sleep && domains.habits) {
    if (
      domains.sleep.averageSleepHours >= 7 &&
      domains.sleep.trend !== 'declining' &&
      !domains.habits.inSlump
    ) {
      patterns.push({
        description: 'Good sleep and habit consistency supporting each other',
        domains: ['sleep', 'habits'],
        impact: 'positive',
      });
    }
  }

  // Pattern: Goals on track + High motivation
  if (domains.goals) {
    if (domains.goals.overallProgress === 'ahead' && domains.goals.motivationLevel === 'high') {
      patterns.push({
        description: 'Momentum building in goals',
        domains: ['goals'],
        impact: 'positive',
      });
    }
  }

  // Pattern: Thriving relationships + Low isolation
  if (domains.relationships) {
    if (
      domains.relationships.relationshipHealth === 'thriving' &&
      !domains.relationships.isolationSignals
    ) {
      patterns.push({
        description: 'Strong social connection',
        domains: ['relationships'],
        impact: 'positive',
      });
    }
  }

  // Pattern: No stress anywhere (rare but worth noting)
  if (totalStress < 0.5 && highStressDomains.length === 0) {
    patterns.push({
      description: 'Life feeling balanced across domains',
      domains: stressIndicators.map((d) => d.domain),
      impact: 'positive',
    });
  }

  return patterns;
}

// ============================================================================
// OVERALL SCORES
// ============================================================================

/**
 * Calculate overall load score (0-1, higher = more stressed/overwhelmed)
 */
function calculateOverallLoadScore(stressIndicators: DomainStressIndicator[]): number {
  if (stressIndicators.length === 0) return 0;

  // Weight certain domains more heavily
  const weights: Record<string, number> = {
    sleep: 1.3, // Sleep affects everything
    relationships: 1.2, // Isolation is serious
    calendar: 1.0,
    finance: 1.0,
    goals: 0.9,
    habits: 0.8,
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const indicator of stressIndicators) {
    const weight = weights[indicator.domain] || 1.0;
    weightedSum += indicator.stressLevel * weight;
    totalWeight += weight;
  }

  // Apply non-linear scaling - multiple high stress domains compound
  const highStressCount = stressIndicators.filter((i) => i.stressLevel > 0.5).length;
  const compoundingFactor = 1 + highStressCount * 0.1;

  const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return Math.min(1, rawScore * compoundingFactor);
}

/**
 * Calculate overall wellbeing score (0-1, higher = better)
 * This is NOT just inverse of load - it considers positive signals too
 */
function calculateWellbeingScore(
  domains: LifeContextSnapshot['domains'],
  loadScore: number,
  patterns: DetectedPattern[]
): number {
  // Start with inverse of load
  let wellbeing = 1 - loadScore * 0.6; // Load accounts for 60%

  // Positive signals boost wellbeing
  const positivePatterns = patterns.filter((p) => p.impact === 'positive').length;
  wellbeing += positivePatterns * 0.05;

  // Good sleep is a foundation
  if (domains.sleep && domains.sleep.averageSleepHours >= 7) {
    wellbeing += 0.05;
  }

  // Social connection
  if (domains.relationships && domains.relationships.relationshipHealth === 'thriving') {
    wellbeing += 0.05;
  }

  // Progress on goals
  if (domains.goals && domains.goals.overallProgress === 'ahead') {
    wellbeing += 0.05;
  }

  // Habit wins
  if (domains.habits && domains.habits.recentWins.length > 0) {
    wellbeing += 0.03;
  }

  // Existential growth (meaning-making can be positive)
  if (
    domains.relationships?.existentialThemes.includes('meaning') ||
    domains.relationships?.existentialThemes.includes('purpose')
  ) {
    wellbeing += 0.03;
  }

  return Math.max(0, Math.min(1, wellbeing));
}

// ============================================================================
// MAIN AGGREGATOR
// ============================================================================

/**
 * Default aggregator configuration
 */
export const DEFAULT_AGGREGATOR_CONFIG: AggregatorConfig = {
  analysisWindowDays: 7,
  minConfidence: 0.3,
  maxTriggers: 5,
  supportTriggerThreshold: 0.6,
  celebrationThreshold: 0.7,
};

/**
 * Aggregate all domain data into a unified life context snapshot
 */
export async function aggregateLifeContext(
  userId: string,
  config: Partial<AggregatorConfig> = {}
): Promise<LifeContextSnapshot> {
  const startTime = Date.now();
  const fullConfig = { ...DEFAULT_AGGREGATOR_CONFIG, ...config };

  log.info({ userId, config: fullConfig }, 'Starting life context aggregation');

  // Collect all domain data
  const domainData = await collectAllDomainData(userId, fullConfig.analysisWindowDays);

  // Compute stress indicators for each domain
  const stressIndicators: DomainStressIndicator[] = [];

  if (domainData.sleep) {
    const stress = computeSleepStress(domainData.sleep);
    if (stress) stressIndicators.push(stress);
  }

  if (domainData.calendar) {
    const stress = computeCalendarStress(domainData.calendar);
    if (stress) stressIndicators.push(stress);
  }

  if (domainData.finance) {
    const stress = computeFinanceStress(domainData.finance);
    if (stress) stressIndicators.push(stress);
  }

  if (domainData.goals) {
    const stress = computeGoalsStress(domainData.goals);
    if (stress) stressIndicators.push(stress);
  }

  if (domainData.relationships) {
    const stress = computeRelationshipStress(domainData.relationships);
    if (stress) stressIndicators.push(stress);
  }

  if (domainData.habits) {
    const stress = computeHabitsStress(domainData.habits);
    if (stress) stressIndicators.push(stress);
  }

  // Build domains object for snapshot
  const domains: LifeContextSnapshot['domains'] = {};
  if (domainData.sleep) domains.sleep = domainData.sleep;
  if (domainData.calendar) domains.calendar = domainData.calendar;
  if (domainData.finance) domains.finance = domainData.finance;
  if (domainData.goals) domains.goals = domainData.goals;
  if (domainData.relationships) domains.relationships = domainData.relationships;
  if (domainData.habits) domains.habits = domainData.habits;

  // Detect cross-domain patterns
  const patterns = detectCrossDomainPatterns(domains, stressIndicators);

  // Calculate overall scores
  const overallLoadScore = calculateOverallLoadScore(stressIndicators);
  const wellbeingScore = calculateWellbeingScore(domains, overallLoadScore, patterns);

  // Build metadata
  const domainsWithData = Object.keys(domains);
  const allDomains = ['sleep', 'calendar', 'finance', 'goals', 'relationships', 'habits'];
  const domainsMissingData = allDomains.filter((d) => !domainsWithData.includes(d));

  let dataQuality: 'high' | 'medium' | 'low' = 'low';
  if (domainsWithData.length >= 5) {
    dataQuality = 'high';
  } else if (domainsWithData.length >= 3) {
    dataQuality = 'medium';
  }

  const processingTimeMs = Date.now() - startTime;

  const snapshot: LifeContextSnapshot = {
    userId,
    createdAt: new Date(),
    analysisWindowDays: fullConfig.analysisWindowDays,
    domains,
    stressIndicators,
    overallLoadScore,
    wellbeingScore,
    synthesizedTriggers: [], // Will be populated by synthesis-trigger-generator.ts
    patterns,
    metadata: {
      domainsWithData,
      domainsMissingData,
      dataQuality,
      processingTimeMs,
    },
  };

  log.info(
    {
      userId,
      domainsWithData: domainsWithData.length,
      stressIndicators: stressIndicators.length,
      patterns: patterns.length,
      overallLoadScore: overallLoadScore.toFixed(2),
      wellbeingScore: wellbeingScore.toFixed(2),
      dataQuality,
      processingTimeMs,
    },
    'Life context aggregation complete'
  );

  return snapshot;
}

/**
 * Get a quick summary of life context for logging/debugging
 */
export function summarizeLifeContext(snapshot: LifeContextSnapshot): string {
  const parts: string[] = [];

  parts.push(`Load: ${(snapshot.overallLoadScore * 100).toFixed(0)}%`);
  parts.push(`Wellbeing: ${(snapshot.wellbeingScore * 100).toFixed(0)}%`);

  const highStress = snapshot.stressIndicators.filter((i) => i.stressLevel > 0.5);
  if (highStress.length > 0) {
    parts.push(`High stress: ${highStress.map((i) => i.domain).join(', ')}`);
  }

  const negativePatterns = snapshot.patterns.filter((p) => p.impact === 'negative');
  if (negativePatterns.length > 0) {
    parts.push(`Patterns: ${negativePatterns.map((p) => p.description).join('; ')}`);
  }

  return parts.join(' | ');
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  computeSleepStress,
  computeCalendarStress,
  computeFinanceStress,
  computeGoalsStress,
  computeRelationshipStress,
  computeHabitsStress,
  detectCrossDomainPatterns,
  calculateOverallLoadScore,
  calculateWellbeingScore,
};

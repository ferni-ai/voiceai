/**
 * Synthesis Trigger Generator
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * Generates synthesis triggers based on life context patterns.
 * These triggers respond to LIFE CONTEXT, not just words.
 *
 * Example:
 * - Maya sees poor sleep + Alex sees packed calendar + Peter sees market anxiety
 *   → Generate trigger: "support" with "You're carrying a lot right now"
 *
 * Key categories:
 * - support: User needs emotional/practical support
 * - celebration: Positive momentum worth acknowledging
 * - warning: Early intervention for emerging issues
 * - connection: User may need social connection
 * - rest: User needs to slow down
 *
 * @module synthesis-trigger-generator
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  LifeContextSnapshot,
  SynthesisTrigger,
  DomainStressIndicator,
  AggregatorConfig,
} from './life-context-snapshot.js';

const log = createLogger({ module: 'synthesis-trigger-generator' });

// ============================================================================
// TRIGGER TEMPLATES
// ============================================================================

interface TriggerTemplate {
  id: string;
  category: SynthesisTrigger['category'];
  priority: SynthesisTrigger['priority'];
  condition: (snapshot: LifeContextSnapshot) => {
    matches: boolean;
    confidence: number;
    reasoning: string;
  };
  suggestedResponses: string[];
  recommendedPersona: string;
  contributingDomains: string[];
}

/**
 * Support trigger templates - for when user needs help
 */
const supportTriggerTemplates: TriggerTemplate[] = [
  {
    id: 'overwhelm_cascade',
    category: 'support',
    priority: 'urgent',
    condition: (snapshot) => {
      const highStress = snapshot.stressIndicators.filter((i) => i.stressLevel > 0.5);
      const matches = highStress.length >= 3 && snapshot.overallLoadScore > 0.7;
      return {
        matches,
        confidence: matches ? 0.85 : 0,
        reasoning: `${highStress.length} domains showing high stress, overall load ${(snapshot.overallLoadScore * 100).toFixed(0)}%`,
      };
    },
    suggestedResponses: [
      "You're carrying a lot right now. I can hear it.",
      "There's a lot on your plate. Want to just... breathe for a moment?",
      "I'm noticing pressure from several directions. You don't have to figure it all out today.",
    ],
    recommendedPersona: 'ferni',
    contributingDomains: ['sleep', 'calendar', 'finance', 'goals', 'relationships'],
  },
  {
    id: 'sleep_calendar_collision',
    category: 'rest',
    priority: 'high',
    condition: (snapshot) => {
      const sleep = snapshot.domains.sleep;
      const calendar = snapshot.domains.calendar;
      const matches = !!(
        sleep &&
        calendar &&
        sleep.averageSleepHours < 6 &&
        calendar.scheduleDensity > 60
      );
      return {
        matches,
        confidence: matches ? 0.8 : 0,
        reasoning: `Sleep at ${sleep?.averageSleepHours.toFixed(1)}h with ${calendar?.scheduleDensity}% schedule density`,
      };
    },
    suggestedResponses: [
      "Your body's asking for rest while your calendar's asking for more. Something might need to give.",
      "Running on fumes with a packed schedule... that's not sustainable. What can we protect?",
    ],
    recommendedPersona: 'maya',
    contributingDomains: ['sleep', 'calendar'],
  },
  {
    id: 'financial_sleep_disruption',
    category: 'support',
    priority: 'high',
    condition: (snapshot) => {
      const finance = snapshot.domains.finance;
      const sleep = snapshot.domains.sleep;
      const matches = !!(finance?.expressedAnxiety && sleep?.trend === 'declining');
      return {
        matches,
        confidence: matches ? 0.75 : 0,
        reasoning: 'Financial anxiety correlating with declining sleep',
      };
    },
    suggestedResponses: [
      "Money worries have a way of following us to bed. Want to talk through what's weighing on you?",
      'I notice the financial concerns might be affecting your rest. Both deserve attention.',
    ],
    recommendedPersona: 'peter',
    contributingDomains: ['finance', 'sleep'],
  },
  {
    id: 'isolation_motivation_spiral',
    category: 'connection',
    priority: 'urgent',
    condition: (snapshot) => {
      const relationships = snapshot.domains.relationships;
      const goals = snapshot.domains.goals;
      const matches = !!(relationships?.isolationSignals && goals?.motivationLevel === 'low');
      return {
        matches,
        confidence: matches ? 0.85 : 0,
        reasoning: 'Isolation signals combined with low motivation',
      };
    },
    suggestedResponses: [
      "It can be hard to keep going when we feel alone. You're not alone right now.",
      "Isolation and low motivation often travel together. I'm here.",
      'When we feel disconnected, everything feels harder. Want to tell me more?',
    ],
    recommendedPersona: 'nayan',
    contributingDomains: ['relationships', 'goals'],
  },
  {
    id: 'goal_habit_reinforcement_loop',
    category: 'support',
    priority: 'medium',
    condition: (snapshot) => {
      const goals = snapshot.domains.goals;
      const habits = snapshot.domains.habits;
      const matches = !!(goals?.overallProgress === 'behind' && habits?.inSlump);
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: 'Goal struggles and habit slump may be reinforcing each other',
      };
    },
    suggestedResponses: [
      "Goals and habits have gotten tangled up. Let's find one small thread to pull.",
      "When everything slips, the fix isn't doing more - it's choosing one tiny thing.",
    ],
    recommendedPersona: 'jordan',
    contributingDomains: ['goals', 'habits'],
  },
  {
    id: 'calendar_relationship_strain',
    category: 'warning',
    priority: 'medium',
    condition: (snapshot) => {
      const calendar = snapshot.domains.calendar;
      const relationships = snapshot.domains.relationships;
      const matches = !!(
        calendar?.isOverloaded && relationships?.relationshipHealth === 'strained'
      );
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: 'Overloaded schedule correlating with relationship strain',
      };
    },
    suggestedResponses: [
      'A packed calendar can crowd out the people we care about. Worth checking in on that.',
      'Busy schedules and relationship strain often go together. Something to be aware of.',
    ],
    recommendedPersona: 'alex',
    contributingDomains: ['calendar', 'relationships'],
  },
  // Alex support trigger for productivity recovery
  {
    id: 'productivity_recovery_support',
    category: 'support',
    priority: 'medium',
    condition: (snapshot) => {
      const calendar = snapshot.domains.calendar;
      const goals = snapshot.domains.goals;
      const matches = !!(
        calendar &&
        calendar.freeTimeHours < 2 &&
        calendar.backToBackChains > 3 &&
        goals?.overallProgress === 'behind'
      );
      return {
        matches,
        confidence: matches ? 0.75 : 0,
        reasoning: `Only ${calendar?.freeTimeHours}h free time with ${calendar?.backToBackChains} back-to-back chains`,
      };
    },
    suggestedResponses: [
      "Your calendar is wall-to-wall. Let's find some breathing room.",
      "Productivity isn't about more meetings. What can we protect or delegate?",
    ],
    recommendedPersona: 'alex',
    contributingDomains: ['calendar', 'goals'],
  },
  // Peter support trigger for financial decision support
  {
    id: 'financial_decision_support',
    category: 'support',
    priority: 'high',
    condition: (snapshot) => {
      const finance = snapshot.domains.finance;
      const matches = !!(
        finance?.pendingDecision.exists &&
        finance.pendingDecision.urgency === 'high' &&
        finance.stressLevel === 'high'
      );
      return {
        matches,
        confidence: matches ? 0.8 : 0,
        reasoning: 'High-urgency financial decision with elevated stress',
      };
    },
    suggestedResponses: [
      "A big financial decision is weighing on you. Let's think through it together.",
      "When money decisions feel heavy, slowing down can actually help. What's the core question?",
    ],
    recommendedPersona: 'peter',
    contributingDomains: ['finance'],
  },
];

/**
 * Celebration trigger templates - for positive momentum
 */
const celebrationTriggerTemplates: TriggerTemplate[] = [
  {
    id: 'sleep_habit_foundation',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const sleep = snapshot.domains.sleep;
      const habits = snapshot.domains.habits;
      const matches = !!(
        sleep &&
        habits &&
        sleep.averageSleepHours >= 7 &&
        sleep.trend !== 'declining' &&
        !habits.inSlump &&
        habits.adherencePercent > 70
      );
      return {
        matches,
        confidence: matches ? 0.8 : 0,
        reasoning: `Sleep at ${sleep?.averageSleepHours.toFixed(1)}h and ${habits?.adherencePercent}% habit adherence`,
      };
    },
    suggestedResponses: [
      "Your sleep and habits are holding strong. That's a foundation that supports everything else.",
      "Good sleep, consistent habits - you're building something sustainable here.",
    ],
    recommendedPersona: 'maya',
    contributingDomains: ['sleep', 'habits'],
  },
  {
    id: 'goal_momentum',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const goals = snapshot.domains.goals;
      const matches = !!(goals?.overallProgress === 'ahead' && goals.motivationLevel === 'high');
      return {
        matches,
        confidence: matches ? 0.85 : 0,
        reasoning: 'Goals ahead of schedule with high motivation',
      };
    },
    suggestedResponses: [
      "You're ahead on your goals and feeling motivated. That momentum is real.",
      "The progress you're making isn't luck - it's showing up consistently.",
    ],
    recommendedPersona: 'jordan',
    contributingDomains: ['goals'],
  },
  {
    id: 'thriving_relationships',
    category: 'celebration',
    priority: 'low',
    condition: (snapshot) => {
      const relationships = snapshot.domains.relationships;
      const matches = !!(
        relationships?.relationshipHealth === 'thriving' &&
        !relationships.isolationSignals &&
        relationships.relationshipConcerns.length === 0
      );
      return {
        matches,
        confidence: matches ? 0.75 : 0,
        reasoning: 'Relationships thriving with no concerns',
      };
    },
    suggestedResponses: [
      'Your relationships seem to be in a good place. That matters more than most things.',
      "Strong connections with people you care about - that's worth noticing.",
    ],
    recommendedPersona: 'nayan',
    contributingDomains: ['relationships'],
  },
  {
    id: 'overall_balance',
    category: 'celebration',
    priority: 'low',
    condition: (snapshot) => {
      const matches = snapshot.overallLoadScore < 0.3 && snapshot.wellbeingScore > 0.7;
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: `Load at ${(snapshot.overallLoadScore * 100).toFixed(0)}%, wellbeing at ${(snapshot.wellbeingScore * 100).toFixed(0)}%`,
      };
    },
    suggestedResponses: [
      'Life feels more balanced right now. Worth pausing to appreciate that.',
      'Things seem to be humming along. These moments matter.',
    ],
    recommendedPersona: 'ferni',
    contributingDomains: ['sleep', 'calendar', 'goals', 'relationships', 'habits'],
  },
  // Alex celebration trigger for schedule optimization
  {
    id: 'schedule_optimization_win',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const calendar = snapshot.domains.calendar;
      const matches = !!(
        calendar &&
        !calendar.isOverloaded &&
        calendar.freeTimeHours >= 4 &&
        calendar.scheduleDensity < 50 &&
        calendar.backToBackChains <= 1
      );
      return {
        matches,
        confidence: matches ? 0.75 : 0,
        reasoning: `Calendar balanced: ${calendar?.freeTimeHours}h free, ${calendar?.scheduleDensity}% density`,
      };
    },
    suggestedResponses: [
      'Your calendar has some room to breathe. That took intentional choices.',
      "You've carved out actual space this week. That doesn't happen by accident.",
    ],
    recommendedPersona: 'alex',
    contributingDomains: ['calendar'],
  },
  // Peter celebration trigger for financial stability
  {
    id: 'financial_stability_win',
    category: 'celebration',
    priority: 'medium',
    condition: (snapshot) => {
      const finance = snapshot.domains.finance;
      const matches = !!(
        finance &&
        !finance.expressedAnxiety &&
        finance.stressLevel === 'low' &&
        finance.concernTopics.length === 0 &&
        !finance.pendingDecision.exists
      );
      return {
        matches,
        confidence: matches ? 0.7 : 0,
        reasoning: 'No financial anxiety, low stress, no pending concerns',
      };
    },
    suggestedResponses: [
      'Your finances seem to be in a steady place. That kind of stability is worth recognizing.',
      "No financial fires to put out - that's the result of good decisions adding up.",
    ],
    recommendedPersona: 'peter',
    contributingDomains: ['finance'],
  },
];

/**
 * Warning trigger templates - early intervention
 */
const warningTriggerTemplates: TriggerTemplate[] = [
  {
    id: 'deadline_approaching_behind',
    category: 'warning',
    priority: 'high',
    condition: (snapshot) => {
      const calendar = snapshot.domains.calendar;
      const goals = snapshot.domains.goals;
      const matches = !!(
        calendar?.upcomingDeadline.exists &&
        calendar.upcomingDeadline.daysUntil !== undefined &&
        calendar.upcomingDeadline.daysUntil <= 2 &&
        goals?.overallProgress === 'behind'
      );
      return {
        matches,
        confidence: matches ? 0.8 : 0,
        reasoning: `Deadline in ${calendar?.upcomingDeadline.daysUntil} days while behind on goals`,
      };
    },
    suggestedResponses: [
      "A deadline's close and you're feeling behind. Let's figure out what's actually essential.",
      "Crunch time approaching. What's the smallest viable version?",
    ],
    recommendedPersona: 'alex',
    contributingDomains: ['calendar', 'goals'],
  },
  {
    id: 'burnout_warning',
    category: 'warning',
    priority: 'urgent',
    condition: (snapshot) => {
      const sleep = snapshot.domains.sleep;
      const calendar = snapshot.domains.calendar;
      const habits = snapshot.domains.habits;
      const matches = !!(
        sleep &&
        sleep.averageSleepHours < 6 &&
        sleep.mentionedFatigue &&
        calendar?.isOverloaded &&
        habits?.inSlump
      );
      return {
        matches,
        confidence: matches ? 0.9 : 0,
        reasoning: 'Multiple burnout indicators: poor sleep, fatigue, overload, habit slump',
      };
    },
    suggestedResponses: [
      "I'm seeing signs of burnout. This is worth taking seriously.",
      'Your body and habits are signaling something important. Can we talk about it?',
    ],
    recommendedPersona: 'maya',
    contributingDomains: ['sleep', 'calendar', 'habits'],
  },
  {
    id: 'existential_spiral',
    category: 'support',
    priority: 'high',
    condition: (snapshot) => {
      const relationships = snapshot.domains.relationships;
      const goals = snapshot.domains.goals;
      const matches = !!(
        relationships?.existentialThemes.includes('nihilism') && goals?.motivationLevel === 'low'
      );
      return {
        matches,
        confidence: matches ? 0.8 : 0,
        reasoning: 'Nihilistic questioning combined with low motivation',
      };
    },
    suggestedResponses: [
      'Questioning meaning while feeling stuck is hard. Both things can be true.',
      "The 'what's the point' feeling deserves space, not dismissal. I'm listening.",
    ],
    recommendedPersona: 'nayan',
    contributingDomains: ['relationships', 'goals'],
  },
];

/**
 * All trigger templates combined
 */
const allTriggerTemplates: TriggerTemplate[] = [
  ...supportTriggerTemplates,
  ...celebrationTriggerTemplates,
  ...warningTriggerTemplates,
];

// ============================================================================
// TRIGGER GENERATION
// ============================================================================

/**
 * Generate synthesis triggers from life context snapshot
 */
export function generateSynthesisTriggers(
  snapshot: LifeContextSnapshot,
  config: Partial<AggregatorConfig> = {}
): SynthesisTrigger[] {
  const maxTriggers = config.maxTriggers || 5;
  const supportThreshold = config.supportTriggerThreshold || 0.6;
  const celebrationThreshold = config.celebrationThreshold || 0.7;

  const triggers: SynthesisTrigger[] = [];

  // Evaluate all templates
  for (const template of allTriggerTemplates) {
    const result = template.condition(snapshot);

    if (!result.matches) continue;

    // Apply category-specific confidence thresholds
    const threshold = template.category === 'celebration' ? celebrationThreshold : supportThreshold;
    if (result.confidence < threshold) continue;

    // Select a response (cycle through for variety)
    const responseIndex = Math.floor(Math.random() * template.suggestedResponses.length);
    const suggestedResponse = template.suggestedResponses[responseIndex];

    triggers.push({
      id: template.id,
      category: template.category,
      suggestedResponse,
      reasoning: result.reasoning,
      confidence: result.confidence,
      priority: template.priority,
      contributingDomains: template.contributingDomains,
      recommendedPersona: template.recommendedPersona,
    });
  }

  // Sort by priority and confidence
  const priorityOrder: Record<SynthesisTrigger['priority'], number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  triggers.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });

  // Limit to max triggers
  const selectedTriggers = triggers.slice(0, maxTriggers);

  log.info(
    {
      userId: snapshot.userId,
      triggersGenerated: selectedTriggers.length,
      categories: selectedTriggers.map((t) => t.category),
      priorities: selectedTriggers.map((t) => t.priority),
    },
    'Synthesis triggers generated'
  );

  return selectedTriggers;
}

/**
 * Populate synthesizedTriggers field in a life context snapshot
 */
export function populateSynthesisTriggers(
  snapshot: LifeContextSnapshot,
  config: Partial<AggregatorConfig> = {}
): LifeContextSnapshot {
  const triggers = generateSynthesisTriggers(snapshot, config);
  return {
    ...snapshot,
    synthesizedTriggers: triggers,
  };
}

/**
 * Get the most important trigger from a snapshot
 */
export function getMostImportantTrigger(snapshot: LifeContextSnapshot): SynthesisTrigger | null {
  if (snapshot.synthesizedTriggers.length === 0) return null;
  return snapshot.synthesizedTriggers[0]; // Already sorted by priority/confidence
}

/**
 * Get triggers by category
 */
export function getTriggersByCategory(
  snapshot: LifeContextSnapshot,
  category: SynthesisTrigger['category']
): SynthesisTrigger[] {
  return snapshot.synthesizedTriggers.filter((t) => t.category === category);
}

/**
 * Get triggers recommended for a specific persona
 */
export function getTriggersForPersona(
  snapshot: LifeContextSnapshot,
  personaId: string
): SynthesisTrigger[] {
  return snapshot.synthesizedTriggers.filter((t) => t.recommendedPersona === personaId);
}

// ============================================================================
// ANALYTICS
// ============================================================================

interface SynthesisAnalytics {
  totalTriggersGenerated: number;
  byCategory: Record<SynthesisTrigger['category'], number>;
  byPriority: Record<SynthesisTrigger['priority'], number>;
  byPersona: Record<string, number>;
  averageConfidence: number;
  mostCommonTriggers: { id: string; count: number }[];
}

// Simple in-memory analytics store
let analyticsData: {
  triggerCounts: Record<string, number>;
  totalGenerated: number;
  categoryBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  personaBreakdown: Record<string, number>;
  confidenceSum: number;
} = {
  triggerCounts: {},
  totalGenerated: 0,
  categoryBreakdown: {},
  priorityBreakdown: {},
  personaBreakdown: {},
  confidenceSum: 0,
};

/**
 * Record triggers for analytics
 */
export function recordSynthesisTriggers(triggers: SynthesisTrigger[]): void {
  for (const trigger of triggers) {
    analyticsData.totalGenerated++;
    analyticsData.triggerCounts[trigger.id] = (analyticsData.triggerCounts[trigger.id] || 0) + 1;
    analyticsData.categoryBreakdown[trigger.category] =
      (analyticsData.categoryBreakdown[trigger.category] || 0) + 1;
    analyticsData.priorityBreakdown[trigger.priority] =
      (analyticsData.priorityBreakdown[trigger.priority] || 0) + 1;
    analyticsData.personaBreakdown[trigger.recommendedPersona] =
      (analyticsData.personaBreakdown[trigger.recommendedPersona] || 0) + 1;
    analyticsData.confidenceSum += trigger.confidence;
  }
}

/**
 * Get synthesis analytics
 */
export function getSynthesisAnalytics(): SynthesisAnalytics {
  const mostCommonTriggers = Object.entries(analyticsData.triggerCounts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalTriggersGenerated: analyticsData.totalGenerated,
    byCategory: analyticsData.categoryBreakdown as Record<SynthesisTrigger['category'], number>,
    byPriority: analyticsData.priorityBreakdown as Record<SynthesisTrigger['priority'], number>,
    byPersona: analyticsData.personaBreakdown,
    averageConfidence:
      analyticsData.totalGenerated > 0
        ? analyticsData.confidenceSum / analyticsData.totalGenerated
        : 0,
    mostCommonTriggers,
  };
}

/**
 * Reset analytics (for testing)
 */
export function resetSynthesisAnalytics(): void {
  analyticsData = {
    triggerCounts: {},
    totalGenerated: 0,
    categoryBreakdown: {},
    priorityBreakdown: {},
    personaBreakdown: {},
    confidenceSum: 0,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  allTriggerTemplates,
  supportTriggerTemplates,
  celebrationTriggerTemplates,
  warningTriggerTemplates,
};

export type { TriggerTemplate, SynthesisAnalytics };

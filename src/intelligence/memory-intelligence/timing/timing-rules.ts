/**
 * Timing Rules
 *
 * Rule-based system for deciding when to surface memories.
 * Includes blocking conditions (when NOT to surface) and
 * triggering conditions (when to surface).
 *
 * @module intelligence/memory-intelligence/timing/timing-rules
 */

import type { TimingRule, TimingRuleContext, BlockingCondition, SurfacingTrigger } from '../types.js';

// ============================================================================
// BLOCKING RULES (When NOT to surface)
// ============================================================================

/**
 * Rules that block memory surfacing.
 * If any blocking rule matches, we don't surface.
 */
export const BLOCKING_RULES: TimingRule[] = [
  {
    name: 'crisis_active',
    type: 'blocking',
    condition: (ctx) => ctx.crisisDetected,
    reason: 'Never interrupt crisis support with memory callbacks - user needs immediate help',
  },
  {
    name: 'emotional_intensity_high',
    type: 'blocking',
    condition: (ctx) => ctx.emotionalIntensity > 0.8,
    reason: 'Let intense emotions be processed first before adding memories',
  },
  {
    name: 'user_energy_low',
    type: 'blocking',
    condition: (ctx) => ctx.userEnergy < 0.3,
    reason: 'User is depleted - keep conversation light and supportive',
  },
  {
    name: 'recently_surfaced',
    type: 'blocking',
    condition: (ctx) => ctx.turnsSinceLastMemory < 3,
    reason: 'Avoid memory overload - space out callbacks',
  },
  {
    name: 'conversation_shallow',
    type: 'blocking',
    condition: (ctx) => ctx.turnCount < 3,
    reason: 'Build rapport before diving into past memories',
  },
  {
    name: 'trust_insufficient',
    type: 'blocking',
    condition: (ctx) => ctx.trustLevel === 'new' && ctx.topicSensitivity > 0.5,
    reason: 'Need more trust before surfacing sensitive topics',
    minTrustLevel: 'developing',
  },
  {
    name: 'user_deflected_before',
    type: 'blocking',
    condition: (ctx) => ctx.hasDeflectedTopic,
    reason: 'User has deflected this topic before - respect their boundaries',
  },
  {
    name: 'cognitive_overload',
    type: 'blocking',
    condition: (ctx) => ctx.cognitiveLoad > 0.8,
    reason: 'User is processing a lot already - not the time for more',
  },
  {
    name: 'user_rushed',
    type: 'blocking',
    condition: (ctx) => ctx.isRushed,
    reason: 'User seems in a hurry - keep it brief',
  },
  {
    name: 'late_night_sensitive',
    type: 'blocking',
    condition: (ctx) => ctx.timeOfDay === 'late_night' && ctx.topicSensitivity > 0.6,
    reason: 'Late night is not the time for heavy memory callbacks',
  },
];

// ============================================================================
// TRIGGERING RULES (When TO surface)
// ============================================================================

/**
 * Rules that trigger memory surfacing.
 * Sorted by priority (high to low).
 */
export const TRIGGERING_RULES: TimingRule[] = [
  {
    name: 'topic_connection',
    type: 'triggering',
    condition: (ctx) => ctx.topicRelevance > 0.8,
    reason: 'Strong topic match - natural time to reference past',
    priority: 'high',
  },
  {
    name: 'person_with_history',
    type: 'triggering',
    condition: (ctx) => ctx.personMentioned && ctx.hasPersonHistory,
    reason: 'Person mentioned has rich history - show we remember',
    priority: 'high',
  },
  {
    name: 'commitment_followup',
    type: 'triggering',
    condition: (ctx) => ctx.hasOutstandingCommitment && (ctx.daysSinceCommitment ?? 0) >= 3,
    reason: 'Time to check in on commitment without being pushy',
    priority: 'medium',
    minTrustLevel: 'developing',
  },
  {
    name: 'emotional_callback',
    type: 'triggering',
    condition: (ctx) => ctx.emotionalSimilarity > 0.7 && ctx.emotionalIntensity < 0.6,
    reason: 'Similar emotional context - can provide perspective',
    priority: 'medium',
    minTrustLevel: 'established',
  },
  {
    name: 'positive_reinforcement',
    type: 'triggering',
    condition: (ctx) => ctx.emotionalValence > 0.5 && ctx.topicRelevance > 0.6,
    reason: 'Positive moment - good time to connect with past',
    priority: 'low',
  },
  {
    name: 'established_trust_topic',
    type: 'triggering',
    condition: (ctx) => ctx.trustLevel === 'deep' && ctx.topicRelevance > 0.5,
    reason: 'Deep trust allows natural memory references',
    priority: 'low',
    minTrustLevel: 'deep',
  },
  {
    name: 'moderate_depth_callback',
    type: 'triggering',
    condition: (ctx) => ctx.turnCount >= 5 && ctx.turnCount <= 15 && ctx.topicRelevance > 0.6,
    reason: 'Sweet spot in conversation depth for memory callbacks',
    priority: 'low',
  },
];

// ============================================================================
// EVALUATION FUNCTIONS
// ============================================================================

/**
 * Result of timing rule evaluation
 */
export interface TimingRuleEvaluation {
  /** Should we surface? */
  shouldSurface: boolean;

  /** Blocking rules that fired */
  blockingRulesFired: string[];

  /** Triggering rules that fired */
  triggeringRulesFired: Array<{ name: string; priority: 'high' | 'medium' | 'low' }>;

  /** Primary reason for decision */
  primaryReason: string;

  /** Confidence in decision (0-1) */
  confidence: number;
}

/**
 * Evaluate all timing rules for a context
 */
export function evaluateTimingRules(ctx: TimingRuleContext): TimingRuleEvaluation {
  // Check blocking rules first
  const blockingRulesFired: string[] = [];
  for (const rule of BLOCKING_RULES) {
    if (rule.condition(ctx)) {
      blockingRulesFired.push(rule.name);
    }
  }

  // If any blocking rule fired, we don't surface
  if (blockingRulesFired.length > 0) {
    const primaryBlocker = BLOCKING_RULES.find((r) => r.name === blockingRulesFired[0]);
    return {
      shouldSurface: false,
      blockingRulesFired,
      triggeringRulesFired: [],
      primaryReason: primaryBlocker?.reason || 'Blocked by timing rules',
      confidence: 0.9,
    };
  }

  // Check triggering rules
  const triggeringRulesFired: Array<{ name: string; priority: 'high' | 'medium' | 'low' }> = [];
  for (const rule of TRIGGERING_RULES) {
    // Check trust level requirement
    if (rule.minTrustLevel) {
      const trustOrder: Record<string, number> = { new: 0, developing: 1, established: 2, deep: 3 };
      if (trustOrder[ctx.trustLevel] < trustOrder[rule.minTrustLevel]) {
        continue;
      }
    }

    if (rule.condition(ctx)) {
      triggeringRulesFired.push({
        name: rule.name,
        priority: rule.priority || 'low',
      });
    }
  }

  // Determine if we should surface
  const hasHighPriority = triggeringRulesFired.some((r) => r.priority === 'high');
  const hasMediumPriority = triggeringRulesFired.some((r) => r.priority === 'medium');
  const hasAnyTrigger = triggeringRulesFired.length > 0;

  // Calculate confidence based on trigger strength
  let confidence = 0;
  if (hasHighPriority) {
    confidence = 0.9;
  } else if (hasMediumPriority) {
    confidence = 0.7;
  } else if (hasAnyTrigger) {
    confidence = 0.5;
  }

  // Boost confidence if multiple triggers
  if (triggeringRulesFired.length > 1) {
    confidence = Math.min(confidence + 0.1, 1.0);
  }

  const shouldSurface = hasHighPriority || (hasMediumPriority && triggeringRulesFired.length > 1);

  const primaryTrigger = triggeringRulesFired[0];
  const triggerRule = primaryTrigger ? TRIGGERING_RULES.find((r) => r.name === primaryTrigger.name) : null;

  return {
    shouldSurface,
    blockingRulesFired: [],
    triggeringRulesFired,
    primaryReason: triggerRule?.reason || (shouldSurface ? 'Triggered by timing rules' : 'No strong trigger'),
    confidence,
  };
}

/**
 * Get blocking condition from rule name
 */
export function ruleNameToBlockingCondition(ruleName: string): BlockingCondition | null {
  const mapping: Record<string, BlockingCondition> = {
    crisis_active: 'crisis_active',
    emotional_intensity_high: 'emotional_intensity_high',
    user_energy_low: 'user_energy_low',
    recently_surfaced: 'recently_surfaced',
    conversation_shallow: 'conversation_shallow',
    trust_insufficient: 'trust_insufficient',
    user_deflected_before: 'user_deflected_before',
    cognitive_overload: 'user_energy_low', // Map to closest
    user_rushed: 'user_energy_low', // Map to closest
    late_night_sensitive: 'topic_sensitive',
  };
  return mapping[ruleName] || null;
}

/**
 * Get surfacing trigger from rule name
 */
export function ruleNameToSurfacingTrigger(ruleName: string): SurfacingTrigger | null {
  const mapping: Record<string, SurfacingTrigger> = {
    topic_connection: 'topic_connection',
    person_with_history: 'person_mentioned',
    commitment_followup: 'commitment_followup',
    emotional_callback: 'emotional_callback',
    positive_reinforcement: 'emotional_callback',
    established_trust_topic: 'topic_connection',
    moderate_depth_callback: 'topic_connection',
  };
  return mapping[ruleName] || null;
}

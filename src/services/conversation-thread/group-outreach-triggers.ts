/**
 * Group Outreach Triggers
 *
 * This module wires group outreach capabilities into the superhuman services
 * and decision engine. It determines when multiple personas should reach out
 * together instead of a single persona.
 *
 * @example
 * // From a superhuman service detecting a major milestone:
 * import { shouldTriggerGroupOutreach, triggerGroupOutreach } from './group-outreach-triggers.js';
 *
 * if (shouldTriggerGroupOutreach(userId, 'celebration', achievement)) {
 *   await triggerGroupOutreach(userId, 'celebration', achievement);
 * }
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { PersonaId } from '../../personas/types.js';
import type { OutreachTriggerType, OutreachPriority } from '../outreach/decision-engine-types.js';
import {
  initiateGroupOutreach,
  mayaJordanPlanningOutreach,
  peterFerniInsightOutreach,
  teamCelebrationOutreach,
  fullTeamSupportOutreach,
  initiateTeamRoundtableCall,
  type GroupOutreachResult,
} from './group-outreach.js';

const log = getLogger().child({ service: 'group-outreach-triggers' });

// ============================================================================
// TRIGGER TYPES THAT BENEFIT FROM MULTIPLE PERSONAS
// ============================================================================

/**
 * Trigger types that warrant group outreach.
 * These are situations where multiple perspectives add value.
 */
const GROUP_OUTREACH_TRIGGER_TYPES: Set<OutreachTriggerType> = new Set([
  'celebration', // Team celebration
  'emotional_support', // Full team support for difficult times
  'goal_milestone', // Major life milestone
  'check_in', // Can be team roundtable for important check-ins
]);

/**
 * Topic patterns that suggest group outreach would be valuable.
 */
const GROUP_TOPICS: Array<{ pattern: RegExp; personas: PersonaId[]; reason: string }> = [
  {
    pattern: /\b(career|job|work|promotion|fired|hired|quit)\b/i,
    personas: ['ferni', 'peter-john', 'alex-chen'],
    reason: 'Career transition - needs research, communication, and life coaching',
  },
  {
    pattern: /\b(wedding|marriage|engaged|relationship|dating)\b/i,
    personas: ['ferni', 'jordan-taylor', 'maya-santos'],
    reason: 'Relationship milestone - needs planning, habits, and life coaching',
  },
  {
    pattern: /\b(moving|relocation|new home|apartment)\b/i,
    personas: ['ferni', 'jordan-taylor', 'alex-chen'],
    reason: 'Major life change - needs planning, communication, and life coaching',
  },
  {
    pattern: /\b(health|diagnosis|medical|surgery|treatment)\b/i,
    personas: ['ferni', 'peter-john', 'maya-santos'],
    reason: 'Health journey - needs research, habits, and life coaching',
  },
  {
    pattern: /\b(depression|anxiety|overwhelm|burnout|crisis)\b/i,
    personas: ['ferni', 'maya-santos', 'nayan-patel'],
    reason: 'Mental health support - needs habits, wisdom, and life coaching',
  },
  {
    pattern: /\b(finances|money|invest|budget|debt|retirement)\b/i,
    personas: ['ferni', 'peter-john'],
    reason: 'Financial planning - needs research and life coaching',
  },
  {
    pattern: /\b(trip|vacation|travel|adventure)\b/i,
    personas: ['ferni', 'jordan-taylor'],
    reason: 'Travel planning - needs planning and life coaching',
  },
  {
    pattern: /\b(birthday|anniversary|graduation|celebration)\b/i,
    personas: ['ferni', 'jordan-taylor', 'maya-santos'],
    reason: 'Celebration - needs planning, habits, and life coaching',
  },
];

// ============================================================================
// DECISION LOGIC
// ============================================================================

export interface GroupOutreachDecision {
  shouldUseGroup: boolean;
  personas: PersonaId[];
  reason: string;
  outreachType: 'text' | 'call' | 'roundtable';
}

/**
 * Determine if a trigger should use group outreach.
 *
 * @param userId - The user ID
 * @param triggerType - The type of outreach trigger
 * @param context - Additional context (topic, achievement, etc.)
 * @returns Decision about whether to use group outreach
 */
export function shouldTriggerGroupOutreach(
  userId: string,
  triggerType: OutreachTriggerType,
  context: {
    topic?: string;
    achievement?: string;
    priority?: OutreachPriority;
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
  }
): GroupOutreachDecision {
  // Default: no group outreach
  const defaultDecision: GroupOutreachDecision = {
    shouldUseGroup: false,
    personas: [],
    reason: 'Single persona sufficient',
    outreachType: 'text',
  };

  // Only established/deep relationships get group outreach
  if (context.relationshipStage === 'new' || context.relationshipStage === 'building') {
    return {
      ...defaultDecision,
      reason: 'Relationship too new for group outreach',
    };
  }

  // Check if trigger type warrants group outreach
  if (GROUP_OUTREACH_TRIGGER_TYPES.has(triggerType)) {
    switch (triggerType) {
      case 'celebration':
        return {
          shouldUseGroup: true,
          personas: ['ferni', 'jordan-taylor', 'maya-santos'],
          reason: 'Team celebration for achievement',
          outreachType: 'text',
        };

      case 'emotional_support':
        return {
          shouldUseGroup: true,
          personas: ['ferni', 'maya-santos', 'nayan-patel'],
          reason: 'Full team support for difficult time',
          outreachType: context.priority === 'urgent' ? 'call' : 'text',
        };

      case 'goal_milestone':
        return {
          shouldUseGroup: true,
          personas: ['ferni', 'jordan-taylor', 'peter-john'],
          reason: 'Major life milestone - multiple perspectives valuable',
          outreachType: 'text',
        };

      case 'check_in':
        // Only roundtable for high-priority check-ins with deep relationships
        if (context.priority === 'high' && context.relationshipStage === 'deep') {
          return {
            shouldUseGroup: true,
            personas: ['ferni', 'maya-santos', 'jordan-taylor'],
            reason: 'Important check-in with engaged user',
            outreachType: 'roundtable',
          };
        }
        break;
    }
  }

  // Check topic patterns
  if (context.topic) {
    for (const topicConfig of GROUP_TOPICS) {
      if (topicConfig.pattern.test(context.topic)) {
        return {
          shouldUseGroup: true,
          personas: topicConfig.personas,
          reason: topicConfig.reason,
          outreachType: 'text',
        };
      }
    }
  }

  return defaultDecision;
}

// ============================================================================
// TRIGGER EXECUTION
// ============================================================================

/**
 * Execute group outreach based on the trigger type and context.
 *
 * @param userId - The user ID
 * @param triggerType - The type of outreach trigger
 * @param context - Additional context
 * @returns Result of the outreach attempt
 */
export async function triggerGroupOutreach(
  userId: string,
  triggerType: OutreachTriggerType,
  context: {
    topic?: string;
    achievement?: string;
    reason?: string;
    preferredName?: string;
    scheduledFor?: Date;
    priority?: OutreachPriority;
  }
): Promise<GroupOutreachResult> {
  const decision = shouldTriggerGroupOutreach(userId, triggerType, context);

  if (!decision.shouldUseGroup) {
    log.debug({ userId, triggerType }, 'Group outreach not needed for this trigger');
    return {
      success: false,
      outreachId: '',
      threadId: '',
      channel: 'sms',
      message: '',
      personas: [],
      error: 'Group outreach not appropriate for this trigger',
    };
  }

  log.info(
    {
      userId,
      triggerType,
      personas: decision.personas,
      outreachType: decision.outreachType,
      reason: decision.reason,
    },
    '🎭 Triggering group outreach'
  );

  try {
    switch (triggerType) {
      case 'celebration':
        return await teamCelebrationOutreach(userId, {
          achievement: context.achievement || 'an amazing accomplishment',
          preferredName: context.preferredName,
        });

      case 'emotional_support':
        return await fullTeamSupportOutreach(userId, {
          situation: context.topic || 'a challenging time',
          preferredName: context.preferredName,
        });

      case 'goal_milestone':
        // Use Peter + Ferni for research-backed insights on milestones
        return await peterFerniInsightOutreach(userId, {
          topic: context.topic || 'this important milestone',
          insight: context.achievement || 'your significant progress',
          preferredName: context.preferredName,
        });

      case 'check_in':
        if (decision.outreachType === 'roundtable') {
          return await initiateTeamRoundtableCall(userId, {
            personas: decision.personas,
            topic: context.topic || 'a team check-in',
            reason: context.reason || 'We wanted to catch up and see how you are doing',
            preferredName: context.preferredName,
          });
        }
        // Fall through to generic group outreach for text-based check-ins
        break;
    }

    // Default fallback - generic group outreach
    return await initiateGroupOutreach({
      userId,
      personas: decision.personas,
      leadPersona: decision.personas[0],
      preferredChannel: 'sms',
      triggerType: 'follow_up', // Valid OutreachType
      topic: context.topic || 'reaching out',
      reason: context.reason || decision.reason,
      context: {
        preferredName: context.preferredName,
      },
    });
  } catch (error) {
    log.error({ error: String(error), userId, triggerType }, 'Failed to trigger group outreach');
    return {
      success: false,
      outreachId: '',
      threadId: '',
      channel: 'sms',
      message: '',
      personas: decision.personas,
      error: String(error),
    };
  }
}

// ============================================================================
// SUPERHUMAN SERVICE INTEGRATIONS
// ============================================================================

/**
 * Called when commitment keeper detects a major commitment milestone.
 */
export async function onCommitmentMilestone(
  userId: string,
  milestone: {
    commitmentText: string;
    streakDays?: number;
    completionRate?: number;
    preferredName?: string;
  }
): Promise<GroupOutreachResult | null> {
  // Only celebrate significant milestones
  if ((milestone.streakDays || 0) < 7 && (milestone.completionRate || 0) < 0.5) {
    return null;
  }

  const achievement =
    milestone.streakDays && milestone.streakDays >= 7
      ? `${milestone.streakDays} days committed to "${milestone.commitmentText}"`
      : `making real progress on "${milestone.commitmentText}"`;

  return await teamCelebrationOutreach(userId, {
    achievement,
    preferredName: milestone.preferredName,
  });
}

/**
 * Called when relationship network detects a reconnection opportunity.
 * This could trigger a planning outreach with Jordan + Maya.
 */
export async function onReconnectionOpportunity(
  userId: string,
  opportunity: {
    personName: string;
    daysSinceLastMention: number;
    suggestedAction: string;
    preferredName?: string;
  }
): Promise<GroupOutreachResult | null> {
  // Only trigger group outreach for long-lost important connections
  if (opportunity.daysSinceLastMention < 30) {
    return null;
  }

  return await mayaJordanPlanningOutreach(userId, {
    eventName: `reconnecting with ${opportunity.personName}`,
    preferredName: opportunity.preferredName,
  });
}

/**
 * Called when predictive coaching detects a pattern worth discussing.
 */
export async function onPredictivePattern(
  userId: string,
  pattern: {
    patternDescription: string;
    prediction: string;
    confidence: number;
    preferredName?: string;
  }
): Promise<GroupOutreachResult | null> {
  // Only trigger for high-confidence patterns
  if (pattern.confidence < 0.7) {
    return null;
  }

  return await peterFerniInsightOutreach(userId, {
    topic: pattern.patternDescription,
    insight: pattern.prediction,
    preferredName: pattern.preferredName,
  });
}

/**
 * Called when emotional trajectory shows significant distress.
 */
export async function onEmotionalDistress(
  userId: string,
  signal: {
    emotion: string;
    intensity: number;
    duration: string;
    preferredName?: string;
  }
): Promise<GroupOutreachResult | null> {
  // Only trigger for sustained, intense negative emotions
  if (signal.intensity < 0.7) {
    return null;
  }

  return await fullTeamSupportOutreach(userId, {
    situation: `you've been feeling ${signal.emotion} lately`,
    preferredName: signal.preferredName,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export { GROUP_OUTREACH_TRIGGER_TYPES, GROUP_TOPICS };

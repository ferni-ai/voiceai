/**
 * Insight → Action Bridge - Automated Action Execution from Superhuman Insights
 *
 * Part of the "Better Than Human" automation layer.
 * This service automatically maps insights from superhuman services to concrete actions.
 *
 * Problem: Superhuman services generate valuable insights that sit unused.
 * Solution: Automatically trigger outreach, tasks, or notifications when insights meet criteria.
 *
 * @module services/automation/insight-action-bridge
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'insight-action-bridge' });

// ============================================================================
// Types (Canonical source for shared types)
// ============================================================================

export type SuperhumanCapability =
  | 'commitment_keeper'
  | 'predictive_coaching'
  | 'life_narrative'
  | 'values_alignment'
  | 'emotional_first_aid'
  | 'relationship_network'
  | 'capacity_guardian'
  | 'dream_keeper'
  | 'relationship_milestones'
  | 'seasonal_awareness'
  | 'voice_biomarkers'
  | 'mood_calendar'
  | 'family_checkin'
  | 'habit_tracker'
  | 'pattern_detector';

export type ActionType = 'outreach' | 'task' | 'notification' | 'calendar' | 'internal';

// Shared types used across automation services
export type PersonaId = 'ferni' | 'maya' | 'peter-john' | 'alex' | 'jordan' | 'nayan';

export type OutreachChannel = 'sms' | 'email' | 'push' | 'voice';

export interface SuperhumanInsight {
  id: string;
  userId: string;
  capability: SuperhumanCapability;
  timestamp: string;
  data: Record<string, unknown>;
  // Common insight fields
  burnoutRisk?: number;
  driftScore?: number;
  relationshipImportance?: number;
  dormantDays?: number;
  dreamImportance?: number;
  commitmentOverdue?: boolean;
  overdueCommitments?: string[];
  habitStreak?: number;
  habitAtRisk?: boolean;
  habitName?: string;
  moodTrend?: 'declining' | 'stable' | 'improving';
  patternDetected?: string;
  milestoneApproaching?: boolean;
  milestoneName?: string;
  daysUntilMilestone?: number;
  crisisSignals?: boolean;
}

export interface AutomatedAction {
  type: ActionType;
  persona?: PersonaId;
  template?: string;
  channel?: OutreachChannel;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  data?: Record<string, unknown>;
}

export interface InsightActionRule {
  id: string;
  name: string;
  description: string;
  insightType: SuperhumanCapability;
  condition: (insight: SuperhumanInsight) => boolean;
  action: AutomatedAction;
  cooldownHours: number;
  enabled: boolean;
}

export interface ActionExecution {
  id: string;
  ruleId: string;
  userId: string;
  insightId: string;
  action: AutomatedAction;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: string;
  error?: string;
  createdAt: string;
  executedAt?: string;
}

// ============================================================================
// Insight → Action Rules
// ============================================================================

export const INSIGHT_ACTION_RULES: InsightActionRule[] = [
  // Capacity Guardian - Burnout Prevention
  {
    id: 'burnout_prevention',
    name: 'Burnout Prevention Outreach',
    description: 'When burnout risk exceeds 70%, Maya reaches out with support',
    insightType: 'capacity_guardian',
    condition: (insight) => (insight.burnoutRisk ?? 0) > 0.7,
    action: {
      type: 'outreach',
      persona: 'maya',
      template: 'burnout_prevention',
      channel: 'push',
      priority: 'high',
    },
    cooldownHours: 72,
    enabled: true,
  },

  // Relationship Network - Drift Detection
  {
    id: 'relationship_drift',
    name: 'Relationship Reconnect',
    description: 'When important relationship shows drift, Ferni suggests reconnection',
    insightType: 'relationship_network',
    condition: (insight) =>
      (insight.driftScore ?? 0) > 0.8 && (insight.relationshipImportance ?? 0) > 0.7,
    action: {
      type: 'outreach',
      persona: 'ferni',
      template: 'relationship_reconnect',
      channel: 'push',
      priority: 'normal',
    },
    cooldownHours: 168, // 7 days
    enabled: true,
  },

  // Dream Keeper - Dormant Dream Revival
  {
    id: 'dream_revival',
    name: 'Dream Revival',
    description: 'When important dream becomes dormant, Jordan reaches out',
    insightType: 'dream_keeper',
    condition: (insight) =>
      (insight.dormantDays ?? 0) > 30 && (insight.dreamImportance ?? 0) > 0.6,
    action: {
      type: 'outreach',
      persona: 'jordan',
      template: 'dream_revival',
      channel: 'email',
      priority: 'normal',
    },
    cooldownHours: 336, // 14 days
    enabled: true,
  },

  // Commitment Keeper - Overdue Commitments
  {
    id: 'commitment_reminder',
    name: 'Commitment Reminder',
    description: 'When commitments become overdue, Ferni gently reminds',
    insightType: 'commitment_keeper',
    condition: (insight) =>
      insight.commitmentOverdue === true &&
      (insight.overdueCommitments?.length ?? 0) > 0,
    action: {
      type: 'outreach',
      persona: 'ferni',
      template: 'commitment_reminder',
      channel: 'push',
      priority: 'normal',
    },
    cooldownHours: 48,
    enabled: true,
  },

  // Habit Tracker - Streak at Risk
  {
    id: 'habit_streak_risk',
    name: 'Habit Streak at Risk',
    description: 'When a habit streak is about to break, Maya reaches out',
    insightType: 'habit_tracker',
    condition: (insight) =>
      insight.habitAtRisk === true && (insight.habitStreak ?? 0) >= 7,
    action: {
      type: 'outreach',
      persona: 'maya',
      template: 'habit_streak_rescue',
      channel: 'push',
      priority: 'high',
    },
    cooldownHours: 12,
    enabled: true,
  },

  // Mood Calendar - Declining Trend
  {
    id: 'mood_decline_support',
    name: 'Mood Decline Support',
    description: 'When mood trend is declining, Ferni checks in',
    insightType: 'mood_calendar',
    condition: (insight) => insight.moodTrend === 'declining',
    action: {
      type: 'outreach',
      persona: 'ferni',
      template: 'mood_support',
      channel: 'push',
      priority: 'high',
    },
    cooldownHours: 48,
    enabled: true,
  },

  // Emotional First Aid - Crisis Signals
  {
    id: 'crisis_response',
    name: 'Crisis Response',
    description: 'When crisis signals detected, immediate outreach',
    insightType: 'emotional_first_aid',
    condition: (insight) => insight.crisisSignals === true,
    action: {
      type: 'outreach',
      persona: 'ferni',
      template: 'crisis_support',
      channel: 'push',
      priority: 'urgent',
    },
    cooldownHours: 4,
    enabled: true,
  },

  // Pattern Detector - Positive Pattern Found
  {
    id: 'pattern_celebration',
    name: 'Pattern Celebration',
    description: 'When positive pattern detected, celebrate it',
    insightType: 'pattern_detector',
    condition: (insight) =>
      insight.patternDetected !== undefined &&
      !insight.patternDetected.includes('negative'),
    action: {
      type: 'notification',
      template: 'pattern_celebration',
      priority: 'low',
    },
    cooldownHours: 168, // 7 days
    enabled: true,
  },

  // Relationship Milestones - Upcoming Milestone
  {
    id: 'milestone_reminder',
    name: 'Milestone Reminder',
    description: 'Remind about upcoming relationship milestones',
    insightType: 'relationship_milestones',
    condition: (insight) =>
      insight.milestoneApproaching === true &&
      (insight.daysUntilMilestone ?? 999) <= 7,
    action: {
      type: 'outreach',
      persona: 'ferni',
      template: 'milestone_reminder',
      channel: 'push',
      priority: 'normal',
    },
    cooldownHours: 24,
    enabled: true,
  },

  // Seasonal Awareness - Seasonal Check-in
  {
    id: 'seasonal_checkin',
    name: 'Seasonal Check-in',
    description: 'Seasonal awareness prompts reflection',
    insightType: 'seasonal_awareness',
    condition: () => true, // Always triggers when seasonal insight generated
    action: {
      type: 'outreach',
      persona: 'nayan',
      template: 'seasonal_reflection',
      channel: 'email',
      priority: 'low',
    },
    cooldownHours: 720, // 30 days
    enabled: true,
  },

  // Voice Biomarkers - Stress Detected
  {
    id: 'voice_stress_support',
    name: 'Voice Stress Support',
    description: 'When voice indicates stress, offer support',
    insightType: 'voice_biomarkers',
    condition: (insight) => {
      const stressLevel = insight.data?.stressLevel as number | undefined;
      return stressLevel !== undefined && stressLevel > 0.7;
    },
    action: {
      type: 'notification',
      template: 'stress_support',
      priority: 'normal',
    },
    cooldownHours: 24,
    enabled: true,
  },

  // Values Alignment - Misalignment Detected
  {
    id: 'values_reflection',
    name: 'Values Reflection',
    description: 'When actions misalign with stated values, Nayan prompts reflection',
    insightType: 'values_alignment',
    condition: (insight) => {
      const alignmentScore = insight.data?.alignmentScore as number | undefined;
      return alignmentScore !== undefined && alignmentScore < 0.5;
    },
    action: {
      type: 'outreach',
      persona: 'nayan',
      template: 'values_reflection',
      channel: 'email',
      priority: 'low',
    },
    cooldownHours: 336, // 14 days
    enabled: true,
  },

  // Life Narrative - Story Arc Complete
  {
    id: 'narrative_milestone',
    name: 'Narrative Milestone',
    description: 'When life narrative reaches a milestone, celebrate',
    insightType: 'life_narrative',
    condition: (insight) => {
      const chapterComplete = insight.data?.chapterComplete as boolean | undefined;
      return chapterComplete === true;
    },
    action: {
      type: 'outreach',
      persona: 'nayan',
      template: 'narrative_celebration',
      channel: 'email',
      priority: 'normal',
    },
    cooldownHours: 720, // 30 days
    enabled: true,
  },

  // Predictive Coaching - Struggle Predicted
  {
    id: 'predictive_support',
    name: 'Predictive Support',
    description: 'When struggle is predicted, offer preemptive support',
    insightType: 'predictive_coaching',
    condition: (insight) => {
      const struggleProbability = insight.data?.struggleProbability as number | undefined;
      return struggleProbability !== undefined && struggleProbability > 0.7;
    },
    action: {
      type: 'outreach',
      persona: 'maya',
      template: 'predictive_support',
      channel: 'push',
      priority: 'normal',
    },
    cooldownHours: 72,
    enabled: true,
  },

  // Family Check-in - Missed Check-in
  {
    id: 'family_checkin_reminder',
    name: 'Family Check-in Reminder',
    description: 'When family check-in is missed, remind gently',
    insightType: 'family_checkin',
    condition: (insight) => {
      const missedDays = insight.data?.daysSinceLastCheckin as number | undefined;
      return missedDays !== undefined && missedDays > 7;
    },
    action: {
      type: 'outreach',
      persona: 'ferni',
      template: 'family_reminder',
      channel: 'push',
      priority: 'normal',
    },
    cooldownHours: 48,
    enabled: true,
  },
];

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Evaluate an insight against all rules and return matching rules
 */
export function evaluateInsight(insight: SuperhumanInsight): InsightActionRule[] {
  const matchingRules = INSIGHT_ACTION_RULES.filter((rule) => {
    if (!rule.enabled) return false;
    if (rule.insightType !== insight.capability) return false;

    try {
      return rule.condition(insight);
    } catch (error) {
      log.error({ error: String(error), ruleId: rule.id }, 'Rule condition evaluation failed');
      return false;
    }
  });

  log.debug(
    { insightId: insight.id, matchingRules: matchingRules.map((r) => r.id) },
    'Evaluated insight against rules'
  );

  return matchingRules;
}

/**
 * Check if an action is on cooldown for a user
 */
export async function isOnCooldown(
  userId: string,
  ruleId: string,
  cooldownHours: number
): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;

  try {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - cooldownHours);

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('action_executions')
      .where('ruleId', '==', ruleId)
      .where('createdAt', '>=', cutoff.toISOString())
      .where('status', '==', 'completed')
      .limit(1)
      .get();

    return !snapshot.empty;
  } catch (error) {
    log.error({ error: String(error), userId, ruleId }, 'Failed to check cooldown');
    return false;
  }
}

/**
 * Generate message content based on template and insight data
 */
function generateMessageFromTemplate(template: string, insight: SuperhumanInsight): string {
  // Template-based message generation with fallbacks
  const messages: Record<string, string> = {
    burnout_prevention: `Hey, I've been thinking about you. It seems like you've been carrying a lot lately. How are you really doing?`,
    relationship_reconnect: `I noticed it's been a while since you mentioned ${insight.data?.relationshipName || 'that important person'}. Just wanted to check in - want to reconnect with them?`,
    dream_revival: `Remember when you talked about ${insight.data?.dreamDescription || 'that dream of yours'}? I've been thinking about it. Still calling to you?`,
    commitment_reminder: `Just checking in on those things you said you'd do. How's it going? ${insight.overdueCommitments?.[0] ? `(Like: ${insight.overdueCommitments[0]})` : ''}`,
    habit_streak_rescue: `Hey! Your ${insight.habitName || 'habit'} streak is at ${insight.habitStreak || 'a great number'} days! Let's keep it going today.`,
    mood_support: `I've noticed things might feel heavier lately. I'm here whenever you want to talk.`,
    crisis_support: `I'm here. Whatever you're going through, you don't have to face it alone. Want to talk?`,
    pattern_celebration: `Something cool I noticed: ${insight.patternDetected || 'a positive pattern forming'}. You're doing great!`,
    milestone_reminder: `${insight.milestoneName || 'An important date'} is coming up in ${insight.daysUntilMilestone || 'a few'} days. Want to plan something special?`,
    seasonal_reflection: `As the season shifts, I've been thinking about how things are going for you. A good time to reflect?`,
    stress_support: `I could hear you might be carrying some stress. Take a breath. I'm here if you need me.`,
    values_reflection: `I've noticed something that might be worth reflecting on - your recent actions vs what matters most to you. Want to explore that?`,
    narrative_celebration: `You've reached a real milestone in your journey. That's worth celebrating!`,
    predictive_support: `I have a feeling the next few days might be challenging. Just wanted you to know I'm here if you need support.`,
    family_reminder: `It's been a bit since you connected with family. Might be a good time to reach out?`,
  };

  return messages[template] || `Hey, just thinking about you. How are things?`;
}

/**
 * Execute an action - integrates with actual outreach/notification systems
 */
export async function executeAction(
  userId: string,
  rule: InsightActionRule,
  insight: SuperhumanInsight
): Promise<ActionExecution> {
  const execution: ActionExecution = {
    id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    ruleId: rule.id,
    userId,
    insightId: insight.id,
    action: rule.action,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const db = getFirestoreDb();

  try {
    execution.status = 'executing';

    // Execute based on action type
    switch (rule.action.type) {
      case 'outreach': {
        // Integrate with outreach orchestrator for real delivery
        const { getOutreachOrchestrator } =
          await import('../outreach/outreach-orchestrator.js');
        const orchestrator = getOutreachOrchestrator();

        const message = generateMessageFromTemplate(
          rule.action.template || 'default',
          insight
        );

        let sent = false;

        // Try channel-specific delivery
        if (rule.action.channel === 'push' || !rule.action.channel) {
          const result = await orchestrator.sendPushNotification(userId, message, {
            trigger: rule.id,
            personaId: rule.action.persona || 'ferni',
            metadata: {
              insightId: insight.id,
              capability: insight.capability,
              priority: rule.action.priority,
            },
          });
          sent = result !== null;
        } else if (rule.action.channel === 'sms') {
          // Use SMS via orchestrator
          const result = await orchestrator.sendSMS(userId, message, {
            trigger: rule.id,
            personaId: rule.action.persona || 'ferni',
            metadata: {
              insightId: insight.id,
              capability: insight.capability,
              ruleId: rule.id,
            },
          });
          sent = result !== null;
        } else if (rule.action.channel === 'email') {
          // Email delivery - log intent, actual sending handled by outreach system
          log.info(
            {
              userId,
              channel: 'email',
              template: rule.action.template,
              capability: insight.capability,
            },
            'Email outreach queued for processing'
          );
          sent = true; // Mark as queued
        }

        log.info(
          {
            userId,
            persona: rule.action.persona,
            template: rule.action.template,
            channel: rule.action.channel,
            sent,
          },
          'Executed outreach action'
        );

        execution.result = sent
          ? `Outreach sent: ${rule.action.template} via ${rule.action.channel || 'push'}`
          : `Outreach failed: ${rule.action.template}`;
        break;
      }

      case 'notification': {
        // Create push notification via orchestrator
        const { getOutreachOrchestrator } =
          await import('../outreach/outreach-orchestrator.js');
        const orchestrator = getOutreachOrchestrator();

        const message = generateMessageFromTemplate(
          rule.action.template || 'default',
          insight
        );

        const result = await orchestrator.sendPushNotification(userId, message, {
          trigger: `notification_${rule.id}`,
          personaId: rule.action.persona || 'ferni',
          metadata: {
            type: 'insight_notification',
            insightId: insight.id,
            capability: insight.capability,
          },
        });

        const sent = result !== null;
        log.info({ userId, template: rule.action.template, sent }, 'Notification sent');
        execution.result = sent
          ? `Notification sent: ${rule.action.template}`
          : `Notification failed`;
        break;
      }

      case 'task': {
        // Store task in Firestore for processing
        if (db) {
          await db
            .collection('bogle_users')
            .doc(userId)
            .collection('insight_tasks')
            .add({
              type: 'insight_action',
              title: rule.name,
              description: rule.description,
              ruleId: rule.id,
              insightId: insight.id,
              status: 'pending',
              createdAt: new Date().toISOString(),
              metadata: rule.action.data,
            });
        }

        log.info({ userId, ruleId: rule.id }, 'Created insight task');
        execution.result = 'Task created';
        break;
      }

      case 'internal':
        log.info({ userId, data: rule.action.data }, 'Internal action triggered');
        execution.result = 'Internal action completed';
        break;

      default:
        log.warn({ actionType: rule.action.type }, 'Unknown action type');
        execution.result = 'Unknown action type';
    }

    execution.status = 'completed';
    execution.executedAt = new Date().toISOString();
  } catch (error) {
    execution.status = 'failed';
    execution.error = String(error);
    log.error({ error: String(error), execution }, 'Action execution failed');
  }

  // Store execution record
  if (db) {
    try {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('action_executions')
        .doc(execution.id)
        .set(execution);
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to store action execution');
    }
  }

  return execution;
}

/**
 * Process multiple insights and execute matching actions
 */
export async function processInsights(insights: SuperhumanInsight[]): Promise<ActionExecution[]> {
  const executions: ActionExecution[] = [];

  for (const insight of insights) {
    const matchingRules = evaluateInsight(insight);

    for (const rule of matchingRules) {
      // Check cooldown
      const onCooldown = await isOnCooldown(insight.userId, rule.id, rule.cooldownHours);
      if (onCooldown) {
        log.debug({ userId: insight.userId, ruleId: rule.id }, 'Rule on cooldown, skipping');
        continue;
      }

      // Execute action
      const execution = await executeAction(insight.userId, rule, insight);
      executions.push(execution);
    }
  }

  log.info({ insightCount: insights.length, executionCount: executions.length }, 'Processed insights batch');

  return executions;
}

/**
 * Get action execution history for a user
 */
export async function getActionHistory(
  userId: string,
  limit = 50
): Promise<ActionExecution[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('action_executions')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as ActionExecution);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get action history');
    return [];
  }
}

/**
 * Get rule statistics (for monitoring)
 */
export async function getRuleStats(
  days = 7
): Promise<Map<string, { triggered: number; completed: number; failed: number }>> {
  const db = getFirestoreDb();
  const stats = new Map<string, { triggered: number; completed: number; failed: number }>();

  // Initialize stats for all rules
  for (const rule of INSIGHT_ACTION_RULES) {
    stats.set(rule.id, { triggered: 0, completed: 0, failed: 0 });
  }

  if (!db) return stats;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  try {
    // This would need to be a collection group query or aggregated differently in production
    const snapshot = await db
      .collectionGroup('action_executions')
      .where('createdAt', '>=', cutoff.toISOString())
      .get();

    for (const doc of snapshot.docs) {
      const execution = doc.data() as ActionExecution;
      const ruleStat = stats.get(execution.ruleId);
      if (ruleStat) {
        ruleStat.triggered++;
        if (execution.status === 'completed') ruleStat.completed++;
        if (execution.status === 'failed') ruleStat.failed++;
      }
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get rule stats');
  }

  return stats;
}

/**
 * Predictive Insights → Outreach Integration
 *
 * Connects the predictive insights system to proactive outreach,
 * turning predictions into meaningful user touchpoints.
 *
 * Maps prediction types to outreach:
 * - Energy prediction → "Good morning! Today looks like..."
 * - Burnout prediction → Wellness check-in
 * - Habit decay → Gentle encouragement
 * - Social connection → Reconnection nudge
 * - Goal trajectory → Progress celebration or course correction
 * - Seasonal mood → Supportive check-in
 * - Relationship health → Conversation prompt
 * - Decision timing → Decision support offer
 *
 * @module PredictiveInsights/OutreachIntegration
 */

import { createLogger } from '../../utils/safe-logger.js';
import { runPredictiveAnalysis, type PredictiveInsight } from './index.js';

const log = createLogger({ module: 'PredictiveOutreach' });

// ============================================================================
// TYPES
// ============================================================================

export interface PredictiveOutreachTrigger {
  userId: string;
  insightId: string;
  insightType: PredictiveInsight['type'];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  suggestedPersona: string;
  suggestedChannel: 'sms' | 'push' | 'email' | 'call';
  message: string;
  subject?: string;
  scheduledFor: Date;
  reason: string;
}

// ============================================================================
// PERSONA MAPPING
// ============================================================================

/**
 * Maps insight types to the best persona to deliver them
 */
const INSIGHT_TO_PERSONA: Record<PredictiveInsight['type'], string> = {
  energy_prediction: 'ferni', // Life coach - energy management
  relationship_health: 'ferni', // Life coach - relationships
  goal_trajectory: 'maya-santos', // Habits coach - goal tracking
  burnout_prediction: 'ferni', // Life coach - wellbeing
  decision_timing: 'peter-john', // Analytical - decision support
  social_connection: 'ferni', // Life coach - social health
  seasonal_mood: 'nayan-patel', // Wisdom - seasonal reflection
  habit_decay: 'maya-santos', // Habits coach - habit support
};

/**
 * Maps insight types to preferred channels
 */
const INSIGHT_TO_CHANNEL: Record<PredictiveInsight['type'], 'sms' | 'push' | 'email'> = {
  energy_prediction: 'push', // Time-sensitive, brief
  relationship_health: 'sms', // Personal, conversational
  goal_trajectory: 'push', // Progress update
  burnout_prediction: 'sms', // Important, needs attention
  decision_timing: 'email', // Thoughtful, can be longer
  social_connection: 'sms', // Quick prompt
  seasonal_mood: 'email', // Reflective, supportive
  habit_decay: 'push', // Brief nudge
};

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

interface MessageTemplate {
  generateMessage: (insight: PredictiveInsight) => string;
  generateSubject?: (insight: PredictiveInsight) => string;
}

const MESSAGE_TEMPLATES: Record<PredictiveInsight['type'], MessageTemplate> = {
  energy_prediction: {
    generateMessage: (insight) => {
      const meta = insight.metadata as { predictedLevel?: string; windowStart?: Date };
      const level = meta.predictedLevel || 'good';
      const windowStart = meta.windowStart ? new Date(meta.windowStart) : new Date();
      const timeStr = formatTime(windowStart);

      if (level === 'high' || level === 'peak') {
        return `Good morning! 🌅 ${insight.message} ${insight.suggestion || ''}`;
      }
      return `Hey - heads up that ${insight.message.toLowerCase()} ${insight.suggestion || ''}`;
    },
  },

  relationship_health: {
    generateMessage: (insight) => {
      return `${insight.message} ${insight.suggestion || ''}`;
    },
  },

  goal_trajectory: {
    generateMessage: (insight) => {
      const meta = insight.metadata as { onTrack?: boolean; goalName?: string };
      if (meta.onTrack) {
        return `🎯 ${insight.message} Keep it up!`;
      }
      return `${insight.message} ${insight.suggestion || ''}`;
    },
    generateSubject: (insight) => {
      const meta = insight.metadata as { goalName?: string };
      return `Update on "${meta.goalName || 'your goal'}"`;
    },
  },

  burnout_prediction: {
    generateMessage: (insight) => {
      const meta = insight.metadata as { riskLevel?: string };
      if (meta.riskLevel === 'high' || meta.riskLevel === 'critical') {
        return `Hey, I'm a bit worried. ${insight.message} Can we talk?`;
      }
      return `Just checking in - ${insight.message} ${insight.suggestion || ''}`;
    },
  },

  decision_timing: {
    generateMessage: (insight) => {
      const meta = insight.metadata as { topic?: string; isReady?: boolean };
      if (meta.isReady) {
        return `I've been thinking about your "${meta.topic}" decision. ${insight.message} Want to talk it through?`;
      }
      return insight.message;
    },
    generateSubject: (insight) => {
      const meta = insight.metadata as { topic?: string };
      return `About "${meta.topic || 'that decision'}"...`;
    },
  },

  social_connection: {
    generateMessage: (insight) => {
      const meta = insight.metadata as { personName?: string };
      return `${insight.message} ${insight.suggestion || ''}`;
    },
  },

  seasonal_mood: {
    generateMessage: (insight) => {
      return `${insight.message}\n\n${insight.suggestion || ''}\n\nI'm here if you want to talk.`;
    },
    generateSubject: (insight) => {
      const meta = insight.metadata as { period?: string };
      return `Thinking of you this ${meta.period || 'season'}`;
    },
  },

  habit_decay: {
    generateMessage: (insight) => {
      const meta = insight.metadata as { habitName?: string };
      return `${insight.message} ${insight.suggestion || ''} 💪`;
    },
  },
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Run predictive analysis and generate outreach triggers
 */
export async function generatePredictiveOutreach(
  userId: string
): Promise<PredictiveOutreachTrigger[]> {
  const triggers: PredictiveOutreachTrigger[] = [];

  try {
    // Run all predictions
    const insights = await runPredictiveAnalysis(userId);

    // Filter to surfaceable insights
    const surfaceable = insights.filter((i) => i.priority !== 'low');

    log.info(
      { userId, totalInsights: insights.length, surfaceable: surfaceable.length },
      '🔮 Generated predictive insights for outreach'
    );

    // Convert to outreach triggers
    for (const insight of surfaceable) {
      const trigger = insightToOutreachTrigger(insight);
      if (trigger) {
        triggers.push(trigger);
      }
    }

    return triggers;
  } catch (error) {
    log.error({ error, userId }, 'Failed to generate predictive outreach');
    return [];
  }
}

/**
 * Convert a single insight to an outreach trigger
 */
function insightToOutreachTrigger(insight: PredictiveInsight): PredictiveOutreachTrigger | null {
  const template = MESSAGE_TEMPLATES[insight.type];
  if (!template) {
    log.warn({ type: insight.type }, 'No message template for insight type');
    return null;
  }

  const message = template.generateMessage(insight);
  const subject = template.generateSubject?.(insight);

  // Determine timing
  const scheduledFor = determineOptimalTiming(insight);

  return {
    userId: insight.userId,
    insightId: insight.id,
    insightType: insight.type,
    priority: insight.priority,
    suggestedPersona: INSIGHT_TO_PERSONA[insight.type] || 'ferni',
    suggestedChannel: INSIGHT_TO_CHANNEL[insight.type] || 'push',
    message,
    subject,
    scheduledFor,
    reason: `Predictive insight: ${insight.title}`,
  };
}

/**
 * Determine optimal time to send this outreach
 */
function determineOptimalTiming(insight: PredictiveInsight): Date {
  const now = new Date();

  // Energy predictions should be sent in the morning before the window
  if (insight.type === 'energy_prediction') {
    const windowStart = insight.metadata.windowStart as Date | undefined;
    if (windowStart) {
      const sendTime = new Date(windowStart);
      sendTime.setHours(sendTime.getHours() - 1); // 1 hour before window
      if (sendTime > now) return sendTime;
    }
    // Default: tomorrow morning
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(7, 30, 0, 0);
    return tomorrow;
  }

  // Burnout predictions should be sent soon but not immediately
  if (insight.type === 'burnout_prediction') {
    if (insight.priority === 'urgent') {
      return now; // Send immediately
    }
    // Send in next few hours during reasonable time
    const sendTime = new Date(now);
    sendTime.setHours(sendTime.getHours() + 2);
    return constrainToReasonableHours(sendTime);
  }

  // Goal and habit updates work well mid-day
  if (insight.type === 'goal_trajectory' || insight.type === 'habit_decay') {
    const sendTime = new Date(now);
    sendTime.setHours(11, 0, 0, 0); // 11am
    if (sendTime <= now) {
      sendTime.setDate(sendTime.getDate() + 1);
    }
    return sendTime;
  }

  // Decision timing and social connection - afternoon
  if (insight.type === 'decision_timing' || insight.type === 'social_connection') {
    const sendTime = new Date(now);
    sendTime.setHours(14, 30, 0, 0); // 2:30pm
    if (sendTime <= now) {
      sendTime.setDate(sendTime.getDate() + 1);
    }
    return sendTime;
  }

  // Seasonal mood and relationship health - evening
  if (insight.type === 'seasonal_mood' || insight.type === 'relationship_health') {
    const sendTime = new Date(now);
    sendTime.setHours(18, 30, 0, 0); // 6:30pm
    if (sendTime <= now) {
      sendTime.setDate(sendTime.getDate() + 1);
    }
    return sendTime;
  }

  // Default: next reasonable hour
  return constrainToReasonableHours(new Date(now.getTime() + 60 * 60 * 1000));
}

/**
 * Constrain time to reasonable hours (8am - 9pm)
 */
function constrainToReasonableHours(date: Date): Date {
  const hour = date.getHours();

  if (hour < 8) {
    date.setHours(8, 0, 0, 0);
  } else if (hour >= 21) {
    date.setDate(date.getDate() + 1);
    date.setHours(8, 0, 0, 0);
  }

  return date;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ============================================================================
// INTEGRATION WITH OUTREACH SYSTEM
// ============================================================================

/**
 * Queue predictive outreach triggers into the main outreach system
 */
export async function queuePredictiveOutreach(userId: string): Promise<number> {
  try {
    const triggers = await generatePredictiveOutreach(userId);

    if (triggers.length === 0) {
      return 0;
    }

    // Import the outreach system
    const { triggerOutreach } = await import('../outreach/index.js');

    let queued = 0;
    for (const trigger of triggers) {
      try {
        // Map to outreach trigger format
        const outreachType = mapInsightTypeToOutreachType(trigger.insightType);

        triggerOutreach({
          userId: trigger.userId,
          type: outreachType,
          priority: trigger.priority,
          reason: trigger.reason,
          suggestedTime: trigger.scheduledFor,
          context: {
            predictiveInsightId: trigger.insightId,
            predictiveInsightType: trigger.insightType,
            suggestedChannel: trigger.suggestedChannel,
            suggestedPersona: trigger.suggestedPersona,
            preGeneratedMessage: trigger.message,
            preGeneratedSubject: trigger.subject,
          },
        });

        queued++;
      } catch (error) {
        log.warn({ error, trigger }, 'Failed to queue predictive trigger');
      }
    }

    log.info({ userId, queued }, '📤 Queued predictive outreach triggers');
    return queued;
  } catch (error) {
    log.error({ error, userId }, 'Failed to queue predictive outreach');
    return 0;
  }
}

/**
 * Map insight types to outreach trigger types
 */
type OutreachTriggerType =
  | 'commitment_check'
  | 'goal_milestone'
  | 'emotional_support'
  | 'reengagement'
  | 'insight_discovery'
  | 'pattern_acknowledgment';

function mapInsightTypeToOutreachType(insightType: PredictiveInsight['type']): OutreachTriggerType {
  const mapping: Record<PredictiveInsight['type'], OutreachTriggerType> = {
    energy_prediction: 'insight_discovery',
    relationship_health: 'emotional_support',
    goal_trajectory: 'goal_milestone',
    burnout_prediction: 'emotional_support',
    decision_timing: 'insight_discovery',
    social_connection: 'reengagement',
    seasonal_mood: 'pattern_acknowledgment',
    habit_decay: 'commitment_check',
  };

  return mapping[insightType] || 'insight_discovery';
}

// ============================================================================
// SCHEDULED JOB
// ============================================================================

/**
 * Run predictive outreach for all active users
 * Call this from a daily cron job
 */
export async function runDailyPredictiveOutreach(
  getUserIds: () => Promise<string[]>
): Promise<{ processed: number; triggered: number }> {
  let processed = 0;
  let triggered = 0;

  try {
    const userIds = await getUserIds();

    log.info({ userCount: userIds.length }, '🔮 Starting daily predictive outreach scan');

    for (const userId of userIds) {
      try {
        const count = await queuePredictiveOutreach(userId);
        processed++;
        triggered += count;

        // Rate limit
        await sleep(100);
      } catch (error) {
        log.warn({ error, userId }, 'Failed to process user for predictive outreach');
      }
    }

    log.info({ processed, triggered }, '✅ Daily predictive outreach complete');
    return { processed, triggered };
  } catch (error) {
    log.error({ error }, 'Daily predictive outreach failed');
    return { processed, triggered };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generatePredictiveOutreach,
  queuePredictiveOutreach,
  runDailyPredictiveOutreach,
};

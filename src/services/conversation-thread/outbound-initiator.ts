/**
 * Outbound Initiator
 *
 * Enables any agent to initiate proactive outreach while maintaining
 * conversation thread continuity. This is the "agent reaches out" side
 * of bidirectional engagement.
 *
 * @module services/conversation-thread/outbound-initiator
 */

import { createLogger } from '../../utils/safe-logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { PersonaId } from '../../personas/types.js';
import type { EngagementChannel, OutreachInitiation } from './types.js';
import { getOrCreateThread, addMessage } from './thread-manager.js';
import {
  storeOutreachContext,
  type OutreachType,
} from '../outreach/conversation-context-bridge.js';

const log = createLogger({ module: 'OutboundInitiator' });

// ============================================================================
// TYPES
// ============================================================================

export interface InitiateOutreachOptions {
  /** User to reach out to */
  userId: string;
  /** Which agent is initiating */
  agentId: PersonaId;
  /** Channel to use (system may override if channel not available) */
  preferredChannel: EngagementChannel;
  /** Type of outreach */
  triggerType: OutreachType;
  /** Why we're reaching out */
  reason: string;
  /** Base message content (will be styled for agent voice) */
  messageContent: string;
  /** Priority for delivery */
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  /** Schedule for later? */
  scheduledFor?: Date;
  /** ML confidence if prediction-driven */
  mlConfidence?: number;
  /** Predicted emotional state */
  predictedEmotionalState?: string;
  /** Suggested follow-up topics */
  suggestedTopics?: string[];
}

export interface OutreachResult {
  success: boolean;
  outreachId: string;
  threadId: string;
  channel: EngagementChannel;
  message: string;
  scheduledFor?: Date;
  error?: string;
}

// ============================================================================
// OUTREACH INITIATION
// ============================================================================

/**
 * Initiate outreach from any agent.
 * This creates/continues a thread and queues the message for delivery.
 */
export async function initiateOutreach(options: InitiateOutreachOptions): Promise<OutreachResult> {
  const outreachId = uuidv4();

  try {
    // Get or create thread
    const thread = await getOrCreateThread(
      options.userId,
      options.preferredChannel,
      options.agentId,
      {
        triggerType: options.triggerType,
        outreachId,
      }
    );

    // Generate persona-styled message
    const styledMessage = await styleMessageForAgent(
      options.agentId,
      options.messageContent,
      options.preferredChannel
    );

    // Store outreach context for conversation bridge
    await storeOutreachContext({
      outreachId,
      userId: options.userId,
      type: options.triggerType,
      personaId: options.agentId,
      message: styledMessage,
      channel: mapChannelToOutreach(options.preferredChannel),
      sentAt: options.scheduledFor || new Date(),
      reason: options.reason,
      mlConfidence: options.mlConfidence,
      predictedEmotionalState: options.predictedEmotionalState,
      suggestedTopics: options.suggestedTopics,
    });

    // Add message to thread
    await addMessage(thread.id, {
      role: 'agent',
      agentId: options.agentId,
      channel: options.preferredChannel,
      direction: 'outbound',
      content: styledMessage,
      timestamp: options.scheduledFor || new Date(),
      metadata: {
        outreachId,
      },
    });

    // Queue for delivery
    const deliveryResult = await queueForDelivery(outreachId, {
      userId: options.userId,
      channel: options.preferredChannel,
      message: styledMessage,
      priority: options.priority || 'medium',
      scheduledFor: options.scheduledFor,
    });

    log.info(
      {
        outreachId,
        threadId: thread.id,
        userId: options.userId,
        agentId: options.agentId,
        channel: options.preferredChannel,
        triggerType: options.triggerType,
        scheduled: !!options.scheduledFor,
      },
      '📤 Outreach initiated'
    );

    return {
      success: true,
      outreachId,
      threadId: thread.id,
      channel: options.preferredChannel,
      message: styledMessage,
      scheduledFor: options.scheduledFor,
    };
  } catch (error) {
    log.error({ error, options }, 'Failed to initiate outreach');

    return {
      success: false,
      outreachId,
      threadId: '',
      channel: options.preferredChannel,
      message: '',
      error: String(error),
    };
  }
}

// ============================================================================
// AGENT-SPECIFIC OUTREACH PATTERNS
// ============================================================================

/**
 * Maya initiates habit support outreach.
 */
export async function mayaHabitOutreach(
  userId: string,
  options: {
    habitName: string;
    streakCount?: number;
    isEncouragement?: boolean;
    isReminder?: boolean;
  }
): Promise<OutreachResult> {
  let message: string;
  let triggerType: OutreachType;

  if (options.isEncouragement && options.streakCount) {
    message = `${options.streakCount} days of ${options.habitName}! That's real momentum.`;
    triggerType = 'celebration';
  } else if (options.isReminder) {
    message = `Just checking in about ${options.habitName}. How's it going?`;
    triggerType = 'habit_support';
  } else {
    message = `I noticed you've been working on ${options.habitName}. How can I support you today?`;
    triggerType = 'habit_support';
  }

  return initiateOutreach({
    userId,
    agentId: 'maya-santos',
    preferredChannel: 'sms',
    triggerType,
    reason: `Habit support for ${options.habitName}`,
    messageContent: message,
    priority: options.isReminder ? 'medium' : 'low',
  });
}

/**
 * Peter initiates research update outreach.
 */
export async function peterResearchOutreach(
  userId: string,
  options: {
    topic: string;
    insightSummary: string;
    source?: string;
  }
): Promise<OutreachResult> {
  const message = `Found something interesting about ${options.topic}: ${options.insightSummary}`;

  return initiateOutreach({
    userId,
    agentId: 'peter-john',
    preferredChannel: 'push',
    triggerType: 'follow_up',
    reason: `Research update on ${options.topic}`,
    messageContent: message,
    priority: 'low',
    suggestedTopics: [options.topic],
  });
}

/**
 * Jordan initiates milestone/celebration outreach.
 */
export async function jordanMilestoneOutreach(
  userId: string,
  options: {
    milestoneName: string;
    daysUntil?: number;
    celebrationContext?: string;
  }
): Promise<OutreachResult> {
  let message: string;
  let triggerType: OutreachType;

  if (options.daysUntil !== undefined && options.daysUntil > 0) {
    message = `${options.milestoneName} is coming up in ${options.daysUntil} days. Want to start planning?`;
    triggerType = 'hard_date';
  } else {
    message = `Today's ${options.milestoneName}! ${options.celebrationContext || "I hope it's wonderful."}`;
    triggerType = 'celebration';
  }

  return initiateOutreach({
    userId,
    agentId: 'jordan-bell',
    preferredChannel: 'push',
    triggerType,
    reason: `Milestone: ${options.milestoneName}`,
    messageContent: message,
    priority: options.daysUntil === 0 ? 'high' : 'medium',
  });
}

/**
 * Alex initiates communication support outreach.
 */
export async function alexCommunicationOutreach(
  userId: string,
  options: {
    context: string;
    urgency?: 'low' | 'medium' | 'high';
    draftReady?: boolean;
  }
): Promise<OutreachResult> {
  let message: string;

  if (options.draftReady) {
    message = `I've drafted something for ${options.context}. Want to review it?`;
  } else {
    message = `Need help with ${options.context}? I can help you find the right words.`;
  }

  return initiateOutreach({
    userId,
    agentId: 'alex-chen',
    preferredChannel: 'push',
    triggerType: 'follow_up',
    reason: `Communication support: ${options.context}`,
    messageContent: message,
    priority: options.urgency || 'low',
  });
}

/**
 * Nayan initiates reflection/wisdom outreach.
 */
export async function nayanWisdomOutreach(
  userId: string,
  options: {
    reflectionPrompt: string;
    context?: string;
  }
): Promise<OutreachResult> {
  return initiateOutreach({
    userId,
    agentId: 'nayan-patel',
    preferredChannel: 'push',
    triggerType: 'thinking_of_you',
    reason: 'Wisdom check-in',
    messageContent: options.reflectionPrompt,
    priority: 'low',
  });
}

/**
 * Ferni initiates coordinator check-in.
 */
export async function ferniCheckInOutreach(
  userId: string,
  options: {
    reason: string;
    emotionalState?: string;
    mlConfidence?: number;
  }
): Promise<OutreachResult> {
  const message = options.emotionalState
    ? `I've been thinking about you. How are you feeling?`
    : `Just wanted to check in. How are things going?`;

  return initiateOutreach({
    userId,
    agentId: 'ferni',
    preferredChannel: 'sms',
    triggerType: options.emotionalState ? 'ml_prediction' : 'thinking_of_you',
    reason: options.reason,
    messageContent: message,
    priority: options.emotionalState ? 'high' : 'medium',
    mlConfidence: options.mlConfidence,
    predictedEmotionalState: options.emotionalState,
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Style message content for a specific agent's voice.
 *
 * NOTE: Detailed styling is handled by the delivery services
 * (persona-voice-generator.ts). This function adds minimal
 * persona-specific touches for thread messages.
 */
async function styleMessageForAgent(
  _agentId: PersonaId,
  content: string,
  _channel: EngagementChannel
): Promise<string> {
  // For now, return content as-is
  // The delivery services (sms-delivery, email-delivery, etc.) handle
  // full persona voice styling when actually sending
  // This ensures thread messages capture the intent,
  // and delivery services apply final styling
  return content;
}

/**
 * Map our channel type to outreach channel type.
 */
function mapChannelToOutreach(
  channel: EngagementChannel
): 'sms' | 'push' | 'email' | 'voice_message' {
  switch (channel) {
    case 'voice':
      return 'voice_message';
    case 'in_app':
      return 'push';
    default:
      return channel as 'sms' | 'push' | 'email';
  }
}

/**
 * Queue message for delivery through appropriate channel.
 */
async function queueForDelivery(
  outreachId: string,
  options: {
    userId: string;
    channel: EngagementChannel;
    message: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    scheduledFor?: Date;
  }
): Promise<void> {
  // In production, this would:
  // 1. Check user preferences for this channel
  // 2. Check quiet hours
  // 3. Add to Cloud Tasks queue with appropriate delay
  // 4. Trigger appropriate delivery service (SMS, push, email)

  log.debug(
    {
      outreachId,
      channel: options.channel,
      priority: options.priority,
      scheduled: !!options.scheduledFor,
    },
    'Message queued for delivery'
  );

  // For now, just log - actual delivery handled by existing services
  // The existing outreach orchestrator can be called here
}

// ============================================================================
// EXPORTS
// ============================================================================

export const outboundInitiator = {
  initiateOutreach,
  mayaHabitOutreach,
  peterResearchOutreach,
  jordanMilestoneOutreach,
  alexCommunicationOutreach,
  nayanWisdomOutreach,
  ferniCheckInOutreach,
};

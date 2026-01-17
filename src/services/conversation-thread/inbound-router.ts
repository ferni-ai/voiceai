/**
 * Inbound Message Router
 *
 * Routes incoming messages (SMS replies, push taps, call-backs) to the
 * appropriate agent. This ensures bidirectional continuity - if Maya
 * sent an SMS about habits, the user's reply goes to Maya, not Ferni.
 *
 * Routing logic:
 * 1. If replying to recent outreach → same agent
 * 2. If active thread exists → thread owner
 * 3. If intent detected → specialized agent
 * 4. Default → Ferni (coordinator)
 *
 * @module services/conversation-thread/inbound-router
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { PersonaId } from '../../personas/types.js';
import type { EngagementChannel, InboundRouteDecision } from './types.js';
import { getActiveThread, getOrCreateThread, addMessage } from './thread-manager.js';
import { getConversationBridgeContext } from '../outreach/conversation-context-bridge.js';

const log = createLogger({ module: 'InboundRouter' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/** How long after outreach to route to same agent (ms) */
const OUTREACH_REPLY_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

/** Intent patterns for routing to specific agents */
const INTENT_ROUTING: Array<{
  patterns: RegExp[];
  agentId: PersonaId;
  confidence: number;
}> = [
  {
    // Habit/routine questions → Maya
    patterns: [
      /\b(habit|routine|morning|evening|workout|exercise|sleep|meditation)\b/i,
      /\b(track|streak|consistency|daily|weekly)\b/i,
    ],
    agentId: 'maya-santos',
    confidence: 0.85,
  },
  {
    // Research/learning → Peter
    patterns: [
      /\b(research|study|learn|book|article|podcast|course)\b/i,
      /\b(investing|stock|market|portfolio|compound)\b/i,
    ],
    agentId: 'peter-john',
    confidence: 0.85,
  },
  {
    // Planning/events → Jordan
    patterns: [
      /\b(plan|event|party|birthday|celebration|milestone)\b/i,
      /\b(schedule|calendar|deadline|upcoming)\b/i,
    ],
    agentId: 'jordan-bell',
    confidence: 0.8,
  },
  {
    // Communication → Alex
    patterns: [
      /\b(email|message|respond|reply|communicate|write)\b/i,
      /\b(meeting|presentation|pitch|proposal)\b/i,
    ],
    agentId: 'alex-chen',
    confidence: 0.8,
  },
  {
    // Deep reflection → Nayan
    patterns: [
      /\b(meaning|purpose|life|death|legacy|wisdom)\b/i,
      /\b(values|principles|philosophy|spiritual)\b/i,
    ],
    agentId: 'nayan-sharma',
    confidence: 0.85,
  },
];

// ============================================================================
// CORE ROUTING
// ============================================================================

/**
 * Route an inbound message to the appropriate agent.
 */
export async function routeInbound(
  userId: string,
  channel: EngagementChannel,
  content: string,
  options?: {
    /** If we know this is a reply to a specific outreach */
    outreachId?: string;
    /** Phone number (for SMS routing) */
    fromPhone?: string;
  }
): Promise<InboundRouteDecision> {
  log.debug({ userId, channel, contentLength: content.length }, 'Routing inbound message');

  // ─────────────────────────────────────────────────────────────────────────
  // STRATEGY 1: Route to same agent if replying to recent outreach
  // ─────────────────────────────────────────────────────────────────────────
  const bridgeContext = await getConversationBridgeContext(userId);

  if (bridgeContext && bridgeContext.isDirectResponse) {
    const agentId = bridgeContext.outreach.personaId as PersonaId;
    log.info(
      { userId, agentId, outreachId: bridgeContext.outreach.outreachId },
      '↩️ Routing reply to original outreach agent'
    );

    return {
      agentId,
      confidence: 0.95,
      reason: `Replying to ${agentId}'s recent outreach`,
      threadId: bridgeContext.outreach.outreachId,
      acknowledgeOutreach: true,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STRATEGY 2: Route to active thread owner
  // ─────────────────────────────────────────────────────────────────────────
  const activeThread = await getActiveThread(userId);

  if (activeThread) {
    log.info(
      { userId, agentId: activeThread.currentOwnerId, threadId: activeThread.id },
      '🧵 Routing to active thread owner'
    );

    return {
      agentId: activeThread.currentOwnerId,
      confidence: 0.9,
      reason: `Continuing active thread with ${activeThread.currentOwnerId}`,
      threadId: activeThread.id,
      acknowledgeOutreach: false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STRATEGY 3: Route by intent detection
  // ─────────────────────────────────────────────────────────────────────────
  const intentRoute = detectIntentRoute(content);

  if (intentRoute && intentRoute.confidence > 0.75) {
    log.info(
      { userId, agentId: intentRoute.agentId, confidence: intentRoute.confidence },
      '🎯 Routing by intent detection'
    );

    return {
      agentId: intentRoute.agentId,
      confidence: intentRoute.confidence,
      reason: `Message intent matches ${intentRoute.agentId}'s specialty`,
      acknowledgeOutreach: false,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FALLBACK: Route to Ferni (coordinator)
  // ─────────────────────────────────────────────────────────────────────────
  log.info({ userId }, '🌱 Routing to Ferni (default coordinator)');

  return {
    agentId: 'ferni',
    confidence: 0.7,
    reason: 'Default routing to Ferni as coordinator',
    acknowledgeOutreach: false,
  };
}

/**
 * Detect intent from message content for routing.
 */
function detectIntentRoute(content: string): { agentId: PersonaId; confidence: number } | null {
  if (!content || content.length < 3) {
    return null;
  }

  let bestMatch: { agentId: PersonaId; confidence: number } | null = null;
  let highestScore = 0;

  for (const route of INTENT_ROUTING) {
    let matchCount = 0;

    for (const pattern of route.patterns) {
      if (pattern.test(content)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      // Adjust confidence based on match count
      const score = route.confidence * Math.min(matchCount / 2, 1);

      if (score > highestScore) {
        highestScore = score;
        bestMatch = { agentId: route.agentId, confidence: score };
      }
    }
  }

  return bestMatch;
}

// ============================================================================
// CHANNEL-SPECIFIC HANDLERS
// ============================================================================

/**
 * Handle inbound SMS reply.
 * Call this from Twilio webhook.
 */
export async function handleInboundSMS(
  userId: string,
  fromPhone: string,
  body: string
): Promise<{
  routeDecision: InboundRouteDecision;
  shouldInitiateCall: boolean;
  responseMessage?: string;
}> {
  // Route the message
  const routeDecision = await routeInbound(userId, 'sms', body, { fromPhone });

  // Check if user wants to talk
  const callIntent = detectCallIntent(body);

  // Get or create thread
  const thread = await getOrCreateThread(userId, 'sms', routeDecision.agentId, {
    triggerType: routeDecision.acknowledgeOutreach ? 'reply_to_outreach' : 'user_initiated',
  });

  // Record message
  await addMessage(thread.id, {
    role: 'user',
    channel: 'sms',
    direction: 'inbound',
    content: body,
    timestamp: new Date(),
    metadata: {
      sentiment: detectSentiment(body),
    },
  });

  log.info(
    {
      userId,
      threadId: thread.id,
      agentId: routeDecision.agentId,
      callIntent,
    },
    '📥 Inbound SMS processed'
  );

  return {
    routeDecision,
    shouldInitiateCall: callIntent,
    responseMessage: callIntent ? `I'd love to talk. Let me call you now...` : undefined,
  };
}

/**
 * Handle push notification tap.
 * Call this when user taps notification in app.
 */
export async function handlePushTap(
  userId: string,
  notificationData: {
    outreachId?: string;
    agentId?: PersonaId;
    action?: 'open' | 'call' | 'reply';
  }
): Promise<InboundRouteDecision> {
  // If we know the agent from notification data, route directly
  if (notificationData.agentId) {
    return {
      agentId: notificationData.agentId,
      confidence: 0.95,
      reason: 'Direct from notification metadata',
      threadId: notificationData.outreachId,
      acknowledgeOutreach: !!notificationData.outreachId,
    };
  }

  // Otherwise use standard routing
  return routeInbound(userId, 'push', '', {
    outreachId: notificationData.outreachId,
  });
}

/**
 * Handle voice call initiation.
 * Call this when user starts a voice call from app.
 */
export async function handleVoiceCallStart(
  userId: string,
  options?: {
    requestedAgentId?: PersonaId;
    fromNotification?: boolean;
    outreachId?: string;
  }
): Promise<InboundRouteDecision> {
  // If user explicitly requested an agent
  if (options?.requestedAgentId) {
    return {
      agentId: options.requestedAgentId,
      confidence: 1.0,
      reason: `User explicitly requested ${options.requestedAgentId}`,
      acknowledgeOutreach: !!options?.outreachId,
    };
  }

  // If coming from notification with outreach context
  if (options?.fromNotification && options?.outreachId) {
    const bridgeContext = await getConversationBridgeContext(userId);

    if (bridgeContext) {
      return {
        agentId: bridgeContext.outreach.personaId as PersonaId,
        confidence: 0.95,
        reason: 'Calling back from notification',
        acknowledgeOutreach: true,
      };
    }
  }

  // Check for active thread
  const activeThread = await getActiveThread(userId);

  if (activeThread) {
    return {
      agentId: activeThread.currentOwnerId,
      confidence: 0.9,
      reason: 'Continuing active thread',
      threadId: activeThread.id,
      acknowledgeOutreach: false,
    };
  }

  // Default to Ferni
  return {
    agentId: 'ferni',
    confidence: 0.8,
    reason: 'New conversation with Ferni',
    acknowledgeOutreach: false,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect if message indicates user wants a voice call.
 */
function detectCallIntent(message: string): boolean {
  const callPhrases = [
    /\bcall\s+me\b/i,
    /\bcan\s+we\s+talk\b/i,
    /\bwant\s+to\s+talk\b/i,
    /\bneed\s+to\s+talk\b/i,
    /\blet'?s\s+talk\b/i,
    /\bcall\s+back\b/i,
    /\bgive\s+me\s+a\s+call\b/i,
    /\bring\s+me\b/i,
    /\bphone\s+me\b/i,
    /^(yes|ok|sure|please)$/i,
    /\bi'?d\s+like\s+that\b/i,
  ];

  return callPhrases.some((pattern) => pattern.test(message.trim()));
}

/**
 * Simple sentiment detection.
 */
function detectSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const positive =
    /\b(thanks|thank|great|awesome|love|yes|sure|ok|okay|perfect|wonderful|amazing|good|happy|excited)\b/i;
  const negative =
    /\b(no|stop|don't|hate|bad|terrible|awful|annoyed|angry|frustrated|sad|upset|worried)\b/i;

  if (positive.test(text)) return 'positive';
  if (negative.test(text)) return 'negative';
  return 'neutral';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const inboundRouter = {
  routeInbound,
  handleInboundSMS,
  handlePushTap,
  handleVoiceCallStart,
  detectIntentRoute,
};

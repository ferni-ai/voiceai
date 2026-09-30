/**
 * Twilio Webhook Handlers
 *
 * Handles incoming webhooks from Twilio for:
 * - SMS status updates (queued, sent, delivered, failed)
 * - SMS replies (inbound messages)
 * - Call status updates (initiated, ringing, answered, completed)
 * - Voicemail detection
 */

import { getLogger } from '../../../utils/safe-logger.js';
import { recordResponseEvent } from '../analytics.js';
import { markResponded, updateDeliveryStatus } from '../delivery/delivery-tracker.js';
import { handleSMSStatus } from '../delivery/sms-delivery.js';
import {
  firestoreThreadStore,
  geminiReplyGenerator,
  handleContactReply,
} from '../contact-sms-conversation.js';
import { findContactByPhone, markContactResponded } from '../../contacts/optimal-timing.js';
// Bidirectional engagement - route replies to the right agent
import { handleInboundSMS as routeInboundSMS } from '../../conversation-thread/inbound-router.js';
import {
  calculateEngagement,
  detectSentiment,
  findUserByPhone,
  generateTwiML,
  updateSmsOptStatus,
} from './twilio-webhook-helpers.js';
import { initializeTwilioWebhooks, validateTwilioSignature } from './twilio-signature.js';
import { handleCallStatusWebhook, handleVoicemailWebhook } from './twilio-call-webhooks.js';
import type {
  InboundMessage,
  InboundMessageHandler,
  TwilioInboundSMSPayload,
  TwilioSMSStatusPayload,
} from './twilio-webhook-types.js';

// Re-exports: moved to sibling modules, kept here for backward-compatible imports
export type {
  TwilioSMSStatusPayload,
  TwilioInboundSMSPayload,
  TwilioCallStatusPayload,
  InboundMessage,
} from './twilio-webhook-types.js';
export {
  initializeTwilioWebhooks,
  twilioSignedUrls,
  validateTwilioSignature,
} from './twilio-signature.js';
export { handleCallStatusWebhook, handleVoicemailWebhook } from './twilio-call-webhooks.js';

const log = getLogger().child({ module: 'twilio-webhooks' });

// ============================================================================
// STATE
// ============================================================================

const inboundHandlers: InboundMessageHandler[] = [];
const recentInbound = new Map<string, InboundMessage>();

/**
 * Register handler for inbound messages
 */
export function onInboundMessage(handler: InboundMessageHandler): void {
  inboundHandlers.push(handler);
}

// ============================================================================
// SMS STATUS WEBHOOK
// ============================================================================

/**
 * Handle SMS status webhook from Twilio
 *
 * Statuses: queued, failed, sent, delivered, undelivered, receiving, received, read
 */
export async function handleSMSStatusWebhook(
  payload: TwilioSMSStatusPayload,
  signature?: string,
  url?: string | string[]
): Promise<{ success: boolean; twiml?: string }> {
  // ALWAYS validate Twilio signature (skip only in test environment with explicit flag)
  const skipValidation =
    process.env.SKIP_TWILIO_VALIDATION === 'true' && process.env.NODE_ENV === 'test';
  if (!skipValidation) {
    if (!signature || !url) {
      log.warn({ messageSid: payload.MessageSid }, 'Missing Twilio signature or URL');
      return { success: false };
    }
    const isValid = validateTwilioSignature(
      signature,
      url,
      payload as unknown as Record<string, string>
    );
    if (!isValid) {
      log.warn({ messageSid: payload.MessageSid }, 'Invalid Twilio signature');
      return { success: false };
    }
  }

  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = payload;

  log.debug({ MessageSid, MessageStatus, ErrorCode }, 'SMS status webhook received');

  // Update SMS delivery service
  handleSMSStatus(MessageSid, MessageStatus, ErrorCode, ErrorMessage);

  // Update unified delivery tracker
  let deliveryStatus: 'sent' | 'delivered' | 'failed' | 'bounced' = 'sent';
  switch (MessageStatus) {
    case 'delivered':
    case 'read':
      deliveryStatus = 'delivered';
      break;
    case 'failed':
    case 'undelivered':
      deliveryStatus = 'failed';
      break;
  }

  updateDeliveryStatus(MessageSid, deliveryStatus, {
    errorCode: ErrorCode,
    errorMessage: ErrorMessage,
  });

  return { success: true };
}

// ============================================================================
// INBOUND SMS WEBHOOK
// ============================================================================

/**
 * Handle inbound SMS (user reply)
 */
export async function handleInboundSMSWebhook(
  payload: TwilioInboundSMSPayload,
  signature?: string,
  url?: string | string[]
): Promise<{ success: boolean; twiml?: string }> {
  // ALWAYS validate Twilio signature (skip only in test environment with explicit flag)
  const skipValidation =
    process.env.SKIP_TWILIO_VALIDATION === 'true' && process.env.NODE_ENV === 'test';
  if (!skipValidation) {
    if (!signature || !url) {
      log.warn({ messageSid: payload.MessageSid }, 'Missing Twilio signature or URL');
      return { success: false };
    }
    const isValid = validateTwilioSignature(
      signature,
      url,
      payload as unknown as Record<string, string>
    );
    if (!isValid) {
      log.warn({ messageSid: payload.MessageSid }, 'Invalid Twilio signature');
      return { success: false };
    }
  }

  const { MessageSid, Body, From, NumMedia } = payload;

  log.info({ MessageSid, From, bodyLength: Body.length }, '📥 Inbound SMS received');

  // Check for opt-out
  const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'quit', 'end'];
  const normalizedBody = Body.toLowerCase().trim();

  if (optOutKeywords.includes(normalizedBody)) {
    log.info({ From }, '🚫 User opted out via SMS');
    // Update user preferences to disable SMS outreach
    await updateSmsOptStatus(From, false);
    return {
      success: true,
      twiml: generateTwiML(
        "You've been unsubscribed from Ferni messages. Reply START to resubscribe."
      ),
    };
  }

  // Check for opt-in
  if (normalizedBody === 'start') {
    log.info({ From }, '✅ User opted back in via SMS');
    // Update user preferences to enable SMS outreach
    await updateSmsOptStatus(From, true);
    return {
      success: true,
      twiml: generateTwiML("Welcome back! You'll receive messages from Ferni again. 🌱"),
    };
  }

  // Collect media URLs
  const mediaUrls: string[] = [];
  const numMedia = parseInt(NumMedia, 10) || 0;
  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = (payload as unknown as Record<string, string>)[`MediaUrl${i}`];
    if (mediaUrl) {
      mediaUrls.push(mediaUrl);
    }
  }

  // Create inbound message record
  const message: InboundMessage = {
    id: MessageSid,
    from: From,
    body: Body,
    receivedAt: new Date(),
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
  };

  // Store for deduplication
  recentInbound.set(MessageSid, message);

  // Notify handlers
  for (const handler of inboundHandlers) {
    try {
      await handler(message);
    } catch (error) {
      log.error({ error, handler: handler.name }, 'Inbound message handler error');
    }
  }

  // Look up userId from phone number for proper attribution
  const userProfile = await findUserByPhone(From);
  const userId = userProfile?.id || 'unknown';

  // Mark as responded in delivery tracker
  markResponded(userId, 'sms');

  // Find the most recent outreach to this user to calculate response time and get outreach ID
  const { getUserDeliveries } = await import('../delivery/delivery-tracker.js');
  const recentDeliveries = getUserDeliveries(userId, 10);
  const matchingDelivery = recentDeliveries.find(
    (d) => d.channel === 'sms' && d.status !== 'failed' && d.status !== 'responded'
  );

  const outreachId = matchingDelivery?.outreachId || 'unknown';
  const responseTime = matchingDelivery?.sentAt
    ? Date.now() - matchingDelivery.sentAt.getTime()
    : 0;

  // Record response event for analytics
  recordResponseEvent({
    outreachId,
    userId,
    responseType: 'reply',
    responseTime,
    sentiment: detectSentiment(Body),
    engagementScore:
      calculateEngagement(Body) === 'high' ? 9 : calculateEngagement(Body) === 'medium' ? 6 : 3,
  });

  if (userId !== 'unknown') {
    log.info({ userId, from: From }, 'SMS response attributed to user');
  }

  // =========================================================================
  // ML TIMING LEARNING - Check if this is a response from a known contact
  // =========================================================================
  // If the inbound message is from a phone number we've sent TO (a contact),
  // update the ML timing model to record that they responded.
  try {
    const contactLookup = await findContactByPhone(From);
    if (contactLookup) {
      const mlResult = await markContactResponded(
        contactLookup.userId,
        contactLookup.contactId,
        new Date()
      );

      if (mlResult.updated) {
        log.info(
          {
            contactId: contactLookup.contactId,
            contactName: contactLookup.contactName,
            userId: contactLookup.userId,
          },
          '📊 ML timing model updated - contact responded to outreach'
        );
      }
    }
  } catch (mlError) {
    // Don't fail the webhook if ML tracking fails
    log.warn(
      { error: String(mlError), from: From },
      'Failed to update ML timing for contact response'
    );
  }

  // =========================================================================
  // CONTACT CONVERSATION - a contact Ferni texted is replying (e.g. mom)
  // =========================================================================
  try {
    const threadStore = firestoreThreadStore();
    if (threadStore) {
      const reply = await handleContactReply(threadStore, geminiReplyGenerator, From, Body);
      if (reply) {
        return { success: true, twiml: generateTwiML(reply) };
      }
    }
  } catch (threadError) {
    log.warn({ error: String(threadError) }, 'Contact SMS conversation failed');
  }

  // =========================================================================
  // BIDIRECTIONAL ROUTING - Route to appropriate agent
  // =========================================================================
  if (userId !== 'unknown') {
    try {
      const routeResult = await routeInboundSMS(userId, From, Body);

      log.info(
        {
          userId,
          routedToAgent: routeResult.routeDecision.agentId,
          confidence: routeResult.routeDecision.confidence,
          shouldInitiateCall: routeResult.shouldInitiateCall,
        },
        '🔀 SMS routed to agent'
      );

      // If user wants a call, we could trigger one here
      // For now, just track the routing decision
      if (routeResult.shouldInitiateCall && routeResult.responseMessage) {
        return {
          success: true,
          twiml: generateTwiML(routeResult.responseMessage),
        };
      }
    } catch (routeError) {
      log.warn({ error: String(routeError), userId }, 'Failed to route inbound SMS');
      // Continue with default handling
    }
  }

  // Auto-reply (optional)
  // For now, don't auto-reply to avoid confusion
  return { success: true };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get recent inbound messages
 */
export function getRecentInbound(limit = 50): InboundMessage[] {
  return Array.from(recentInbound.values())
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .slice(0, limit);
}

/**
 * Clear old inbound messages
 */
export function clearOldInbound(maxAgeHours = 24): number {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - maxAgeHours);

  let cleared = 0;
  for (const [id, msg] of recentInbound) {
    if (msg.receivedAt < cutoff) {
      recentInbound.delete(id);
      cleared++;
    }
  }

  return cleared;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const twilioWebhooks = {
  initialize: initializeTwilioWebhooks,
  onInboundMessage,
  validateSignature: validateTwilioSignature,
  handleSMSStatus: handleSMSStatusWebhook,
  handleInboundSMS: handleInboundSMSWebhook,
  handleCallStatus: handleCallStatusWebhook,
  handleVoicemail: handleVoicemailWebhook,
  getRecentInbound,
  clearOldInbound,
};

/**
 * Send Message on Behalf - Autonomous Messaging with Approval Flow
 *
 * Allows Ferni to send messages (SMS, email) on the user's behalf.
 * Uses the trust level system to determine when to ask for approval.
 *
 * Key Principle: User ALWAYS sees the message before it's sent for new actions.
 * Once they've approved several similar messages, Ferni can send autonomously.
 *
 * @module services/automation/send-on-behalf
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import {
  checkActionPermission,
  markActionExecuted,
  type ActionPreview,
} from './trust-level-system.js';

const log = createLogger({ module: 'SendOnBehalf' });

// ============================================================================
// Types
// ============================================================================

export type MessageChannel = 'sms' | 'email';

export interface SendMessageRequest {
  userId: string;
  channel: MessageChannel;
  recipient: {
    name: string;
    phone?: string;
    email?: string;
  };
  message: string;
  context?: string; // Why is Ferni sending this?
  metadata?: Record<string, unknown>;
}

export interface SendMessageResult {
  success: boolean;
  requiresApproval: boolean;
  pendingActionId?: string;
  preview?: ActionPreview;
  messageId?: string;
  error?: string;
}

export interface MessageHistory {
  id: string;
  userId: string;
  channel: MessageChannel;
  recipientName: string;
  recipientContact: string;
  message: string;
  context?: string;
  status: 'pending' | 'sent' | 'failed' | 'rejected';
  sentAt?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Message Generation Helpers
// ============================================================================

/**
 * Generate a preview for a message
 */
function generateMessagePreview(request: SendMessageRequest): ActionPreview {
  const channelLabel = request.channel === 'sms' ? 'text message' : 'email';
  const contactLabel = request.recipient.phone || request.recipient.email || 'contact';

  return {
    title: `Send ${channelLabel} to ${request.recipient.name}`,
    summary: request.message,
    details: [
      `To: ${request.recipient.name} (${contactLabel})`,
      `Via: ${request.channel.toUpperCase()}`,
      ...(request.context ? [`Reason: ${request.context}`] : []),
    ],
    canUndo: false, // Can't unsend messages
    affectedParties: [request.recipient.name],
  };
}

/**
 * Validate a message request
 */
function validateMessageRequest(request: SendMessageRequest): string | null {
  if (!request.userId) {
    return 'userId is required';
  }

  if (!request.recipient) {
    return 'recipient is required';
  }

  if (!request.recipient.name) {
    return 'recipient.name is required';
  }

  if (request.channel === 'sms' && !request.recipient.phone) {
    return 'recipient.phone is required for SMS';
  }

  if (request.channel === 'email' && !request.recipient.email) {
    return 'recipient.email is required for email';
  }

  if (!request.message || request.message.trim().length === 0) {
    return 'message is required';
  }

  if (request.message.length > 1600) {
    return 'message too long (max 1600 characters)';
  }

  return null;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Request to send a message on behalf of the user
 *
 * This checks trust level and either:
 * 1. Sends immediately (if trusted)
 * 2. Returns a pending action for approval
 */
export async function sendMessageOnBehalf(request: SendMessageRequest): Promise<SendMessageResult> {
  // Validate request
  const validationError = validateMessageRequest(request);
  if (validationError) {
    return { success: false, requiresApproval: false, error: validationError };
  }

  const actionType = request.channel === 'sms' ? 'send_sms' : 'send_email';
  const preview = generateMessagePreview(request);

  // Check permission via trust level system
  const permissionResult = await checkActionPermission(request.userId, actionType, preview);

  if (!permissionResult.success) {
    return {
      success: false,
      requiresApproval: false,
      error: permissionResult.error,
    };
  }

  // If requires approval, return the pending action
  if (permissionResult.requiresApproval) {
    // Store the message request for later execution
    await storeMessageRequest(request, permissionResult.pendingActionId!);

    return {
      success: true,
      requiresApproval: true,
      pendingActionId: permissionResult.pendingActionId,
      preview,
    };
  }

  // Trusted - send immediately
  const sendResult = await executeMessageSend(request);

  if (sendResult.success) {
    // Mark action as executed for trust tracking
    await markActionExecuted(request.userId, permissionResult.actionId);
  }

  return {
    success: sendResult.success,
    requiresApproval: false,
    messageId: sendResult.messageId,
    error: sendResult.error,
  };
}

/**
 * Execute a message send after approval
 */
export async function executeApprovedMessage(
  userId: string,
  pendingActionId: string
): Promise<SendMessageResult> {
  // Get stored message request
  const request = await getStoredMessageRequest(userId, pendingActionId);

  if (!request) {
    return {
      success: false,
      requiresApproval: false,
      error: 'Message request not found',
    };
  }

  // Execute the send
  const result = await executeMessageSend(request);

  // Mark action as executed
  if (result.success) {
    await markActionExecuted(userId, pendingActionId);
  }

  return {
    ...result,
    requiresApproval: false, // Already approved at this point
  };
}

/**
 * Store a message request for later execution (after approval)
 */
async function storeMessageRequest(
  request: SendMessageRequest,
  pendingActionId: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(request.userId)
      .collection('pending_messages')
      .doc(pendingActionId)
      .set({
        ...request,
        createdAt: new Date().toISOString(),
      });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to store message request');
  }
}

/**
 * Get a stored message request
 */
async function getStoredMessageRequest(
  userId: string,
  pendingActionId: string
): Promise<SendMessageRequest | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pending_messages')
      .doc(pendingActionId)
      .get();

    if (!doc.exists) return null;
    return doc.data() as SendMessageRequest;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get stored message');
    return null;
  }
}

/**
 * Actually send the message
 */
async function executeMessageSend(
  request: SendMessageRequest
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (request.channel === 'sms') {
      return await sendSms(request);
    } else if (request.channel === 'email') {
      return await sendEmail(request);
    }

    return { success: false, error: 'Unknown channel' };
  } catch (error) {
    log.error({ error: String(error), request }, 'Message send failed');
    return { success: false, error: String(error) };
  }
}

/**
 * Send SMS via Twilio
 */
async function sendSms(
  request: SendMessageRequest
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Import Twilio SMS service
    const { sendSMS } = await import('../twilio-sms.js');

    // Get user's verified sender info
    const db = getFirestoreDb();
    let fromName = 'Ferni';

    if (db) {
      const userDoc = await db.collection('bogle_users').doc(request.userId).get();
      if (userDoc.exists) {
        fromName = userDoc.data()?.displayName || 'Ferni';
      }
    }

    // Send the message
    const messageId = await sendSMS(
      request.recipient.phone!,
      `[From ${fromName} via Ferni] ${request.message}`
    );
    const result = { success: messageId !== null, messageId: messageId ?? undefined };

    if (result.success) {
      // Record in message history
      await recordMessageHistory(request, 'sent', result.messageId);

      log.info(
        {
          userId: request.userId,
          recipientName: request.recipient.name,
          messageId: result.messageId,
        },
        'SMS sent on behalf of user'
      );

      return { success: true, messageId: result.messageId };
    }

    return { success: false, error: 'SMS delivery failed' };
  } catch (error) {
    log.error({ error: String(error) }, 'SMS send failed');
    return { success: false, error: 'SMS service unavailable' };
  }
}

/**
 * Send email via SendGrid
 */
async function sendEmail(
  request: SendMessageRequest
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { sendEmail: deliverEmail, isEmailDeliveryAvailable } =
      await import('../outreach/delivery/email-delivery.js');

    if (!isEmailDeliveryAvailable()) {
      return { success: false, error: 'Email service not configured' };
    }

    // Get user info for "from" name
    const db = getFirestoreDb();
    let fromName = 'Ferni';
    let userEmail = '';

    if (db) {
      const userDoc = await db.collection('bogle_users').doc(request.userId).get();
      if (userDoc.exists) {
        fromName = userDoc.data()?.displayName || 'Ferni';
        userEmail = userDoc.data()?.email || '';
      }
    }

    // Send the email
    const result = await deliverEmail({
      to: request.recipient.email!,
      toName: request.recipient.name,
      subject: request.context || `Message from ${fromName}`,
      body: request.message,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <p>${request.message.replace(/\n/g, '<br>')}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            Sent by ${fromName} via Ferni<br>
            ${userEmail ? `Reply to: ${userEmail}` : ''}
          </p>
        </div>
      `,
      userId: request.userId,
      personaId: 'ferni',
      outreachId: `send_behalf_${Date.now()}`,
    });

    if (result.success) {
      // Record in message history
      await recordMessageHistory(request, 'sent', result.messageId);

      log.info(
        {
          userId: request.userId,
          recipientName: request.recipient.name,
          messageId: result.messageId,
        },
        'Email sent on behalf of user'
      );

      return { success: true, messageId: result.messageId };
    }

    return { success: false, error: 'Email delivery failed' };
  } catch (error) {
    log.error({ error: String(error) }, 'Email send failed');
    return { success: false, error: 'Email service unavailable' };
  }
}

/**
 * Record message in history
 */
async function recordMessageHistory(
  request: SendMessageRequest,
  status: MessageHistory['status'],
  messageId?: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  const history: MessageHistory = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    userId: request.userId,
    channel: request.channel,
    recipientName: request.recipient.name,
    recipientContact: request.recipient.phone || request.recipient.email || '',
    message: request.message,
    context: request.context,
    status,
    sentAt: status === 'sent' ? new Date().toISOString() : undefined,
    createdAt: new Date().toISOString(),
    metadata: {
      ...request.metadata,
      externalMessageId: messageId,
    },
  };

  try {
    await db
      .collection('bogle_users')
      .doc(request.userId)
      .collection('message_history')
      .doc(history.id)
      .set(history);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to record message history');
  }
}

/**
 * Get message history for a user
 */
export async function getMessageHistory(userId: string, limit = 50): Promise<MessageHistory[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('message_history')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as MessageHistory);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get message history');
    return [];
  }
}

// ============================================================================
// Exports
// ============================================================================

export const sendOnBehalf = {
  sendMessage: sendMessageOnBehalf,
  executeApproved: executeApprovedMessage,
  getHistory: getMessageHistory,
};

export default sendOnBehalf;

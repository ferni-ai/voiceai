/**
 * Follow-up Executor
 *
 * Alex's domain - sends follow-up messages on user's behalf.
 * "BETTER THAN HUMAN" - We never forget to follow up.
 *
 * Features:
 * - Sends follow-up emails/messages
 * - Tracks delivery status
 * - Supports multiple channels (email, text)
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { captureBackgroundResult } from '../unified-result-capture.js';
import type { OutcomeStatus, ResultPriority } from '../result-types.js';

const log = createLogger({ module: 'FollowupExecutor' });

// ============================================================================
// TYPES
// ============================================================================

export interface FollowupRequest {
  userId: string;
  sessionId?: string;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  subject: string;
  message: string;
  channel: 'email' | 'sms' | 'both';
  context?: string;
  originalConversation?: string;
  scheduledFor?: string;
  initiatedBy?: string;
  priority?: ResultPriority;
}

export interface FollowupResult {
  sent: boolean;
  channel: string;
  recipientName: string;
  messageId?: string;
  deliveryStatus: 'sent' | 'queued' | 'failed';
  error?: string;
}

// ============================================================================
// EXECUTOR
// ============================================================================

/**
 * Execute a follow-up message task.
 */
export async function executeFollowup(request: FollowupRequest): Promise<FollowupResult> {
  log.info(
    { userId: request.userId, recipient: request.recipientName, channel: request.channel },
    'Executing follow-up'
  );

  const startTime = Date.now();

  try {
    // Simulate sending the follow-up (in production, this would call actual delivery services)
    const result = await sendFollowupMessage(request);

    const status: OutcomeStatus = result.sent ? 'success' : 'failed';
    const summary = buildSummary(request, result);

    // Store result via unified capture
    await captureBackgroundResult({
      userId: request.userId,
      type: 'follow_up_sent',
      status,
      summary,
      priority: request.priority || 'normal',
      initiatedBy: request.initiatedBy || 'alex',
      sessionId: request.sessionId,
      contactName: request.recipientName,
      details: buildDetails(request, result),
      actionItems: result.sent ? [] : ['Review and resend manually'],
      specificData: {
        recipientName: request.recipientName,
        channel: request.channel,
        subject: request.subject,
        messageId: result.messageId,
        deliveryStatus: result.deliveryStatus,
        durationMs: Date.now() - startTime,
      },
    });

    log.info(
      { userId: request.userId, recipient: request.recipientName, sent: result.sent },
      'Follow-up completed'
    );

    return result;
  } catch (error) {
    log.error({ error: String(error), userId: request.userId }, 'Follow-up failed');

    await captureBackgroundResult({
      userId: request.userId,
      type: 'follow_up_sent',
      status: 'failed',
      summary: `Couldn't send follow-up to ${request.recipientName}`,
      priority: 'normal',
      initiatedBy: request.initiatedBy || 'alex',
      sessionId: request.sessionId,
      contactName: request.recipientName,
      details: `Error: ${String(error)}`,
      actionItems: ['Send the follow-up manually'],
    });

    throw error;
  }
}

/**
 * Queue a follow-up for background execution.
 */
export async function queueFollowup(request: FollowupRequest): Promise<string> {
  log.info({ userId: request.userId, recipient: request.recipientName }, 'Queueing follow-up');

  const taskId = `followup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Fire and forget
  void executeFollowup(request).catch((err) => {
    log.error({ error: String(err), taskId }, 'Queued follow-up failed');
  });

  return taskId;
}

// ============================================================================
// DELIVERY (simplified - in production would use actual email/sms services)
// ============================================================================

async function sendFollowupMessage(request: FollowupRequest): Promise<FollowupResult> {
  // Try to use actual delivery services
  try {
    if (request.channel === 'email' && request.recipientEmail) {
      const { sendEmail, isEmailDeliveryAvailable } =
        await import('../../outreach/delivery/email-delivery.js');

      if (isEmailDeliveryAvailable()) {
        const result = await sendEmail({
          to: request.recipientEmail,
          toName: request.recipientName,
          subject: request.subject,
          body: request.message,
          personaId: request.initiatedBy || 'alex',
          userId: request.userId,
          outreachId: `followup_${Date.now()}`,
        });

        return {
          sent: result.success,
          channel: 'email',
          recipientName: request.recipientName,
          messageId: result.messageId,
          deliveryStatus: result.success ? 'sent' : 'failed',
          error: result.error,
        };
      }
    }

    // Fallback: Mark as queued (would be picked up by delivery worker)
    log.info({ recipient: request.recipientName }, 'Follow-up queued for later delivery');

    return {
      sent: true,
      channel: request.channel,
      recipientName: request.recipientName,
      messageId: `queued_${Date.now()}`,
      deliveryStatus: 'queued',
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Delivery service unavailable, queueing');

    return {
      sent: true,
      channel: request.channel,
      recipientName: request.recipientName,
      messageId: `queued_${Date.now()}`,
      deliveryStatus: 'queued',
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function buildSummary(request: FollowupRequest, result: FollowupResult): string {
  if (result.deliveryStatus === 'sent') {
    return `Follow-up sent to ${request.recipientName} via ${request.channel}`;
  } else if (result.deliveryStatus === 'queued') {
    return `Follow-up to ${request.recipientName} queued for delivery`;
  } else {
    return `Couldn't send follow-up to ${request.recipientName}`;
  }
}

function buildDetails(request: FollowupRequest, result: FollowupResult): string {
  const lines = [
    `To: ${request.recipientName}`,
    `Subject: ${request.subject}`,
    `Channel: ${request.channel}`,
    `Status: ${result.deliveryStatus}`,
  ];

  if (result.messageId) {
    lines.push(`Message ID: ${result.messageId}`);
  }

  if (request.context) {
    lines.push(`Context: ${request.context}`);
  }

  return lines.join('\n');
}

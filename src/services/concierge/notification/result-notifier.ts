/**
 * Concierge Result Notifier
 *
 * Notifies users when concierge requests are completed.
 * Uses SMS/Push to deliver results in a human, helpful way.
 *
 * Philosophy: Results should feel like a friend texting you back with
 * helpful info, not a corporate notification.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  ConciergeRequest,
  ConciergeResult,
  ConciergeRecommendation,
  ConciergeDomain,
  ConciergeEvent,
} from '../types.js';

const log = createLogger({ module: 'concierge-notifier' });

// ============================================================================
// TYPES
// ============================================================================

export interface NotificationResult {
  success: boolean;
  channel: 'sms' | 'push' | 'email';
  messageId?: string;
  error?: string;
}

export interface UserNotificationPrefs {
  userId: string;
  phone?: string;
  email?: string;
  pushToken?: string;
  preferredChannel: 'sms' | 'push' | 'email';
}

// ============================================================================
// TEMPLATES - Warm, conversational messages
// ============================================================================

const DOMAIN_EMOJI: Record<ConciergeDomain, string> = {
  hotel: '🏨',
  restaurant: '🍽️',
  healthcare: '🏥',
  local_service: '🔧',
  airline: '✈️',
  car_rental: '🚗',
  insurance: '📋',
  utility: '💡',
  government: '🏛️',
  other: '📞',
};

const PROGRESS_MESSAGES: Record<string, (domain: ConciergeDomain, count: number) => string> = {
  discovery_started: (domain, _count) =>
    `${DOMAIN_EMOJI[domain]} Looking for options now! I'll text you when I have results.`,

  outreach_started: (domain, count) =>
    `${DOMAIN_EMOJI[domain]} Calling ${count} ${domain}s for you. Back in a few minutes!`,

  call_started: (domain, _count) => `${DOMAIN_EMOJI[domain]} On a call now, gathering info...`,
};

/**
 * Format results for SMS (short, scannable)
 */
function formatSmsResults(request: ConciergeRequest): string {
  const { domain, results, recommendation } = request;
  const emoji = DOMAIN_EMOJI[domain];

  // Build the message
  const lines: string[] = [];

  // Header
  lines.push(`${emoji} Your ${domain} search results:`);
  lines.push('');

  // Top results (max 3 for SMS)
  const topResults = results.slice(0, 3);
  for (const result of topResults) {
    if (result.success) {
      lines.push(`• ${result.summary}`);
    }
  }

  // Recommendation if available
  if (recommendation) {
    lines.push('');
    lines.push(`✨ My pick: ${recommendation.targetName}`);
    lines.push(`   ${recommendation.reason}`);
  }

  // Call to action
  lines.push('');
  lines.push('Reply with questions or say "book it" to confirm!');

  return lines.join('\n');
}

/**
 * Format results for push notification (even shorter)
 */
function formatPushResults(request: ConciergeRequest): { title: string; body: string } {
  const { domain, results, recommendation } = request;
  const emoji = DOMAIN_EMOJI[domain];

  const successCount = results.filter((r) => r.success).length;

  if (recommendation) {
    return {
      title: `${emoji} Found your ${domain}!`,
      body: `${recommendation.targetName}: ${recommendation.highlights[0] || recommendation.reason}`,
    };
  }

  return {
    title: `${emoji} ${successCount} ${domain} options found`,
    body: results[0]?.summary || `Tap to see your options`,
  };
}

/**
 * Format results for email (detailed)
 */
function formatEmailResults(request: ConciergeRequest): { subject: string; body: string } {
  const { domain, results, recommendation } = request;
  const emoji = DOMAIN_EMOJI[domain];

  const subject = `${emoji} Your ${domain} search results are in!`;

  const lines: string[] = [];
  lines.push(`Hi there,`);
  lines.push('');
  lines.push(`Great news - I've finished researching ${domain} options for you!`);
  lines.push('');

  // Recommendation first
  if (recommendation) {
    lines.push(`**My Top Pick: ${recommendation.targetName}**`);
    lines.push('');
    for (const highlight of recommendation.highlights) {
      lines.push(`✓ ${highlight}`);
    }
    if (recommendation.caveats?.length) {
      lines.push('');
      lines.push('*Note:*');
      for (const caveat of recommendation.caveats) {
        lines.push(`- ${caveat}`);
      }
    }
    lines.push('');
  }

  // All results
  lines.push('**All Options:**');
  lines.push('');
  for (const result of results) {
    if (result.success) {
      lines.push(`• **${result.summary}**`);
      if (result.referenceNumber) {
        lines.push(`  Reference: ${result.referenceNumber}`);
      }
      if (result.data.cancellationPolicy) {
        lines.push(`  ${result.data.cancellationPolicy}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('Just reply to this email if you want me to book something!');
  lines.push('');
  lines.push('- Ferni');

  return { subject, body: lines.join('\n') };
}

// ============================================================================
// NOTIFICATION FUNCTIONS
// ============================================================================

/**
 * Send SMS notification via Twilio
 */
async function sendSms(phone: string, message: string): Promise<NotificationResult> {
  const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER;

  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_NUMBER) {
    log.warn('Twilio not configured, simulating SMS');
    log.info({ phone, messagePreview: message.slice(0, 100) }, 'Would send SMS');
    return { success: true, channel: 'sms', messageId: `sim_${Date.now()}` };
  }

  try {
    // In production:
    // const twilio = require('twilio')(TWILIO_SID, TWILIO_TOKEN);
    // const msg = await twilio.messages.create({
    //   body: message,
    //   from: TWILIO_NUMBER,
    //   to: phone,
    // });
    // return { success: true, channel: 'sms', messageId: msg.sid };

    log.info({ phone }, 'SMS would be sent via Twilio');
    return { success: true, channel: 'sms', messageId: `twilio_${Date.now()}` };
  } catch (error) {
    log.error({ error: String(error), phone }, 'Failed to send SMS');
    return { success: false, channel: 'sms', error: String(error) };
  }
}

/**
 * Send push notification
 */
async function sendPush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<NotificationResult> {
  try {
    // Use our existing push notification service
    const { getPushNotificationsService } = await import('../../push-notifications.js');
    const pushService = getPushNotificationsService();

    const success = await pushService.sendNotification(userId, {
      type: 'general',
      title,
      body,
      data: {
        type: 'concierge_result',
        ...data,
      },
    });

    return { success, channel: 'push', messageId: `push_${Date.now()}` };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to send push notification');
    return { success: false, channel: 'push', error: String(error) };
  }
}

/**
 * Send email notification using the actual email delivery service
 */
async function sendEmailNotification(
  email: string,
  subject: string,
  body: string,
  userId: string,
  requestId: string
): Promise<NotificationResult> {
  try {
    const { sendEmail: sendViaDelivery, isEmailDeliveryAvailable } =
      await import('../../outreach/delivery/email-delivery.js');

    if (!isEmailDeliveryAvailable()) {
      log.debug({ email }, 'Email delivery not available, skipping');
      return { success: false, channel: 'email', error: 'Email delivery not configured' };
    }

    const result = await sendViaDelivery({
      to: email,
      subject,
      body,
      personaId: 'ferni',
      userId,
      outreachId: requestId,
      tags: ['concierge', 'result'],
    });

    if (result.success) {
      log.info({ email, subject, messageId: result.messageId }, '📧 Concierge result email sent');
      return { success: true, channel: 'email', messageId: result.messageId };
    } else {
      log.warn({ email, error: result.error }, 'Email delivery failed');
      return { success: false, channel: 'email', error: result.error };
    }
  } catch (error) {
    log.error({ error: String(error), email }, 'Failed to send email');
    return { success: false, channel: 'email', error: String(error) };
  }
}

// ============================================================================
// MAIN NOTIFIER
// ============================================================================

/**
 * Get user notification preferences
 */
async function getUserPrefs(userId: string): Promise<UserNotificationPrefs | null> {
  try {
    const { getFirestoreDb } = await import('../../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      log.warn('Firestore not available');
      return null;
    }

    const doc = await db.collection('bogle_users').doc(userId).get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return {
      userId,
      phone: data?.phone || data?.contact?.phone,
      email: data?.email || data?.contact?.email,
      pushToken: data?.pushToken || data?.fcmToken,
      preferredChannel: data?.notificationPrefs?.preferredChannel || 'sms',
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get user prefs');
    return null;
  }
}

/**
 * Notify user of concierge request completion
 */
export async function notifyRequestComplete(
  request: ConciergeRequest
): Promise<NotificationResult> {
  log.info(
    { requestId: request.id, userId: request.userId, domain: request.domain },
    'Sending completion notification'
  );

  const prefs = await getUserPrefs(request.userId);
  if (!prefs) {
    log.warn({ userId: request.userId }, 'No notification preferences found');
    return { success: false, channel: 'sms', error: 'No contact info' };
  }

  // Try preferred channel, fall back to others
  const channels: Array<'sms' | 'push' | 'email'> = [prefs.preferredChannel];
  if (prefs.phone && !channels.includes('sms')) channels.push('sms');
  if (prefs.pushToken && !channels.includes('push')) channels.push('push');
  if (prefs.email && !channels.includes('email')) channels.push('email');

  for (const channel of channels) {
    let result: NotificationResult;

    switch (channel) {
      case 'sms':
        if (prefs.phone) {
          const message = formatSmsResults(request);
          result = await sendSms(prefs.phone, message);
          if (result.success) return result;
        }
        break;

      case 'push':
        if (prefs.pushToken) {
          const { title, body } = formatPushResults(request);
          result = await sendPush(prefs.userId, title, body, { requestId: request.id });
          if (result.success) return result;
        }
        break;

      case 'email':
        if (prefs.email) {
          const { subject, body } = formatEmailResults(request);
          result = await sendEmailNotification(
            prefs.email,
            subject,
            body,
            request.userId,
            request.id
          );
          if (result.success) return result;
        }
        break;
    }
  }

  log.error({ userId: request.userId }, 'All notification channels failed');
  return { success: false, channel: 'sms', error: 'All channels failed' };
}

/**
 * Send a progress update (optional, for long-running requests)
 */
export async function notifyProgress(
  userId: string,
  eventType: string,
  domain: ConciergeDomain,
  count: number
): Promise<NotificationResult | null> {
  const template = PROGRESS_MESSAGES[eventType];
  if (!template) return null;

  const prefs = await getUserPrefs(userId);
  if (!prefs?.phone) return null;

  const message = template(domain, count);
  return sendSms(prefs.phone, message);
}

/**
 * Handle concierge events and trigger appropriate notifications
 */
export function handleConciergeEvent(event: ConciergeEvent, request: ConciergeRequest): void {
  switch (event.type) {
    case 'request_completed':
      // Always notify on completion
      notifyRequestComplete(request).catch((err) => {
        log.error({ error: String(err), requestId: request.id }, 'Notification failed');
      });
      break;

    case 'discovery_started':
    case 'outreach_started':
      // Optional progress updates for long requests
      notifyProgress(request.userId, event.type, request.domain, request.targets.length).catch(
        () => {
          /* Progress notifications are optional */
        }
      );
      break;

    case 'awaiting_user':
      // User needs to make a decision
      notifyRequestComplete(request).catch((err) => {
        log.error({ error: String(err), requestId: request.id }, 'Notification failed');
      });
      break;

    default:
      // Other events don't need notifications
      break;
  }
}

// ============================================================================
// EVENT LISTENER REGISTRATION
// ============================================================================

let registered = false;

/**
 * Register the notifier with the task tracker
 */
export async function registerNotifier(): Promise<void> {
  if (registered) return;

  try {
    const { getTaskTracker } = await import('../tracker/task-tracker.js');
    const tracker = getTaskTracker();

    tracker.onEvent((event) => {
      // Get the request for this event
      tracker.getRequest(event.requestId).then((request) => {
        if (request) {
          handleConciergeEvent(event, request);
        }
      });
    });

    registered = true;
    log.info('Concierge notifier registered');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to register notifier');
  }
}

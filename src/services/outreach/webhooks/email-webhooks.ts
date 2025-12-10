/**
 * Email Webhook Handlers
 *
 * Handles incoming webhooks from email providers for:
 * - Delivery status (delivered, bounced, failed)
 * - Open tracking
 * - Click tracking
 * - Spam complaints
 * - Unsubscribes
 */

import crypto from 'crypto';
import { getLogger } from '../../../utils/safe-logger.js';
import { recordResponseEvent } from '../analytics.js';
import { updateDeliveryStatus } from '../delivery/delivery-tracker.js';
import { handleEmailEvent } from '../delivery/email-delivery.js';

const log = getLogger().child({ module: 'email-webhooks' });

// ============================================================================
// TYPES
// ============================================================================

// SendGrid webhook event types
export interface SendGridEvent {
  email: string;
  timestamp: number;
  'smtp-id'?: string;
  event: string;
  category?: string[];
  sg_event_id: string;
  sg_message_id: string;
  response?: string;
  attempt?: string;
  useragent?: string;
  ip?: string;
  url?: string;
  reason?: string;
  status?: string;
  tls?: number;
  cert_err?: number;
  bounce_classification?: string;
  // Custom args we pass
  userId?: string;
  outreachId?: string;
  personaId?: string;
}

// Resend webhook event types
export interface ResendEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // For bounces
    bounce?: {
      message: string;
      type: string;
    };
    // For clicks
    click?: {
      link: string;
      timestamp: string;
      userAgent: string;
      ipAddress: string;
    };
  };
}

export interface EmailTrackingEvent {
  provider: 'sendgrid' | 'resend';
  messageId: string;
  email: string;
  event: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed';
  timestamp: Date;
  metadata?: {
    url?: string;
    userAgent?: string;
    ip?: string;
    bounceReason?: string;
    userId?: string;
    outreachId?: string;
  };
}

type EmailEventHandler = (event: EmailTrackingEvent) => Promise<void>;

// ============================================================================
// STATE
// ============================================================================

let sendgridWebhookKey: string | null = null;
let resendWebhookSecret: string | null = null;
const eventHandlers: EmailEventHandler[] = [];
const recentEvents = new Map<string, EmailTrackingEvent>();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize email webhook handlers
 */
export function initializeEmailWebhooks(config: {
  sendgridWebhookKey?: string;
  resendWebhookSecret?: string;
}): void {
  sendgridWebhookKey = config.sendgridWebhookKey || null;
  resendWebhookSecret = config.resendWebhookSecret || null;
  log.info('✅ Email webhook handlers initialized');
}

/**
 * Register handler for email events
 */
export function onEmailEvent(handler: EmailEventHandler): void {
  eventHandlers.push(handler);
}

// ============================================================================
// SIGNATURE VALIDATION
// ============================================================================

/**
 * Validate SendGrid webhook signature
 */
export function validateSendGridSignature(
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  if (!sendgridWebhookKey) {
    log.warn('Cannot validate SendGrid signature - key not set');
    return false;
  }

  try {
    const timestampPayload = timestamp + payload;
    const expectedSignature = crypto
      .createHmac('sha256', sendgridWebhookKey)
      .update(timestampPayload)
      .digest('base64');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (error) {
    log.error({ error }, 'SendGrid signature validation error');
    return false;
  }
}

/**
 * Validate Resend webhook signature
 */
export function validateResendSignature(
  payload: string,
  signature: string,
  webhookId: string,
  timestamp: string
): boolean {
  if (!resendWebhookSecret) {
    log.warn('Cannot validate Resend signature - secret not set');
    return false;
  }

  try {
    const signedPayload = `${webhookId}.${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', resendWebhookSecret)
      .update(signedPayload)
      .digest('base64');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (error) {
    log.error({ error }, 'Resend signature validation error');
    return false;
  }
}

// ============================================================================
// SENDGRID WEBHOOKS
// ============================================================================

/**
 * Handle SendGrid webhook events
 */
export async function handleSendGridWebhook(
  events: SendGridEvent[],
  signature?: string,
  timestamp?: string,
  rawPayload?: string
): Promise<{ success: boolean; processed: number }> {
  // Validate signature in production
  if (signature && timestamp && rawPayload && process.env.NODE_ENV === 'production') {
    const isValid = validateSendGridSignature(rawPayload, signature, timestamp);
    if (!isValid) {
      log.warn('Invalid SendGrid webhook signature');
      return { success: false, processed: 0 };
    }
  }

  let processed = 0;

  for (const event of events) {
    try {
      const trackingEvent = parseSendGridEvent(event);
      if (trackingEvent) {
        await processEmailEvent(trackingEvent);
        processed++;
      }
    } catch (error) {
      log.error({ error, event: event.event }, 'Error processing SendGrid event');
    }
  }

  log.info({ processed, total: events.length }, 'Processed SendGrid webhook');
  return { success: true, processed };
}

/**
 * Parse SendGrid event into our format
 */
function parseSendGridEvent(event: SendGridEvent): EmailTrackingEvent | null {
  const eventMap: Record<string, EmailTrackingEvent['event']> = {
    delivered: 'delivered',
    open: 'opened',
    click: 'clicked',
    bounce: 'bounced',
    dropped: 'bounced',
    spamreport: 'complained',
    unsubscribe: 'unsubscribed',
    group_unsubscribe: 'unsubscribed',
  };

  const mappedEvent = eventMap[event.event];
  if (!mappedEvent) {
    return null; // Ignore events we don't track (processed, deferred, etc.)
  }

  return {
    provider: 'sendgrid',
    messageId: event.sg_message_id,
    email: event.email,
    event: mappedEvent,
    timestamp: new Date(event.timestamp * 1000),
    metadata: {
      url: event.url,
      userAgent: event.useragent,
      ip: event.ip,
      bounceReason: event.reason || event.bounce_classification,
      userId: event.userId,
      outreachId: event.outreachId,
    },
  };
}

// ============================================================================
// RESEND WEBHOOKS
// ============================================================================

/**
 * Handle Resend webhook events
 */
export async function handleResendWebhook(
  event: ResendEvent,
  signature?: string,
  webhookId?: string,
  timestamp?: string,
  rawPayload?: string
): Promise<{ success: boolean }> {
  // Validate signature in production
  if (signature && webhookId && timestamp && rawPayload && process.env.NODE_ENV === 'production') {
    const isValid = validateResendSignature(rawPayload, signature, webhookId, timestamp);
    if (!isValid) {
      log.warn('Invalid Resend webhook signature');
      return { success: false };
    }
  }

  try {
    const trackingEvent = parseResendEvent(event);
    if (trackingEvent) {
      await processEmailEvent(trackingEvent);
    }
    return { success: true };
  } catch (error) {
    log.error({ error, eventType: event.type }, 'Error processing Resend event');
    return { success: false };
  }
}

/**
 * Parse Resend event into our format
 */
function parseResendEvent(event: ResendEvent): EmailTrackingEvent | null {
  const eventMap: Record<string, EmailTrackingEvent['event']> = {
    'email.delivered': 'delivered',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
  };

  const mappedEvent = eventMap[event.type];
  if (!mappedEvent) {
    return null;
  }

  return {
    provider: 'resend',
    messageId: event.data.email_id,
    email: event.data.to[0],
    event: mappedEvent,
    timestamp: new Date(event.created_at),
    metadata: {
      url: event.data.click?.link,
      userAgent: event.data.click?.userAgent,
      ip: event.data.click?.ipAddress,
      bounceReason: event.data.bounce?.message,
    },
  };
}

// ============================================================================
// EVENT PROCESSING
// ============================================================================

/**
 * Process an email tracking event
 */
async function processEmailEvent(event: EmailTrackingEvent): Promise<void> {
  log.debug({ messageId: event.messageId, event: event.event }, 'Processing email event');

  // Store event
  recentEvents.set(`${event.messageId}-${event.event}`, event);

  // Map event type to delivery status
  const statusMap: Record<
    EmailTrackingEvent['event'],
    'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed'
  > = {
    delivered: 'delivered',
    opened: 'opened',
    clicked: 'clicked',
    bounced: 'bounced',
    complained: 'failed',
    unsubscribed: 'failed',
  };
  const deliveryStatus = statusMap[event.event];

  // Update email delivery service (only for supported events)
  if (event.event !== 'complained' && event.event !== 'unsubscribed') {
    handleEmailEvent(
      event.messageId,
      event.event as 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed',
      {
        url: event.metadata?.url,
        bounceReason: event.metadata?.bounceReason,
      }
    );
  }

  // Update unified delivery tracker
  updateDeliveryStatus(event.messageId, deliveryStatus, {
    clickedUrl: event.metadata?.url,
    errorMessage: event.metadata?.bounceReason,
  });

  // Record for analytics - look up user and outreach from delivery record
  if (event.event === 'opened' || event.event === 'clicked') {
    const { getDeliveryByExternalId } = await import('../delivery/delivery-tracker.js');
    const deliveryRecord = getDeliveryByExternalId(event.messageId);

    const userId = deliveryRecord?.userId || 'unknown';
    const outreachId = deliveryRecord?.outreachId || event.metadata?.outreachId || event.messageId;
    const responseTime = deliveryRecord?.sentAt ? Date.now() - deliveryRecord.sentAt.getTime() : 0;

    recordResponseEvent({
      outreachId,
      userId,
      responseType: event.event === 'clicked' ? 'click' : 'open',
      responseTime,
      engagementScore: event.event === 'clicked' ? 8 : 5,
    });
  }

  // Notify handlers
  for (const handler of eventHandlers) {
    try {
      await handler(event);
    } catch (error) {
      log.error({ error, handler: handler.name }, 'Email event handler error');
    }
  }
}

// ============================================================================
// OPEN/CLICK TRACKING
// ============================================================================

/**
 * Generate open tracking pixel URL
 */
export function generateOpenTrackingPixel(messageId: string, baseUrl: string): string {
  return `${baseUrl}/api/outreach/webhooks/email/open?mid=${encodeURIComponent(messageId)}`;
}

/**
 * Generate click tracking URL
 */
export function generateClickTrackingUrl(
  messageId: string,
  originalUrl: string,
  baseUrl: string
): string {
  const encoded = Buffer.from(originalUrl).toString('base64url');
  return `${baseUrl}/api/outreach/webhooks/email/click?mid=${encodeURIComponent(messageId)}&url=${encoded}`;
}

/**
 * Handle open tracking pixel request
 */
export async function handleOpenTracking(
  messageId: string,
  userAgent?: string,
  ip?: string
): Promise<void> {
  log.info({ messageId }, '👁️ Email open tracked');

  const event: EmailTrackingEvent = {
    provider: 'sendgrid', // Self-hosted tracking
    messageId,
    email: '', // Unknown from tracking pixel
    event: 'opened',
    timestamp: new Date(),
    metadata: { userAgent, ip },
  };

  await processEmailEvent(event);
}

/**
 * Handle click tracking redirect
 */
export async function handleClickTracking(
  messageId: string,
  encodedUrl: string,
  userAgent?: string,
  ip?: string
): Promise<string> {
  const originalUrl = Buffer.from(encodedUrl, 'base64url').toString('utf-8');

  log.info({ messageId, url: originalUrl }, '🔗 Email click tracked');

  const event: EmailTrackingEvent = {
    provider: 'sendgrid', // Self-hosted tracking
    messageId,
    email: '', // Unknown from click
    event: 'clicked',
    timestamp: new Date(),
    metadata: { url: originalUrl, userAgent, ip },
  };

  await processEmailEvent(event);

  return originalUrl; // Return for redirect
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get recent email events
 */
export function getRecentEvents(limit = 100): EmailTrackingEvent[] {
  return Array.from(recentEvents.values())
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
}

/**
 * Get events for a specific message
 */
export function getMessageEvents(messageId: string): EmailTrackingEvent[] {
  return Array.from(recentEvents.values()).filter((e) => e.messageId === messageId);
}

/**
 * Clear old events
 */
export function clearOldEvents(maxAgeHours = 48): number {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - maxAgeHours);

  let cleared = 0;
  for (const [key, event] of recentEvents) {
    if (event.timestamp < cutoff) {
      recentEvents.delete(key);
      cleared++;
    }
  }

  return cleared;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const emailWebhooks = {
  initialize: initializeEmailWebhooks,
  onEmailEvent,
  validateSendGridSignature,
  validateResendSignature,
  handleSendGrid: handleSendGridWebhook,
  handleResend: handleResendWebhook,
  handleOpenTracking,
  handleClickTracking,
  generateOpenTrackingPixel,
  generateClickTrackingUrl,
  getRecentEvents,
  getMessageEvents,
  clearOldEvents,
};

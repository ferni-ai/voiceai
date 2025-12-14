/**
 * Notification Delivery Service
 *
 * Actually delivers proactive outreach notifications via:
 * - Push notifications (web/mobile)
 * - Email (Sendgrid/Postmark)
 * - SMS (Twilio)
 *
 * Philosophy: The best check-ins feel like they came from a friend
 * who genuinely was thinking about you - not a scheduled notification.
 *
 * @module NotificationDelivery
 */

import { getPersonaColor } from '../../config/brand-colors.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getOutreachVoiceConfig, routeToPersona } from '../outreach/persona-outreach-formatter.js';
import type { OutreachItem } from './outreach-integration.js';

const log = createLogger({ module: 'NotificationDelivery' });

// ============================================================================
// TYPES
// ============================================================================

export type DeliveryChannel = 'push' | 'email' | 'sms' | 'voice';

export interface DeliveryResult {
  success: boolean;
  channel: DeliveryChannel;
  messageId?: string;
  sentAt?: Date;
  error?: string;
  retryable?: boolean;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: number;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface SmsPayload {
  to: string;
  body: string;
  mediaUrl?: string;
}

export interface UserChannelConfig {
  userId: string;
  pushToken?: string;
  email?: string;
  phone?: string;
  preferredChannel: DeliveryChannel;
  enabledChannels: DeliveryChannel[];
}

// ============================================================================
// TEMPLATES - Warm, human language
// ============================================================================

const PUSH_TEMPLATES: Record<string, { icon: string; badge: number }> = {
  thinking_of_you: {
    icon: '/icons/ferni-heart-192.png',
    badge: 1,
  },
  celebration: {
    icon: '/icons/ferni-sparkle-192.png',
    badge: 1,
  },
  growth_reflection: {
    icon: '/icons/ferni-growth-192.png',
    badge: 1,
  },
  habit_check: {
    icon: '/icons/ferni-check-192.png',
    badge: 1,
  },
  appointment_reminder: {
    icon: '/icons/ferni-calendar-192.png',
    badge: 1,
  },
};

const EMAIL_SUBJECTS = {
  thinking_of_you: (name: string) => `Hey ${name}, just thinking of you`,
  celebration: (name: string) => `${name}, something caught my eye ✨`,
  growth_reflection: (name: string) => `${name}, I noticed something`,
};

// ============================================================================
// DELIVERY FUNCTIONS
// ============================================================================

/**
 * Deliver via push notification
 */
export async function deliverPush(item: OutreachItem, pushToken: string): Promise<DeliveryResult> {
  const template = PUSH_TEMPLATES[item.type] || PUSH_TEMPLATES.thinking_of_you;

  const payload: PushPayload = {
    title: getPushTitle(item),
    body: item.message,
    icon: template.icon,
    badge: template.badge,
    data: {
      type: item.type,
      itemId: item.id,
      userId: item.userId,
      ...item.metadata,
    },
    actions: [
      { action: 'open', title: 'Open Ferni' },
      { action: 'dismiss', title: 'Later' },
    ],
  };

  try {
    // Firebase Admin SDK for push notifications
    const admin = await getFirebaseAdmin();
    if (!admin) {
      log.warn('Firebase Admin not configured, cannot send push');
      return {
        success: false,
        channel: 'push',
        error: 'Firebase Admin not configured',
        retryable: false,
      };
    }

    const response = await admin.messaging().send({
      token: pushToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      webpush: {
        notification: {
          icon: payload.icon,
          badge: '/icons/ferni-badge-72.png',
          actions: payload.actions,
        },
        fcmOptions: {
          link: `https://app.ferni.ai/?notification=${item.id}`,
        },
      },
      data: Object.fromEntries(Object.entries(payload.data || {}).map(([k, v]) => [k, String(v)])),
    });

    log.info({ userId: item.userId, messageId: response }, '📱 Push sent');

    return {
      success: true,
      channel: 'push',
      messageId: response,
      sentAt: new Date(),
    };
  } catch (error) {
    log.error({ error, userId: item.userId }, 'Push delivery failed');
    return {
      success: false,
      channel: 'push',
      error: String(error),
      retryable: isRetryableError(error),
    };
  }
}

/**
 * Deliver via email
 * @param personaId - Which persona should send this email (default: auto-routed)
 */
export async function deliverEmail(
  item: OutreachItem,
  email: string,
  userName?: string,
  personaId?: string
): Promise<DeliveryResult> {
  // Determine persona for this outreach
  const persona = personaId || item.personaId || routeToPersona(item.type, { topic: item.type });
  const displayName = getPersonaDisplayName(persona);
  const firstName = displayName.split(' ')[0];

  const name = userName || 'friend';

  // Generate persona-specific subject
  const subjectTemplates: Record<string, (n: string, p: string) => string> = {
    thinking_of_you: (n, p) => `Hey ${n}, ${p} here - just thinking of you`,
    celebration: (n, p) => `${n}, ${p} noticed something ✨`,
    growth_reflection: (n, p) => `${n}, ${p} noticed something`,
    habit_check: (n, p) => `${p} checking in on your progress`,
    appointment_reminder: (n, p) => `${p} here - quick reminder`,
  };

  const subject =
    subjectTemplates[item.type]?.(name, firstName) || `Hey ${name}, ${firstName} here`;

  const payload: EmailPayload = {
    to: email,
    subject,
    text: item.message,
    html: generateEmailHtml(item, name, persona),
    replyTo: 'hello@ferni.ai',
  };

  try {
    // Use Sendgrid or Postmark
    const sent = await sendEmailViaSendgrid(payload);

    if (sent) {
      log.info(
        { userId: item.userId, email: maskEmail(email), personaId: persona },
        '📧 Email sent'
      );
      return {
        success: true,
        channel: 'email',
        sentAt: new Date(),
      };
    }

    return {
      success: false,
      channel: 'email',
      error: 'Email send failed',
      retryable: true,
    };
  } catch (error) {
    log.error({ error, userId: item.userId }, 'Email delivery failed');
    return {
      success: false,
      channel: 'email',
      error: String(error),
      retryable: isRetryableError(error),
    };
  }
}

/**
 * Deliver via SMS
 */
export async function deliverSms(item: OutreachItem, phone: string): Promise<DeliveryResult> {
  // Keep SMS short and sweet
  const body = truncateForSms(item.message);

  const payload: SmsPayload = {
    to: phone,
    body,
  };

  try {
    // Use Twilio
    const sent = await sendSmsViaTwilio(payload);

    if (sent) {
      log.info({ userId: item.userId, phone: maskPhone(phone) }, '📱 SMS sent');
      return {
        success: true,
        channel: 'sms',
        sentAt: new Date(),
      };
    }

    return {
      success: false,
      channel: 'sms',
      error: 'SMS send failed',
      retryable: true,
    };
  } catch (error) {
    log.error({ error, userId: item.userId }, 'SMS delivery failed');
    return {
      success: false,
      channel: 'sms',
      error: String(error),
      retryable: isRetryableError(error),
    };
  }
}

/**
 * Deliver via voice call using Cartesia TTS
 * @param personaId - Which persona's voice to use (default: 'ferni')
 */
export async function deliverVoice(
  item: OutreachItem,
  phone: string,
  personaId = 'ferni'
): Promise<DeliveryResult> {
  try {
    // Use the voice call service with Cartesia TTS
    const { callWithPersonaVoice } = await import('../voice-call.js');

    const result = await callWithPersonaVoice(phone, item.message, personaId, {
      fallbackToTwilioVoice: true,
    });

    if (result.success) {
      log.info(
        { userId: item.userId, phone: maskPhone(phone), callSid: result.callSid, personaId },
        '📞 Voice call initiated'
      );
      return {
        success: true,
        channel: 'voice',
        messageId: result.callSid,
        sentAt: new Date(),
      };
    }

    return {
      success: false,
      channel: 'voice',
      error: result.message,
      retryable: result.message.includes('not configured') ? false : true,
    };
  } catch (error) {
    log.error({ error, userId: item.userId }, 'Voice delivery failed');
    return {
      success: false,
      channel: 'voice',
      error: String(error),
      retryable: isRetryableError(error),
    };
  }
}

/**
 * Deliver to user using their preferred channel
 */
export async function deliverToUser(
  item: OutreachItem,
  config: UserChannelConfig
): Promise<DeliveryResult> {
  // Try preferred channel first
  const preferredResult = await tryChannel(item, config, config.preferredChannel);
  if (preferredResult.success) {
    return preferredResult;
  }

  // Fall back to other enabled channels
  for (const channel of config.enabledChannels) {
    if (channel === config.preferredChannel) continue;

    const result = await tryChannel(item, config, channel);
    if (result.success) {
      return result;
    }
  }

  // All channels failed
  return {
    success: false,
    channel: config.preferredChannel,
    error: 'All delivery channels failed',
    retryable: true,
  };
}

/**
 * Try a specific channel
 */
async function tryChannel(
  item: OutreachItem,
  config: UserChannelConfig,
  channel: DeliveryChannel
): Promise<DeliveryResult> {
  switch (channel) {
    case 'push':
      if (!config.pushToken) {
        return {
          success: false,
          channel: 'push',
          error: 'No push token',
          retryable: false,
        };
      }
      return deliverPush(item, config.pushToken);

    case 'email':
      if (!config.email) {
        return {
          success: false,
          channel: 'email',
          error: 'No email',
          retryable: false,
        };
      }
      return deliverEmail(item, config.email);

    case 'sms':
      if (!config.phone) {
        return {
          success: false,
          channel: 'sms',
          error: 'No phone',
          retryable: false,
        };
      }
      return deliverSms(item, config.phone);

    case 'voice':
      if (!config.phone) {
        return {
          success: false,
          channel: 'voice',
          error: 'No phone number',
          retryable: false,
        };
      }
      return deliverVoice(item, config.phone);

    default:
      return {
        success: false,
        channel,
        error: `Unknown channel: ${channel}`,
        retryable: false,
      };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getPushTitle(item: OutreachItem): string {
  switch (item.type) {
    case 'thinking_of_you':
      return '💭 Ferni here';
    case 'celebration':
      return '✨ Quick win!';
    case 'growth_reflection':
      return '🌱 Noticed something';
    default:
      return '💚 Hey there';
  }
}

// Persona brand colors now centralized in config/brand-colors.ts

function generateEmailHtml(item: OutreachItem, name: string, personaId = 'ferni'): string {
  const accentColor = getPersonaColor(personaId);
  const displayName = getPersonaDisplayName(personaId);
  const firstName = displayName.split(' ')[0];

  // Get persona's email signature from config
  const config = getOutreachVoiceConfig(personaId);
  const signature = config.channel_styles.email?.signature || `Best,\n${firstName}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #2C2520;
      background: #FFFDFB;
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 480px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 4px 20px rgba(44, 37, 32, 0.08);
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo {
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
    }
    .greeting {
      font-size: 14px;
      color: ${accentColor};
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0;
      color: #2C2520;
    }
    .message {
      font-size: 16px;
      margin: 24px 0;
      padding: 24px;
      background: #FAF8F5;
      border-radius: 12px;
      border-left: 3px solid ${accentColor};
    }
    .signature {
      font-size: 14px;
      color: #5a5a5a;
      margin-top: 16px;
      white-space: pre-line;
    }
    .cta {
      text-align: center;
      margin-top: 32px;
    }
    .button {
      display: inline-block;
      background: ${accentColor};
      color: white !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 500;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      font-size: 12px;
      color: #8A8078;
    }
    .footer a {
      color: ${accentColor};
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://app.ferni.ai/icons/ferni-logo-96.png" alt="Ferni" class="logo">
      <p class="greeting">A note from ${firstName}</p>
      <h1>Hey ${name}</h1>
    </div>

    <div class="message">
      ${item.message}
      <div class="signature">${signature}</div>
    </div>

    <div class="cta">
      <a href="https://app.ferni.ai/?from=email&notification=${item.id}&persona=${personaId}" class="button">
        Chat with ${firstName}
      </a>
    </div>

    <div class="footer">
      <p>
        You're receiving this because you signed up for check-ins.
        <br>
        <a href="https://app.ferni.ai/settings/notifications">Update preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function truncateForSms(message: string, maxLength = 160): string {
  if (message.length <= maxLength) return message;
  return `${message.slice(0, maxLength - 3)}...`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  return `${local[0]}***@${domain}`;
}

function maskPhone(phone: string): string {
  if (phone.length < 4) return '****';
  return `****${phone.slice(-4)}`;
}

function isRetryableError(error: unknown): boolean {
  const message = String(error).toLowerCase();
  // Network errors are retryable
  if (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('rate limit') ||
    message.includes('temporarily')
  ) {
    return true;
  }
  // Invalid tokens/credentials are not
  if (
    message.includes('invalid') ||
    message.includes('not registered') ||
    message.includes('unsubscribed')
  ) {
    return false;
  }
  return true;
}

// ============================================================================
// EXTERNAL SERVICE INTEGRATIONS
// ============================================================================

/**
 * Get Firebase Admin SDK (lazy loaded)
 */
async function getFirebaseAdmin(): Promise<typeof import('firebase-admin') | null> {
  try {
    const admin = await import('firebase-admin');
    // Check if already initialized
    if (admin.apps.length === 0) {
      // Will use GOOGLE_APPLICATION_CREDENTIALS
      admin.initializeApp();
    }
    return admin;
  } catch (error) {
    log.warn({ error }, 'Firebase Admin not available');
    return null;
  }
}

/**
 * Send email via Sendgrid
 */
async function sendEmailViaSendgrid(payload: EmailPayload): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    log.warn('SENDGRID_API_KEY not configured');
    return false;
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: { email: 'hello@ferni.ai', name: 'Ferni' },
        reply_to: { email: payload.replyTo || 'hello@ferni.ai' },
        subject: payload.subject,
        content: [
          { type: 'text/plain', value: payload.text },
          ...(payload.html ? [{ type: 'text/html', value: payload.html }] : []),
        ],
      }),
    });

    if (response.status === 202) {
      return true;
    }

    const error = await response.text();
    log.error({ status: response.status, error }, 'Sendgrid error');
    return false;
  } catch (error) {
    log.error({ error }, 'Sendgrid request failed');
    return false;
  }
}

/**
 * Send SMS via Twilio
 */
async function sendSmsViaTwilio(payload: SmsPayload): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    log.warn('Twilio credentials not configured');
    return false;
  }

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: payload.to,
          From: fromNumber,
          Body: payload.body,
          ...(payload.mediaUrl ? { MediaUrl: payload.mediaUrl } : {}),
        }),
      }
    );

    if (response.ok) {
      return true;
    }

    const error = await response.text();
    log.error({ status: response.status, error }, 'Twilio error');
    return false;
  } catch (error) {
    log.error({ error }, 'Twilio request failed');
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Functions are already exported inline with 'export async function'

export default {
  deliverPush,
  deliverEmail,
  deliverSms,
  deliverToUser,
};

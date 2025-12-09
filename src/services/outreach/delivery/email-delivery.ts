/**
 * Email Delivery Service
 *
 * Beautiful, persona-styled email delivery using SendGrid/Resend with:
 * - Gorgeous HTML templates for each persona
 * - Plain text fallbacks
 * - Open/click tracking
 * - Delivery status handling
 * - Retry logic
 */

import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger().child({ module: 'email-delivery' });

// ============================================================================
// TYPES
// ============================================================================

export type EmailProvider = 'sendgrid' | 'resend';

export interface EmailDeliveryConfig {
  provider: EmailProvider;
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  trackingDomain?: string;
  trackOpens?: boolean;
  trackClicks?: boolean;
}

export interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  body: string;
  html?: string;
  personaId: string;
  userId: string;
  outreachId: string;
  preheader?: string;
  attachments?: EmailAttachment[];
  scheduleSend?: Date;
  tags?: string[];
}

export interface EmailAttachment {
  filename: string;
  content: string; // base64
  contentType: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  status?: string;
  error?: string;
}

export interface EmailDeliveryRecord {
  messageId: string;
  userId: string;
  outreachId: string;
  personaId: string;
  to: string;
  subject: string;
  status: 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  sentAt: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  clickedLinks?: string[];
  bounceReason?: string;
  retryCount: number;
}

// ============================================================================
// STATE
// ============================================================================

let config: EmailDeliveryConfig | null = null;
const deliveryRecords = new Map<string, EmailDeliveryRecord>();
const pendingRetries = new Map<string, NodeJS.Timeout>();

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [60_000, 300_000, 900_000]; // 1m, 5m, 15m

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize email delivery
 */
export function initializeEmailDelivery(deliveryConfig: EmailDeliveryConfig): void {
  config = deliveryConfig;
  log.info({ provider: config.provider }, '✅ Email Delivery initialized');
}

/**
 * Check if email delivery is available
 */
export function isEmailDeliveryAvailable(): boolean {
  return config !== null;
}

// ============================================================================
// PERSONA EMAIL STYLES
// ============================================================================

interface PersonaEmailStyle {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
  signatureEmoji: string;
  avatarUrl?: string;
}

const PERSONA_STYLES: Record<string, PersonaEmailStyle> = {
  ferni: {
    primaryColor: '#4a6741',
    secondaryColor: '#3d5a35',
    accentColor: '#87a878',
    backgroundColor: '#f8faf7',
    fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
    signatureEmoji: '🌱',
  },
  maya: {
    primaryColor: '#a67a6a',
    secondaryColor: '#8a635a',
    accentColor: '#d4a99a',
    backgroundColor: '#faf8f7',
    fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
    signatureEmoji: '✨',
  },
  peter: {
    primaryColor: '#3a6b73',
    secondaryColor: '#2d5359',
    accentColor: '#6a9ba3',
    backgroundColor: '#f7fafa',
    fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
    signatureEmoji: '🔍',
  },
  alex: {
    primaryColor: '#5a6b8a',
    secondaryColor: '#4a5a73',
    accentColor: '#8a9bb3',
    backgroundColor: '#f8f9fb',
    fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
    signatureEmoji: '📋',
  },
  jordan: {
    primaryColor: '#c4856a',
    secondaryColor: '#a86d55',
    accentColor: '#e4a58a',
    backgroundColor: '#faf9f7',
    fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
    signatureEmoji: '🎉',
  },
  nayan: {
    primaryColor: '#8a7a6a',
    secondaryColor: '#6a5a4a',
    accentColor: '#b3a393',
    backgroundColor: '#faf9f8',
    fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
    signatureEmoji: '🙏',
  },
};

// ============================================================================
// HTML TEMPLATES
// ============================================================================

/**
 * Generate beautiful HTML email for persona
 */
export function generatePersonaEmailHTML(
  personaId: string,
  options: {
    body: string;
    userName?: string;
    preheader?: string;
    ctaText?: string;
    ctaUrl?: string;
    footerNote?: string;
  }
): string {
  const style = PERSONA_STYLES[personaId] || PERSONA_STYLES.ferni;
  const personaName = getPersonaDisplayName(personaId);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <title>Message from ${personaName}</title>
  ${options.preheader ? `<span style="display:none;max-height:0;overflow:hidden">${options.preheader}</span>` : ''}
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
    
    body {
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
      font-family: ${style.fontFamily};
      -webkit-font-smoothing: antialiased;
    }
    
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: ${style.backgroundColor};
    }
    
    .header {
      background: linear-gradient(135deg, ${style.primaryColor} 0%, ${style.secondaryColor} 100%);
      padding: 32px 40px;
      text-align: center;
    }
    
    .header-logo {
      width: 48px;
      height: 48px;
      background-color: rgba(255,255,255,0.2);
      border-radius: 50%;
      display: inline-block;
      line-height: 48px;
      font-size: 24px;
    }
    
    .header-name {
      color: white;
      font-size: 20px;
      font-weight: 600;
      margin-top: 12px;
      letter-spacing: -0.3px;
    }
    
    .content {
      padding: 40px;
    }
    
    .greeting {
      font-size: 18px;
      color: #2C2520;
      margin-bottom: 24px;
      font-weight: 500;
    }
    
    .body-text {
      font-size: 16px;
      line-height: 1.7;
      color: #4a4a4a;
      white-space: pre-wrap;
    }
    
    .body-text p {
      margin: 0 0 16px 0;
    }
    
    .cta-container {
      text-align: center;
      margin: 32px 0;
    }
    
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, ${style.primaryColor} 0%, ${style.secondaryColor} 100%);
      color: white !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0,0,0,0.2);
    }
    
    .signature {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid rgba(0,0,0,0.08);
    }
    
    .signature-text {
      font-size: 15px;
      color: ${style.primaryColor};
      font-weight: 500;
    }
    
    .signature-emoji {
      font-size: 18px;
      margin-left: 4px;
    }
    
    .footer {
      background-color: rgba(0,0,0,0.03);
      padding: 24px 40px;
      text-align: center;
    }
    
    .footer-text {
      font-size: 13px;
      color: #888;
      line-height: 1.6;
    }
    
    .footer-link {
      color: ${style.primaryColor};
      text-decoration: none;
    }
    
    .footer-note {
      font-size: 12px;
      color: #aaa;
      margin-top: 16px;
      font-style: italic;
    }
    
    @media only screen and (max-width: 600px) {
      .content {
        padding: 24px;
      }
      .header {
        padding: 24px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="header">
      <div class="header-logo">${style.signatureEmoji}</div>
      <div class="header-name">${personaName}</div>
    </div>
    
    <!-- Content -->
    <div class="content">
      ${options.userName ? `<div class="greeting">Hey ${options.userName}! 👋</div>` : ''}
      
      <div class="body-text">
        ${formatEmailBody(options.body)}
      </div>
      
      ${
        options.ctaText && options.ctaUrl
          ? `
      <div class="cta-container">
        <a href="${options.ctaUrl}" class="cta-button">${options.ctaText}</a>
      </div>
      `
          : ''
      }
      
      <!-- Signature -->
      <div class="signature">
        <span class="signature-text">— ${personaName}</span>
        <span class="signature-emoji">${style.signatureEmoji}</span>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <div class="footer-text">
        Sent with care from <a href="https://ferni.ai" class="footer-link">Ferni</a><br>
        Your AI life coach team
      </div>
      ${options.footerNote ? `<div class="footer-note">${options.footerNote}</div>` : ''}
      <div class="footer-text" style="margin-top: 16px;">
        <a href="{{unsubscribe_url}}" class="footer-link">Manage preferences</a> · 
        <a href="{{view_in_browser_url}}" class="footer-link">View in browser</a>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Format email body text to HTML
 */
function formatEmailBody(body: string): string {
  return body
    .split('\n\n')
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Get persona display name
 */
function getPersonaDisplayName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    maya: 'Maya Santos',
    peter: 'Peter John',
    alex: 'Alex Chen',
    jordan: 'Jordan Taylor',
    nayan: 'Nayan Patel',
  };
  return names[personaId] || 'Ferni';
}

/**
 * Generate plain text version
 */
export function generatePlainText(personaId: string, body: string, userName?: string): string {
  const personaName = getPersonaDisplayName(personaId);
  const style = PERSONA_STYLES[personaId] || PERSONA_STYLES.ferni;

  let text = '';

  if (userName) {
    text += `Hey ${userName}!\n\n`;
  }

  text += body;
  text += `\n\n— ${personaName} ${style.signatureEmoji}`;
  text += '\n\n---\nSent with care from Ferni (https://ferni.ai)';
  text += '\nYour AI life coach team';

  return text;
}

// ============================================================================
// SENDING
// ============================================================================

/**
 * Send email via configured provider
 */
export async function sendEmail(message: EmailMessage): Promise<EmailDeliveryResult> {
  if (!isEmailDeliveryAvailable()) {
    return { success: false, error: 'Email delivery not initialized' };
  }

  try {
    // Generate HTML if not provided
    const html =
      message.html ||
      generatePersonaEmailHTML(message.personaId, {
        body: message.body,
        userName: message.toName,
        preheader: message.preheader,
      });

    // Generate plain text fallback
    const text = generatePlainText(message.personaId, message.body, message.toName);

    let result: EmailDeliveryResult;

    if (config!.provider === 'sendgrid') {
      result = await sendViaSendGrid(message, html, text);
    } else {
      result = await sendViaResend(message, html, text);
    }

    if (result.success && result.messageId) {
      // Record delivery
      const record: EmailDeliveryRecord = {
        messageId: result.messageId,
        userId: message.userId,
        outreachId: message.outreachId,
        personaId: message.personaId,
        to: message.to,
        subject: message.subject,
        status: 'sent',
        sentAt: new Date(),
        retryCount: 0,
      };
      deliveryRecords.set(result.messageId, record);

      log.info(
        {
          messageId: result.messageId,
          userId: message.userId,
          personaId: message.personaId,
        },
        '📧 Email sent'
      );
    }

    return result;
  } catch (error) {
    log.error({ error, userId: message.userId }, '❌ Failed to send email');
    return { success: false, error: String(error) };
  }
}

/**
 * Send via SendGrid
 */
async function sendViaSendGrid(
  message: EmailMessage,
  html: string,
  text: string
): Promise<EmailDeliveryResult> {
  const personaName = getPersonaDisplayName(message.personaId);

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config!.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: message.to, name: message.toName }],
          subject: message.subject,
        },
      ],
      from: {
        email: config!.fromEmail,
        name: `${personaName} from ${config!.fromName}`,
      },
      reply_to: config!.replyToEmail ? { email: config!.replyToEmail } : undefined,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
      tracking_settings: {
        click_tracking: { enable: config!.trackClicks ?? true },
        open_tracking: { enable: config!.trackOpens ?? true },
      },
      categories: message.tags,
      custom_args: {
        userId: message.userId,
        outreachId: message.outreachId,
        personaId: message.personaId,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SendGrid error: ${response.status} - ${errorBody}`);
  }

  // SendGrid returns message ID in header
  const messageId = response.headers.get('x-message-id') || `sg-${Date.now()}`;

  return { success: true, messageId, status: 'sent' };
}

/**
 * Send via Resend
 */
async function sendViaResend(
  message: EmailMessage,
  html: string,
  text: string
): Promise<EmailDeliveryResult> {
  const personaName = getPersonaDisplayName(message.personaId);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config!.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${personaName} <${config!.fromEmail}>`,
      to: [message.to],
      subject: message.subject,
      html,
      text,
      reply_to: config!.replyToEmail,
      tags: message.tags?.map((t) => ({ name: 'category', value: t })),
      headers: {
        'X-User-Id': message.userId,
        'X-Outreach-Id': message.outreachId,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend error: ${response.status} - ${errorBody}`);
  }

  const data = (await response.json()) as { id: string };

  return { success: true, messageId: data.id, status: 'sent' };
}

/**
 * Send email with retry logic
 */
export async function sendEmailWithRetry(
  message: EmailMessage,
  retryCount = 0
): Promise<EmailDeliveryResult> {
  const result = await sendEmail(message);

  if (result.success) {
    return result;
  }

  // Check if we should retry
  if (retryCount < MAX_RETRIES) {
    const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];

    log.info(
      {
        userId: message.userId,
        retryCount: retryCount + 1,
        delayMs: delay,
      },
      '🔄 Scheduling email retry'
    );

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingRetries.delete(message.outreachId);
        void sendEmailWithRetry(message, retryCount + 1).then(resolve);
      }, delay);

      pendingRetries.set(message.outreachId, timeout);
    });
  }

  return result;
}

// ============================================================================
// STATUS HANDLING
// ============================================================================

/**
 * Handle email webhook (open, click, bounce, etc.)
 */
export function handleEmailEvent(
  messageId: string,
  event: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed',
  details?: {
    url?: string;
    bounceReason?: string;
  }
): void {
  const record = deliveryRecords.get(messageId);
  if (!record) {
    log.warn({ messageId }, 'Received event for unknown email');
    return;
  }

  switch (event) {
    case 'delivered':
      record.status = 'delivered';
      record.deliveredAt = new Date();
      log.info({ messageId, userId: record.userId }, '✅ Email delivered');
      break;

    case 'opened':
      record.status = 'opened';
      record.openedAt = new Date();
      log.info({ messageId, userId: record.userId }, '👁️ Email opened');
      break;

    case 'clicked':
      record.status = 'clicked';
      record.clickedAt = new Date();
      if (details?.url) {
        record.clickedLinks = record.clickedLinks || [];
        record.clickedLinks.push(details.url);
      }
      log.info({ messageId, userId: record.userId, url: details?.url }, '🔗 Email link clicked');
      break;

    case 'bounced':
      record.status = 'bounced';
      record.bounceReason = details?.bounceReason;
      log.warn(
        { messageId, userId: record.userId, reason: details?.bounceReason },
        '⚠️ Email bounced'
      );
      break;

    case 'failed':
      record.status = 'failed';
      log.error({ messageId, userId: record.userId }, '❌ Email failed');
      break;
  }

  deliveryRecords.set(messageId, record);
}

/**
 * Get delivery record
 */
export function getDeliveryRecord(messageId: string): EmailDeliveryRecord | undefined {
  return deliveryRecords.get(messageId);
}

/**
 * Get all delivery records for a user
 */
export function getUserDeliveryRecords(userId: string): EmailDeliveryRecord[] {
  return Array.from(deliveryRecords.values()).filter((r) => r.userId === userId);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cancel pending retry
 */
export function cancelPendingRetry(outreachId: string): boolean {
  const timeout = pendingRetries.get(outreachId);
  if (timeout) {
    clearTimeout(timeout);
    pendingRetries.delete(outreachId);
    return true;
  }
  return false;
}

/**
 * Clear old delivery records
 */
export function clearOldRecords(maxAgeDays = 90): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  let cleared = 0;
  for (const [id, record] of deliveryRecords) {
    if (record.sentAt < cutoff) {
      deliveryRecords.delete(id);
      cleared++;
    }
  }

  if (cleared > 0) {
    log.info({ cleared }, 'Cleared old email delivery records');
  }

  return cleared;
}

/**
 * Shutdown email delivery
 */
export function shutdownEmailDelivery(): void {
  for (const timeout of pendingRetries.values()) {
    clearTimeout(timeout);
  }
  pendingRetries.clear();
  log.info('Email delivery shut down');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const emailDelivery = {
  initialize: initializeEmailDelivery,
  isAvailable: isEmailDeliveryAvailable,
  send: sendEmail,
  sendWithRetry: sendEmailWithRetry,
  handleEvent: handleEmailEvent,
  getRecord: getDeliveryRecord,
  getUserRecords: getUserDeliveryRecords,
  cancelRetry: cancelPendingRetry,
  clearOldRecords,
  shutdown: shutdownEmailDelivery,
  generateHTML: generatePersonaEmailHTML,
  generatePlainText,
};

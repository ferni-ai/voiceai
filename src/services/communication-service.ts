/**
 * Communication Service
 *
 * Core communication functions: email, SMS, reminders.
 * This is the implementation layer - use this for direct API calls.
 *
 * For LLM tools, use `tools/domains/communication/` instead.
 */

import { getLogger } from '../utils/safe-logger.js';
import { consentBlocks } from './messaging/consent.js';
import {
  validateEmail,
  validatePhone,
  sanitizePlainText,
  sanitizeEmailForLog,
  sanitizePhoneForLog,
} from '../utils/validation.js';
import { MAX_RETRIES, RETRY_DELAY_MS, RETRY_MAX_DELAY_MS } from '../config/resilience-config.js';
import {
  getEmailSender,
  type EmailSendResult,
  type OutgoingEmail,
} from './email-transport/index.js';

// API Keys from environment
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

// ============================================================================
// RETRY UTILITY
// ============================================================================

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: MAX_RETRIES,
  baseDelayMs: RETRY_DELAY_MS,
  maxDelayMs: RETRY_MAX_DELAY_MS,
};

/** A provider answered with a non-2xx HTTP status. */
export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

/**
 * Whether a failed send is worth retrying, judged by HTTP status rather than
 * message text ("not authorized" matched none of the old keywords, so a key
 * without Mail Send was retried on every email). A 4xx is permanent, except
 * 408 and 429; a 5xx, timeout or network error may pass.
 */
export function isRetryableSendError(error: unknown): boolean {
  if (!(error instanceof ProviderHttpError)) return true;
  const { status } = error;
  if (status === 408 || status === 429) return true;
  return status < 400 || status >= 500;
}

/**
 * Execute a function with exponential backoff retry logic
 */
async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableSendError(error) || attempt === opts.maxRetries - 1) {
        throw lastError;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * 100,
        opts.maxDelayMs
      );

      getLogger().warn(
        { attempt: attempt + 1, maxRetries: opts.maxRetries, delay, error: lastError.message },
        'Retrying after failure'
      );

      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }

  throw lastError || new Error('Unknown error after retries');
}

// ============================================================================
// EMAIL SERVICE
// ============================================================================

/** True when the email transport (the ferni.ai Workspace mailbox) can send. */
export function isEmailConfigured(): boolean {
  return getEmailSender().isConfigured();
}

/**
 * Send one email through the app's transport (the ferni.ai Workspace mailbox).
 * Never throws; check `ok`. For callers that can't import
 * src/services/email-transport (L3 contexts).
 */
export async function sendAppEmail(email: OutgoingEmail): Promise<EmailSendResult> {
  return getEmailSender().send(email);
}

/**
 * The List-Unsubscribe mailto for 'bulk' mail that has no unsubscribe endpoint:
 * the app's From mailbox (EMAIL_FROM), which a person reads. admin@ is the
 * Workspace user when EMAIL_FROM is unset (docs/runbooks/email-via-workspace.md).
 */
export function unsubscribeMailbox(): string {
  return process.env.EMAIL_FROM?.trim() || 'admin@ferni.ai';
}

/** Who and what an email is for: carried to the transport as metadata, never sent. */
export interface AppEmailOptions {
  /** The member it is for (their account), when known. */
  userId?: string;
  /** What sent it, e.g. 'reminder' or 'agent-to-user'. */
  trigger?: string;
  /** The id of the thing it is about (reminder, outreach, call). */
  sourceId?: string;
}

/**
 * Send a plain-text (or HTML) email from Ferni. Throws when the transport says
 * it failed, so a caller never reports a send that didn't happen.
 *
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param body - Email body content
 * @param isHtml - Whether body is HTML (default: false)
 * @param options - userId / trigger / sourceId for the transport's metadata
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  isHtml = false,
  options: AppEmailOptions = {}
): Promise<string> {
  // Validate email
  const emailValidation = validateEmail(to);
  if (!emailValidation.valid) {
    throw new Error(`Invalid email address: ${sanitizeEmailForLog(to)}`);
  }

  const sender = getEmailSender();
  if (!sender.isConfigured()) {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment) {
      getLogger().warn(
        { provider: sender.provider },
        'Email transport not configured - email not sent (development mode)'
      );
      return `[DEV MODE] Would send email to ${sanitizeEmailForLog(to)}: ${subject}`;
    }

    getLogger().error(
      { provider: sender.provider },
      'Email transport not configured in production'
    );
    throw new Error(
      `Email service is not available: the ${sender.provider} transport is not configured. Contact support to enable email delivery.`
    );
  }

  const sanitizedBody = isHtml ? body : sanitizePlainText(body);
  const sanitizedSubject = sanitizePlainText(subject);

  // The Gmail transport retries and backs off itself; it never throws.
  const metadata = Object.fromEntries(
    Object.entries(options).filter((e): e is [string, string] => typeof e[1] === 'string')
  );
  const result = await sender.send({
    to,
    subject: sanitizedSubject,
    ...(isHtml ? { html: sanitizedBody } : { text: sanitizedBody }),
    fromName: 'Ferni',
    kind: 'transactional',
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  });
  if (!result.ok) {
    // A code only: never the address or the body.
    getLogger().warn({ provider: result.provider, code: result.status ?? 'send_failed', userId: options.userId }, 'Email not sent'); // prettier-ignore
    throw new Error(`Email send failed (${result.provider}): ${result.error ?? 'unknown error'}`);
  }

  getLogger().info(
    {
      to: sanitizeEmailForLog(to),
      subject: sanitizedSubject.slice(0, 50),
      provider: result.provider,
    },
    'Email sent successfully'
  );
  return `Email sent to ${sanitizeEmailForLog(to)}: "${sanitizedSubject}"`;
}

// ============================================================================
// SMS SERVICE
// ============================================================================

/** Who a text is for, so a MINOR_CARE_SHARED_HOLD on their account stops it too. */
export interface SmsOptions {
  /** The member it is for or from (their account), when known. */
  userId?: string;
  /** Asked for in the call just now (a verification code): a hold doesn't stop it. */
  askedNow?: boolean;
}

/**
 * MINOR_CARE_SHARED_HOLD: `to`, or the account opts.userId, is held by a call under 18 and this
 * was not asked for just now. For senders that may not import services/outreach (a lower layer).
 */
export async function textHeld(to: string, opts: SmsOptions = {}): Promise<boolean> {
  const { heldSender } = await import('./outreach/checkin-replies.js');
  return !opts.askedNow && heldSender(opts.userId, to);
}

/**
 * textHeld for the senders that reach Twilio themselves (in-call tools, the group call, voice
 * messages, family check-ins): true when that text or call must not go. Logged without the number.
 */
export async function directSendHeld(
  to: string,
  what: 'text' | 'call',
  opts: SmsOptions = {}
): Promise<boolean> {
  if (!(await textHeld(to, opts))) return false;
  getLogger().info({ what }, 'Not sent: MINOR_CARE_SHARED_HOLD');
  return true;
}

/**
 * Send an SMS via Twilio. MINOR_CARE_SHARED_HOLD: never to an account (opts.userId) or a number
 * a call held under 18, unless asked for just now (the code they asked for).
 */
export async function sendSMS(to: string, message: string, opts: SmsOptions = {}): Promise<string> {
  // Validate phone number
  const phoneValidation = validatePhone(to);
  if (!phoneValidation.valid) {
    throw new Error(`Invalid phone number: ${sanitizePhoneForLog(to)}`);
  }
  if (await textHeld(to, opts)) throw new Error('SMS not sent: held');

  // Check Twilio credentials
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment) {
      getLogger().warn('Twilio credentials not configured - SMS not sent (development mode)');
      return `[DEV MODE] Would send SMS to ${sanitizePhoneForLog(to)}: ${message.slice(0, 50)}...`;
    }

    getLogger().error('Twilio credentials not configured in production');
    throw new Error(
      'SMS service is not available: Twilio credentials are not configured. Contact support to enable SMS delivery.'
    );
  }

  // MESSAGING_PIPELINE: every text through here stops at an opt-out (consent/{phoneHash}).
  const refused = await consentBlocks(to, 'sms', true);
  if (refused) throw new Error(`SMS not sent: ${refused}`);

  const sanitizedMessage = sanitizePlainText(message);

  return withRetry(async () => {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: to,
        From: TWILIO_PHONE_NUMBER,
        Body: sanitizedMessage,
      }),
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ProviderHttpError(
        `Twilio error: ${response.status} - ${JSON.stringify(errorData)}`,
        response.status
      );
    }

    getLogger().info(
      { to: sanitizePhoneForLog(to), messageLength: sanitizedMessage.length },
      'SMS sent successfully'
    );

    return `SMS sent to ${sanitizePhoneForLog(to)}`;
  });
}

/**
 * A text to someone other than the member, sent by `send` (this module's SMS or
 * a voice message) only if guarded-text's guards allow it: never after their
 * STOP, not in quiet hours, not twice in ten minutes. Says plainly when not sent.
 */
export async function guardedThirdPartySend(
  phone: string,
  body: string,
  userId: string,
  send: () => Promise<string>
): Promise<string> {
  const { defaultTextDeps, onBehalfNotSent, textOnBehalf } =
    await import('./outreach/guarded-text.js');
  let reply = '';
  const sent = await textOnBehalf(
    { senderUserId: userId, toPhone: phone, body, refId: `text_${Date.now()}` },
    {
      ...defaultTextDeps(),
      send: async () => {
        reply = await send();
        return { success: true };
      },
    }
  );
  return sent.sent ? reply : onBehalfNotSent(sanitizePhoneForLog(phone), sent.reason);
}

// ============================================================================
// REMINDER SERVICE
// ============================================================================

/**
 * Send a reminder via SMS
 *
 * @param to - Phone number to send to
 * @param reminderText - The reminder message
 * @param context - Optional context to include
 */
export async function sendReminder(
  to: string,
  reminderText: string,
  context?: string
): Promise<string> {
  const message = context
    ? `⏰ Reminder: ${reminderText}\n\nContext: ${context}`
    : `⏰ Reminder: ${reminderText}`;

  return sendSMS(to, message);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  sendEmail,
  sendSMS,
  sendReminder,
};

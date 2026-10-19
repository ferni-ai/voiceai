/**
 * Communication Service
 *
 * Core communication functions: email, SMS, reminders.
 * This is the implementation layer - use this for direct API calls.
 *
 * For LLM tools, use `tools/domains/communication/` instead.
 */

import { getLogger } from '../utils/safe-logger.js';
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

/** True when the configured email transport (EMAIL_PROVIDER) can send. */
export function isEmailConfigured(): boolean {
  return getEmailSender().isConfigured();
}

/**
 * Send one email through the app's transport (SendGrid or the ferni.ai Workspace,
 * per EMAIL_PROVIDER). Never throws; check `ok`. For callers that can't import
 * src/services/email-transport (L3 contexts).
 */
export async function sendAppEmail(email: OutgoingEmail): Promise<EmailSendResult> {
  return getEmailSender().send(email);
}

/**
 * Send a plain-text (or HTML) email from Ferni.
 *
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param body - Email body content
 * @param isHtml - Whether body is HTML (default: false)
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  isHtml = false
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

  // Gmail backs off inside its transport. SendGrid doesn't retry at all, so its
  // failures are retried here by status (isRetryableSendError: 408, 429, 5xx),
  // plus a network error, which has no status.
  const retryHere = sender.provider === 'sendgrid';
  let result: EmailSendResult;
  try {
    result = await withRetry(async () => {
      const attempt = await sender.send({
        to,
        subject: sanitizedSubject,
        ...(isHtml ? { html: sanitizedBody } : { text: sanitizedBody }),
        from: 'hello@ferni.ai',
        fromName: 'Ferni',
        kind: 'transactional',
      });
      if (retryHere && !attempt.ok && (attempt.status || attempt.retryable)) {
        const message = attempt.error ?? 'send failed';
        throw attempt.status ? new ProviderHttpError(message, attempt.status) : new Error(message);
      }
      return attempt;
    });
  } catch (error) {
    throw new Error(`Email send failed (${sender.provider}): ${(error as Error).message}`);
  }
  if (!result.ok)
    throw new Error(`Email send failed (${result.provider}): ${result.error ?? 'unknown error'}`);

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

/**
 * Send an SMS via Twilio
 */
export async function sendSMS(to: string, message: string): Promise<string> {
  // Validate phone number
  const phoneValidation = validatePhone(to);
  if (!phoneValidation.valid) {
    throw new Error(`Invalid phone number: ${sanitizePhoneForLog(to)}`);
  }

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

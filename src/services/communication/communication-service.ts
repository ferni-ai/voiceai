/**
 * Communication Service
 *
 * Core communication functions: email, SMS, reminders.
 * This is the implementation layer - use this for direct API calls.
 *
 * For LLM tools, use `tools/domains/communication/` instead.
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  validateEmail,
  validatePhone,
  sanitizePlainText,
  sanitizeEmailForLog,
  sanitizePhoneForLog,
} from '../../utils/validation.js';

// API Keys from environment
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
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
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
};

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

      // Don't retry on validation or authentication errors
      const nonRetryableMessages = ['Invalid', 'Unauthorized', 'Forbidden', 'not configured'];
      const shouldSkipRetry = nonRetryableMessages.some((msg) => lastError?.message.includes(msg));

      if (shouldSkipRetry || attempt === opts.maxRetries - 1) {
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

/**
 * Send an email via SendGrid
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

  // Check API key
  if (!SENDGRID_API_KEY) {
    getLogger().warn('SendGrid API key not configured - email not sent');
    return `[DEV MODE] Would send email to ${sanitizeEmailForLog(to)}: ${subject}`;
  }

  const sanitizedBody = isHtml ? body : sanitizePlainText(body);
  const sanitizedSubject = sanitizePlainText(subject);

  return withRetry(async () => {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'hello@ferni.ai', name: 'Ferni' },
        subject: sanitizedSubject,
        content: [{ type: isHtml ? 'text/html' : 'text/plain', value: sanitizedBody }],
      }),
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SendGrid error: ${response.status} - ${errorText}`);
    }

    getLogger().info(
      { to: sanitizeEmailForLog(to), subject: sanitizedSubject.slice(0, 50) },
      'Email sent successfully'
    );

    return `Email sent to ${sanitizeEmailForLog(to)}: "${sanitizedSubject}"`;
  });
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
    getLogger().warn('Twilio credentials not configured - SMS not sent');
    return `[DEV MODE] Would send SMS to ${sanitizePhoneForLog(to)}: ${message.slice(0, 50)}...`;
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
      throw new Error(`Twilio error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    getLogger().info(
      { to: sanitizePhoneForLog(to), messageLength: sanitizedMessage.length },
      'SMS sent successfully'
    );

    return `SMS sent to ${sanitizePhoneForLog(to)}`;
  });
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

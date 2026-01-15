/**
 * Twilio SMS Service
 *
 * Simple SMS sending via Twilio. Used for 2FA verification,
 * appointment reminders, and other outreach.
 */

import { getLogger } from '../utils/safe-logger.js';
import { getCircuitBreaker } from '../utils/circuit-breaker.js';

const log = getLogger().child({ module: 'TwilioSMS' });

// Circuit breaker for Twilio API - prevents hammering a failing service
const twilioCircuitBreaker = getCircuitBreaker('twilio-sms', {
  failureThreshold: 5, // Open circuit after 5 failures
  resetTimeout: 60_000, // Try again after 60s (Twilio errors often need time to clear)
  successThreshold: 2, // Need 2 successes to close
});

// Lazy-loaded Twilio client
let twilioClient: ReturnType<typeof import('twilio')> | null = null;

/**
 * Get or create the Twilio client
 */
async function getTwilioClient() {
  if (twilioClient) return twilioClient;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    log.warn('Twilio not configured - SMS sending disabled');
    return null;
  }

  try {
    const twilio = await import('twilio');
    twilioClient = twilio.default(accountSid, authToken);
    log.info('Twilio client initialized');
    return twilioClient;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Twilio client');
    return null;
  }
}

/**
 * Check if Twilio SMS is configured
 */
export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

/**
 * Send an SMS message (with circuit breaker protection)
 *
 * @param to - Phone number to send to (E.164 format)
 * @param body - Message body
 * @returns Message SID if successful, null if failed
 */
export async function sendSMS(to: string, body: string): Promise<string | null> {
  const client = await getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!client || !from) {
    log.warn({ to: to.slice(-4) }, 'SMS not sent - Twilio not configured');
    return null;
  }

  // Check if circuit breaker allows the request
  if (!twilioCircuitBreaker.canRequest()) {
    log.warn({ to: to.slice(-4) }, 'SMS not sent - Twilio circuit breaker is open');
    return null;
  }

  try {
    return await twilioCircuitBreaker.execute(async () => {
      // Ensure phone number is in E.164 format
      const formattedTo = formatPhoneNumber(to);

      const message = await client.messages.create({
        body,
        to: formattedTo,
        from,
      });

      log.info(
        { messageSid: message.sid, to: formattedTo.slice(-4), status: message.status },
        '📱 SMS sent successfully'
      );

      return message.sid;
    });
  } catch (error) {
    log.error({ error: String(error), to: to.slice(-4) }, '❌ Failed to send SMS');
    return null;
  }
}

/**
 * Send a verification code SMS
 *
 * @param to - Phone number
 * @param code - 6-digit verification code
 * @returns Message SID if successful
 */
export async function sendVerificationCode(to: string, code: string): Promise<string | null> {
  const message = `Your Ferni code is ${code}. Just making sure it's really you! 💚`;
  return sendSMS(to, message);
}

/**
 * Send an appointment reminder SMS
 *
 * @param to - Phone number
 * @param appointmentDetails - Details about the appointment
 * @returns Message SID if successful
 */
export async function sendAppointmentReminder(
  to: string,
  appointmentDetails: {
    title: string;
    date: string;
    time: string;
    location?: string;
  }
): Promise<string | null> {
  let message = `Hey! Quick reminder: ${appointmentDetails.title} on ${appointmentDetails.date} at ${appointmentDetails.time}`;
  if (appointmentDetails.location) {
    message += ` at ${appointmentDetails.location}`;
  }
  message += '. You got this! 💚 -Ferni';
  return sendSMS(to, message);
}

/**
 * Send a check-in SMS
 *
 * @param to - Phone number
 * @param message - Personalized check-in message
 * @returns Message SID if successful
 */
export async function sendCheckIn(to: string, message: string): Promise<string | null> {
  // Add Ferni signature
  const fullMessage = `${message} 💚 -Ferni`;
  return sendSMS(to, fullMessage);
}

/**
 * Format phone number to E.164 format
 */
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If it's 10 digits, assume US number and add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // If it's 11 digits starting with 1, add +
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // If it already starts with +, return as-is
  if (phone.startsWith('+')) {
    return phone;
  }

  // Otherwise, assume it needs a + prefix
  return `+${digits}`;
}

export default {
  sendSMS,
  sendVerificationCode,
  sendAppointmentReminder,
  sendCheckIn,
  isTwilioConfigured,
};

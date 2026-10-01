/**
 * Appointment integration helpers: transcription analysis, calendar events,
 * user notifications and date parsing. Stateless functions extracted from the
 * AppointmentIntegrationService in appointment-integration.ts.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { sendEmail, sendSMS } from '../communication-service.js';
import { createAppointmentEvent, isCalendarConfigured } from '../identity/google-calendar-oauth.js';
import type { AppointmentRequest } from './appointment-integration-types.js';

/**
 * User notifications are best-effort: a failed or unconfigured send is logged
 * (never reported as delivered) and must not break the appointment flow.
 */
async function notifyBestEffort(
  channel: 'sms' | 'email',
  send: () => Promise<string>
): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (error) {
    getLogger().warn({ error: String(error), channel }, 'Appointment notification not sent');
    return false;
  }
}

// Read at runtime for testability
export function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL || 'https://api.ferni.ai/webhooks/twilio',
  };
}

/**
 * Analyze transcription to determine appointment outcome
 */
export function analyzeTranscription(transcription: string): {
  confirmed: boolean;
  confirmedDateTime?: Date;
  confirmationNumber?: string;
  needsCallback: boolean;
} {
  const lower = transcription.toLowerCase();

  // Check for confirmation indicators
  const confirmationPhrases = [
    'confirmed',
    'booked',
    'see you',
    'we have you down',
    'all set',
    'appointment is set',
    "you're scheduled",
  ];

  const confirmed = confirmationPhrases.some((phrase) => lower.includes(phrase));

  // Check for callback indicators
  const callbackPhrases = [
    'call you back',
    "we'll call",
    'give you a call',
    'check and call',
    'let you know',
  ];

  const needsCallback = callbackPhrases.some((phrase) => lower.includes(phrase));

  // Try to extract time from transcription
  let confirmedDateTime: Date | undefined;
  const timePatterns = [
    /(\d{1,2})\s*(am|pm)/i,
    /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  ];

  // Basic extraction - in production, use NLP
  for (const pattern of timePatterns) {
    const match = lower.match(pattern);
    if (match) {
      // Would parse properly in production
      break;
    }
  }

  // Try to extract confirmation number
  let confirmationNumber: string | undefined;
  const confMatch = transcription.match(
    /(?:confirmation|reference|booking)\s*(?:number|#|:)?\s*(\w+)/i
  );
  if (confMatch) {
    confirmationNumber = confMatch[1];
  }

  return {
    confirmed,
    confirmedDateTime,
    confirmationNumber,
    needsCallback: needsCallback && !confirmed,
  };
}

/**
 * Create calendar event for confirmed appointment
 */
export async function createCalendarEventForAppointment(
  appointmentId: string,
  request: AppointmentRequest,
  confirmedDate: Date
): Promise<string | null> {
  if (!(await isCalendarConfigured(request.userId))) {
    getLogger().debug({ userId: request.userId }, 'Calendar not configured for user');
    return null;
  }

  try {
    const event = await createAppointmentEvent(request.userId, {
      title: `${request.appointmentType.charAt(0).toUpperCase() + request.appointmentType.slice(1)} at ${request.businessName}`,
      description: request.specialRequests
        ? `Special requests: ${request.specialRequests}\n\nScheduled by Ferni`
        : 'Scheduled by Ferni',
      location: request.businessName,
      startTime: confirmedDate,
      durationMinutes: request.appointmentType === 'restaurant' ? 90 : 60,
      reminders: [
        { method: 'popup', minutes: 60 },
        { method: 'email', minutes: 24 * 60 }, // 1 day before
      ],
    });

    if (event?.id) {
      getLogger().info({ appointmentId, eventId: event.id }, '📅 Calendar event created');
      return event.id;
    }
  } catch (error) {
    getLogger().error({ appointmentId, error }, 'Failed to create calendar event');
  }

  return null;
}

/**
 * Notify user of confirmation
 */
export async function notifyUserOfConfirmation(
  appointmentId: string,
  request: AppointmentRequest,
  confirmationNumber: string,
  confirmedDate: Date
): Promise<void> {
  const dateStr = confirmedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const message = `✅ Your ${request.appointmentType} at ${request.businessName} is confirmed for ${dateStr}! Confirmation: ${confirmationNumber}`;

  if (request.notifyVia === 'sms' || request.notifyVia === 'both') {
    if (request.notifyContact) {
      await notifyBestEffort('sms', () => sendSMS(request.notifyContact ?? '', message));
    }
  }

  if (request.notifyVia === 'email' || request.notifyVia === 'both') {
    if (request.notifyContact?.includes('@')) {
      await notifyBestEffort('email', () =>
        sendEmail(
          request.notifyContact ?? '',
          `✅ Appointment Confirmed - ${request.businessName}`,
          `${message}\n\n— Your Ferni assistant`
        )
      );
    }
  }

  getLogger().info(
    { appointmentId, notifyVia: request.notifyVia },
    'User notified of confirmation'
  );
}

/**
 * Notify user of delay
 */
export async function notifyUserOfDelay(
  appointmentId: string,
  request: AppointmentRequest,
  reason: string
): Promise<void> {
  const message = `I'm still working on your ${request.appointmentType} appointment at ${request.businessName}. ${
    reason === 'no-answer' ? 'No answer yet' : 'Line was busy'
  } - I'll keep trying!`;

  if (request.notifyVia && request.notifyContact) {
    if (request.notifyVia === 'sms' || request.notifyVia === 'both') {
      await notifyBestEffort('sms', () => sendSMS(request.notifyContact ?? '', message));
    }
  }
}

/**
 * Notify user of failure
 */
export async function notifyUserOfFailure(
  appointmentId: string,
  request: AppointmentRequest
): Promise<void> {
  const message = `I wasn't able to reach ${request.businessName} for your ${request.appointmentType} appointment. Would you like me to try again or do you want to call them directly at ${request.businessPhone}?`;

  if (request.notifyVia && request.notifyContact) {
    if (request.notifyVia === 'sms' || request.notifyVia === 'both') {
      await notifyBestEffort('sms', () => sendSMS(request.notifyContact ?? '', message));
    }
  }
}

/**
 * Parse natural language date/time into Date object
 */
export function parseRequestedDateTime(dateStr: string, timeStr: string): Date {
  const now = new Date();
  const targetDate = new Date(now);

  // Parse date
  const dateLower = dateStr.toLowerCase();
  if (dateLower.includes('tomorrow')) {
    targetDate.setDate(now.getDate() + 1);
  } else if (dateLower.includes('next week')) {
    targetDate.setDate(now.getDate() + 7);
  } else if (dateLower.includes('next')) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
      if (dateLower.includes(days[i])) {
        const currentDay = now.getDay();
        const daysUntil = (i - currentDay + 7) % 7 || 7;
        targetDate.setDate(now.getDate() + daysUntil);
        break;
      }
    }
  }

  // Parse time
  const timeLower = timeStr.toLowerCase();
  const timeMatch = timeLower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3];

    if (ampm === 'pm' && hours !== 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    targetDate.setHours(hours, minutes, 0, 0);
  } else {
    // Default to noon
    targetDate.setHours(12, 0, 0, 0);
  }

  return targetDate;
}

/**
 * Check if Twilio is configured
 */
export function isTwilioConfigured(): boolean {
  const config = getTwilioConfig();
  return !!(config.accountSid && config.authToken && config.phoneNumber);
}

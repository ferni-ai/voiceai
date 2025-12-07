/**
 * Appointment Core Functions
 *
 * Core appointment management functions including creation, status updates, and calling.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { validatePhone, sanitizePhoneForLog } from '../validation.js';
import { getAppointmentFollowUpService } from '../../services/appointment-followup.js';
import type { AppointmentType, AppointmentStatus, ScheduledAppointment } from './types.js';

// Twilio credentials
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

// In-memory storage (production would use database)
const appointments = new Map<string, ScheduledAppointment>();

// ============================================================================
// APPOINTMENT MANAGEMENT
// ============================================================================

/**
 * Create a new appointment request and track it for follow-up
 */
export function createAppointmentRequest(params: {
  userId: string;
  type: AppointmentType;
  businessName: string;
  businessPhone?: string;
  requestedDateTime: Date;
  partySize?: number;
  forPerson?: string;
  specialRequests?: string;
  linkedMilestoneId?: string;
  linkedEventName?: string;
}): ScheduledAppointment {
  const id = `apt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const appointment: ScheduledAppointment = {
    id,
    userId: params.userId,
    type: params.type,
    businessName: params.businessName,
    businessPhone: params.businessPhone,
    requestedDateTime: params.requestedDateTime,
    partySize: params.partySize,
    forPerson: params.forPerson,
    specialRequests: params.specialRequests,
    linkedMilestoneId: params.linkedMilestoneId,
    linkedEventName: params.linkedEventName,
    status: 'pending',
    callAttempts: 0,
    notes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  appointments.set(id, appointment);

  // Also track in follow-up service for automatic retry logic
  try {
    const followUpService = getAppointmentFollowUpService();
    followUpService.trackAppointment({
      id,
      userId: params.userId,
      type:
        params.type === 'restaurant'
          ? 'restaurant'
          : params.linkedMilestoneId
            ? 'life_event'
            : 'service',
      businessName: params.businessName,
      businessPhone: params.businessPhone,
      requestedDateTime: params.requestedDateTime,
      status: 'pending',
      maxCallAttempts: 3,
      linkedMilestoneId: params.linkedMilestoneId,
      linkedEventName: params.linkedEventName,
      partySize: params.partySize,
      specialRequests: params.specialRequests,
    });
  } catch (error) {
    getLogger().warn({ error }, 'Could not track appointment for follow-up');
  }

  getLogger().info(
    { id, type: params.type, business: params.businessName },
    'Appointment request created'
  );

  return appointment;
}

/**
 * Update appointment status
 */
export function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  note?: string,
  confirmedDateTime?: Date,
  confirmationNumber?: string
): ScheduledAppointment | null {
  const apt = appointments.get(id);
  if (!apt) return null;

  apt.status = status;
  apt.updatedAt = new Date();

  if (confirmedDateTime) apt.confirmedDateTime = confirmedDateTime;
  if (confirmationNumber) apt.confirmationNumber = confirmationNumber;
  if (note) apt.notes.push(`[${new Date().toISOString()}] ${note}`);

  appointments.set(id, apt);
  return apt;
}

/**
 * Get an appointment by ID
 */
export function getAppointment(id: string): ScheduledAppointment | undefined {
  return appointments.get(id);
}

/**
 * Get all appointments for a user
 */
export function getUserAppointments(userId: string): ScheduledAppointment[] {
  return Array.from(appointments.values()).filter((apt) => apt.userId === userId);
}

// ============================================================================
// CALL FUNCTIONALITY
// ============================================================================

/**
 * Generate a call script for making an appointment
 */
export function generateCallScript(apt: ScheduledAppointment): string {
  const dateStr = apt.requestedDateTime.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = apt.requestedDateTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  let script = `Hi, this is Alex calling on behalf of a client. `;

  switch (apt.type) {
    case 'restaurant':
      script += `I'd like to make a reservation for ${apt.partySize || 2} on ${dateStr} at ${timeStr}. `;
      break;
    case 'doctor':
    case 'dentist':
      script += `I'm calling to schedule an appointment for ${apt.forPerson || 'my client'} on ${dateStr} around ${timeStr} if available. `;
      break;
    case 'salon':
    case 'spa':
      script += `I'd like to book an appointment for ${dateStr} at ${timeStr}. `;
      break;
    default:
      script += `I'm calling to schedule an appointment for ${dateStr} at ${timeStr}. `;
  }

  if (apt.specialRequests) {
    script += `Special requests: ${apt.specialRequests}. `;
  }

  script += `Could you confirm availability?`;

  return script;
}

/**
 * Make an outbound call to schedule an appointment
 */
export async function makeAppointmentCall(apt: ScheduledAppointment): Promise<string> {
  if (!apt.businessPhone) {
    return `I need a phone number for ${apt.businessName} to make this call. Do you have their number?`;
  }

  const validation = validatePhone(apt.businessPhone);
  if (!validation.valid) {
    return `That phone number for ${apt.businessName} doesn't look right. Can you double-check it?`;
  }

  const validPhone = validation.sanitized as string;
  const followUpService = getAppointmentFollowUpService();

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    // Simulate the call for demo/testing
    getLogger().warn('Twilio not configured - simulating appointment call');

    apt.callAttempts++;
    apt.lastCallAt = new Date();
    apt.status = 'calling';
    appointments.set(apt.id, apt);

    // Record the attempt in follow-up service
    followUpService.recordCallAttempt(apt.id, 'connected');
    followUpService.updateStatus(apt.id, 'awaiting_callback', {
      note: 'Call simulated (Twilio not configured)',
    });

    const script = generateCallScript(apt);
    getLogger().info(
      {
        appointmentId: apt.id,
        business: apt.businessName,
        phone: sanitizePhoneForLog(validPhone),
        script: `${script.slice(0, 100)}...`,
      },
      'Simulated appointment call'
    );

    return `I'm calling ${apt.businessName} now to make your ${apt.type} appointment. Script: "${script.slice(0, 100)}..." - I'll let you know once it's confirmed!`;
  }

  try {
    const script = generateCallScript(apt);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${script}</Say>
  <Pause length="3"/>
  <Say voice="alice">Thank you! I'll wait for your response.</Say>
  <Record maxLength="60" transcribe="true"/>
</Response>`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: validPhone,
          From: TWILIO_PHONE_NUMBER,
          Twiml: twiml,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    apt.callAttempts++;
    apt.lastCallAt = new Date();
    apt.status = 'calling';

    if (response.ok) {
      const data = (await response.json()) as { sid?: string };
      apt.notes.push(`Call initiated: ${data.sid}`);
      appointments.set(apt.id, apt);

      // Record successful call initiation
      followUpService.recordCallAttempt(apt.id, 'connected');
      followUpService.updateStatus(apt.id, 'awaiting_callback', {
        note: `Call initiated via Twilio: ${data.sid}`,
      });

      getLogger().info(
        {
          appointmentId: apt.id,
          callSid: data.sid,
          business: apt.businessName,
        },
        'Appointment call initiated'
      );

      return `I'm calling ${apt.businessName} right now to make your ${apt.type} appointment! I'll update you once I hear back.`;
    } else {
      apt.notes.push(`Call failed: ${response.status}`);
      appointments.set(apt.id, apt);

      // Record failed attempt - will trigger retry
      followUpService.recordCallAttempt(apt.id, 'error');

      return `I had trouble reaching ${apt.businessName}. I'll try again in about 30 minutes, or would you like me to try a different approach?`;
    }
  } catch (error) {
    getLogger().error({ error, appointmentId: apt.id }, 'Appointment call error');
    apt.notes.push(`Call error: ${error}`);
    appointments.set(apt.id, apt);

    // Record error - will trigger retry
    followUpService.recordCallAttempt(apt.id, 'error');

    return `Something went wrong trying to call ${apt.businessName}. I'll try again automatically, or let me know if you want to cancel.`;
  }
}

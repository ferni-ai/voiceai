/**
 * Appointment Core Functions
 *
 * Core appointment management functions: creation and status updates. Nothing
 * here calls a business; see businessCallReply.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getAppointmentFollowUpService } from '../../services/scheduling/appointment-followup.js';
import {
  syncAppointmentToCalendar,
  updateCalendarSyncedItem,
  removeCalendarSyncedItem,
} from '../../services/calendar/calendar-bridge.js';
import type { AppointmentType, AppointmentStatus, ScheduledAppointment } from './types.js';

// In-memory storage (production would use database)
const appointments = new Map<string, ScheduledAppointment>();

// ============================================================================
// APPOINTMENT MANAGEMENT
// ============================================================================

/**
 * Create a new appointment request and track it for follow-up
 */
export async function createAppointmentRequest(params: {
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
}): Promise<ScheduledAppointment> {
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

  // Sync appointment to calendar for unified visibility
  // Even pending appointments should appear on the calendar (marked as tentative)
  try {
    const appointmentTitle = getAppointmentTitle(params.type, params.businessName);
    const calendarResult = await syncAppointmentToCalendar(
      params.userId,
      id,
      appointmentTitle,
      params.requestedDateTime,
      {
        location: params.businessName,
        contactName: params.forPerson,
        description: buildAppointmentDescription(appointment),
        durationMinutes: getDefaultDuration(params.type),
      }
    );

    if (calendarResult.success) {
      getLogger().info(
        {
          appointmentId: id,
          calendarEventId: calendarResult.calendarEventId,
        },
        '📅 Appointment synced to calendar'
      );

      if (calendarResult.conflicts && calendarResult.conflicts.length > 0) {
        getLogger().warn(
          {
            appointmentId: id,
            conflicts: calendarResult.conflicts.length,
          },
          '⚠️ Appointment conflicts with existing calendar events'
        );
      }
    }
  } catch (calendarError) {
    // Don't fail appointment creation if calendar sync fails
    getLogger().warn(
      { error: String(calendarError), appointmentId: id },
      '⚠️ Failed to sync appointment to calendar'
    );
  }

  return appointment;
}

/**
 * Generate a human-readable title for the appointment
 */
function getAppointmentTitle(type: AppointmentType, businessName: string): string {
  const typeLabels: Record<AppointmentType, string> = {
    restaurant: 'Reservation',
    doctor: 'Doctor Appointment',
    dentist: 'Dentist Appointment',
    salon: 'Salon Appointment',
    spa: 'Spa Appointment',
    vet: 'Vet Appointment',
    veterinary: 'Vet Appointment',
    service: 'Service Appointment',
    general_service: 'Appointment',
    consultation: 'Consultation',
    meeting: 'Meeting',
    other: 'Appointment',
  };
  return `${typeLabels[type] || 'Appointment'} at ${businessName}`;
}

/**
 * Get default appointment duration based on type
 */
function getDefaultDuration(type: AppointmentType): number {
  const durations: Record<AppointmentType, number> = {
    restaurant: 90,
    doctor: 60,
    dentist: 60,
    salon: 60,
    spa: 120,
    vet: 45,
    veterinary: 45,
    service: 60,
    general_service: 60,
    consultation: 60,
    meeting: 60,
    other: 60,
  };
  return durations[type] || 60;
}

/**
 * Build appointment description for calendar
 */
function buildAppointmentDescription(apt: ScheduledAppointment): string {
  const parts: string[] = [];

  if (apt.forPerson) {
    parts.push(`For: ${apt.forPerson}`);
  }
  if (apt.partySize) {
    parts.push(`Party size: ${apt.partySize}`);
  }
  if (apt.specialRequests) {
    parts.push(`Special requests: ${apt.specialRequests}`);
  }
  if (apt.status !== 'confirmed') {
    parts.push(`\nStatus: ${apt.status.toUpperCase()} - awaiting confirmation`);
  }
  if (apt.confirmationNumber) {
    parts.push(`Confirmation #: ${apt.confirmationNumber}`);
  }

  parts.push(`\n[Ferni ID: ${apt.id}]`);

  return parts.join('\n');
}

/**
 * Update appointment status
 */
export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  note?: string,
  confirmedDateTime?: Date,
  confirmationNumber?: string
): Promise<ScheduledAppointment | null> {
  const apt = appointments.get(id);
  if (!apt) return null;

  apt.status = status;
  apt.updatedAt = new Date();

  if (confirmedDateTime) apt.confirmedDateTime = confirmedDateTime;
  if (confirmationNumber) apt.confirmationNumber = confirmationNumber;
  if (note) apt.notes.push(`[${new Date().toISOString()}] ${note}`);

  appointments.set(id, apt);

  // Update or remove calendar event based on status
  try {
    if (status === 'cancelled') {
      // Remove from calendar when cancelled
      await removeCalendarSyncedItem(apt.userId, id);
      getLogger().info({ appointmentId: id }, '📅 Cancelled appointment removed from calendar');
    } else if (status === 'confirmed' && confirmedDateTime) {
      // Update calendar event with confirmed time
      await updateCalendarSyncedItem(apt.userId, id, {
        scheduledFor: confirmedDateTime,
        description: buildAppointmentDescription(apt),
      });
      getLogger().info(
        { appointmentId: id },
        '📅 Calendar updated with confirmed appointment time'
      );
    } else {
      // Update calendar event with new status
      await updateCalendarSyncedItem(apt.userId, id, {
        description: buildAppointmentDescription(apt),
      });
    }
  } catch (calendarError) {
    getLogger().warn(
      { error: String(calendarError), appointmentId: id },
      '⚠️ Failed to update calendar for appointment status change'
    );
  }

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
// CALLS TO THE BUSINESS
// ============================================================================

/**
 * Said instead of calling. Ferni's callOnBehalf reads a call back and waits for
 * the caller's spoken yes before it dials (outbound-gate.ts).
 */
export const BUSINESS_CALL_OFFER =
  "I can call them for you another way: I'll tell you what I'll say first, and I'll only dial once you say yes. Want me to?";

/**
 * What an appointment tool says when booking needs a call to the business.
 *
 * These tools never dial. They used to POST straight to Twilio, read a one-way
 * script and record 60 seconds, with no read-back, no spoken yes and no outcome
 * loop. The request stays pending until a real call is made through
 * callOnBehalf.
 */
export function businessCallReply(apt: ScheduledAppointment): string {
  const saved = `I saved the ${apt.type} request for ${apt.businessName}, but I haven't called them, and I can't call a business from here.`;
  if (!apt.businessPhone) {
    return `${saved} If you give me their number, I can call them. I'll tell you what I'll say first, and I'll only dial once you say yes.`;
  }
  return `${saved} ${BUSINESS_CALL_OFFER}`;
}

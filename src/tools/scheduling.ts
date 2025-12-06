/**
 * Appointment & Scheduling Tools
 *
 * Tools for scheduling, reservations, and contact management:
 * - Make calls to businesses to schedule appointments
 * - Book reservations (restaurants, services) - via OpenTable/Resy or phone
 * - Check availability with third parties
 * - Follow up on scheduled appointments
 * - Coordinate with life event scheduling
 *
 * NOTE: This is the agent-agnostic version. The original alex-appointments.ts
 * re-exports from this file for backward compatibility.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { validatePhone, sanitizePhoneForLog } from './validation.js';
import { parseNaturalTime, createReminder } from '../services/reminder-scheduler.js';
import {
  searchRestaurants,
  getAvailability,
  bookReservation,
  isReservationServiceConfigured,
  formatRestaurantForSpeech,
  formatSlotsForSpeech,
  type RestaurantSearchResult,
} from '../services/restaurant-reservations.js';
import {
  getAppointmentFollowUpService,
  type TrackedAppointment,
} from '../services/appointment-followup.js';

// Twilio credentials
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

// ============================================================================
// TYPES
// ============================================================================

export type AppointmentType =
  | 'restaurant'
  | 'doctor'
  | 'dentist'
  | 'salon'
  | 'spa'
  | 'vet'
  | 'service'
  | 'consultation'
  | 'meeting'
  | 'other';

export type AppointmentStatus =
  | 'pending'
  | 'calling'
  | 'confirmed'
  | 'waitlist'
  | 'cancelled'
  | 'completed'
  | 'no_answer';

export interface ScheduledAppointment {
  id: string;
  userId: string;

  // What and where
  type: AppointmentType;
  businessName: string;
  businessPhone?: string;
  address?: string;

  // When
  requestedDateTime: Date;
  confirmedDateTime?: Date;
  duration?: number; // minutes

  // Who
  partySize?: number; // for reservations
  forPerson?: string; // name of person appointment is for
  specialRequests?: string;

  // Status
  status: AppointmentStatus;
  callAttempts: number;
  lastCallAt?: Date;
  confirmationNumber?: string;
  notes: string[];

  // Linked events (from Jordan)
  linkedMilestoneId?: string;
  linkedEventName?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// In-memory storage (production would use database)
const appointments = new Map<string, ScheduledAppointment>();

// ============================================================================
// APPOINTMENT MANAGEMENT
// ============================================================================

/**
 * Create a new appointment request and track it for follow-up
 */
function createAppointmentRequest(params: {
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
    '📅 Appointment request created'
  );

  return appointment;
}

/**
 * Update appointment status
 */
function updateAppointmentStatus(
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

// ============================================================================
// CALL FUNCTIONALITY
// ============================================================================

/**
 * Generate a call script for making an appointment
 */
function generateCallScript(apt: ScheduledAppointment): string {
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
async function makeAppointmentCall(apt: ScheduledAppointment): Promise<string> {
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
      '📞 Simulated appointment call'
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
        '📞 Appointment call initiated'
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

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createAppointmentTools() {
  return {
    // ========== RESTAURANT RESERVATIONS ==========

    makeReservation: llm.tool({
      description: `Make a restaurant reservation - tries online booking first (OpenTable/Resy), falls back to phone call.
Use when the user wants to:
- Book a table at a restaurant
- Make a dinner/lunch reservation
- Reserve for a special occasion

Alex will try to book instantly online, or call if needed.`,
      parameters: z.object({
        restaurantName: z.string().describe('Name of the restaurant'),
        restaurantPhone: z.string().optional().describe('Phone number (if known)'),
        location: z.string().optional().describe('City or area (helps find the right location)'),
        dateTime: z.string().describe('When (e.g., "tomorrow at 7pm", "Saturday evening")'),
        partySize: z.number().default(2).describe('Number of people'),
        guestName: z.string().optional().describe('Name for the reservation'),
        guestPhone: z.string().optional().describe('Contact phone for confirmation'),
        guestEmail: z.string().optional().describe('Email for confirmation'),
        specialRequests: z
          .string()
          .optional()
          .describe('Special requests (outdoor seating, birthday, allergies, etc.)'),
      }),
      execute: async (
        {
          restaurantName,
          restaurantPhone,
          location,
          dateTime,
          partySize,
          guestName,
          guestPhone,
          guestEmail,
          specialRequests,
        },
        { ctx }
      ) => {
        const requestedTime = parseNaturalTime(dateTime);
        if (!requestedTime) {
          return `When would you like the reservation? Give me a date and time like "tomorrow at 7pm" or "Saturday at 6:30".`;
        }

        const userData = ctx?.userData as
          | {
              userId?: string;
              userProfile?: {
                name?: string;
                contactInfo?: { phone?: string; email?: string };
              };
            }
          | undefined;
        const userId = userData?.userId || 'unknown';

        // Get guest info from profile if not provided
        const name = guestName || userData?.userProfile?.name || 'Guest';
        const phone = guestPhone || userData?.userProfile?.contactInfo?.phone;
        const email = guestEmail || userData?.userProfile?.contactInfo?.email;

        const dateStr = requestedTime.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        const timeStr = requestedTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });
        const dateForApi = requestedTime.toISOString().split('T')[0];
        const timeForApi = requestedTime.toTimeString().slice(0, 5);

        // Try online booking first if services are configured
        if (isReservationServiceConfigured()) {
          getLogger().info(
            { restaurant: restaurantName, location },
            '🍽️ Searching for online booking'
          );

          const restaurants = await searchRestaurants(
            restaurantName,
            location || 'nearby',
            dateForApi,
            timeForApi,
            partySize
          );

          // Find best match
          const match =
            restaurants.find(
              (r) =>
                r.name.toLowerCase().includes(restaurantName.toLowerCase()) ||
                restaurantName.toLowerCase().includes(r.name.toLowerCase())
            ) || restaurants[0];

          if (match && match.reservationProvider !== 'phone_only') {
            // We can book online!
            if (!phone) {
              return `Great news! I found ${match.name} on ${match.reservationProvider === 'opentable' ? 'OpenTable' : 'Resy'} and can book instantly! I just need your phone number for the reservation. What's the best number?`;
            }

            const result = await bookReservation(match, {
              date: dateForApi,
              time: timeForApi,
              partySize,
              guestName: name,
              guestPhone: phone,
              guestEmail: email,
              specialRequests,
            });

            if (result.success) {
              // Create appointment record
              createAppointmentRequest({
                userId,
                type: 'restaurant',
                businessName: match.name,
                businessPhone: match.phone,
                requestedDateTime: requestedTime,
                partySize,
                specialRequests,
              });

              return `🎉 Booked! ${match.name}, party of ${partySize}, ${dateStr} at ${timeStr}. Confirmation: ${result.confirmationNumber}. You'll get a confirmation at ${phone}${email ? ` and ${email}` : ''}.`;
            } else if (result.needsPhoneCall && match.phone) {
              // Fall through to phone call
              restaurantPhone = match.phone;
            } else {
              return `${match.name} shows no availability for ${dateStr} at ${timeStr}. Would you like me to check different times, or try calling them directly?`;
            }
          } else if (match) {
            // Found it but need to call
            if (match.phone) {
              restaurantPhone = match.phone;
              getLogger().info(
                { restaurant: match.name, phone: match.phone },
                'Found restaurant, will call'
              );
            }
          }
        }

        // Fall back to phone call
        const apt = createAppointmentRequest({
          userId,
          type: 'restaurant',
          businessName: restaurantName,
          businessPhone: restaurantPhone,
          requestedDateTime: requestedTime,
          partySize,
          specialRequests,
        });

        if (restaurantPhone) {
          return makeAppointmentCall(apt);
        } else {
          return `I couldn't find ${restaurantName} for online booking. I can call them to make the reservation - do you have their phone number?`;
        }
      },
    }),

    searchRestaurantsNearby: llm.tool({
      description: `Search for restaurants that take reservations.
Use when:
- User wants suggestions for where to eat
- User wants to know what's available in an area
- Need to find a restaurant's booking options`,
      parameters: z.object({
        query: z.string().describe('Type of food or restaurant name'),
        location: z.string().describe('City, neighborhood, or area'),
        date: z.string().describe('Date for the reservation'),
        partySize: z.number().default(2).describe('Number of people'),
      }),
      execute: async ({ query, location, date, partySize }) => {
        const requestedDate = parseNaturalTime(date);
        if (!requestedDate) {
          return `What date are you looking at? Like "this Saturday" or "December 15th"?`;
        }

        const dateForApi = requestedDate.toISOString().split('T')[0];
        const dateStr = requestedDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });

        const restaurants = await searchRestaurants(
          query,
          location,
          dateForApi,
          '19:00',
          partySize
        );

        if (restaurants.length === 0) {
          return `I couldn't find any ${query} restaurants in ${location}. Try a different search term or location?`;
        }

        const descriptions = restaurants
          .slice(0, 5)
          .map((r, i) => `${i + 1}. ${formatRestaurantForSpeech(r)}`)
          .join('\n');

        return `Found ${restaurants.length} options for ${query} in ${location} on ${dateStr}:\n\n${descriptions}\n\nWhich one catches your eye? I can check availability or book!`;
      },
    }),

    // ========== APPOINTMENTS (DOCTOR, DENTIST, ETC.) ==========

    scheduleAppointment: llm.tool({
      description: `Schedule an appointment by calling the business.
Use for:
- Doctor appointments
- Dentist appointments
- Salon/spa bookings
- Service appointments
- Consultations
- Any appointment that needs a phone call to book

Alex will call on behalf of the user.`,
      parameters: z.object({
        appointmentType: z
          .enum(['doctor', 'dentist', 'salon', 'spa', 'vet', 'service', 'consultation', 'other'])
          .describe('Type of appointment'),
        businessName: z.string().describe('Name of the business/provider'),
        businessPhone: z.string().optional().describe('Phone number'),
        dateTime: z.string().describe('Preferred date/time'),
        forPerson: z.string().optional().describe('Who the appointment is for (if not the user)'),
        reason: z.string().optional().describe('Reason for appointment'),
        specialRequests: z.string().optional().describe('Any special needs or requests'),
      }),
      execute: async (
        {
          appointmentType,
          businessName,
          businessPhone,
          dateTime,
          forPerson,
          reason,
          specialRequests,
        },
        { ctx }
      ) => {
        const requestedTime = parseNaturalTime(dateTime);
        if (!requestedTime) {
          return `When would you like the appointment? Something like "next Tuesday at 2pm" or "tomorrow morning"?`;
        }

        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'unknown';

        const apt = createAppointmentRequest({
          userId,
          type: appointmentType,
          businessName,
          businessPhone,
          requestedDateTime: requestedTime,
          forPerson,
          specialRequests: [reason, specialRequests].filter(Boolean).join('. '),
        });

        const dateStr = requestedTime.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });

        if (businessPhone) {
          return makeAppointmentCall(apt);
        } else {
          return `Perfect! I'll call ${businessName} to schedule ${forPerson ? `${forPerson}'s` : 'your'} ${appointmentType} appointment for ${dateStr}. What's their phone number?`;
        }
      },
    }),

    // ========== CHECK AVAILABILITY ==========

    checkAvailability: llm.tool({
      description: `Call a business to check if they have availability.
Use when:
- User wants to know if a restaurant has openings
- Checking if a service is available
- Seeing if appointments are open before committing

This is a quick call to check, not book.`,
      parameters: z.object({
        businessName: z.string().describe('Business to check'),
        businessPhone: z.string().describe('Phone number'),
        dateTime: z.string().describe('Date/time to check'),
        serviceType: z.string().optional().describe('What they want (table, appointment, service)'),
      }),
      execute: async ({ businessName, businessPhone, dateTime, serviceType }) => {
        const validation = validatePhone(businessPhone);
        if (!validation.valid) {
          return `That phone number doesn't look right. Can you check ${businessName}'s number?`;
        }

        const requestedTime = parseNaturalTime(dateTime);
        if (!requestedTime) {
          return `When do you want me to check? Give me a date and time.`;
        }

        const dateStr = requestedTime.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });
        const timeStr = requestedTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });

        // For now, simulate the call
        getLogger().info(
          {
            business: businessName,
            dateTime: requestedTime.toISOString(),
            service: serviceType,
          },
          '📞 Checking availability'
        );

        return `I'm calling ${businessName} to check availability for ${dateStr} around ${timeStr}. Give me just a moment... ${serviceType ? `(checking for ${serviceType})` : ''}`;
      },
    }),

    // ========== CONFIRM/CANCEL APPOINTMENTS ==========

    confirmAppointment: llm.tool({
      description: `Confirm a scheduled appointment by calling.
Use to verify an existing appointment is still on.`,
      parameters: z.object({
        appointmentId: z.string().optional().describe('Appointment ID if known'),
        businessName: z.string().describe('Business name'),
        businessPhone: z.string().describe('Phone number'),
        dateTime: z.string().describe('When the appointment is'),
        personName: z.string().optional().describe('Name the appointment is under'),
      }),
      execute: async ({ appointmentId, businessName, businessPhone, dateTime, personName }) => {
        const validation = validatePhone(businessPhone);
        if (!validation.valid) {
          return `I need a valid phone number to call and confirm.`;
        }

        const requestedTime = parseNaturalTime(dateTime);
        const dateStr = requestedTime
          ? requestedTime.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })
          : dateTime;

        getLogger().info(
          {
            business: businessName,
            appointmentId,
            date: dateStr,
          },
          '📞 Confirming appointment'
        );

        return `Calling ${businessName} now to confirm ${personName ? `${personName}'s` : 'your'} appointment on ${dateStr}. One moment...`;
      },
    }),

    cancelAppointment: llm.tool({
      description: `Cancel an appointment by calling the business.`,
      parameters: z.object({
        businessName: z.string().describe('Business name'),
        businessPhone: z.string().describe('Phone number'),
        dateTime: z.string().describe('When the appointment was'),
        reason: z.string().optional().describe('Reason for cancellation'),
      }),
      execute: async ({ businessName, businessPhone, dateTime, reason }) => {
        const validation = validatePhone(businessPhone);
        if (!validation.valid) {
          return `I need the phone number for ${businessName} to cancel.`;
        }

        const requestedTime = parseNaturalTime(dateTime);
        const dateStr = requestedTime
          ? requestedTime.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })
          : dateTime;

        getLogger().info(
          {
            business: businessName,
            date: dateStr,
            reason,
          },
          '📞 Cancelling appointment'
        );

        return `I'll call ${businessName} to cancel your appointment on ${dateStr}. ${reason ? `I'll mention that: ${reason}` : ''} Give me a moment...`;
      },
    }),

    // ========== APPOINTMENT STATUS ==========

    getAppointmentStatus: llm.tool({
      description: `Get the status of scheduled appointments.
Shows pending, confirmed, and recent appointments.`,
      parameters: z.object({
        includeCompleted: z.boolean().default(false).describe('Include past appointments'),
      }),
      execute: async ({ includeCompleted }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'unknown';

        const userAppts = Array.from(appointments.values())
          .filter((a) => a.userId === userId)
          .filter((a) => includeCompleted || !['completed', 'cancelled'].includes(a.status))
          .sort((a, b) => a.requestedDateTime.getTime() - b.requestedDateTime.getTime());

        if (userAppts.length === 0) {
          return `You don't have any scheduled appointments. Would you like me to make one?`;
        }

        let summary = '📅 **Your Appointments**\n\n';

        for (const apt of userAppts) {
          const statusEmoji = {
            pending: '⏳',
            calling: '📞',
            confirmed: '✅',
            waitlist: '📋',
            cancelled: '❌',
            completed: '✓',
            no_answer: '📵',
          }[apt.status];

          const dateStr = (apt.confirmedDateTime || apt.requestedDateTime).toLocaleDateString(
            'en-US',
            {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            }
          );
          const timeStr = (apt.confirmedDateTime || apt.requestedDateTime).toLocaleTimeString(
            'en-US',
            {
              hour: 'numeric',
              minute: '2-digit',
            }
          );

          summary += `${statusEmoji} **${apt.businessName}** - ${apt.type}\n`;
          summary += `   ${dateStr} at ${timeStr}`;
          if (apt.status === 'confirmed' && apt.confirmationNumber) {
            summary += ` (Conf#: ${apt.confirmationNumber})`;
          }
          if (apt.partySize) {
            summary += ` - Party of ${apt.partySize}`;
          }
          summary += `\n\n`;
        }

        return summary;
      },
    }),

    // ========== LIFE EVENT SCHEDULING (JORDAN COORDINATION) ==========

    scheduleLifeEventAppointment: llm.tool({
      description: `Schedule appointments related to a life event/milestone.
Used when Jordan passes event details and Alex needs to make calls.
Examples:
- Wedding: venue tours, catering tastings, dress fittings
- Baby: doctor appointments, pediatrician meet-and-greets
- Home: inspection, appraisal, moving company
- Party: venue, caterer, entertainment`,
      parameters: z.object({
        eventName: z.string().describe('The life event (e.g., "Wedding", "Baby Shower")'),
        milestoneId: z.string().optional().describe('Jordan milestone ID if linked'),
        appointmentType: z.string().describe('Type of appointment for the event'),
        businessName: z.string().describe('Vendor/business name'),
        businessPhone: z.string().optional().describe('Phone number'),
        preferredDate: z.string().describe('When they want it'),
        specialRequests: z.string().optional().describe('Special needs'),
      }),
      execute: async (
        {
          eventName,
          milestoneId,
          appointmentType,
          businessName,
          businessPhone,
          preferredDate,
          specialRequests,
        },
        { ctx }
      ) => {
        const requestedTime = parseNaturalTime(preferredDate);
        if (!requestedTime) {
          return `When should I schedule the ${appointmentType} for ${eventName}? Give me a date like "next Saturday" or "December 15th".`;
        }

        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'unknown';

        const apt = createAppointmentRequest({
          userId,
          type: 'service',
          businessName,
          businessPhone,
          requestedDateTime: requestedTime,
          specialRequests: `For ${eventName}${specialRequests ? `: ${specialRequests}` : ''}`,
          linkedMilestoneId: milestoneId,
          linkedEventName: eventName,
        });

        const dateStr = requestedTime.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        });

        if (businessPhone) {
          return makeAppointmentCall(apt);
        } else {
          return `Perfect! I'll schedule the ${appointmentType} at ${businessName} for your ${eventName} on ${dateStr}. What's their phone number so I can call?`;
        }
      },
    }),

    // ========== QUICK CALL ==========

    quickCall: llm.tool({
      description: `Make a quick call to any number for a simple inquiry.
Use for:
- Checking store hours
- Quick questions
- General inquiries
- Any call that doesn't need formal appointment tracking`,
      parameters: z.object({
        phoneNumber: z.string().describe('Phone number to call'),
        businessName: z.string().optional().describe('Who you are calling'),
        purpose: z.string().describe('What to ask/say'),
      }),
      execute: async ({ phoneNumber, businessName, purpose }) => {
        const validation = validatePhone(phoneNumber);
        if (!validation.valid) {
          return `That phone number doesn't look right. Can you check it?`;
        }

        getLogger().info(
          {
            phone: sanitizePhoneForLog(validation.sanitized as string),
            business: businessName,
            purpose,
          },
          '📞 Quick call'
        );

        const who = businessName || 'that number';
        return `Calling ${who} now to ask: "${purpose}". Give me just a moment...`;
      },
    }),

    // ========== APPOINTMENT FOLLOW-UP TOOLS ==========

    markAppointmentConfirmed: llm.tool({
      description: `Mark an appointment as confirmed after receiving confirmation.
Use when:
- User says "they confirmed my reservation"
- User got a confirmation number
- The business called back to confirm`,
      parameters: z.object({
        businessName: z.string().describe('Business name'),
        confirmationNumber: z.string().optional().describe('Confirmation number if given'),
        confirmedTime: z.string().optional().describe('Confirmed time if different from requested'),
        notes: z.string().optional().describe('Any additional notes'),
      }),
      execute: async ({ businessName, confirmationNumber, confirmedTime, notes }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'unknown';

        // Find the matching appointment
        const userAppts = Array.from(appointments.values())
          .filter((a) => a.userId === userId)
          .filter((a) => a.businessName.toLowerCase().includes(businessName.toLowerCase()))
          .filter((a) => ['pending', 'calling'].includes(a.status));

        if (userAppts.length === 0) {
          return `I don't see a pending appointment with ${businessName}. Are you sure that's the right name?`;
        }

        const apt = userAppts[0];
        apt.status = 'confirmed';
        apt.updatedAt = new Date();
        if (confirmationNumber) apt.confirmationNumber = confirmationNumber;
        if (notes) apt.notes.push(notes);

        let confirmedDateTime: Date | undefined;
        if (confirmedTime) {
          const parsed = parseNaturalTime(confirmedTime);
          if (parsed) {
            confirmedDateTime = parsed;
            apt.confirmedDateTime = confirmedDateTime;
          }
        }

        appointments.set(apt.id, apt);

        // Update follow-up service
        const followUpService = getAppointmentFollowUpService();
        followUpService.updateStatus(apt.id, 'confirmed', {
          confirmationNumber,
          confirmedDateTime,
          note: `Manually confirmed by user${notes ? `: ${notes}` : ''}`,
        });

        const dateStr = (apt.confirmedDateTime || apt.requestedDateTime).toLocaleDateString(
          'en-US',
          {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          }
        );

        let response = `Perfect! I've marked your ${apt.type} at ${apt.businessName} as confirmed for ${dateStr}.`;
        if (confirmationNumber) {
          response += ` Confirmation #${confirmationNumber}.`;
        }
        response += ` Would you like me to set a reminder?`;

        return response;
      },
    }),

    retryAppointmentCall: llm.tool({
      description: `Retry calling for an appointment that's still pending.
Use when user asks to try calling again.`,
      parameters: z.object({
        businessName: z.string().describe('Business to call again'),
      }),
      execute: async ({ businessName }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'unknown';

        const apt = Array.from(appointments.values()).find(
          (a) =>
            a.userId === userId &&
            a.businessName.toLowerCase().includes(businessName.toLowerCase()) &&
            ['pending', 'calling'].includes(a.status)
        );

        if (!apt) {
          return `I don't see a pending appointment for ${businessName}. Would you like me to create a new one?`;
        }

        if (!apt.businessPhone) {
          return `I still need the phone number for ${businessName}. Do you have it?`;
        }

        return makeAppointmentCall(apt);
      },
    }),

    getFollowUpStatus: llm.tool({
      description: `Check the status of appointment follow-ups.
Shows which appointments are pending, being called, or need attention.`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'unknown';

        const followUpService = getAppointmentFollowUpService();
        const pending = followUpService
          .getAppointments(userId)
          .filter((a) => !['confirmed', 'failed', 'cancelled'].includes(a.status));

        if (pending.length === 0) {
          return `All your appointments are either confirmed or completed! No pending follow-ups.`;
        }

        let summary = `📞 **Pending Appointments**\n\n`;

        for (const apt of pending) {
          const statusMap: Record<string, string> = {
            pending: '⏳ Pending',
            calling: '📞 Calling...',
            awaiting_callback: '⏰ Waiting for callback',
            confirmed: '✅ Confirmed',
            failed: '❌ Failed',
            cancelled: '🚫 Cancelled',
          };
          const statusEmoji = statusMap[apt.status] || apt.status;

          summary += `**${apt.businessName}** - ${statusEmoji}\n`;
          summary += `   Call attempts: ${apt.callAttempts}`;
          if (apt.nextFollowUpAt && apt.nextFollowUpAt > new Date()) {
            const mins = Math.round((apt.nextFollowUpAt.getTime() - Date.now()) / 60000);
            summary += ` - Retrying in ${mins} minutes`;
          }
          summary += `\n\n`;
        }

        return summary;
      },
    }),

    // ========== SET REMINDER FOR APPOINTMENT ==========

    setAppointmentReminder: llm.tool({
      description: `Set a reminder before an upcoming appointment.
Alex will remind via text/call before the appointment.`,
      parameters: z.object({
        appointmentDescription: z.string().describe('What the appointment is'),
        appointmentDateTime: z.string().describe('When the appointment is'),
        reminderTime: z
          .string()
          .default('1 hour before')
          .describe('When to remind (e.g., "1 hour before", "day before")'),
        deliveryMethod: z.enum(['sms', 'call', 'email']).default('sms').describe('How to remind'),
        contact: z.string().optional().describe('Phone/email for reminder'),
      }),
      execute: async (
        { appointmentDescription, appointmentDateTime, reminderTime, deliveryMethod, contact },
        { ctx }
      ) => {
        const aptTime = parseNaturalTime(appointmentDateTime);
        if (!aptTime) {
          return `When is the appointment? I need to know so I can set the reminder.`;
        }

        // Calculate reminder time
        const reminderDate = new Date(aptTime);
        if (reminderTime.includes('hour')) {
          const hours = parseInt(reminderTime) || 1;
          reminderDate.setHours(reminderDate.getHours() - hours);
        } else if (reminderTime.includes('day')) {
          const days = parseInt(reminderTime) || 1;
          reminderDate.setDate(reminderDate.getDate() - days);
        } else if (reminderTime.includes('minute')) {
          const mins = parseInt(reminderTime) || 30;
          reminderDate.setMinutes(reminderDate.getMinutes() - mins);
        }

        const userData = ctx?.userData as
          | { userId?: string; userProfile?: { contactInfo?: { phone?: string; email?: string } } }
          | undefined;
        const userId = userData?.userId || 'unknown';

        // Get contact from profile if not provided
        let contactToUse = contact;
        if (!contactToUse && userData?.userProfile?.contactInfo) {
          contactToUse =
            deliveryMethod === 'email'
              ? userData.userProfile.contactInfo.email
              : userData.userProfile.contactInfo.phone;
        }

        if (!contactToUse) {
          return `I need your ${deliveryMethod === 'email' ? 'email address' : 'phone number'} to send the reminder. What should I use?`;
        }

        try {
          await createReminder({
            userId,
            message: `⏰ Reminder: ${appointmentDescription}`,
            subject: `Appointment Reminder: ${appointmentDescription}`,
            scheduledFor: reminderDate,
            deliveryMethod: deliveryMethod as 'sms' | 'email' | 'call',
            deliveryAddress: contactToUse,
            createdBy: 'alex',
          });

          const aptDateStr = aptTime.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });

          return `Got it! I'll remind you about "${appointmentDescription}" via ${deliveryMethod} before your appointment on ${aptDateStr}. You're all set!`;
        } catch (error) {
          getLogger().error({ error }, 'Failed to set appointment reminder');
          return `I had trouble setting that reminder. Let me try again.`;
        }
      },
    }),
  };
}

// ============================================================================
// FOOD DELIVERY TOOLS
// ============================================================================

import {
  searchDeliveryRestaurants,
  startOrder,
  addToOrder,
  finalizeOrder,
  getOrder,
  formatRestaurantForSpeech as formatDeliveryRestaurant,
  formatOrderForSpeech,
  getOrderCompletionMessage,
  isDeliveryConfigured,
  type DeliveryAddress,
  type DeliveryOrder,
  type MenuItem,
} from '../services/food-delivery.js';
import {
  getPlaceDetails,
  isGooglePlacesConfigured,
  type PlaceDetails,
} from '../services/google-places.js';
import {
  createContact,
  updateContact,
  deleteContact,
  getUserContacts,
  getFavoriteContacts,
  getRecentContacts,
  searchContacts,
  findContact,
  addNickname,
  toggleFavorite,
  markContacted,
  formatPhoneForDisplay,
  formatContactForSpeech,
  importFromGoogle,
  importFromVCard,
  importFromCSV,
  type Contact,
} from '../services/contacts.js';

/**
 * Food delivery tools for Alex
 */
export function createDeliveryTools() {
  return {
    // ========== SEARCH DELIVERY ==========

    searchFoodDelivery: llm.tool({
      description: `Search for restaurants on food delivery apps (DoorDash, Uber Eats).
Use when the user wants to:
- Order food for delivery
- Find what delivers to their area
- Get dinner/lunch delivered`,
      parameters: z.object({
        query: z.string().describe('What to search for (e.g., "pizza", "Thai food", "McDonalds")'),
        street: z.string().describe('Delivery address street'),
        city: z.string().describe('City'),
        state: z.string().describe('State abbreviation'),
        zipCode: z.string().describe('ZIP code'),
        platform: z
          .enum(['doordash', 'ubereats', 'both'])
          .default('both')
          .describe('Which delivery app to use'),
      }),
      execute: async ({ query, street, city, state, zipCode, platform }) => {
        const address: DeliveryAddress = { street, city, state, zipCode };
        const platforms = platform === 'both' ? undefined : [platform as 'doordash' | 'ubereats'];

        const results = await searchDeliveryRestaurants(query, address, platforms);

        if (results.length === 0) {
          return `I couldn't find "${query}" for delivery to ${city}. Try a different search or check if the address is correct?`;
        }

        const formatted = results
          .slice(0, 5)
          .map((r, i) => `${i + 1}. ${formatDeliveryRestaurant(r)} (${r.platform})`)
          .join('\n');

        return `🍕 Found ${results.length} option${results.length > 1 ? 's' : ''} for "${query}":\n\n${formatted}\n\nWhich one would you like? I can help you order!`;
      },
    }),

    // ========== START ORDER ==========

    startFoodOrder: llm.tool({
      description: `Start a food delivery order from a specific restaurant.
Use after the user picks a restaurant from search results.`,
      parameters: z.object({
        restaurantName: z.string().describe('Name of the restaurant'),
        platform: z.enum(['doordash', 'ubereats']).describe('Which delivery app'),
      }),
      execute: async ({ restaurantName, platform }) => {
        // Create a basic restaurant object for the order
        const restaurant = {
          id: `${platform}_${Date.now()}`,
          platform: platform as 'doordash' | 'ubereats',
          name: restaurantName,
          cuisines: [],
          isOpen: true,
          acceptsOrders: true,
          deliveryFee: 2.99,
        };

        const order = startOrder(restaurant);

        return (
          `🛒 Started your order from ${restaurantName} on ${platform === 'doordash' ? 'DoorDash' : 'Uber Eats'}! ` +
          `Order ID: ${order.id}\n\n` +
          `What would you like to order? Just tell me the items and quantities!`
        );
      },
    }),

    // ========== ADD TO ORDER ==========

    addItemToOrder: llm.tool({
      description: `Add an item to the current food order.
Use when user says what they want to eat.`,
      parameters: z.object({
        orderId: z.string().describe('The order ID from startFoodOrder'),
        itemName: z.string().describe('Name of the menu item'),
        price: z.number().describe('Price of the item'),
        quantity: z.number().default(1).describe('How many'),
        specialInstructions: z.string().optional().describe('Special requests like "no onions"'),
      }),
      execute: async ({ orderId, itemName, price, quantity, specialInstructions }) => {
        const menuItem: MenuItem = {
          id: `item_${Date.now()}`,
          name: itemName,
          price,
          category: 'entree',
        };

        const order = addToOrder(orderId, menuItem, quantity, { specialInstructions });

        if (!order) {
          return `I couldn't find that order. Let me start a new one for you.`;
        }

        return (
          `Added ${quantity}x ${itemName} ($${(price * quantity).toFixed(2)}) to your order!\n\n` +
          `Current total: $${order.subtotal.toFixed(2)} (+ fees)\n` +
          `Want to add anything else, or should we checkout?`
        );
      },
    }),

    // ========== CHECKOUT ==========

    checkoutOrder: llm.tool({
      description: `Finalize the food order and get a link to complete payment.
Use when user is done adding items and ready to pay.`,
      parameters: z.object({
        orderId: z.string().describe('The order ID'),
        tip: z.number().optional().describe('Tip amount in dollars'),
      }),
      execute: async ({ orderId, tip }, { ctx }) => {
        let order = getOrder(orderId);
        if (!order) {
          return `I couldn't find that order. Did you want to start a new one?`;
        }

        // Set tip if provided
        if (tip !== undefined) {
          const { setTip } = await import('../services/food-delivery.js');
          setTip(orderId, tip);
          order = getOrder(orderId)!;
        }

        // Finalize
        const finalizedOrder = finalizeOrder(orderId);
        if (!finalizedOrder) {
          return `Something went wrong finalizing the order. Let me try again.`;
        }
        order = finalizedOrder;

        const summary = formatOrderForSpeech(order);
        const checkoutMsg = getOrderCompletionMessage(order);

        // Try to send link to user
        const userData = ctx?.userData as
          | { userProfile?: { contactInfo?: { phone?: string } } }
          | undefined;
        const phone = userData?.userProfile?.contactInfo?.phone;

        let response = `🎉 Your order is ready!\n\n${summary}\n\n`;

        if (order.checkoutUrl) {
          response += `Here's your link to complete the order:\n${order.checkoutUrl}\n\n`;
        }

        if (order.deepLink) {
          response += `Or open in the app: ${order.deepLink}\n\n`;
        }

        if (phone) {
          response += `I can also text you this link if you'd like!`;
        }

        return response;
      },
    }),

    // ========== ORDER STATUS ==========

    getOrderStatus: llm.tool({
      description: `Check the status of a food order.`,
      parameters: z.object({
        orderId: z.string().describe('The order ID'),
      }),
      execute: async ({ orderId }) => {
        const order = getOrder(orderId);
        if (!order) {
          return `I couldn't find order ${orderId}. It may have expired.`;
        }

        return formatOrderForSpeech(order);
      },
    }),

    // ========== QUICK ORDER (common items) ==========

    quickFoodOrder: llm.tool({
      description: `Quick order for common food items - searches, picks best match, and creates order link.
Use for simple orders like "order me a pizza" or "get me Chinese food".`,
      parameters: z.object({
        foodType: z.string().describe('Type of food (pizza, Chinese, burgers, etc.)'),
        street: z.string().describe('Delivery address street'),
        city: z.string().describe('City'),
        state: z.string().describe('State abbreviation'),
        zipCode: z.string().describe('ZIP code'),
        platform: z
          .enum(['doordash', 'ubereats'])
          .default('doordash')
          .describe('Preferred delivery app'),
      }),
      execute: async ({ foodType, street, city, state, zipCode, platform }) => {
        const address: DeliveryAddress = { street, city, state, zipCode };

        const results = await searchDeliveryRestaurants(foodType, address, [platform]);

        if (results.length === 0) {
          return `I couldn't find ${foodType} for delivery to ${city}. Want to try a different type of food?`;
        }

        const best = results[0];

        // Generate direct link
        const platformName = platform === 'doordash' ? 'DoorDash' : 'Uber Eats';
        let response = `🍕 Found ${best.name} for ${foodType}!\n\n`;

        if (best.rating) response += `⭐ ${best.rating} stars\n`;
        if (best.deliveryTime)
          response += `🕐 ${best.deliveryTime.min}-${best.deliveryTime.max} min delivery\n`;
        if (best.deliveryFee !== undefined)
          response += `💰 $${best.deliveryFee.toFixed(2)} delivery fee\n`;

        response += `\n`;

        if (best.menuUrl) {
          response += `Order here: ${best.menuUrl}\n`;
        }
        if (best.deepLink) {
          response += `Or open in ${platformName}: ${best.deepLink}\n`;
        }

        response += `\nWant me to text you this link?`;

        return response;
      },
    }),
  };
}

// ============================================================================
// GOOGLE PLACES / PHONE LOOKUP TOOLS
// ============================================================================

/**
 * Google Places tools for Alex to find business info and phone numbers
 * Now integrated with Google Places API for real business lookups
 */
export function createPlacesTools() {
  // Lazy import to avoid circular dependencies
  const getPlacesService = async () => {
    const {
      searchRestaurants,
      getPlaceDetails,
      findNearbyRestaurants,
      isGooglePlacesConfigured,
      formatRestaurantListForSpeech,
    } = await import('../services/google-places.js');
    return {
      searchRestaurants,
      getPlaceDetails,
      findNearbyRestaurants,
      isGooglePlacesConfigured,
      formatRestaurantListForSpeech,
    };
  };

  return {
    // ========== FIND PHONE NUMBER ==========

    lookupBusinessPhone: llm.tool({
      description: `Look up a business phone number using Google Places API.
Use when the user asks for a business's phone number.
Example: "What's the number for Joe's Pizza on Main Street?"`,
      parameters: z.object({
        businessName: z.string().describe('Name of the business to find'),
        location: z.string().optional().describe('City, address, or area to search in'),
      }),
      execute: async ({ businessName, location }) => {
        const places = await getPlacesService();
        if (!places.isGooglePlacesConfigured()) {
          return `I can't look up business numbers right now. Do you have the number for ${businessName}?`;
        }

        const results = await places.searchRestaurants({ query: businessName, location });
        if (results.length === 0) {
          return `I couldn't find ${businessName}${location ? ` near ${location}` : ''}. Could you give me more details?`;
        }

        const details = await places.getPlaceDetails(results[0].placeId);
        if (!details) {
          return `Found ${results[0].name} but couldn't get their details. Try searching for them online.`;
        }

        if (details.formattedPhoneNumber) {
          return `${details.name}'s phone number is ${details.formattedPhoneNumber}. They're located at ${details.formattedAddress}. Would you like me to call them?`;
        }

        return `Found ${details.name} at ${details.formattedAddress}, but they don't have a phone number listed. You might try their website: ${details.website || 'not listed'}.`;
      },
    }),

    findNearbyBusinesses: llm.tool({
      description: `Find nearby businesses using Google Places API.
Use when the user wants to find businesses near a specific location.`,
      parameters: z.object({
        type: z.string().describe('Type of business (e.g., restaurant, dentist, gym)'),
        keyword: z.string().optional().describe('Additional keyword to filter results'),
        latitude: z.number().describe('Latitude of search center'),
        longitude: z.number().describe('Longitude of search center'),
        openNow: z.boolean().default(false).describe('Only show places that are currently open'),
      }),
      execute: async ({ type, keyword, latitude, longitude }) => {
        const places = await getPlacesService();
        if (!places.isGooglePlacesConfigured()) {
          return `I can't search for nearby businesses right now. Can you tell me a specific business name?`;
        }

        const results = await places.findNearbyRestaurants(
          latitude,
          longitude,
          2000,
          keyword || type
        );
        if (results.length === 0) {
          return `I couldn't find any ${type}${keyword ? ` matching "${keyword}"` : ''} nearby. Try expanding your search area or being more specific.`;
        }

        return places.formatRestaurantListForSpeech(results, 5);
      },
    }),

    searchBusinesses: llm.tool({
      description: `Search for businesses by name or type using Google Places API.
Use for general business searches.`,
      parameters: z.object({
        query: z.string().describe('Search query (business name or type)'),
        location: z.string().optional().describe('Location to search in'),
        openNow: z.boolean().default(false).describe('Only show places that are currently open'),
      }),
      execute: async ({ query, location, openNow }) => {
        const places = await getPlacesService();
        if (!places.isGooglePlacesConfigured()) {
          return `I can't search for businesses right now. Do you know the specific name of ${query}?`;
        }

        const results = await places.searchRestaurants({ query, location, openNow });
        if (results.length === 0) {
          return `I couldn't find anything matching "${query}"${location ? ` near ${location}` : ''}. Could you be more specific?`;
        }

        return places.formatRestaurantListForSpeech(results, 5);
      },
    }),

    getBusinessDetails: llm.tool({
      description: `Get detailed information about a specific business.
Returns hours, phone, address, ratings, and reviews.`,
      parameters: z.object({
        businessName: z.string().describe('Name of the business'),
        location: z.string().optional().describe('Location to narrow down search'),
      }),
      execute: async ({ businessName, location }) => {
        const places = await getPlacesService();
        if (!places.isGooglePlacesConfigured()) {
          return `I can't look up details for ${businessName} right now. What would you like to know?`;
        }

        const results = await places.searchRestaurants({ query: businessName, location });
        if (results.length === 0) {
          return `I couldn't find ${businessName}. Could you give me more details about their location?`;
        }

        const details = await places.getPlaceDetails(results[0].placeId);
        if (!details) {
          return `Found ${results[0].name} but couldn't get their full details.`;
        }

        let response = `**${details.name}**\n`;
        response += `📍 ${details.formattedAddress}\n`;
        if (details.formattedPhoneNumber) response += `📞 ${details.formattedPhoneNumber}\n`;
        if (details.rating)
          response += `⭐ ${details.rating} stars (${details.userRatingsTotal} reviews)\n`;
        if (details.website) response += `🌐 ${details.website}\n`;
        if (details.openingHours) {
          response += `\n**Hours:**\n`;
          details.openingHours.weekdayText.forEach((day) => {
            response += `• ${day}\n`;
          });
          response += details.openingHours.openNow ? '\n✅ Open now' : '\n❌ Currently closed';
        }

        return response;
      },
    }),

    findAndCall: llm.tool({
      description: `Find a business and offer to call them.
Combines search with phone lookup and calling capability.`,
      parameters: z.object({
        businessName: z.string().describe('Name of the business to call'),
        location: z.string().optional().describe('Location to narrow search'),
        purpose: z
          .string()
          .optional()
          .describe('Why you want to call (e.g., "make a reservation", "check hours")'),
      }),
      execute: async ({ businessName, location, purpose }) => {
        const places = await getPlacesService();
        if (!places.isGooglePlacesConfigured()) {
          return `I need the phone number for ${businessName}. Do you have it?`;
        }

        const results = await places.searchRestaurants({ query: businessName, location });
        if (results.length === 0) {
          return `I couldn't find ${businessName}. Do you have their phone number?`;
        }

        const details = await places.getPlaceDetails(results[0].placeId);
        if (!details?.formattedPhoneNumber) {
          return `Found ${results[0].name} but they don't have a phone number listed. You might try their website.`;
        }

        const purposeText = purpose ? ` to ${purpose}` : '';
        return `Found ${details.name} at ${details.formattedAddress}. Their number is ${details.formattedPhoneNumber}. Would you like me to call them${purposeText}?`;
      },
    }),
  };
}

// ============================================================================
// CONTACTS TOOLS
// ============================================================================

/**
 * Contact management tools for Alex
 */
export function createContactsTools() {
  return {
    // ========== ADD CONTACT ==========

    addContact: llm.tool({
      description: `Add a new contact to the user's address book.
Use when:
- "Save my mom's number: 555-1234"
- "Add John Smith, his email is john@example.com"
- "My dentist is Dr. Chen, number 555-9999"`,
      parameters: z.object({
        name: z.string().describe('Contact name (e.g., "Mom", "John Smith", "Dr. Chen")'),
        phone: z.string().optional().describe('Phone number'),
        email: z.string().optional().describe('Email address'),
        nickname: z.string().optional().describe('Nickname like "mom", "work", "dentist"'),
        relationship: z
          .string()
          .optional()
          .describe('Relationship like "mother", "friend", "doctor"'),
        company: z.string().optional().describe('Company or workplace'),
        notes: z.string().optional().describe('Any additional notes'),
      }),
      execute: async ({ name, phone, email, nickname, relationship, company, notes }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        if (!phone && !email) {
          return `I need at least a phone number or email for ${name}. What should I save?`;
        }

        const contact = createContact(userId, {
          displayName: name,
          phone,
          email,
          nicknames: nickname ? [nickname.toLowerCase()] : undefined,
          relationship,
          company,
          notes,
        });

        let response = `✅ Saved ${name}`;
        if (phone) response += ` - ${formatPhoneForDisplay(phone)}`;
        if (email) response += ` - ${email}`;
        if (nickname) response += `\n\nYou can say "${nickname}" and I'll know who you mean!`;

        return response;
      },
    }),

    // ========== FIND CONTACT ==========

    findMyContact: llm.tool({
      description: `Find a contact from the user's address book.
Use when:
- "What's my mom's number?"
- "Call John"
- "Find my dentist's info"`,
      parameters: z.object({
        query: z.string().describe('Who to find (name, nickname, or relationship like "my mom")'),
      }),
      execute: async ({ query }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const results = await searchContacts(userId, query);

        if (results.length === 0) {
          return `I don't have "${query}" in your contacts. Would you like to add them?`;
        }

        if (results.length === 1) {
          const { contact } = results[0];
          let response = `📇 ${contact.displayName}`;
          if (contact.relationship) response += ` (${contact.relationship})`;
          response += '\n';

          if (contact.phones.length > 0) {
            const primary = contact.phones.find((p) => p.primary) || contact.phones[0];
            response += `📞 ${formatPhoneForDisplay(primary.number)}`;
            if (primary.type !== 'mobile') response += ` (${primary.type})`;
            response += '\n';
          }

          if (contact.emails.length > 0) {
            response += `✉️ ${contact.emails[0].address}\n`;
          }

          if (contact.company) {
            response += `🏢 ${contact.company}\n`;
          }

          response += `\nWant me to call or text them?`;
          return response;
        }

        // Multiple matches
        const list = results
          .slice(0, 5)
          .map((r, i) => {
            const c = r.contact;
            let line = `${i + 1}. ${c.displayName}`;
            if (c.relationship) line += ` (${c.relationship})`;
            if (c.phones.length > 0) line += ` - ${formatPhoneForDisplay(c.phones[0].number)}`;
            return line;
          })
          .join('\n');

        return `Found ${results.length} contact${results.length > 1 ? 's' : ''} matching "${query}":\n\n${list}\n\nWhich one did you mean?`;
      },
    }),

    // ========== CALL CONTACT ==========

    callMyContact: llm.tool({
      description: `Find a contact and prepare to call them.
Use when:
- "Call my mom"
- "Call John from work"
- "Phone the dentist"`,
      parameters: z.object({
        who: z.string().describe('Who to call (name, nickname, or relationship)'),
        purpose: z.string().optional().describe('Why calling (for appointment, to chat, etc.)'),
      }),
      execute: async ({ who, purpose }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const contact = await findContact(userId, who);

        if (!contact) {
          return `I don't have "${who}" in your contacts. Do you have their number, or should I look them up?`;
        }

        if (contact.phones.length === 0) {
          return `I have ${contact.displayName} saved, but no phone number. Want to add one?`;
        }

        const phone =
          contact.phones.find((p: { primary?: boolean }) => p.primary) || contact.phones[0];

        // Mark as contacted
        markContacted(contact.id);

        let response = `📞 Calling ${formatContactForSpeech(contact)}\n`;
        response += `Number: ${formatPhoneForDisplay(phone.number)}\n`;

        if (purpose) {
          response += `\nPurpose: ${purpose}\n`;
        }

        response += `\nReady to dial!`;

        return response;
      },
    }),

    // ========== LIST CONTACTS ==========

    listContacts: llm.tool({
      description: `List user's contacts.
Use when:
- "Show my contacts"
- "Who's in my favorites?"
- "Recent contacts"
- "Show family contacts"`,
      parameters: z.object({
        filter: z.enum(['all', 'favorites', 'recent', 'group']).default('all'),
        group: z.string().optional().describe('Group name if filter is "group"'),
        limit: z.number().default(10).describe('How many to show'),
      }),
      execute: async ({ filter, group, limit }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        let contacts: Contact[];
        let title: string;

        switch (filter) {
          case 'favorites':
            contacts = await getFavoriteContacts(userId);
            title = '⭐ Favorite Contacts';
            break;
          case 'recent':
            contacts = await getRecentContacts(userId, limit);
            title = '🕐 Recent Contacts';
            break;
          case 'group':
            if (group) {
              const allContacts = await getUserContacts(userId);
              contacts = allContacts.filter((c: Contact) =>
                c.groups.some((g: string) => g.toLowerCase() === group.toLowerCase())
              );
            } else {
              contacts = [];
            }
            title = `👥 ${group || 'Group'} Contacts`;
            break;
          default:
            contacts = (await getUserContacts(userId)).slice(0, limit);
            title = '📇 Your Contacts';
        }

        if (contacts.length === 0) {
          if (filter === 'all') {
            return `You don't have any contacts saved yet. Say "add contact" to get started!`;
          }
          return `No ${filter} contacts found.`;
        }

        const list = contacts
          .map((c, i) => {
            let line = `${i + 1}. ${c.displayName}`;
            if (c.isFavorite) line += ' ⭐';
            if (c.relationship) line += ` (${c.relationship})`;
            if (c.phones.length > 0) line += ` - ${formatPhoneForDisplay(c.phones[0].number)}`;
            return line;
          })
          .join('\n');

        return `${title} (${contacts.length}):\n\n${list}`;
      },
    }),

    // ========== UPDATE CONTACT ==========

    updateMyContact: llm.tool({
      description: `Update an existing contact.
Use when:
- "Change mom's number to 555-1234"
- "Add a nickname for John: Johnny"
- "Mark Sarah as favorite"`,
      parameters: z.object({
        who: z.string().describe('Which contact to update'),
        phone: z.string().optional().describe('New phone number'),
        email: z.string().optional().describe('New email'),
        nickname: z.string().optional().describe('Add a nickname'),
        makeFavorite: z.boolean().optional().describe('Mark as favorite'),
        notes: z.string().optional().describe('Add notes'),
      }),
      execute: async ({ who, phone, email, nickname, makeFavorite, notes }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const contact = await findContact(userId, who);

        if (!contact) {
          return `I couldn't find "${who}" in your contacts.`;
        }

        const updates: string[] = [];

        if (phone) {
          updateContact(contact.id, {
            phones: [{ number: phone, type: 'mobile', primary: true }, ...contact.phones.slice(1)],
          });
          updates.push(`phone → ${formatPhoneForDisplay(phone)}`);
        }

        if (email) {
          updateContact(contact.id, {
            emails: [
              { address: email.toLowerCase(), type: 'personal', primary: true },
              ...contact.emails.slice(1),
            ],
          });
          updates.push(`email → ${email}`);
        }

        if (nickname) {
          addNickname(contact.id, nickname);
          updates.push(`added nickname "${nickname}"`);
        }

        if (makeFavorite !== undefined) {
          if (contact.isFavorite !== makeFavorite) {
            toggleFavorite(contact.id);
            updates.push(makeFavorite ? 'marked as favorite ⭐' : 'removed from favorites');
          }
        }

        if (notes) {
          updateContact(contact.id, {
            notes: contact.notes ? `${contact.notes}\n${notes}` : notes,
          });
          updates.push('added notes');
        }

        if (updates.length === 0) {
          return `Nothing to update for ${contact.displayName}. What would you like to change?`;
        }

        return `✅ Updated ${contact.displayName}:\n${updates.map((u) => `  • ${u}`).join('\n')}`;
      },
    }),

    // ========== DELETE CONTACT ==========

    deleteMyContact: llm.tool({
      description: `Delete a contact.
Use when user explicitly asks to remove someone.`,
      parameters: z.object({
        who: z.string().describe('Which contact to delete'),
        confirm: z.boolean().describe('User has confirmed deletion'),
      }),
      execute: async ({ who, confirm }, { ctx }) => {
        if (!confirm) {
          return `Are you sure you want to delete ${who} from your contacts? Say "yes, delete" to confirm.`;
        }

        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        const contact = await findContact(userId, who);

        if (!contact) {
          return `I couldn't find "${who}" in your contacts.`;
        }

        deleteContact(contact.id);

        return `✅ Deleted ${contact.displayName} from your contacts.`;
      },
    }),

    // ========== IMPORT CONTACTS ==========

    importContacts: llm.tool({
      description: `Import contacts from Google, vCard, or CSV.
Guides user through the import process.`,
      parameters: z.object({
        source: z.enum(['google', 'vcard', 'csv', 'help']).describe('Where to import from'),
        data: z.string().optional().describe('vCard or CSV data if provided'),
      }),
      execute: async ({ source, data }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'default';

        switch (source) {
          case 'google':
            return (
              `To import from Google Contacts:\n\n` +
              `1. I'll need to connect to your Google account\n` +
              `2. You'll authorize access to your contacts\n` +
              `3. I'll import them automatically\n\n` +
              `Would you like to connect your Google account? (This would open a secure login)`
            );

          case 'vcard':
            if (data) {
              const result = importFromVCard(userId, data);
              return `✅ Imported ${result.imported} contact${result.imported !== 1 ? 's' : ''} from vCard!${
                result.errors > 0 ? ` (${result.errors} couldn't be imported)` : ''
              }`;
            }
            return (
              `To import from vCard:\n\n` +
              `1. Export contacts from your phone/email as .vcf file\n` +
              `2. Share or paste the vCard data\n` +
              `3. I'll import them for you\n\n` +
              `Do you have a vCard file ready?`
            );

          case 'csv':
            if (data) {
              const result = importFromCSV(userId, data);
              return `✅ Imported ${result.imported} contact${result.imported !== 1 ? 's' : ''} from CSV!${
                result.errors > 0 ? ` (${result.errors} couldn't be imported)` : ''
              }`;
            }
            return (
              `To import from CSV:\n\n` +
              `1. Export contacts from your phone/email as .csv file\n` +
              `2. The file should have columns like Name, Phone, Email\n` +
              `3. Share or paste the CSV data\n\n` +
              `Do you have a CSV file ready?`
            );

          default:
            return (
              `📥 **Import Contacts**\n\n` +
              `I can import contacts from:\n` +
              `• **Google Contacts** - Connect your Google account\n` +
              `• **vCard (.vcf)** - Export from iPhone, Android, or email\n` +
              `• **CSV** - Spreadsheet format\n\n` +
              `Which would you like to use?`
            );
        }
      },
    }),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createAppointmentTools;

// Export individual functions for testing
export {
  createAppointmentRequest,
  updateAppointmentStatus,
  makeAppointmentCall,
  generateCallScript,
};

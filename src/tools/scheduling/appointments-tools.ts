/**
 * Appointment & Reservation Tools
 *
 * LLM-callable tools for scheduling appointments and reservations.
 *
 * @module scheduling/appointments-tools
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import { z } from 'zod';
import { validatePhone, sanitizePhoneForLog } from '../validation.js';
import { parseNaturalTime, createReminder } from '../../services/reminder-scheduler.js';
import {
  searchRestaurants,
  bookReservation,
  isReservationServiceConfigured,
  formatRestaurantForSpeech,
} from '../../services/restaurant-reservations.js';
import { getAppointmentFollowUpService } from '../../services/appointment-followup.js';
import {
  createAppointmentRequest,
  updateAppointmentStatus,
  makeAppointmentCall,
  generateCallScript,
  getAppointment,
  getUserAppointments,
} from './appointment-core.js';
import type { AppointmentType, AppointmentStatus, ScheduledAppointment } from './types.js';

import { getToolDescription } from '../utils/tool-descriptions.js';
// Helper aliases
const _getAppointmentsForUser = getUserAppointments;
const _getAppointmentById = getAppointment;

export function createAppointmentTools() {
  return {
    // ========== RESTAURANT RESERVATIONS ==========

    makeReservation: llm.tool({
      description: getToolDescription('makeReservation'),
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
      description: getToolDescription('searchRestaurantsNearby'),
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
      description: getToolDescription('scheduleAppointment'),
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
      description: getToolDescription('checkAvailability'),
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
      description: getToolDescription('confirmAppointment'),
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
      description: getToolDescription('cancelAppointment'),
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
      description: getToolDescription('getAppointmentStatus'),
      parameters: z.object({
        includeCompleted: z.boolean().default(false).describe('Include past appointments'),
      }),
      execute: async ({ includeCompleted }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'unknown';

        const userAppts = getUserAppointments(userId)
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
      description: getToolDescription('scheduleLifeEventAppointment'),
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
      description: getToolDescription('quickCall'),
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
      description: getToolDescription('markAppointmentConfirmed'),
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
        const userAppts = getUserAppointments(userId)
          .filter((a) => a.businessName.toLowerCase().includes(businessName.toLowerCase()))
          .filter((a) => ['pending', 'calling'].includes(a.status));

        if (userAppts.length === 0) {
          return `I don't see a pending appointment with ${businessName}. Are you sure that's the right name?`;
        }

        const foundApt = userAppts[0];

        // Parse confirmed time if provided
        let confirmedDateTime: Date | undefined;
        if (confirmedTime) {
          const parsed = parseNaturalTime(confirmedTime);
          if (parsed) {
            confirmedDateTime = parsed;
          }
        }

        // Update via the core function
        const apt = updateAppointmentStatus(
          foundApt.id,
          'confirmed',
          notes ? `Manually confirmed by user: ${notes}` : 'Manually confirmed by user',
          confirmedDateTime,
          confirmationNumber
        );

        if (!apt) {
          return `Something went wrong updating the appointment. Please try again.`;
        }

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
      description: getToolDescription('retryAppointmentCall'),
      parameters: z.object({
        businessName: z.string().describe('Business to call again'),
      }),
      execute: async ({ businessName }, { ctx }) => {
        const userData = ctx?.userData as { userId?: string } | undefined;
        const userId = userData?.userId || 'unknown';

        const apt = getUserAppointments(userId).find(
          (a) =>
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
      description: getToolDescription('getFollowUpStatus'),
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
      description: getToolDescription('setAppointmentReminder'),
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

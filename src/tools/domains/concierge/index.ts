/**
 * Concierge Domain Tools - Business & Vendor Outreach
 *
 * Outreach to BUSINESSES on behalf of users (hotels, restaurants, service
 * providers). Nothing can call them yet, so the action tools say so honestly
 * (see CONCIERGE_CANT_CALL) rather than reporting made-up results.
 *
 * DOMAIN: concierge
 * TOOLS:
 *   requestHotelQuotes - Call multiple hotels to compare rates
 *   makeRestaurantReservation - Book restaurant tables
 *   scheduleAppointment - Schedule healthcare appointments
 *   getServiceQuotes - Get quotes from local service providers
 *   checkConciergeStatus - Check status of an outreach request
 *
 * "Better Than Human" - doing what no friend has time to do consistently.
 *
 * RELATED DOMAINS (distinct functionality):
 *   - communication/outreach/ - User → Personal Contact (mom, friends) - emotional/personalized
 *   - proactive/outreach/ - Agent → User (reminders, check-ins) - accountability
 *   - concierge/ - Agent → Business (hotels, plumbers) - transactional
 *
 * USAGE:
 *   "Find me hotels in Miami next weekend and get the best rates"
 *   "Make a reservation at Nobu for 4 people Saturday night"
 *   "Schedule a dentist appointment for me, nothing urgent"
 *   "Get me quotes from plumbers for a leaky faucet"
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolContext, ToolDefinition, Tool } from '../../registry/types.js';

import { registerNotifier } from '../../../services/concierge/index.js';

// Superhuman calendar prep service
import { buildCalendarPrepContext } from '../../../services/superhuman/calendar-prep-coaching.js';

const log = getLogger();

/**
 * Nothing can call, text or email a business yet: the phone caller only ever
 * pretended to place calls and invented prices, bookings and reference
 * numbers, which these tools then reported as real. Until outreach can really
 * happen, every concierge action says so and offers what does work.
 */
export const CONCIERGE_CANT_CALL =
  "I can't call businesses for you yet, so I haven't contacted anyone and nothing is booked. I can help you work out what to ask and who to try, so you can make the call. Want to do that?";

/** What checkConciergeStatus says, since no request can be in progress. */
export const CONCIERGE_NOTHING_IN_PROGRESS =
  "I can't call businesses for you yet, so there aren't any quotes, reservations or appointments in progress.";

// Register the concierge notification system when this module loads
// This ensures users get email/push notifications when concierge requests complete
registerNotifier().catch((err) => {
  log.warn({ error: String(err) }, 'Failed to register concierge notifier');
});

// ============================================================================
// TOOL: Request Hotel Quotes
// ============================================================================

const requestHotelQuotesDef: ToolDefinition = {
  id: 'requestHotelQuotes',
  name: 'Request Hotel Quotes',
  description: 'Call multiple hotels to compare rates and find the best deal',
  domain: 'concierge',
  tags: ['hotel', 'travel', 'booking', 'outreach'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "Use when the user asks you to call hotels for rates or to book a room. Calling businesses isn't available yet: relay the result exactly and offer the alternative it gives.",
      parameters: z.object({
        destination: z.string().describe('City or area for the hotel'),
        checkIn: z.string().describe('Check-in date (YYYY-MM-DD format)'),
        checkOut: z.string().describe('Check-out date (YYYY-MM-DD format)'),
        guests: z.number().optional().describe('Number of guests'),
        rooms: z.number().optional().describe('Number of rooms needed'),
        roomType: z.string().optional().describe('Preferred room type'),
        maxBudget: z.number().optional().describe('Maximum budget per night'),
      }),
      execute: async () => {
        log.info(
          { userId: ctx.userId },
          'requestHotelQuotes: no way to call businesses, told the user'
        );
        return CONCIERGE_CANT_CALL;
      },
    });
  },
};

// ============================================================================
// TOOL: Make Restaurant Reservation
// ============================================================================

const makeRestaurantReservationDef: ToolDefinition = {
  id: 'makeRestaurantReservation',
  name: 'Make Restaurant Reservation',
  description: 'Call restaurants to book a table',
  domain: 'concierge',
  tags: ['restaurant', 'dining', 'booking', 'outreach'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "Use when the user asks you to book a restaurant table. Calling businesses isn't available yet: relay the result exactly and offer the alternative it gives.",
      parameters: z.object({
        restaurantName: z.string().optional().describe('Specific restaurant name, if known'),
        cuisine: z.string().optional().describe('Type of cuisine if searching'),
        location: z.string().describe('City or neighborhood'),
        date: z.string().describe('Date for reservation (YYYY-MM-DD)'),
        time: z.string().optional().describe('Preferred time (e.g., "7pm", "evening")'),
        partySize: z.number().describe('Number of people'),
        dietaryRestrictions: z.array(z.string()).optional().describe('Any dietary needs'),
        occasion: z.string().optional().describe('Special occasion if any'),
      }),
      execute: async () => {
        log.info(
          { userId: ctx.userId },
          'makeRestaurantReservation: no way to call businesses, told the user'
        );
        return CONCIERGE_CANT_CALL;
      },
    });
  },
};

// ============================================================================
// TOOL: Schedule Appointment
// ============================================================================

const scheduleAppointmentDef: ToolDefinition = {
  id: 'scheduleHealthcareAppointment',
  name: 'Schedule Healthcare Appointment',
  description: 'Call medical offices to schedule appointments',
  domain: 'concierge',
  tags: ['healthcare', 'doctor', 'appointment', 'outreach'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "Use when the user asks you to book a doctor, dentist or specialist appointment. Calling businesses isn't available yet: relay the result exactly and offer the alternative it gives.",
      parameters: z.object({
        providerType: z
          .string()
          .describe('Type of provider (dentist, primary care, dermatologist, etc.)'),
        location: z.string().describe('City or area'),
        urgency: z
          .enum(['routine', 'soon', 'urgent'])
          .optional()
          .describe('How urgent is the appointment'),
        reason: z.string().optional().describe('Reason for the visit'),
        insuranceProvider: z.string().optional().describe('Insurance provider name'),
        preferredTime: z
          .enum(['morning', 'afternoon', 'evening', 'any'])
          .optional()
          .describe('Preferred time of day'),
      }),
      execute: async () => {
        log.info(
          { userId: ctx.userId },
          'scheduleHealthcareAppointment: no way to call businesses, told the user'
        );
        return CONCIERGE_CANT_CALL;
      },
    });
  },
};

// ============================================================================
// TOOL: Get Service Quotes
// ============================================================================

const getServiceQuotesDef: ToolDefinition = {
  id: 'getServiceQuotes',
  name: 'Get Service Quotes',
  description: 'Contact local service providers (plumbers, electricians, etc.) for quotes',
  domain: 'concierge',
  tags: ['service', 'home', 'quote', 'outreach'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "Use when the user asks you to get quotes from a plumber, electrician, cleaner or other home service. Calling businesses isn't available yet: relay the result exactly and offer the alternative it gives.",
      parameters: z.object({
        serviceType: z
          .string()
          .describe('Type of service (plumber, electrician, house cleaner, etc.)'),
        description: z.string().describe('Description of what needs to be done'),
        location: z.string().describe('City or neighborhood'),
        preferredDate: z.string().optional().describe('Preferred date for service'),
        maxBudget: z.number().optional().describe('Maximum budget'),
      }),
      execute: async () => {
        log.info(
          { userId: ctx.userId },
          'getServiceQuotes: no way to call businesses, told the user'
        );
        return CONCIERGE_CANT_CALL;
      },
    });
  },
};

// ============================================================================
// TOOL: Check Concierge Status
// ============================================================================

const checkConciergeStatusDef: ToolDefinition = {
  id: 'checkConciergeStatus',
  name: 'Check Concierge Status',
  description: 'Check the status of an active concierge request',
  domain: 'concierge',
  tags: ['status', 'outreach'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Use when the user asks about hotel quotes, reservations or appointments you were getting for them. Relay the result exactly.',
      parameters: z.object({
        requestId: z.string().optional().describe('Specific request ID to check'),
      }),
      execute: async () => {
        log.info({ userId: ctx.userId }, 'checkConciergeStatus: nothing can be in progress');
        return CONCIERGE_NOTHING_IN_PROGRESS;
      },
    });
  },
};

// ============================================================================
// CALENDAR PREP CONCIERGE - "Better Than Human"
// ============================================================================

const prepareForUpcomingEventDef: ToolDefinition = {
  id: 'prepareForUpcomingEvent',
  name: 'Prepare for Upcoming Event',
  description: 'Get superhuman preparation support for upcoming calendar events',
  domain: 'concierge',
  tags: ['concierge', 'calendar', 'prep', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Get comprehensive preparation for an upcoming calendar event - context about attendees, suggested talking points, travel considerations, and more.',
      parameters: z.object({
        eventTitle: z.string().describe('Title of the event to prepare for'),
        eventDate: z.string().describe('When the event is (YYYY-MM-DD format)'),
        eventType: z
          .enum(['meeting', 'dinner', 'appointment', 'travel', 'personal', 'other'])
          .describe('Type of event'),
        attendees: z.array(z.string()).optional().describe('Names of people involved'),
      }),
      execute: async ({ eventTitle, eventDate, eventType, attendees }) => {
        try {
          log.info({ userId: ctx.userId, eventTitle, eventDate }, 'Preparing for upcoming event');

          // Build event context for prep
          const eventDateTimestamp = new Date(eventDate).getTime();
          const upcomingEvent = {
            id: `prep-${Date.now()}`,
            title: eventTitle,
            startTime: eventDateTimestamp,
            endTime: eventDateTimestamp + 3600000, // 1 hour default
            attendees: attendees || [],
          };

          const prepContext = await buildCalendarPrepContext(ctx.userId, [upcomingEvent]);

          if (!prepContext || prepContext === '') {
            let response = `**Preparing for: ${eventTitle}**\n\n`;
            response += `**When:** ${eventDate}\n`;
            response += `**Type:** ${eventType}\n`;
            if (attendees?.length) {
              response += `**With:** ${attendees.join(', ')}\n`;
            }
            response += `\n---\n\n`;
            response += `I don't have deep context yet, but here's a basic prep checklist:\n`;
            response += `- Confirm the time and location\n`;
            response += `- Review any materials or agenda\n`;
            response += `- Prepare questions you want to ask\n`;
            response += `- Consider what you want to achieve\n\n`;
            response += `Would you like me to help with anything specific?`;

            return response;
          }

          let response = `**Event Preparation: ${eventTitle}**\n\n`;
          response += prepContext;
          response += `\n\n---\n\n`;
          response += `*This is "Better Than Human" prep—no human assistant could synthesize all this context for you.*`;

          return response;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId, eventTitle }, 'Event prep failed');
          return `I couldn't fully prepare for ${eventTitle}, but I'm here to help with specifics.`;
        }
      },
    });
  },
};

const proactiveConciergeCheckInDef: ToolDefinition = {
  id: 'proactiveConciergeCheckIn',
  name: 'Proactive Concierge Check-In',
  description: 'Review upcoming schedule and proactively offer concierge assistance',
  domain: 'concierge',
  tags: ['concierge', 'proactive', 'calendar', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "Proactively review what's coming up and identify where concierge services could help.",
      parameters: z.object({}),
      execute: async () => {
        try {
          // Get upcoming events context
          const prepContext = await buildCalendarPrepContext(ctx.userId, []);

          let response = `**Proactive Concierge Check-In**\n\n`;

          if (!prepContext || prepContext === '') {
            response += `I don't have calendar access yet. I can't call businesses for you yet either, `;
            response += `but I can help you plan what's coming up and what to ask when you call.\n\n`;
            response += `What's coming up that I can help with?`;
          } else {
            response += prepContext;
            response += `\n\n---\n\n`;
            response += `I can't call businesses for you yet, but I can help you plan any reservations, `;
            response += `appointments or quotes these need, so you know who to call and what to ask.\n`;
          }

          log.info({ userId: ctx.userId }, 'Proactive concierge check-in');

          return response;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Proactive check-in failed');
          return "I couldn't review your upcoming schedule, but I'm here to help with any concierge tasks.";
        }
      },
    });
  },
};

// ============================================================================
// EXPORT
// ============================================================================

const conciergeTools: ToolDefinition[] = [
  requestHotelQuotesDef,
  makeRestaurantReservationDef,
  scheduleAppointmentDef,
  getServiceQuotesDef,
  checkConciergeStatusDef,
  // Calendar prep concierge
  prepareForUpcomingEventDef,
  proactiveConciergeCheckInDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'concierge',
  conciergeTools
);
export default getToolDefinitions;

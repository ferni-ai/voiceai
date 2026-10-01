/**
 * Concierge Domain Tools - Business & Vendor Outreach
 *
 * AI-powered outreach to BUSINESSES on behalf of users - calling hotels,
 * restaurants, service providers to get quotes, make reservations, and schedule appointments.
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

// Import concierge service functions
import {
  createConciergeRouter,
  getTaskTracker,
  PhoneCaller,
  registerNotifier,
  type ConciergeRequirements,
} from '../../../services/concierge/index.js';

// Superhuman calendar prep service
import { buildCalendarPrepContext } from '../../../services/superhuman/calendar-prep-coaching.js';
import {
  makeRestaurantReservationDef,
  requestHotelQuotesDef,
  scheduleAppointmentDef,
} from './booking-tools.js';
import {
  CALLS_UNAVAILABLE_REPLY,
  formatStatusUpdate,
  getStatusEmoji,
  startConciergeOutreach,
} from './helpers.js';

const log = getLogger();

// Register the concierge notification system when this module loads
// This ensures users get email/push notifications when concierge requests complete
registerNotifier().catch((err) => {
  log.warn({ error: String(err) }, 'Failed to register concierge notifier');
});

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
        'Get quotes from local service providers. Use when the user needs a plumber, electrician, cleaner, or other home service.',
      parameters: z.object({
        serviceType: z
          .string()
          .describe('Type of service (plumber, electrician, house cleaner, etc.)'),
        description: z.string().describe('Description of what needs to be done'),
        location: z.string().describe('City or neighborhood'),
        preferredDate: z.string().optional().describe('Preferred date for service'),
        maxBudget: z.number().optional().describe('Maximum budget'),
      }),
      execute: async (params) => {
        try {
          if (!PhoneCaller.isCallingAvailable()) return CALLS_UNAVAILABLE_REPLY;
          log.info(
            { serviceType: params.serviceType, location: params.location },
            'Getting service quotes'
          );

          const router = createConciergeRouter({
            userId: ctx.userId,
            sessionId: undefined,
          });

          const requirements: ConciergeRequirements = {
            location: params.location,
            serviceType: params.serviceType,
            serviceDescription: params.description,
            date: params.preferredDate ? new Date(params.preferredDate) : undefined,
            budget: params.maxBudget ? { max: params.maxBudget } : undefined,
          };

          const result = await router.routeRequest(
            `Get quotes for ${params.serviceType}`,
            requirements,
            { maxTargets: 5, preferredChannel: 'phone' }
          );

          if (!result.success) {
            return `I couldn't start the quote search: ${result.error}`;
          }

          startConciergeOutreach(result.requestId!, ctx.userId).catch((e) =>
            log.error({ error: String(e) }, 'Outreach failed')
          );

          return `I'm reaching out to ${result.estimatedTargets} ${params.serviceType}s in ${params.location} to get you quotes. I'll compare pricing and availability, then give you my recommendation!`;
        } catch (error) {
          log.error({ error: String(error) }, 'Failed to get service quotes');
          return 'I ran into an issue getting quotes. Should I try again?';
        }
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
        'Check the status of outreach requests. Use when the user asks about pending hotel quotes, reservations, or appointments.',
      parameters: z.object({
        requestId: z.string().optional().describe('Specific request ID to check'),
      }),
      execute: async (params) => {
        try {
          const tracker = getTaskTracker();

          if (params.requestId) {
            const request = await tracker.getRequest(params.requestId);
            if (!request) {
              return "I couldn't find that request. It may have been completed or expired.";
            }
            return formatStatusUpdate(request);
          }

          // Get all active requests
          const requests = await tracker.getUserRequests(ctx.userId);
          if (requests.length === 0) {
            return "You don't have any active concierge requests right now.";
          }

          const summaries = requests.map((r) => {
            const emoji = getStatusEmoji(r.status);
            return `${emoji} ${r.description} (${r.status})`;
          });

          return `Here are your active requests:\n\n${summaries.join('\n')}`;
        } catch (error) {
          log.error({ error: String(error) }, 'Failed to check status');
          return 'I had trouble checking the status. Let me try again.';
        }
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
            response += `I don't have calendar access yet, but here's how I can help:\n\n`;
            response += `- **Reservations:** I can call restaurants to book tables\n`;
            response += `- **Appointments:** I can schedule healthcare visits\n`;
            response += `- **Travel:** I can get hotel quotes and compare rates\n`;
            response += `- **Services:** I can get quotes from plumbers, cleaners, etc.\n\n`;
            response += `What's coming up that I can help with?`;
          } else {
            response += prepContext;
            response += `\n\n---\n\n`;
            response += `Based on what's coming up, would you like me to:\n`;
            response += `- Make any reservations?\n`;
            response += `- Schedule related appointments?\n`;
            response += `- Get quotes for anything?\n`;
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

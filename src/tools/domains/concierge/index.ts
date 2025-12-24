/**
 * Concierge Domain Tools
 *
 * AI-powered outreach on behalf of users - making calls, sending emails,
 * and texting businesses to get quotes, make reservations, and schedule appointments.
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
  type ConciergeRequirements,
} from '../../../services/concierge/index.js';

const log = getLogger();

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
        'Request hotel rate quotes by calling multiple hotels. Use when the user wants to find hotel prices or book accommodations.',
      parameters: z.object({
        destination: z.string().describe('City or area for the hotel'),
        checkIn: z.string().describe('Check-in date (YYYY-MM-DD format)'),
        checkOut: z.string().describe('Check-out date (YYYY-MM-DD format)'),
        guests: z.number().optional().describe('Number of guests'),
        rooms: z.number().optional().describe('Number of rooms needed'),
        roomType: z.string().optional().describe('Preferred room type'),
        maxBudget: z.number().optional().describe('Maximum budget per night'),
      }),
      execute: async (params) => {
        try {
          log.info(
            { destination: params.destination, userId: ctx.userId },
            'Requesting hotel quotes'
          );

          const router = createConciergeRouter({
            userId: ctx.userId,
            sessionId: undefined,
          });

          const requirements: ConciergeRequirements = {
            location: params.destination,
            dateRange: {
              start: new Date(params.checkIn),
              end: new Date(params.checkOut),
            },
            guests: params.guests,
            rooms: params.rooms,
            roomType: params.roomType,
            budget: params.maxBudget ? { max: params.maxBudget } : undefined,
          };

          const result = await router.routeRequest(
            `Find hotel rates in ${params.destination}`,
            requirements,
            { maxTargets: 5, preferredChannel: 'phone' }
          );

          if (!result.success) {
            return `I couldn't start the hotel search: ${result.error}`;
          }

          // Start outreach in background
          startConciergeOutreach(result.requestId!, ctx.userId).catch((e) =>
            log.error({ error: String(e) }, 'Outreach failed')
          );

          return `I'm now calling ${result.estimatedTargets} hotels in ${params.destination} to get you the best rates for ${params.checkIn} to ${params.checkOut}. I'll compare prices and let you know what I find!`;
        } catch (error) {
          log.error({ error: String(error) }, 'Failed to request hotel quotes');
          return 'I ran into an issue starting the hotel search. Would you like me to try again?';
        }
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
        'Make a restaurant reservation by calling restaurants. Use when the user wants to book a table.',
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
      execute: async (params) => {
        try {
          log.info(
            { location: params.location, partySize: params.partySize },
            'Making restaurant reservation'
          );

          const router = createConciergeRouter({
            userId: ctx.userId,
            sessionId: undefined,
          });

          const requirements: ConciergeRequirements = {
            location: params.location,
            date: new Date(params.date),
            timePreference: parseTimePreference(params.time),
            partySize: params.partySize,
            dietaryRestrictions: params.dietaryRestrictions,
            occasion: params.occasion,
          };

          const description = params.restaurantName
            ? `Make a reservation at ${params.restaurantName}`
            : `Find a ${params.cuisine || 'great'} restaurant in ${params.location}`;

          const result = await router.routeRequest(description, requirements, {
            maxTargets: params.restaurantName ? 1 : 3,
            preferredChannel: 'phone',
          });

          if (!result.success) {
            return `I couldn't start the reservation process: ${result.error}`;
          }

          startConciergeOutreach(result.requestId!, ctx.userId).catch((e) =>
            log.error({ error: String(e) }, 'Outreach failed')
          );

          const restaurantDesc = params.restaurantName || `${params.cuisine || ''} restaurants`;
          return `I'm calling ${restaurantDesc} now to book a table for ${params.partySize} on ${new Date(params.date).toLocaleDateString()}. I'll handle any special requests and get back to you with the confirmation!`;
        } catch (error) {
          log.error({ error: String(error) }, 'Failed to make restaurant reservation');
          return 'I had trouble starting the reservation. Would you like me to try again?';
        }
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
        'Schedule a healthcare appointment by calling medical offices. Use when the user needs to see a doctor, dentist, or specialist.',
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
      execute: async (params) => {
        try {
          log.info(
            { providerType: params.providerType, location: params.location },
            'Scheduling appointment'
          );

          const router = createConciergeRouter({
            userId: ctx.userId,
            sessionId: undefined,
          });

          const requirements: ConciergeRequirements = {
            location: params.location,
            providerType: params.providerType,
            urgency: params.urgency || 'routine',
            reason: params.reason,
            insuranceProvider: params.insuranceProvider,
            timePreference: params.preferredTime,
          };

          const result = await router.routeRequest(
            `Schedule a ${params.providerType} appointment`,
            requirements,
            { maxTargets: 3, preferredChannel: 'phone' }
          );

          if (!result.success) {
            return `I couldn't start the appointment search: ${result.error}`;
          }

          startConciergeOutreach(result.requestId!, ctx.userId).catch((e) =>
            log.error({ error: String(e) }, 'Outreach failed')
          );

          const urgencyText =
            params.urgency === 'urgent'
              ? "I'm prioritizing finding the soonest availability"
              : "I'll find a convenient time";

          return `I'm calling ${params.providerType} offices in ${params.location} to schedule an appointment. ${urgencyText}. ${params.insuranceProvider ? `I'll confirm they accept ${params.insuranceProvider}.` : ''}`;
        } catch (error) {
          log.error({ error: String(error) }, 'Failed to schedule appointment');
          return 'I had trouble starting the appointment search. Want me to try again?';
        }
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
// HELPER FUNCTIONS
// ============================================================================

/**
 * Start the outreach process in the background
 */
async function startConciergeOutreach(requestId: string, userId: string): Promise<void> {
  const tracker = getTaskTracker();
  const request = await tracker.getRequest(requestId);
  if (!request) return;

  await tracker.updateStatus(requestId, 'in_progress', 'Starting outreach');

  const caller = new PhoneCaller({
    userId,
    userName: undefined,
    callbackNumber: undefined,
  });

  // Process targets
  for (const target of request.targets.slice(0, request.maxTargets)) {
    if (!target.phone) continue;

    await tracker.updateTargetStatus(requestId, target.id, 'calling');

    const result = await caller.call({
      target,
      domain: request.domain,
      requirements: request.requirements,
    });

    if (result.success && result.result) {
      await tracker.addResult(requestId, result.result);
    } else {
      await tracker.updateTargetStatus(requestId, target.id, 'failed');
    }

    const updatedRequest = await tracker.getRequest(requestId);
    if (updatedRequest && tracker.isRequestComplete(updatedRequest)) {
      break;
    }
  }

  await tracker.updateStatus(requestId, 'completed');
}

/**
 * Parse time preference from natural language
 */
function parseTimePreference(time?: string): 'morning' | 'afternoon' | 'evening' | 'any' {
  if (!time) return 'any';
  const lower = time.toLowerCase();
  if (lower.includes('morning') || lower.includes('breakfast')) return 'morning';
  if (lower.includes('afternoon') || lower.includes('lunch')) return 'afternoon';
  if (lower.includes('evening') || lower.includes('dinner') || lower.includes('night'))
    return 'evening';
  return 'any';
}

/**
 * Format status update for speech
 */
function formatStatusUpdate(request: any): string {
  const emoji = getStatusEmoji(request.status);
  let message = `${emoji} ${request.description}\n\n`;

  switch (request.status) {
    case 'pending':
      message += 'Queued and ready to start.';
      break;
    case 'in_progress':
      message += `Calling businesses... ${request.results.length} responses so far.`;
      break;
    case 'awaiting_user':
      if (request.recommendation) {
        message += `I recommend ${request.recommendation.targetName}: ${request.recommendation.reason}`;
      }
      break;
    case 'completed':
      message += `All done! Got ${request.results.filter((r: any) => r.success).length} successful responses.`;
      break;
    case 'failed':
      message += `Unfortunately, I couldn't complete this request.`;
      break;
  }

  return message;
}

/**
 * Get status emoji
 */
function getStatusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    pending: '⏳',
    in_progress: '📞',
    awaiting_user: '✋',
    completed: '✅',
    failed: '❌',
  };
  return emojis[status] || '❓';
}

// ============================================================================
// EXPORT
// ============================================================================

const conciergeTools: ToolDefinition[] = [
  requestHotelQuotesDef,
  makeRestaurantReservationDef,
  scheduleAppointmentDef,
  getServiceQuotesDef,
  checkConciergeStatusDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'concierge',
  conciergeTools
);
export default getToolDefinitions;

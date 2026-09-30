/**
 * Concierge booking tools: hotel quotes, restaurant reservations and
 * appointment scheduling. Extracted from concierge/index.ts.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition, Tool } from '../../registry/types.js';

// Import concierge service functions
import {
  createConciergeRouter,
  PhoneCaller,
  type ConciergeRequirements,
} from '../../../services/concierge/index.js';
import { CALLS_UNAVAILABLE_REPLY, parseTimePreference, startConciergeOutreach } from './helpers.js';

const log = getLogger();

// ============================================================================
// TOOL: Request Hotel Quotes
// ============================================================================

export const requestHotelQuotesDef: ToolDefinition = {
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
          if (!PhoneCaller.isCallingAvailable()) return CALLS_UNAVAILABLE_REPLY;
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

export const makeRestaurantReservationDef: ToolDefinition = {
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
          if (!PhoneCaller.isCallingAvailable()) return CALLS_UNAVAILABLE_REPLY;
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

export const scheduleAppointmentDef: ToolDefinition = {
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
          if (!PhoneCaller.isCallingAvailable()) return CALLS_UNAVAILABLE_REPLY;
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

/**
 * Calendar Domain Tools
 *
 * Tools for scheduling, appointments, reservations, and contact management.
 * This domain provides properly-routed tools that dispatch to correct functions.
 *
 * DOMAIN: calendar
 * TOOLS:
 *   Appointments: manageAppointment (schedule, confirm, cancel, status)
 *   Reservations: restaurant (search, reserve)
 *   Delivery: foodOrder (search, start, add, checkout, status)
 *   Places: findBusiness (search, phone, call)
 *   Contacts: manageContact (add, find, update, delete, list, call)
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';

// Stub options for internal tool routing (these calls don't use the actual context)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STUB_CONTEXT = { ctx: {}, toolCallId: 'internal-routing' } as any;

// Import tool creators for underlying tools
import {
  createAppointmentTools,
  createContactsTools,
  createDeliveryTools,
  createPlacesTools,
} from '../../scheduling.js';

// ============================================================================
// LEGACY TOOL WRAPPER (for tools that don't need routing)
// ============================================================================

function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  tags?: string[]
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'calendar',
    tags: ['calendar', ...(tags || [])],
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// APPOINTMENT TOOLS (Properly routed)
// ============================================================================

function getAppointmentToolDefinitions(): ToolDefinition[] {
  const log = getLogger();
  const legacyTools = createAppointmentTools();

  return [
    {
      id: 'manageAppointment',
      name: 'Manage Appointment',
      description:
        'Schedule, confirm, cancel, or check status of appointments. Works for doctors, dentists, salons, and other services.',
      domain: 'calendar',
      tags: ['calendar', 'appointments', 'scheduling', 'confirm', 'cancel', 'status'],
      create: (_ctx: ToolContext) =>
        llm.tool({
          description:
            'Manage appointments. Actions: "schedule" (new appointment), "confirm", "cancel", or "status" (list upcoming).',
          parameters: z.object({
            action: z
              .enum(['schedule', 'confirm', 'cancel', 'status'])
              .describe('What to do with the appointment'),
            businessName: z.string().optional().describe('Business/provider name'),
            businessPhone: z.string().optional().describe('Phone number'),
            dateTime: z.string().optional().describe('When (e.g., "next Tuesday at 2pm")'),
            appointmentType: z
              .enum([
                'doctor',
                'dentist',
                'salon',
                'spa',
                'vet',
                'service',
                'consultation',
                'other',
              ])
              .optional()
              .describe('Type of appointment'),
            reason: z.string().optional().describe('Reason for appointment or cancellation'),
          }),
          execute: async (params) => {
            log.info(
              { action: params.action, business: params.businessName },
              '📅 Appointment tool called'
            );

            try {
              switch (params.action) {
                case 'schedule':
                  // Route to scheduleAppointment tool
                  return await legacyTools.scheduleAppointment.execute(
                    {
                      appointmentType: params.appointmentType || 'other',
                      businessName: params.businessName || 'Unknown',
                      businessPhone: params.businessPhone,
                      dateTime: params.dateTime || '',
                      reason: params.reason,
                    },
                    STUB_CONTEXT
                  );

                case 'confirm':
                  // Route to confirmAppointment tool
                  return await legacyTools.confirmAppointment.execute(
                    {
                      businessName: params.businessName || '',
                      businessPhone: params.businessPhone || '',
                      dateTime: params.dateTime || '',
                    },
                    STUB_CONTEXT
                  );

                case 'cancel':
                  // Route to cancelAppointment tool
                  return await legacyTools.cancelAppointment.execute(
                    {
                      businessName: params.businessName || '',
                      businessPhone: params.businessPhone || '',
                      dateTime: params.dateTime || '',
                      reason: params.reason,
                    },
                    STUB_CONTEXT
                  );

                case 'status':
                  // Route to getAppointmentStatus tool
                  return await legacyTools.getAppointmentStatus.execute(
                    { includeCompleted: false },
                    STUB_CONTEXT
                  );

                default:
                  return 'Please specify an action: schedule, confirm, cancel, or status.';
              }
            } catch (error) {
              log.error(
                { action: params.action, error: String(error) },
                '📅 Appointment tool error'
              );
              return `I had trouble with that appointment action. ${String(error)}`;
            }
          },
        }),
    },
    {
      id: 'restaurant',
      name: 'Restaurant',
      description: 'Find restaurants nearby or make a reservation.',
      domain: 'calendar',
      tags: ['calendar', 'restaurants', 'reservations', 'search', 'dining'],
      create: (_ctx: ToolContext) =>
        llm.tool({
          description: 'Restaurant search or reservation. Actions: "search" or "reserve".',
          parameters: z.object({
            action: z
              .enum(['search', 'reserve'])
              .describe('Search for restaurants or make a reservation'),
            query: z.string().optional().describe('Search term (cuisine type or restaurant name)'),
            location: z.string().optional().describe('City, neighborhood, or area'),
            restaurantName: z
              .string()
              .optional()
              .describe('Specific restaurant name for reservation'),
            restaurantPhone: z.string().optional().describe('Restaurant phone if known'),
            dateTime: z.string().optional().describe('When (e.g., "tomorrow at 7pm")'),
            partySize: z.number().optional().describe('Number of people (default 2)'),
            specialRequests: z
              .string()
              .optional()
              .describe('Special requests (outdoor, birthday, allergies)'),
          }),
          execute: async (params) => {
            log.info({ action: params.action, query: params.query }, '🍽️ Restaurant tool called');

            try {
              if (params.action === 'search') {
                return await legacyTools.searchRestaurantsNearby.execute(
                  {
                    query: params.query || 'restaurants',
                    location: params.location || 'nearby',
                    date: params.dateTime || 'today',
                    partySize: params.partySize || 2,
                  },
                  STUB_CONTEXT
                );
              } else {
                // Reserve
                return await legacyTools.makeReservation.execute(
                  {
                    restaurantName: params.restaurantName || params.query || '',
                    restaurantPhone: params.restaurantPhone,
                    location: params.location,
                    dateTime: params.dateTime || '',
                    partySize: params.partySize || 2,
                    specialRequests: params.specialRequests,
                  },
                  STUB_CONTEXT
                );
              }
            } catch (error) {
              log.error(
                { action: params.action, error: String(error) },
                '🍽️ Restaurant tool error'
              );
              return `I had trouble with that restaurant request. ${String(error)}`;
            }
          },
        }),
    },
  ];
}

// ============================================================================
// DELIVERY TOOLS (Properly routed)
// ============================================================================

function getDeliveryToolDefinitions(): ToolDefinition[] {
  const log = getLogger();
  const legacyTools = createDeliveryTools();

  return [
    {
      id: 'foodDelivery',
      name: 'Food Delivery',
      description:
        'Order food for delivery - search restaurants, start orders, add items, checkout.',
      domain: 'calendar',
      tags: ['calendar', 'delivery', 'food', 'order', 'doordash', 'ubereats'],
      create: (_ctx: ToolContext) =>
        llm.tool({
          description:
            'Food delivery management. Actions: "search" (find restaurants), "start" (begin order), "add" (add item), "checkout" (complete order), "status" (check order).',
          parameters: z.object({
            action: z
              .enum(['search', 'start', 'add', 'checkout', 'status', 'quick'])
              .describe('What to do'),
            // Search params
            query: z.string().optional().describe('Food type or restaurant name'),
            street: z.string().optional().describe('Delivery address street'),
            city: z.string().optional().describe('City'),
            state: z.string().optional().describe('State abbreviation'),
            zipCode: z.string().optional().describe('ZIP code'),
            platform: z.enum(['doordash', 'ubereats', 'both']).optional().describe('Delivery app'),
            // Order params
            restaurantName: z.string().optional().describe('Restaurant name'),
            orderId: z.string().optional().describe('Order ID for add/checkout/status'),
            itemName: z.string().optional().describe('Item to add'),
            price: z.number().optional().describe('Item price'),
            quantity: z.number().optional().describe('Quantity'),
            specialInstructions: z.string().optional().describe('Special requests'),
            tip: z.number().optional().describe('Tip amount for checkout'),
          }),
          execute: async (params) => {
            log.info(
              { action: params.action, query: params.query },
              '🚚 Food delivery tool called'
            );

            try {
              switch (params.action) {
                case 'search':
                  return await legacyTools.searchFoodDelivery.execute(
                    {
                      query: params.query || 'food',
                      street: params.street || '',
                      city: params.city || '',
                      state: params.state || '',
                      zipCode: params.zipCode || '',
                      platform: params.platform || 'both',
                    },
                    STUB_CONTEXT
                  );

                case 'start':
                  return await legacyTools.startFoodOrder.execute(
                    {
                      restaurantName: params.restaurantName || params.query || '',
                      platform:
                        (params.platform === 'both' ? 'doordash' : params.platform) || 'doordash',
                    },
                    STUB_CONTEXT
                  );

                case 'add':
                  if (!params.orderId || !params.itemName) {
                    return 'I need the order ID and item name to add to your order.';
                  }
                  return await legacyTools.addItemToOrder.execute(
                    {
                      orderId: params.orderId,
                      itemName: params.itemName,
                      price: params.price || 10,
                      quantity: params.quantity || 1,
                      specialInstructions: params.specialInstructions,
                    },
                    STUB_CONTEXT
                  );

                case 'checkout':
                  if (!params.orderId) {
                    return 'I need the order ID to checkout.';
                  }
                  return await legacyTools.checkoutOrder.execute(
                    { orderId: params.orderId, tip: params.tip },
                    STUB_CONTEXT
                  );

                case 'status':
                  if (!params.orderId) {
                    return 'I need the order ID to check status.';
                  }
                  return await legacyTools.getOrderStatus.execute(
                    { orderId: params.orderId },
                    STUB_CONTEXT
                  );

                case 'quick':
                  // Quick order shortcut
                  return await legacyTools.quickFoodOrder.execute(
                    {
                      foodType: params.query || 'pizza',
                      street: params.street || '',
                      city: params.city || '',
                      state: params.state || '',
                      zipCode: params.zipCode || '',
                      platform:
                        (params.platform === 'both' ? 'doordash' : params.platform) || 'doordash',
                    },
                    STUB_CONTEXT
                  );

                default:
                  return 'Please specify an action: search, start, add, checkout, status, or quick.';
              }
            } catch (error) {
              log.error(
                { action: params.action, error: String(error) },
                '🚚 Food delivery tool error'
              );
              return `I had trouble with that delivery request. ${String(error)}`;
            }
          },
        }),
    },
  ];
}

// ============================================================================
// PLACES TOOLS (Properly routed)
// ============================================================================

function getPlacesToolDefinitions(): ToolDefinition[] {
  const log = getLogger();
  const legacyTools = createPlacesTools();

  return [
    {
      id: 'findBusiness',
      name: 'Find Business',
      description:
        'Search for businesses by name, type, or location. Get details including phone, hours, address, and reviews.',
      domain: 'calendar',
      tags: ['calendar', 'places', 'search', 'nearby', 'details', 'phone', 'hours'],
      create: (_ctx: ToolContext) =>
        llm.tool({
          description:
            'Business search and info. Actions: "search" (find by name/type), "details" (full info), "phone" (just the number), "call" (find and call).',
          parameters: z.object({
            action: z.enum(['search', 'details', 'phone', 'call']).describe('What to do'),
            query: z.string().optional().describe('Business name or type'),
            location: z.string().optional().describe('Location to search in'),
            openNow: z.boolean().optional().describe('Only show places open now'),
            purpose: z.string().optional().describe('Purpose for calling'),
          }),
          execute: async (params) => {
            log.info({ action: params.action, query: params.query }, '📍 Business tool called');

            try {
              switch (params.action) {
                case 'search':
                  return await legacyTools.searchBusinesses.execute(
                    {
                      query: params.query || '',
                      location: params.location,
                      openNow: params.openNow || false,
                    },
                    STUB_CONTEXT
                  );

                case 'details':
                  return await legacyTools.getBusinessDetails.execute(
                    {
                      businessName: params.query || '',
                      location: params.location,
                    },
                    STUB_CONTEXT
                  );

                case 'phone':
                  return await legacyTools.lookupBusinessPhone.execute(
                    {
                      businessName: params.query || '',
                      location: params.location,
                    },
                    STUB_CONTEXT
                  );

                case 'call':
                  return await legacyTools.findAndCall.execute(
                    {
                      businessName: params.query || '',
                      location: params.location,
                      purpose: params.purpose,
                    },
                    STUB_CONTEXT
                  );

                default:
                  return 'Please specify an action: search, details, phone, or call.';
              }
            } catch (error) {
              log.error({ action: params.action, error: String(error) }, '📍 Business tool error');
              return `I had trouble finding that business. ${String(error)}`;
            }
          },
        }),
    },
  ];
}

// ============================================================================
// CONTACTS TOOLS (Properly routed)
// ============================================================================

function getContactsToolDefinitions(): ToolDefinition[] {
  const log = getLogger();
  const legacyTools = createContactsTools();

  return [
    {
      id: 'manageContact',
      name: 'Manage Contact',
      description: 'Add, find, update, delete, list, or call contacts from the address book.',
      domain: 'calendar',
      tags: ['calendar', 'contacts', 'add', 'find', 'update', 'delete', 'list', 'call'],
      create: (_ctx: ToolContext) =>
        llm.tool({
          description:
            'Contact management. Actions: "add", "find", "update", "delete", "list", or "call".',
          parameters: z.object({
            action: z
              .enum(['add', 'find', 'update', 'delete', 'list', 'call'])
              .describe('What to do with contacts'),
            // Contact identification
            name: z.string().optional().describe('Contact name'),
            query: z
              .string()
              .optional()
              .describe('Search query (name, nickname, or relationship like "my mom")'),
            // Contact details for add/update
            phone: z.string().optional().describe('Phone number'),
            email: z.string().optional().describe('Email address'),
            nickname: z.string().optional().describe('Nickname (e.g., "mom", "work")'),
            relationship: z.string().optional().describe('Relationship (e.g., "mother", "friend")'),
            company: z.string().optional().describe('Company/workplace'),
            notes: z.string().optional().describe('Additional notes'),
            // List options
            filter: z
              .enum(['all', 'favorites', 'recent'])
              .optional()
              .describe('Filter for list action'),
            // Update options
            makeFavorite: z.boolean().optional().describe('Mark as favorite'),
            // Delete confirmation
            confirm: z.boolean().optional().describe('Confirm deletion'),
            // Call options
            purpose: z.string().optional().describe('Purpose of the call'),
          }),
          execute: async (params) => {
            log.info(
              { action: params.action, name: params.name || params.query },
              '📇 Contacts tool called'
            );

            try {
              switch (params.action) {
                case 'add':
                  if (!params.name) {
                    return 'I need a name to add a contact.';
                  }
                  return await legacyTools.addContact.execute(
                    {
                      name: params.name,
                      phone: params.phone,
                      email: params.email,
                      nickname: params.nickname,
                      relationship: params.relationship,
                      company: params.company,
                      notes: params.notes,
                    },
                    STUB_CONTEXT
                  );

                case 'find':
                  return await legacyTools.findMyContact.execute(
                    { query: params.query || params.name || '' },
                    STUB_CONTEXT
                  );

                case 'update':
                  if (!params.query && !params.name) {
                    return 'I need to know which contact to update.';
                  }
                  return await legacyTools.updateMyContact.execute(
                    {
                      who: params.query || params.name || '',
                      phone: params.phone,
                      email: params.email,
                      nickname: params.nickname,
                      makeFavorite: params.makeFavorite,
                      notes: params.notes,
                    },
                    STUB_CONTEXT
                  );

                case 'delete':
                  if (!params.query && !params.name) {
                    return 'I need to know which contact to delete.';
                  }
                  return await legacyTools.deleteMyContact.execute(
                    {
                      who: params.query || params.name || '',
                      confirm: params.confirm || false,
                    },
                    STUB_CONTEXT
                  );

                case 'list':
                  return await legacyTools.listContacts.execute(
                    {
                      filter: params.filter || 'all',
                      limit: 10,
                    },
                    STUB_CONTEXT
                  );

                case 'call':
                  if (!params.query && !params.name) {
                    return 'I need to know who to call.';
                  }
                  return await legacyTools.callMyContact.execute(
                    {
                      who: params.query || params.name || '',
                      purpose: params.purpose,
                    },
                    STUB_CONTEXT
                  );

                default:
                  return 'Please specify an action: add, find, update, delete, list, or call.';
              }
            } catch (error) {
              log.error({ action: params.action, error: String(error) }, '📇 Contacts tool error');
              return `I had trouble with that contact action. ${String(error)}`;
            }
          },
        }),
    },
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const calendarTools: ToolDefinition[] = [
  ...getAppointmentToolDefinitions(),
  ...getDeliveryToolDefinitions(),
  ...getPlacesToolDefinitions(),
  ...getContactsToolDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'calendar',
  calendarTools
);

export {
  getAppointmentToolDefinitions,
  getContactsToolDefinitions,
  getDeliveryToolDefinitions,
  getPlacesToolDefinitions,
};

export default getToolDefinitions;

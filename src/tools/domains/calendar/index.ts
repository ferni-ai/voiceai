/**
 * Calendar Domain Tools
 *
 * Tools for scheduling, appointments, reservations, and contact management.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: calendar
 * TOOLS:
 *   Appointments: scheduleAppointment, findAvailability, cancelAppointment
 *   Reservations: findRestaurants, bookReservation, checkReservationAvailability
 *   Delivery: trackDelivery, getDeliveryStatus, scheduleDelivery
 *   Places: findBusinessPhone, lookupAddress, getBusinessHours
 *   Contacts: addContact, getContacts, updateContact
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';

// Import tool creators
import {
  createAppointmentTools,
  createDeliveryTools,
  createPlacesTools,
  createContactsTools,
} from '../../scheduling.js';

// ============================================================================
// LEGACY TOOL WRAPPER
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
// APPOINTMENT TOOLS (Consolidated: 10 → 4 essential tools)
// ============================================================================

function getAppointmentToolDefinitions(): ToolDefinition[] {
  const legacyTools = createAppointmentTools();

  // Consolidated: schedule handles create/cancel/confirm/status, restaurant handles search/reserve
  return [
    wrapLegacyTool(
      'scheduleAppointment',
      'Schedule Appointment',
      'Schedule, confirm, cancel, or check status of appointments. Action: "schedule", "confirm", "cancel", or "status". Works for doctors, dentists, salons, and other services.',
      legacyTools.scheduleAppointment,
      ['appointments', 'scheduling', 'status']
    ),
    wrapLegacyTool(
      'restaurant',
      'Restaurant',
      'Find restaurants nearby or make a reservation. Action: "search" or "reserve". Specify location, party size, date and time for reservations.',
      legacyTools.makeReservation,
      ['restaurants', 'reservations', 'search']
    ),
    wrapLegacyTool(
      'getAppointments',
      'Get Appointments',
      'Get list of upcoming appointments and reservations.',
      legacyTools.getAppointmentStatus,
      ['appointments', 'list', 'upcoming']
    ),
  ];
}

// ============================================================================
// DELIVERY TOOLS (Consolidated: 6 → 2 essential tools)
// ============================================================================

function getDeliveryToolDefinitions(): ToolDefinition[] {
  const legacyTools = createDeliveryTools();

  // Consolidated: foodOrder handles search/start/add/checkout, trackDelivery handles status
  return [
    wrapLegacyTool(
      'foodOrder',
      'Food Order',
      'Search for food delivery, start an order, add items, and checkout. Action: "search", "order", "add", or "checkout".',
      legacyTools.startFoodOrder,
      ['delivery', 'order', 'food']
    ),
    wrapLegacyTool(
      'trackDelivery',
      'Track Delivery',
      'Get the current status and ETA of a delivery order or package.',
      legacyTools.getOrderStatus,
      ['delivery', 'tracking', 'status']
    ),
  ];
}

// ============================================================================
// PLACES TOOLS (Consolidated: 5 → 2 essential tools)
// ============================================================================

function getPlacesToolDefinitions(): ToolDefinition[] {
  const legacyTools = createPlacesTools();

  // Consolidated: findBusiness handles search/nearby/details/phone lookup
  return [
    wrapLegacyTool(
      'findBusiness',
      'Find Business',
      'Search for businesses by name, type, or location. Get details including phone, hours, address, and reviews.',
      legacyTools.findNearbyBusinesses,
      ['places', 'search', 'nearby', 'details']
    ),
    wrapLegacyTool(
      'callBusiness',
      'Call Business',
      'Find a business and initiate a phone call.',
      legacyTools.findAndCall,
      ['places', 'phone', 'call']
    ),
  ];
}

// ============================================================================
// CONTACTS TOOLS (Consolidated: 7 → 3 essential tools)
// ============================================================================

function getContactsToolDefinitions(): ToolDefinition[] {
  const legacyTools = createContactsTools();

  // Consolidated: manageContact handles add/update/delete/list, findContact for search
  return [
    wrapLegacyTool(
      'manageContact',
      'Manage Contact',
      'Add, update, delete, or list contacts. Action: "add", "update", "delete", or "list".',
      legacyTools.addContact,
      ['contacts', 'add', 'update', 'delete', 'list']
    ),
    wrapLegacyTool(
      'findContact',
      'Find Contact',
      'Search for a contact by name, phone, email, or other details.',
      legacyTools.findMyContact,
      ['contacts', 'search', 'find']
    ),
    wrapLegacyTool(
      'callContact',
      'Call Contact',
      'Call a contact from the address book.',
      legacyTools.callMyContact,
      ['contacts', 'call', 'phone']
    ),
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
  getDeliveryToolDefinitions,
  getPlacesToolDefinitions,
  getContactsToolDefinitions,
};

export default getToolDefinitions;

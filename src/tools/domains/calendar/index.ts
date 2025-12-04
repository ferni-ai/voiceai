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
// APPOINTMENT TOOLS
// ============================================================================

function getAppointmentToolDefinitions(): ToolDefinition[] {
  const legacyTools = createAppointmentTools();

  return [
    wrapLegacyTool(
      'makeReservation',
      'Make Reservation',
      'Make a restaurant reservation for a specific date, time, and party size',
      legacyTools.makeReservation,
      ['restaurants', 'reservations', 'booking']
    ),
    wrapLegacyTool(
      'searchRestaurantsNearby',
      'Search Restaurants Nearby',
      'Search for restaurants near a location',
      legacyTools.searchRestaurantsNearby,
      ['restaurants', 'search', 'reservations']
    ),
    wrapLegacyTool(
      'scheduleAppointment',
      'Schedule Appointment',
      'Schedule an appointment with a business (doctor, dentist, salon, etc.)',
      legacyTools.scheduleAppointment,
      ['appointments', 'scheduling']
    ),
    wrapLegacyTool(
      'checkAvailability',
      'Check Availability',
      'Check available times for an appointment',
      legacyTools.checkAvailability,
      ['appointments', 'availability']
    ),
    wrapLegacyTool(
      'confirmAppointment',
      'Confirm Appointment',
      'Confirm an appointment that was scheduled',
      legacyTools.confirmAppointment,
      ['appointments', 'confirm']
    ),
    wrapLegacyTool(
      'cancelAppointment',
      'Cancel Appointment',
      'Cancel a scheduled appointment',
      legacyTools.cancelAppointment,
      ['appointments', 'cancel']
    ),
    wrapLegacyTool(
      'getAppointmentStatus',
      'Get Appointment Status',
      'Get the current status of a scheduled appointment',
      legacyTools.getAppointmentStatus,
      ['appointments', 'status']
    ),
    wrapLegacyTool(
      'scheduleLifeEventAppointment',
      'Schedule Life Event Appointment',
      'Schedule an appointment related to a life event or milestone',
      legacyTools.scheduleLifeEventAppointment,
      ['appointments', 'life-events']
    ),
    wrapLegacyTool(
      'quickCall',
      'Quick Call',
      'Make a quick call to a business',
      legacyTools.quickCall,
      ['appointments', 'phone', 'call']
    ),
    wrapLegacyTool(
      'setAppointmentReminder',
      'Set Appointment Reminder',
      'Set a reminder for an upcoming appointment',
      legacyTools.setAppointmentReminder,
      ['appointments', 'reminders']
    ),
  ];
}

// ============================================================================
// DELIVERY TOOLS
// ============================================================================

function getDeliveryToolDefinitions(): ToolDefinition[] {
  const legacyTools = createDeliveryTools();

  return [
    wrapLegacyTool(
      'searchFoodDelivery',
      'Search Food Delivery',
      'Search for delivery options from restaurants',
      legacyTools.searchFoodDelivery,
      ['delivery', 'search', 'food']
    ),
    wrapLegacyTool(
      'startFoodOrder',
      'Start Food Order',
      'Start a food delivery order',
      legacyTools.startFoodOrder,
      ['delivery', 'order', 'food']
    ),
    wrapLegacyTool(
      'addItemToOrder',
      'Add Item to Order',
      'Add an item to the current food order',
      legacyTools.addItemToOrder,
      ['delivery', 'order', 'items']
    ),
    wrapLegacyTool(
      'checkoutOrder',
      'Checkout Order',
      'Complete and submit the food delivery order',
      legacyTools.checkoutOrder,
      ['delivery', 'checkout', 'order']
    ),
    wrapLegacyTool(
      'getOrderStatus',
      'Get Order Status',
      'Get the current status and ETA of a delivery order',
      legacyTools.getOrderStatus,
      ['delivery', 'tracking', 'status']
    ),
    wrapLegacyTool(
      'quickFoodOrder',
      'Quick Food Order',
      'Quickly order food from a favorite restaurant',
      legacyTools.quickFoodOrder,
      ['delivery', 'quick', 'food']
    ),
  ];
}

// ============================================================================
// PLACES TOOLS
// ============================================================================

function getPlacesToolDefinitions(): ToolDefinition[] {
  const legacyTools = createPlacesTools();

  return [
    wrapLegacyTool(
      'lookupBusinessPhone',
      'Lookup Business Phone',
      'Look up the phone number for a business',
      legacyTools.lookupBusinessPhone,
      ['places', 'phone', 'lookup']
    ),
    wrapLegacyTool(
      'findNearbyBusinesses',
      'Find Nearby Businesses',
      'Search for businesses near a location by type',
      legacyTools.findNearbyBusinesses,
      ['places', 'search', 'nearby']
    ),
    wrapLegacyTool(
      'searchBusinesses',
      'Search Businesses',
      'Search for businesses by name or keyword',
      legacyTools.searchBusinesses,
      ['places', 'search']
    ),
    wrapLegacyTool(
      'getBusinessDetails',
      'Get Business Details',
      'Get detailed information about a business including hours, address, and reviews',
      legacyTools.getBusinessDetails,
      ['places', 'details', 'info']
    ),
    wrapLegacyTool(
      'findAndCall',
      'Find and Call',
      'Find a business and call them',
      legacyTools.findAndCall,
      ['places', 'phone', 'call']
    ),
  ];
}

// ============================================================================
// CONTACTS TOOLS
// ============================================================================

function getContactsToolDefinitions(): ToolDefinition[] {
  const legacyTools = createContactsTools();

  return [
    wrapLegacyTool(
      'addContact',
      'Add Contact',
      'Add a new contact to the address book',
      legacyTools.addContact,
      ['contacts', 'add', 'create']
    ),
    wrapLegacyTool(
      'findMyContact',
      'Find My Contact',
      'Search and find a contact from the address book',
      legacyTools.findMyContact,
      ['contacts', 'search', 'find']
    ),
    wrapLegacyTool(
      'callMyContact',
      'Call My Contact',
      'Call a contact from the address book',
      legacyTools.callMyContact,
      ['contacts', 'call', 'phone']
    ),
    wrapLegacyTool(
      'listContacts',
      'List Contacts',
      'List all contacts in the address book',
      legacyTools.listContacts,
      ['contacts', 'list']
    ),
    wrapLegacyTool(
      'updateMyContact',
      'Update My Contact',
      'Update information for an existing contact',
      legacyTools.updateMyContact,
      ['contacts', 'update', 'edit']
    ),
    wrapLegacyTool(
      'deleteMyContact',
      'Delete My Contact',
      'Remove a contact from the address book',
      legacyTools.deleteMyContact,
      ['contacts', 'delete', 'remove']
    ),
    wrapLegacyTool(
      'importContacts',
      'Import Contacts',
      'Import contacts from an external source',
      legacyTools.importContacts,
      ['contacts', 'import']
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


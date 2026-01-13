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
 * NOTE: All implementation is now in modular files under ./scheduling/
 * This file is a thin re-export layer for backward compatibility.
 *
 * @see ./scheduling/index.ts for the full module structure
 */
// Core functions
export { createAppointmentRequest, updateAppointmentStatus, makeAppointmentCall, generateCallScript, getAppointment, getUserAppointments, } from './scheduling/appointment-core.js';
// Tool creators
export { createAppointmentTools } from './scheduling/appointments-tools.js';
export { createDeliveryTools } from './scheduling/delivery-tools.js';
export { createPlacesTools } from './scheduling/places-tools.js';
export { createContactsTools } from './scheduling/contacts-tools.js';
// ============================================================================
// DEFAULT EXPORT
// ============================================================================
export { default } from './scheduling/index.js';
//# sourceMappingURL=scheduling.js.map
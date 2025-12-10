/**
 * Scheduling Module
 *
 * Tools for appointment scheduling, delivery tracking, places lookup, and contact management.
 *
 * Module structure:
 * - types.ts: Shared types and interfaces
 * - appointment-core.ts: Core appointment functions
 * - appointments-tools.ts: Appointment & reservation LLM tools
 * - delivery-tools.ts: Delivery tracking LLM tools
 * - places-tools.ts: Places/location LLM tools
 * - contacts-tools.ts: Contact management LLM tools
 *
 * @module scheduling
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  AppointmentType,
  AppointmentStatus,
  ScheduledAppointment,
} from './types.js';

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

export {
  createAppointmentRequest,
  updateAppointmentStatus,
  makeAppointmentCall,
  generateCallScript,
  getAppointment,
  getUserAppointments,
} from './appointment-core.js';

// ============================================================================
// TOOL CREATORS
// ============================================================================

export { createAppointmentTools } from './appointments-tools.js';
export { createDeliveryTools } from './delivery-tools.js';
export { createPlacesTools } from './places-tools.js';
export { createContactsTools } from './contacts-tools.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export { createAppointmentTools as default } from './appointments-tools.js';

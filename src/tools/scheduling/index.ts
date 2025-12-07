/**
 * Scheduling Tools Module
 *
 * Tools for appointment scheduling, food delivery, places lookup, and contact management.
 *
 * Module structure:
 * - types.ts: Shared types and interfaces
 * - appointment-core.ts: Core appointment functions (createAppointment, makeCall, etc.)
 * - ../scheduling.ts: Tool definitions (to be migrated here incrementally)
 *
 * Usage:
 *   import { createAppointmentTools, AppointmentType } from './scheduling/index.js';
 */

// Export types
export type {
  AppointmentType,
  AppointmentStatus,
  ScheduledAppointment,
} from './types.js';

// Export core appointment functions
export {
  createAppointmentRequest,
  updateAppointmentStatus,
  makeAppointmentCall,
  generateCallScript,
  getAppointment,
  getUserAppointments,
} from './appointment-core.js';

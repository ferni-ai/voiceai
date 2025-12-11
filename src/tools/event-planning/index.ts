/**
 * Event Planning Module
 *
 * Re-exports for the event planning tools module.
 */

// Export types
export * from './types.js';

// Export storage and helpers
export {
  events,
  majorPurchases,
  vacations,
  annualPlans,
  loadedUsers,
  getPersistence,
  ensureUserLoaded,
  persistEventPlanningData,
  flushEventPlanningPersistence,
  serializeEvent,
  deserializeEvent,
  serializePurchase,
  deserializePurchase,
  serializeVacation,
  deserializeVacation,
  serializeAnnualPlan,
  deserializeAnnualPlan,
  BEST_TIMES_TO_BUY,
  DESTINATION_DATABASE,
  venueDatabase,
} from './storage.js';

// Re-export the main tools from parent (for convenience)
export { createEventPlanningTools } from '../event-planning.js';

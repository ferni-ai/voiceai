/**
 * Persona-Specific Domain Tools
 *
 * Barrel export for domain-specific tools (agent-agnostic):
 * - Communication tools (was Alex)
 * - Financial habits tools (was Maya)
 * - Event planning tools (was Jordan)
 * - Persona memory tools
 */

// Communication tools (was Alex)
export {
  createCommunicationTools,
  createCommunicationTools as createAlexTools, // Legacy alias
} from '../communication-tools.js';

export {
  createAppointmentTools,
  createDeliveryTools,
  createPlacesTools,
  createContactsTools,
  // Legacy aliases
  createAppointmentTools as createAlexAppointmentTools,
  createDeliveryTools as createAlexDeliveryTools,
  createPlacesTools as createAlexPlacesTools,
  createContactsTools as createAlexContactsTools,
} from '../scheduling.js';

// Financial habits tools (was Maya)
export {
  createFinancialHabitsTools,
  createFinancialHabitsTools as createMayaTools, // Legacy alias
} from '../financial-habits.js';

// Event planning tools (was Jordan)
export {
  createEventPlanningTools,
  createEventPlanningTools as createJordanTools, // Legacy alias
} from '../event-planning.js';

// Persona memory tools
export {
  createFerniMemoryTools,
  createBogleMemoryTools,
  createPeterMemoryTools,
  createMayaMemoryTools,
  createJordanMemoryTools,
} from '../persona-memory-tools.js';

// NOTE: Team handlers have been migrated to the team-handler-registry system.
// See: src/services/team-handler-registry/

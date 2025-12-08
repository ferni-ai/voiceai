/**
 * Persona-Specific Domain Tools
 *
 * Barrel export for domain-specific tools (agent-agnostic):
 * - Communication tools
 * - Financial habits tools
 * - Event planning tools
 * - Persona memory tools
 */

// Communication tools
export { createCommunicationTools } from '../communication-tools.js';

export {
  createAppointmentTools,
  createDeliveryTools,
  createPlacesTools,
  createContactsTools,
} from '../scheduling.js';

// Financial habits tools
export { createFinancialHabitsTools } from '../financial-habits.js';

// Event planning tools
export { createEventPlanningTools } from '../event-planning.js';

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

/**
 * Persona Registry Module
 *
 * Exports the unified agent registry - the single source of truth
 * for all agent discovery and lookup operations.
 *
 * USAGE:
 *   import { AgentRegistry, getAgent, getAllAgents } from './registry/index.js';
 *
 *   // Get an agent by any ID/alias
 *   const jack = await getAgent('jack');
 *
 *   // Get all discovered agents
 *   const agents = await getAllAgents();
 *
 *   // Use the registry directly for more operations
 *   const coordinator = await AgentRegistry.getCoordinator();
 */

export {
  // Main registry
  AgentRegistry,

  // Convenience functions
  getAgent,
  getAllAgents,
  hasAgent,
  resolveAgentId,

  // Types
  type Agent,
} from './unified-registry.js';

// Re-export as default
export { AgentRegistry as default } from './unified-registry.js';


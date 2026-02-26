/**
 * Relational Memory Module (Re-export Shim)
 *
 * This module has been consolidated into services/memory/knowledge-graph/.
 * This shim preserves backward compatibility for existing importers.
 *
 * @module @ferni/services/superhuman/relational-memory
 * @deprecated Import from '../../memory/knowledge-graph/index.js' instead
 */

// Types
export type {
  InsideJoke,
  ConversationRitual,
  CommunicationPreference,
  TrustMilestone,
  RelationalMemory,
  RelationshipStats,
  IRelationalMemory,
} from '../../memory/knowledge-graph/index.js';

export { RelationalMemoryToken } from '../../memory/knowledge-graph/index.js';

// Engine
export {
  RelationalMemoryEngine,
  getRelationalMemory,
  createRelationalMemory,
  resetRelationalMemory,
  clearUserData,
} from '../../memory/knowledge-graph/index.js';

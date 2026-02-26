/**
 * Knowledge Graph
 *
 * Relational memory - inside jokes, rituals, communication preferences,
 * and trust milestones.
 *
 * @module services/memory/knowledge-graph
 */

export type {
  InsideJoke,
  ConversationRitual,
  CommunicationPreference,
  TrustMilestone,
  RelationalMemory,
  RelationshipStats,
  IRelationalMemory,
} from './types.js';
export { RelationalMemoryToken } from './types.js';

export {
  RelationalMemoryEngine,
  getRelationalMemory,
  createRelationalMemory,
  resetRelationalMemory,
  clearUserData,
} from './engine.js';

/**
 * Memory Services
 *
 * Bounded context for all memory-related services:
 * - Memory service orchestrator (unified entry point)
 * - Persistence policies (entity indexing)
 * - Semantic matching (embedding-based intent detection)
 * - Knowledge graph (relational memory)
 * - Legacy memory modules (cognitive, realtime, voice)
 *
 * @module services/memory
 */

// ============================================================================
// NEW CONSOLIDATED MODULES
// ============================================================================

// Memory service orchestrator
export {
  UnifiedMemoryService,
  getUnifiedMemoryService,
  resetUnifiedMemoryService,
  getPendingSurfacingEventIds,
  getMostRecentPendingSurfacingEvent,
  recordMemoryReaction,
  getMemory,
  saveMemoryDirect,
} from './memory-service.js';

// Memory service types
export type {
  TimingDecision,
  PhrasingSuggestion,
  MemoryFeedback,
  AssociatedMemory,
  EnhancedRecallResult,
  ToolSearchOptions,
  SimpleRecallContext,
  MemoryWriteInput,
} from './memory-service-types.js';

// Persistence policies
export {
  getIndexingPolicy,
  setIndexingPolicy,
  getEntityPolicy,
  shouldIndex,
  buildIndexContent,
  getAllPolicies,
  getPoliciesByDomain,
} from './persistence/indexing-policy.js';
export { DEFAULT_INDEXING_POLICY } from './persistence/entity-policies.js';

// Knowledge graph
export {
  RelationalMemoryEngine,
  getRelationalMemory,
  createRelationalMemory,
  resetRelationalMemory,
  clearUserData,
} from './knowledge-graph/index.js';
export type {
  InsideJoke,
  ConversationRitual,
  CommunicationPreference,
  TrustMilestone,
  RelationalMemory,
  RelationshipStats,
  IRelationalMemory,
} from './knowledge-graph/index.js';
export { RelationalMemoryToken } from './knowledge-graph/index.js';

// ============================================================================
// LEGACY MODULES (backward compatibility)
// ============================================================================

// Stubs for backward compatibility (removed in Jan 2026 cleanup)
export * from './cognitive-memory.js';
export * from './cognitive-persistence.js';
export * from './learned-memories.js';

export * from './human-listening-memory.js';
// memory-management - specific exports to avoid conflicts
export {
  consolidateProfiles,
  deletePhoneMapping,
  findDuplicateProfiles,
  findProfilesByVoice,
  generateVoiceRecognitionGreeting,
  getCachedPhoneMapping,
  loadPhoneCache,
  savePhoneMapping,
  type ConsolidationResult,
} from './memory-management.js';
export * from './memory-monitor.js';
export * from './persona-memories.js';
// realtime-memory - specific exports to avoid conflicts with voice-conversation-memory
export {
  buildQuickSummary,
  endConversation as endRealtimeConversation,
  getConversationTurns,
  getLastConversationContext,
  getRecentConversations as getRealtimeRecentConversations,
  getUnsummarizedConversations,
  persistTurn,
  startConversation as startRealtimeConversation,
  type ConversationMetadata,
  type ConversationTurn as RealtimeConversationTurn,
} from './realtime-memory.js';
export * from './voice-conversation-memory.js';
export * from './voice-memory.js';

/**
 * Memory Services
 *
 * Services related to memory management, persistence, and retrieval.
 */

export * from './cognitive-memory.js';
export * from './cognitive-persistence.js';
export * from './collective-learning-store.js';
export * from './human-listening-memory.js';
export * from './learned-memories.js';
// memory-management - specific exports to avoid conflicts
export {
  loadPhoneCache,
  savePhoneMapping,
  getCachedPhoneMapping,
  deletePhoneMapping,
  findDuplicateProfiles,
  consolidateProfiles,
  findProfilesByVoice,
  generateVoiceRecognitionGreeting,
  type ConsolidationResult,
} from './memory-management.js';
export * from './memory-monitor.js';
export * from './persona-memories.js';
// realtime-memory - specific exports to avoid conflicts with voice-conversation-memory
export {
  startConversation as startRealtimeConversation,
  persistTurn,
  endConversation as endRealtimeConversation,
  getRecentConversations as getRealtimeRecentConversations,
  getConversationTurns,
  getLastConversationContext,
  buildQuickSummary,
  getUnsummarizedConversations,
  type ConversationTurn as RealtimeConversationTurn,
  type ConversationMetadata,
} from './realtime-memory.js';
export * from './voice-conversation-memory.js';
export * from './voice-memory.js';

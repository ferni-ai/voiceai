/**
 * Memory Services
 *
 * Services related to memory management, persistence, and retrieval.
 */

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

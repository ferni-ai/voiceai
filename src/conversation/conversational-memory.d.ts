/**
 * Conversational Memory
 *
 * @deprecated Import from './conversational-memory/index.js' directly
 *
 * This file re-exports the conversational memory module for backward compatibility.
 * The implementation has been split into focused submodules:
 *
 * - types.ts - Type definitions
 * - callbacks.ts - Callback generation and frequency tuning
 * - quoted-memory.ts - Hyper-specific quoted memory extraction
 * - thread-tracking.ts - Conversation thread management
 * - topic-detection.ts - Topic detection and transitions
 * - contradiction-detection.ts - Contradiction detection and clarification
 * - statement-classifier.ts - Statement classification and importance
 * - index.ts - Main engine and exports
 *
 * @module conversation/conversational-memory
 */
export { ConversationalMemoryEngine, getConversationalMemory, resetConversationalMemory, default, } from './conversational-memory/index.js';
export type { ConversationCommitment, ConversationThread, ConversationTuningPreferences, MemoryCallback, ProfileContradiction, QuotedMemory, RecordMessageContext, TopicChange, UserProfile, UserStatement, } from './conversational-memory/index.js';
//# sourceMappingURL=conversational-memory.d.ts.map
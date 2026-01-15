/**
 * Voice Memory Module
 *
 * Consolidated module for all voice-based memory and identification services.
 *
 * This module provides:
 * - Voice sketch extraction (DSP-based features)
 * - Neural speaker embeddings (high-accuracy, optional)
 * - Voice-linked conversation memory
 * - Cross-session voice recognition
 *
 * Architecture:
 * ```
 * voice-memory/
 * ├── index.ts           # This file - re-exports
 * ├── types.ts           # Shared types
 * ├── sketch.ts          # DSP-based voice features (~85% accuracy)
 * ├── neural.ts          # Neural embeddings (~99% accuracy, optional)
 * └── conversation.ts    # Voice-linked conversation memory
 * ```
 *
 * Usage:
 * ```typescript
 * import {
 *   // Voice recognition
 *   VoiceSketchBuilder,
 *   compareVoiceSketches,
 *   getVoiceMemory,
 *   extractSpeakerEmbedding,
 *   compareSpeakerEmbeddings,
 *
 *   // Conversation memory
 *   startConversation,
 *   addConversationTurn,
 *   getConversationContext,
 *
 *   // Types
 *   type VoiceSketch,
 *   type SpeakerEmbedding,
 *   type ConversationRecord,
 * } from './voice-memory/index.js';
 * ```
 *
 * @module services/voice-memory
 */

// ============================================================================
// RE-EXPORTS FROM LEGACY FILES
// ============================================================================

// Voice sketch (DSP-based) - from voice-memory.ts
export {
  // Classes
  VoiceSketchBuilder,
  VoiceMemoryService,

  // Functions
  compareVoiceSketches,
  getVoiceMemory,
  resetVoiceMemory,

  // Types
  type VoiceSketch,
  type VoiceSimilarityResult,
  type VoiceSearchResult,
} from '../memory/voice-memory.js';

// Neural embeddings (high-accuracy) - from voice-memory-enhanced.ts
export {
  // Main functions
  extractSpeakerEmbedding,
  compareSpeakerEmbeddings,
  findBestSpeakerMatch,
  extractSpeakerEmbeddingsBatch,

  // Status
  isNeuralEmbeddingAvailable,
  getSpeakerModelInfo,

  // Types
  type SpeakerEmbedding,
  type SpeakerMatch,
} from '../memory/voice-memory-enhanced.js';

// Conversation memory - from voice-conversation-memory.ts
export {
  // Conversation lifecycle
  startConversation,
  addConversationTurn,
  endConversation,

  // Retrieval
  getUserMemory,
  getConversationContext,
  getRecentConversations,
  searchConversationsByTopic,

  // Types
  type ConversationTurn,
  type ConversationRecord,
  type ConversationMemory,
  type ConversationContext,
} from '../memory/voice-conversation-memory.js';

// ============================================================================
// MODULE-LEVEL UTILITIES
// ============================================================================

import { getLogger } from '../../utils/safe-logger.js';
import { isNeuralEmbeddingAvailable } from '../memory/voice-memory-enhanced.js';

const log = getLogger();

/**
 * Check which voice memory backends are available.
 *
 * @returns Object describing available backends
 */
export async function getVoiceMemoryCapabilities(): Promise<{
  dspSketch: boolean;
  neuralEmbedding: boolean;
  conversationMemory: boolean;
}> {
  return {
    dspSketch: true, // Always available (pure JS)
    neuralEmbedding: await isNeuralEmbeddingAvailable(),
    conversationMemory: true, // Firestore-based
  };
}

/**
 * Initialize all voice memory services.
 *
 * Call this at application startup for optimal performance.
 */
export async function initializeVoiceMemory(): Promise<void> {
  log.info('Initializing voice memory services...');

  // Check neural embedding availability (non-blocking)
  try {
    const available = await isNeuralEmbeddingAvailable();
    if (available) {
      log.info('Neural voice memory available');
    } else {
      log.debug('Neural voice memory unavailable (using DSP fallback)');
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Neural voice memory check failed (using DSP fallback)');
  }

  const caps = await getVoiceMemoryCapabilities();
  log.info({ capabilities: caps }, 'Voice memory ready');
}

/**
 * Pronunciation Memory Module
 *
 * Captures and maintains consistent pronunciation of:
 * - User names (from introductions)
 * - Technical terms (domain-specific vocabulary)
 * - Proper nouns (places, companies, people)
 *
 * @example
 * ```typescript
 * import {
 *   getPronunciationMemory,
 *   resetPronunciationMemory,
 * } from './pronunciation-memory/index.js';
 *
 * // Get service for session
 * const memory = getPronunciationMemory(sessionId);
 *
 * // Process user message for name introductions
 * const learned = memory.processUserMessage("Hi, I'm Siobhan");
 * // learned.phonetic = "Shi-vawn"
 *
 * // Apply pronunciations to text
 * const enhanced = memory.applyToText("Hello Siobhan, how are you?");
 * // enhanced = "Hello Shi-vawn, how are you?"
 *
 * // Get specific pronunciation
 * const entry = memory.getPronunciation("Siobhan");
 *
 * // Clean up
 * resetPronunciationMemory(sessionId);
 * ```
 *
 * @module speech/pronunciation-memory
 */

// Types
export type {
  ExportedPronunciationState,
  PronunciationEntry,
  PronunciationMemoryState,
  PronunciationSource,
} from './types.js';

// Constants
export {
  COMMON_DIFFICULT_NAMES,
  INTRODUCTION_PATTERNS,
  TECHNICAL_TERM_PATTERNS,
} from './constants.js';

// Service
export { PronunciationMemoryService, analyzePronunciationNeeds } from './service.js';

// Session management
export {
  getActivePronunciationMemoryCount,
  getPronunciationMemory,
  hasPronunciationMemory,
  resetAllPronunciationMemory,
  resetPronunciationMemory,
} from './session.js';

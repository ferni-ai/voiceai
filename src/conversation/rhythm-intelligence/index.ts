/**
 * Rhythm Intelligence Module
 *
 * Learn each user's conversational rhythm. Some need quick exchanges,
 * others prefer depth. Adapt response length, pause timing, and pacing.
 *
 * ## Usage
 *
 * ```typescript
 * import { getRhythmIntelligence } from './conversation/rhythm-intelligence/index.js';
 *
 * const rhythm = getRhythmIntelligence();
 *
 * // Get guidance for current context
 * const guidance = await rhythm.getGuidance({
 *   userId: 'user-123',
 *   topic: 'work',
 *   emotionalState: 'anxious',
 *   userTurnWordCount: 45,
 *   turnNumber: 5,
 * });
 *
 * console.log('Target words:', guidance.wordRange);
 * console.log('Pause before:', guidance.pauseBeforeMs);
 * console.log('Energy:', guidance.energy);
 *
 * // Record turn outcome for learning
 * const analysis = rhythm.analyzeTurn("The user's message here", {
 *   topic: 'work',
 * });
 * await rhythm.recordTurn('user-123', analysis, true); // wasSuccessful
 *
 * // Build context injection for LLM
 * const contextInjection = rhythm.buildContextInjection(guidance);
 * ```
 *
 * @module @ferni/conversation/rhythm-intelligence
 */

// Types
export type {
  ConversationalRhythm,
  RhythmPreference,
  TopicRhythmPreference,
  RhythmGuidance,
  TurnAnalysis,
  RhythmContext,
  IRhythmIntelligence,
} from './types.js';

export { RhythmIntelligenceToken } from './types.js';

// Constants
export {
  DEFAULT_RHYTHM_PREFERENCE,
  DEFAULT_RHYTHM_PROFILE,
  WORD_RANGES,
  USER_TURN_TO_RESPONSE,
  PAUSE_TIMING,
  EMOTIONAL_PAUSE_ADJUSTMENT,
  THRESHOLDS,
  getTimeOfDay,
  TIME_OF_DAY_ENERGY,
  HIGH_ENERGY_PATTERNS,
  LOW_ENERGY_PATTERNS,
} from './constants.js';

// Persistence
export {
  getProfile,
  createProfile,
  saveProfile,
  recordTurn,
  clearUserData,
} from './persistence.js';

// Engine
export {
  RhythmIntelligence,
  getRhythmIntelligence,
  createRhythmIntelligence,
  resetRhythmIntelligence,
} from './engine.js';

/**
 * Voice Humanization Module
 *
 * Orchestrates voice humanization capabilities to make Ferni feel truly human.
 *
 * @module voice-humanization
 */
export type { EmotionalTtsAdjustments, LaughterDetectionResult, MicroInterruptionResult, RhythmMirroringAdjustments, SpeechRhythmProfile, VoiceHumanizationState, } from './types.js';
export { IMMEDIATE_STOP_WORDS, LAUGHTER_RESPONSES, LAUGHTER_THRESHOLDS, PRE_INTERRUPTION_PATTERNS, SOFT_INTERRUPTION_WORDS, } from './constants.js';
export { VoiceHumanizationService, default } from './service.js';
export { getActiveVoiceHumanizationCount, getVoiceHumanizationService, resetAllVoiceHumanization, resetVoiceHumanization, } from './session-management.js';
export { type EnhancedTurnPrediction, type Intonation } from '../prosody-turn-bridge.js';
//# sourceMappingURL=index.d.ts.map
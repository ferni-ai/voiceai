/**
 * Voice Humanization Module
 *
 * Orchestrates voice humanization capabilities to make Ferni feel truly human.
 *
 * @module voice-humanization
 */
// ============================================================================
// CONSTANTS
// ============================================================================
export { IMMEDIATE_STOP_WORDS, LAUGHTER_RESPONSES, LAUGHTER_THRESHOLDS, PRE_INTERRUPTION_PATTERNS, SOFT_INTERRUPTION_WORDS, } from './constants.js';
// ============================================================================
// MAIN SERVICE
// ============================================================================
export { VoiceHumanizationService, default } from './service.js';
// ============================================================================
// SESSION MANAGEMENT
// ============================================================================
export { getActiveVoiceHumanizationCount, getVoiceHumanizationService, resetAllVoiceHumanization, resetVoiceHumanization, } from './session-management.js';
//# sourceMappingURL=index.js.map
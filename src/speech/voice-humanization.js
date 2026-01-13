/**
 * Voice Humanization Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Orchestrates all voice humanization capabilities to make Ferni feel truly human:
 *
 * 1. **Prosody-Aware Turn Prediction**: Uses pitch intonation (rising/falling)
 *    to better detect when user has finished speaking
 *
 * 2. **Micro-Interruption Handling**: Immediately stops agent speech when
 *    user says "wait", "hold on", "actually" - even as a single word
 *
 * 3. **Emotional Arc → TTS**: Adjusts SSML pauses/pacing based on
 *    conversation emotional trajectory
 *
 * 4. **Laughter Detection**: Detects user laughter for natural response
 *
 * 5. **Rhythm Mirroring**: Matches user's speech rhythm patterns
 *
 * @module VoiceHumanization
 * @see docs/features/VOICE-PRESENCE-ROADMAP.md
 *
 * NOTE: This file is a re-export wrapper for backward compatibility.
 * The implementation has been split into:
 * - ./voice-humanization/types.ts - Type definitions
 * - ./voice-humanization/constants.ts - Static data and thresholds
 * - ./voice-humanization/service.ts - Main service class
 * - ./voice-humanization/session-management.ts - Session handling
 */
// Re-export everything from the new module structure
export * from './voice-humanization/index.js';
// Also export default for CommonJS compatibility
export { default } from './voice-humanization/index.js';
//# sourceMappingURL=voice-humanization.js.map
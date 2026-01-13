/**
 * Audio Prosody Analyzer
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Voice-based emotion detection through audio analysis.
 * Analyzes pitch, volume, speech rate, and other prosodic features
 * to detect emotional state from the user's voice, not just text.
 *
 * Real humans listen to *how* things are said, not just what's said.
 * A slight tremor in someone's voice tells us more than their words.
 * This module gives Ferni that same emotional intelligence.
 *
 * @module audio-prosody
 *
 * NOTE: This file is a re-export wrapper for backward compatibility.
 * The implementation has been split into:
 * - ./audio-prosody/types.ts - Type definitions
 * - ./audio-prosody/analyzer.ts - Main analyzer class
 * - ./audio-prosody/feature-extraction.ts - Audio processing
 * - ./audio-prosody/emotion-mapping.ts - Emotion classification
 * - ./audio-prosody/session-management.ts - Session handling & metrics
 */
// Re-export everything from the new module structure
export * from './audio-prosody/index.js';
// Also export default for CommonJS compatibility
export { default } from './audio-prosody/index.js';
//# sourceMappingURL=audio-prosody.js.map
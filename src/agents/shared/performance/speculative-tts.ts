/**
 * Speculative Parallel TTS Generation - Re-export from services layer
 *
 * This file re-exports from src/services/performance/speculative-tts.ts
 * to maintain backward compatibility while respecting architecture layers.
 *
 * @module agents/shared/performance/speculative-tts
 * @deprecated Import from '../../../services/performance/speculative-tts.js' instead
 */

export {
  // Types
  type TTSRequest,
  type TTSResult,
  type SpeculativeCandidate,
  type SpeculativeTTSConfig,
  // Functions
  getSpeculativeTTS,
  warmupTTSVoice,
  speculateTTS,
  getTTSWithSpeculation,
  streamTTSWithSpeculation,
  branchPredictTTS,
  getSpeculativeTTSMetrics,
  // Default export
  default,
} from '../../../services/performance/speculative-tts.js';

/**
 * Music Intelligence Service
 *
 * Provides superhuman music capabilities including:
 * - Cross-session preference learning (Phase 1.7)
 * - Deep mood-to-music matching (Phase 2)
 * - Voice-based mood detection (Phase 5)
 * - Collaborative discovery (Phase 7)
 *
 * @module services/music-intelligence
 */

// Phase 1.7: Cross-session music memory persistence
export {
  connectDJBoothToPersistence,
  flushMusicMemoryForSession,
  initializeMusicMemoryForSession,
  loadUserMusicPreferences,
  musicMemoryToPreferences,
  preferencesToMusicMemory,
  saveUserMusicPreferences,
} from './music-memory-persistence.js';

// Phase 5: Voice → Music Bridge
// Detects mood from voice and proactively offers music
export {
  VoiceMusicBridge,
  getVoiceMusicBridge,
  resetVoiceMusicBridge,
  type VoiceMusicSuggestion,
} from './voice-music-bridge.js';

/**
 * Music Intelligence Service
 *
 * @deprecated This module has been consolidated into musical-you/
 * Import from '../musical-you/index.js' instead.
 *
 * This file remains for backward compatibility.
 */

// Re-export from consolidated location
export {
  connectDJBoothToPersistence,
  flushMusicMemoryForSession,
  initializeMusicMemoryForSession,
  loadUserMusicPreferences,
  musicMemoryToPreferences,
  preferencesToMusicMemory,
  saveUserMusicPreferences,
} from '../musical-you/memory-persistence.js';

export {
  VoiceMusicBridge,
  getVoiceMusicBridge,
  resetVoiceMusicBridge,
  type VoiceMusicSuggestion,
} from '../musical-you/voice-bridge.js';

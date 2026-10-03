/**
 * Music availability check for the current session's music player.
 *
 * Split out of music-player.ts (which keeps `isMusicAvailable()` as the public
 * entry point and passes in its singleton).
 *
 * @module audio/music-availability
 */

import { createLogger } from '../utils/safe-logger.js';
import type { CallMusicPlayer } from './music-player.js';

// Same module name as music-player.ts so existing log queries keep matching.
const log = createLogger({ module: 'MusicPlayer' });

/**
 * Check whether `player` can play music right now.
 *
 * Tools call this BEFORE attempting playback, so they can tell the LLM clearly
 * that music isn't available (rather than trying and failing with vague errors).
 */
export function checkMusicAvailability(player: CallMusicPlayer | null): {
  available: boolean;
  reason: string;
} {
  // 🔍 DIAGNOSTIC: Log at the very start to see if this function is being called
  log.info(
    {
      timestamp: new Date().toISOString(),
      hasSingleton: !!player,
      singletonSessionId: player?.getSessionId() || null,
    },
    '🎵 [DIAG] isMusicAvailable called - checking music system state'
  );

  // Check if singleton exists and is initialized
  if (!player) {
    log.info('🎵 [DIAG] isMusicAvailable: NO singleton instance - music player never created');
    return {
      available: false,
      reason: 'Music player not created - session may not support music playback',
    };
  }

  if (!player.isInitialized()) {
    log.info(
      { sessionId: player.getSessionId() },
      '🎵 [DIAG] isMusicAvailable: singleton exists but NOT initialized'
    );
    return {
      available: false,
      reason: 'Music player not initialized for this session - audio system not ready',
    };
  }

  // Check if LiveKit room is still connected
  const state = player.getState();
  if (!state.isInitialized) {
    log.info(
      { sessionId: player.getSessionId(), state },
      '🎵 [DIAG] isMusicAvailable: player was DISPOSED'
    );
    return {
      available: false,
      reason: 'Music player was disposed - session may have ended',
    };
  }

  // 🐛 FIX: Check if the LiveKit room is still connected BEFORE attempting playback
  // This prevents the race condition where music search completes but room disconnected
  if (!player.isRoomConnected()) {
    log.info(
      { sessionId: player.getSessionId() },
      '🎵 [DIAG] isMusicAvailable: LiveKit room DISCONNECTED'
    );
    return {
      available: false,
      reason: 'LiveKit room disconnected - reconnect to enable music playback',
    };
  }

  log.info(
    { sessionId: player.getSessionId() },
    '🎵 [DIAG] isMusicAvailable: ALL CHECKS PASSED - music IS available'
  );
  return { available: true, reason: 'Music playback available' };
}

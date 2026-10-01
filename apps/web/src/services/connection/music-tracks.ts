/**
 * Connection Service - music track identification
 */

import { createLogger } from '../../utils/logger.js';
import { PENDING_TRACK_TTL_MS, type ConnectionContext } from './context.js';

const log = createLogger('Connection');

/**
 * Signal that we're expecting a music track soon.
 * Called when we receive music_state: 'playing' from backend.
 *
 * 🐛 FIX: Now also checks pending tracks buffer for tracks that
 * arrived BEFORE this message (race condition fix).
 */
export function expectMusicTrack(ctx: ConnectionContext): void {
  ctx.expectingMusicTrack = true;

  // Clear any existing timeout
  if (ctx.expectingMusicTrackTimeout) {
    clearTimeout(ctx.expectingMusicTrackTimeout);
  }

  // 🐛 FIX: Check if any pending tracks are waiting to be identified
  // This handles the case where audio arrives BEFORE the data message
  if (ctx.pendingMusicTracks.size > 0) {
    log.info('🎚️ Found pending tracks waiting for identification', {
      count: ctx.pendingMusicTracks.size,
    });

    // Identify the most recent pending track as music
    let mostRecentTrack: { trackKey: string; audioEl: HTMLAudioElement } | null = null;
    let mostRecentTime = 0;

    for (const [trackKey, { audioEl, timestamp }] of ctx.pendingMusicTracks) {
      if (timestamp > mostRecentTime) {
        mostRecentTime = timestamp;
        mostRecentTrack = { trackKey, audioEl };
      }
    }

    if (mostRecentTrack) {
      const { trackKey, audioEl } = mostRecentTrack;
      ctx.musicTrackIds.add(trackKey);
      ctx.pendingMusicTracks.delete(trackKey);

      log.info('🎚️ Music track identified (retroactive - audio arrived before data message)', {
        trackKey,
        latencyMs: Date.now() - mostRecentTime,
      });

      // Route to MusicAudioController for ducking
      ctx.callbacks.onMusicTrack?.(audioEl, trackKey);

      // Clear expecting flag since we found the track
      ctx.expectingMusicTrack = false;
      return;
    }
  }

  // Stop expecting after 5 seconds (increased from 3s for reliability)
  ctx.expectingMusicTrackTimeout = setTimeout(() => {
    ctx.expectingMusicTrack = false;
    ctx.expectingMusicTrackTimeout = null;
    log.debug('🎚️ Music track expectation timed out');
  }, 5000);

  log.debug('🎚️ Expecting music track...');
}

/**
 * Add a track to the pending buffer.
 * Called when a track arrives but we're not sure if it's music.
 */
export function addPendingMusicTrack(
  ctx: ConnectionContext,
  trackKey: string,
  audioEl: HTMLAudioElement
): void {
  ctx.pendingMusicTracks.set(trackKey, { audioEl, timestamp: Date.now() });

  // Start cleanup interval if not running
  if (!ctx.pendingTrackCleanupInterval) {
    ctx.pendingTrackCleanupInterval = setInterval(() => {
      cleanupOldPendingTracks(ctx);
    }, 2000);
  }

  log.debug('🎚️ Track added to pending buffer', { trackKey });
}

/**
 * Remove old pending tracks that were never identified.
 */
function cleanupOldPendingTracks(ctx: ConnectionContext): void {
  const now = Date.now();
  let removed = 0;

  for (const [trackKey, { timestamp }] of ctx.pendingMusicTracks) {
    if (now - timestamp > PENDING_TRACK_TTL_MS) {
      ctx.pendingMusicTracks.delete(trackKey);
      removed++;
    }
  }

  // Stop interval if no more pending tracks
  if (ctx.pendingMusicTracks.size === 0 && ctx.pendingTrackCleanupInterval) {
    clearInterval(ctx.pendingTrackCleanupInterval);
    ctx.pendingTrackCleanupInterval = null;
  }

  if (removed > 0) {
    log.debug('🎚️ Cleaned up old pending tracks', { removed });
  }
}

/**
 * Mark a track as ended (for cleanup).
 */
export function handleTrackEnded(ctx: ConnectionContext, trackId: string): void {
  if (ctx.musicTrackIds.has(trackId)) {
    ctx.musicTrackIds.delete(trackId);
    ctx.callbacks.onMusicTrackEnd?.(trackId);
    log.debug('🎚️ Music track ended', { trackId });
  }
  if (ctx.voiceTrackId === trackId) {
    ctx.voiceTrackId = null;
  }
  // Also clean from pending buffer
  ctx.pendingMusicTracks.delete(trackId);
}

/**
 * 🎚️ FIX: Re-attach the most recent music track for ducking.
 * Called when we receive music_state: playing to ensure ducking is on the right track.
 * This handles the case where a stinger was attached instead of real music.
 */
export function reattachMusicTrackForDucking(ctx: ConnectionContext): void {
  // Find the most recent music track from pending buffer
  if (ctx.pendingMusicTracks.size === 0) {
    log.debug('🎚️ No pending tracks to re-attach for ducking');
    return;
  }

  let mostRecentTrack: { trackKey: string; audioEl: HTMLAudioElement } | null = null;
  let mostRecentTime = 0;

  for (const [trackKey, { audioEl, timestamp }] of ctx.pendingMusicTracks) {
    if (timestamp > mostRecentTime) {
      mostRecentTime = timestamp;
      mostRecentTrack = { trackKey, audioEl };
    }
  }

  if (!mostRecentTrack) {
    return;
  }

  const { trackKey, audioEl } = mostRecentTrack;

  // Mark as music track
  ctx.musicTrackIds.add(trackKey);
  ctx.pendingMusicTracks.delete(trackKey);

  log.info('🎚️ Re-attaching music track for ducking', { trackKey });

  // Route to MusicAudioController for ducking
  ctx.callbacks.onMusicTrack?.(audioEl, trackKey);
}

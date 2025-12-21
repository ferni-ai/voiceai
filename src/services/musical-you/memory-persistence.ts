/**
 * Music Memory Persistence Service
 *
 * Connects the DJ Enhancement's MusicMemoryManager to persistent storage.
 * Part of the "More Than Human" music intelligence system (Phase 1.7).
 *
 * Features:
 * - Load music preferences at session start
 * - Save music preferences at session end
 * - Debounced saving to prevent excessive writes
 * - Memory conversion between formats
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { MusicPreferences } from '../../audio/dj-enhancements.js';
import type { MusicMemory } from '../../types/user-profile.js';

const log = getLogger();

// ============================================================================
// TYPE CONVERSION
// ============================================================================

/**
 * Convert MusicMemory (persistence format) to MusicPreferences (runtime format)
 */
export function musicMemoryToPreferences(memory: MusicMemory): Partial<MusicPreferences> {
  return {
    likedArtists: memory.favoriteArtists || [],
    dislikedArtists: memory.dislikedArtists || [],
    favoriteGenres: memory.favoriteGenres || [],
    preferredMusicTimes: memory.preferredMusicTimes || [],
    totalTracksPlayed: memory.totalTracksPlayed || 0,
    lastPlayed: memory.lastPlayedArtist
      ? {
          artist: memory.lastPlayedArtist,
          track: memory.lastPlayedTrack || '',
          timestamp: Date.now() - 24 * 60 * 60 * 1000, // Default to yesterday
        }
      : undefined,
    moodPreferences: memory.moodMusicPreferences || {},
    sharedMoments: memory.sharedMoments || [],
  };
}

/**
 * Convert MusicPreferences (runtime format) to MusicMemory (persistence format)
 */
export function preferencesToMusicMemory(prefs: MusicPreferences): MusicMemory {
  return {
    favoriteArtists: prefs.likedArtists,
    favoriteGenres: prefs.favoriteGenres,
    dislikedArtists: prefs.dislikedArtists,
    totalTracksPlayed: prefs.totalTracksPlayed,
    lastPlayedArtist: prefs.lastPlayed?.artist,
    lastPlayedTrack: prefs.lastPlayed?.track,
    preferredMusicTimes: prefs.preferredMusicTimes,
    moodMusicPreferences: prefs.moodPreferences,
    sharedMoments: prefs.sharedMoments,
  };
}

// ============================================================================
// LOADING
// ============================================================================

/**
 * Load music preferences for a user from persistent storage
 */
export async function loadUserMusicPreferences(
  userId: string
): Promise<Partial<MusicPreferences> | null> {
  try {
    const { loadMusicMemory } = await import('../games/game-store.js');
    const memory = await loadMusicMemory(userId);

    if (memory) {
      log.debug(
        {
          userId,
          tracksPlayed: memory.totalTracksPlayed,
          likedArtists: memory.favoriteArtists?.length || 0,
        },
        '🎵 Loaded music preferences from storage'
      );
      return musicMemoryToPreferences(memory);
    }

    return null;
  } catch (error) {
    log.warn({ error, userId }, '🎵 Failed to load music preferences');
    return null;
  }
}

// ============================================================================
// SAVING
// ============================================================================

/**
 * Save music preferences for a user to persistent storage
 */
export async function saveUserMusicPreferences(
  userId: string,
  prefs: MusicPreferences
): Promise<void> {
  try {
    const { saveMusicMemory } = await import('../games/game-store.js');
    const memory = preferencesToMusicMemory(prefs);

    await saveMusicMemory(userId, memory);

    log.debug(
      {
        userId,
        tracksPlayed: memory.totalTracksPlayed,
        likedArtists: memory.favoriteArtists?.length || 0,
      },
      '🎵 Saved music preferences to storage'
    );
  } catch (error) {
    log.warn({ error, userId }, '🎵 Failed to save music preferences');
  }
}

// ============================================================================
// SESSION INTEGRATION
// ============================================================================

/**
 * Initialize music memory for a session
 * Call this when a session starts with a known user
 */
export async function initializeMusicMemoryForSession(
  userId: string
): Promise<Partial<MusicPreferences> | null> {
  const prefs = await loadUserMusicPreferences(userId);

  if (prefs) {
    log.info({ userId }, '🎵 Music memory initialized for session');
  }

  return prefs;
}

/**
 * Flush music memory for a session
 * Call this when a session ends
 */
export async function flushMusicMemoryForSession(
  userId: string,
  prefs: MusicPreferences
): Promise<void> {
  await saveUserMusicPreferences(userId, prefs);
  log.info({ userId }, '🎵 Music memory flushed at session end');
}

// ============================================================================
// DJ BOOTH INTEGRATION
// ============================================================================

/**
 * Connect DJ Booth to music memory persistence
 * Returns a cleanup function to call when session ends
 */
export async function connectDJBoothToPersistence(userId: string): Promise<{
  existingPrefs: Partial<MusicPreferences> | null;
  cleanup: () => Promise<void>;
}> {
  const existingPrefs = await loadUserMusicPreferences(userId);

  const cleanup = async (): Promise<void> => {
    // Get current preferences from DJ Booth and save
    const { getDJBooth } = await import('../../audio/dj-booth.js');
    const djBooth = getDJBooth();

    if (djBooth) {
      const currentPrefs = djBooth.getMusicPreferences();
      if (currentPrefs) {
        await saveUserMusicPreferences(userId, currentPrefs);
      }
    }
  };

  return { existingPrefs, cleanup };
}

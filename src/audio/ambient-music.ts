/**
 * Ambient Music Configuration
 *
 * Provides ambient/thinking music tracks for quiet moments.
 *
 * Sources (in order of preference):
 * 1. Environment variables (AMBIENT_TRACK_1, etc.)
 * 2. Spotify ambient tracks (if connected)
 * 3. Fallback to simple acknowledgment
 *
 * To add custom tracks:
 * 1. Set AMBIENT_TRACK_1, AMBIENT_TRACK_2, etc. with audio URLs
 * 2. Or set AMBIENT_MUSIC_URLS environment variable (comma-separated)
 */

import { getMusicPlayer, type MusicTrack } from './music-player.js';
import { log } from '@livekit/agents';

const getLogger = () => log();

// Cache for Spotify ambient tracks (fetched once per session)
let cachedSpotifyAmbientTracks: MusicTrack[] | null = null;

// ============================================================================
// AMBIENT MUSIC TRACKS
// ============================================================================

/**
 * Built-in ambient music tracks
 * These are royalty-free/creative commons tracks suitable for background thinking
 *
 * Sources for free ambient music:
 * - Pixabay (pixabay.com/music) - Free for commercial use
 * - Free Music Archive (freemusicarchive.org)
 * - Incompetech (incompetech.com) - Kevin MacLeod, royalty-free
 *
 * To add your own tracks:
 * - Set AMBIENT_TRACK_1, AMBIENT_TRACK_2, etc. in environment
 * - Or set AMBIENT_MUSIC_URLS as comma-separated list
 */
const BUILT_IN_AMBIENT_TRACKS: MusicTrack[] = [
  // User-provided tracks via environment
  {
    name: 'Quiet Reflection',
    artist: 'Ambient',
    previewUrl: process.env.AMBIENT_TRACK_1,
    duration: 120000,
  },
  {
    name: 'Thinking Space',
    artist: 'Ambient',
    previewUrl: process.env.AMBIENT_TRACK_2,
    duration: 90000,
  },
  {
    name: 'Gentle Moments',
    artist: 'Ambient',
    previewUrl: process.env.AMBIENT_TRACK_3,
    duration: 120000,
  },
];

/**
 * Spotify ambient playlists for reference (users can grab preview URLs from these)
 * These are thinking/focus playlists that work well as background:
 * - Lo-fi Beats: spotify:playlist:37i9dQZF1DWWQRwui0ExPn
 * - Deep Focus: spotify:playlist:37i9dQZF1DWZeKCadgRdKQ
 * - Peaceful Piano: spotify:playlist:37i9dQZF1DX4sWSpwq3LiO
 *
 * To use Spotify tracks:
 * 1. Get the track's preview URL from Spotify API
 * 2. Set it as AMBIENT_TRACK_1, AMBIENT_TRACK_2, etc.
 */

/**
 * Get ambient tracks from environment variable
 */
function getEnvAmbientTracks(): MusicTrack[] {
  const urls = process.env.AMBIENT_MUSIC_URLS?.split(',').filter((u) => u.trim());
  if (!urls || urls.length === 0) return [];

  return urls.map((url, i) => ({
    name: `Ambient Track ${i + 1}`,
    artist: 'Ambient',
    previewUrl: url.trim(),
    duration: 120000,
  }));
}

/**
 * Ambient search queries to find good thinking/focus music
 */
const AMBIENT_SEARCH_QUERIES = [
  'lo-fi beats',
  'ambient piano',
  'focus music',
  'calm instrumental',
  'peaceful acoustic',
  'relaxing jazz',
  'meditation music',
];

/**
 * Fetch ambient tracks from Spotify (cached per session)
 * Returns tracks with preview URLs that can be played
 */
export async function fetchSpotifyAmbientTracks(): Promise<MusicTrack[]> {
  // Return cached if available
  if (cachedSpotifyAmbientTracks !== null) {
    return cachedSpotifyAmbientTracks;
  }

  try {
    // Try to import Spotify module
    const { searchTracksWithPreviews } = await import('../tools/spotify.js');

    // Pick random search queries
    const queries = AMBIENT_SEARCH_QUERIES.sort(() => Math.random() - 0.5).slice(0, 3);

    const allTracks: MusicTrack[] = [];

    for (const query of queries) {
      try {
        const tracks = await searchTracksWithPreviews(query, 3);
        allTracks.push(...tracks);
      } catch {
        // Individual search failed, continue
      }
    }

    // Cache the results
    cachedSpotifyAmbientTracks = allTracks;

    if (allTracks.length > 0) {
      getLogger().info({ count: allTracks.length }, '🎵 Fetched ambient tracks from Spotify');
    }

    return allTracks;
  } catch (error) {
    getLogger().debug(
      { error },
      'Could not fetch Spotify ambient tracks (Spotify may not be connected)'
    );
    cachedSpotifyAmbientTracks = [];
    return [];
  }
}

/**
 * Get all available ambient tracks (env + built-in + Spotify)
 */
export function getAmbientTracks(): MusicTrack[] {
  const envTracks = getEnvAmbientTracks();
  const builtInTracks = BUILT_IN_AMBIENT_TRACKS.filter((t) => t.previewUrl);

  // Also include cached Spotify tracks if available
  const spotifyTracks = cachedSpotifyAmbientTracks || [];

  return [...envTracks, ...builtInTracks, ...spotifyTracks];
}

/**
 * Async version that fetches Spotify tracks if needed
 */
export async function getAmbientTracksAsync(): Promise<MusicTrack[]> {
  const envTracks = getEnvAmbientTracks();
  const builtInTracks = BUILT_IN_AMBIENT_TRACKS.filter((t) => t.previewUrl);

  // Try to fetch Spotify tracks if we don't have any cached
  let spotifyTracks: MusicTrack[] = [];
  if (cachedSpotifyAmbientTracks === null) {
    spotifyTracks = await fetchSpotifyAmbientTracks();
  } else {
    spotifyTracks = cachedSpotifyAmbientTracks;
  }

  return [...envTracks, ...builtInTracks, ...spotifyTracks];
}

/**
 * Check if ambient music is enabled
 * Note: Even if no tracks are available now, Spotify might fetch some later
 * 
 * Music is ENABLED by default. Requires MUSIC_ENABLED !== 'false' and AMBIENT_MUSIC_ENABLED !== 'false'
 */
export function isAmbientMusicEnabled(): boolean {
  // Master music flag check (enabled by default)
  if (process.env.MUSIC_ENABLED === 'false') {
    return false;
  }
  
  // Explicitly disabled via environment
  if (process.env.AMBIENT_MUSIC_ENABLED === 'false') {
    return false;
  }

  // Enabled by default - tracks will be fetched from Spotify if needed
  return true;
}

/**
 * Get a random ambient track
 */
export function getRandomAmbientTrack(): MusicTrack | null {
  const tracks = getAmbientTracks();
  if (tracks.length === 0) return null;

  return tracks[Math.floor(Math.random() * tracks.length)];
}

// ============================================================================
// AMBIENT MUSIC CONTROL
// ============================================================================

/**
 * Play ambient/thinking music
 * Used during extended silences to fill the quiet without being intrusive
 *
 * Requires MUSIC_ENABLED=true (master flag) to work.
 *
 * Sources (in order of preference):
 * 1. Environment-configured tracks
 * 2. Spotify ambient tracks (fetched if not cached)
 */
export async function playAmbientMusic(): Promise<boolean> {
  // Check if ambient music is enabled (includes master MUSIC_ENABLED check)
  if (!isAmbientMusicEnabled()) {
    return false;
  }
  
  const player = getMusicPlayer();

  // Don't play if already playing
  if (player.isPlaying()) {
    return false;
  }

  // Don't play if not initialized
  if (!player.isInitialized()) {
    getLogger().debug('Music player not initialized, skipping ambient music');
    return false;
  }

  // Try to get tracks (including fetching from Spotify if needed)
  const tracks = await getAmbientTracksAsync();

  if (tracks.length === 0) {
    getLogger().debug('No ambient tracks available (env vars not set and Spotify not connected)');
    return false;
  }

  // Pick a random track
  const track = tracks[Math.floor(Math.random() * tracks.length)];
  if (!track.previewUrl) {
    getLogger().debug('Selected track has no preview URL');
    return false;
  }

  // Play at low volume (ambient/background level)
  player.setVolume(0.15); // 15% - very soft

  const success = await player.playFromUrl(track.previewUrl, track, true); // isAmbient=true

  if (success) {
    getLogger().info({ track: track.name, artist: track.artist }, '🎵 Started ambient music');
  }

  return success;
}

/**
 * Stop ambient music (only if music is in ambient mode)
 *
 * This is called when the user starts speaking to stop thinking/silence music.
 * It should NOT stop regular user-requested music.
 */
export function stopAmbientMusic(): void {
  const player = getMusicPlayer();
  const state = player.getState();

  // Only stop if music is playing AND it's ambient music
  // Don't stop user-requested music (non-ambient)
  if (state.isPlaying && state.isAmbientMode) {
    player.stop();
    getLogger().debug('Stopped ambient music (user started speaking)');
  } else if (state.isPlaying && !state.isAmbientMode) {
    getLogger().debug('User started speaking but keeping user-requested music playing');
  }
}

// ============================================================================
// AGENT RESPONSES WHEN MUSIC ENDS
// ============================================================================

/**
 * Get a phrase for when ambient music ends
 * The agent should acknowledge the music stopping naturally
 */
export function getAmbientMusicEndedPhrase(personaId?: string): string {
  // Persona-specific phrases
  const personaPhrases: Record<string, string[]> = {
    'peter-john': [
      '<break time="300ms"/>Music\'s done. <break time="200ms"/>Where were we?',
      '<break time="300ms"/>Alright, <break time="200ms"/>quiet time over. <break time="150ms"/>What are you thinking?',
    ],
    'nayan-patel': [
      '<break time="400ms"/>The music\'s faded. <break time="300ms"/>Shall we continue?',
      '<break time="400ms"/>Ah, <break time="200ms"/>quiet again. <break time="300ms"/>What\'s on your mind?',
    ],
    'jack-b': [
      '<break time="300ms"/>Music\'s done! <break time="200ms"/>You ready to keep going?',
      '<break time="300ms"/>That was nice. <break time="200ms"/>How you feeling?',
    ],
    maya: [
      '<break time="300ms"/>Music break\'s over. <break time="250ms"/>Ready to continue?',
      '<break time="300ms"/>That was a good thinking moment. <break time="200ms"/>What came up for you?',
    ],
    jordan: [
      '<emotion value="happy"/><break time="200ms"/>Music\'s done! <break time="150ms"/>Did that help?',
      '<break time="200ms"/>Okay! <break time="150ms"/>Thinking time over! <break time="200ms"/>What did you come up with?',
    ],
    alex: [
      '<break time="200ms"/>Music ended. <break time="150ms"/>Ready to continue?',
      '<break time="200ms"/>Back to it. <break time="150ms"/>What\'s next?',
    ],
  };

  // Default phrases
  const defaultPhrases = [
    '<break time="300ms"/>The music\'s stopped. <break time="200ms"/>Ready to continue?',
    '<break time="300ms"/>Quiet again. <break time="200ms"/>What\'s on your mind?',
  ];

  const phrases =
    personaId && personaPhrases[personaId] ? personaPhrases[personaId] : defaultPhrases;

  return phrases[Math.floor(Math.random() * phrases.length)];
}

export default {
  playAmbientMusic,
  stopAmbientMusic,
  isAmbientMusicEnabled,
  getAmbientTracks,
  getRandomAmbientTrack,
  getAmbientMusicEndedPhrase,
};

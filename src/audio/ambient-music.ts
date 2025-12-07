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
import { getLogger } from '../utils/safe-logger.js';

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

// ============================================================================
// 🎧 DJ-STYLE OUTROS FOR USER-REQUESTED MUSIC
// ============================================================================

/**
 * Get a DJ-style outro phrase when user-requested music is fading out.
 * Spoken DURING the fade (~5 seconds before track ends) like a real DJ.
 * 
 * The agent becomes the DJ - wrapping up the track with style!
 * Includes track name for that authentic radio feel.
 * 
 * @param trackName - The name of the track (for DJ-style callout)
 * @param artistName - The artist name (optional, for fuller callout)
 * @param personaId - The persona speaking (for voice variation)
 */
export function getDJOutroPhrase(trackName?: string, artistName?: string, personaId?: string): string {
  // Persona-specific DJ outro styles
  const personaPhrases: Record<string, string[]> = {
    'peter-john': [
      '<break time="200ms"/>And that was a great one. <break time="150ms"/>Always love that track.',
      '<break time="200ms"/>Nice. <break time="150ms"/>Solid choice there.',
      '<break time="200ms"/>Good stuff. <break time="150ms"/>What else you want to talk about?',
    ],
    'nayan-patel': [
      '<break time="300ms"/>Ah, <break time="150ms"/>that was lovely. <break time="200ms"/>Music for the soul.',
      '<break time="300ms"/>Beautiful. <break time="200ms"/>There\'s something special about a good song, isn\'t there?',
      '<break time="300ms"/>Wonderful. <break time="150ms"/>I hope that resonated.',
    ],
    'jack-b': [
      '<emotion value="happy"/><break time="150ms"/>Nice! <break time="100ms"/>That was a good one!',
      '<break time="150ms"/>Ha! <break time="100ms"/>Love that track. <break time="150ms"/>How you feeling?',
      '<emotion value="happy"/><break time="100ms"/>Good stuff! <break time="150ms"/>Music always hits different, doesn\'t it?',
    ],
    'jack-bogle': [
      '<break time="200ms"/>Good music. <break time="150ms"/>Just like a good investment, <break time="100ms"/>some things never get old.',
      '<break time="200ms"/>That was nice. <break time="150ms"/>Sometimes you gotta take a moment.',
      '<break time="200ms"/>Wonderful. <break time="150ms"/>Now, <break time="100ms"/>what\'s on your mind?',
    ],
    maya: [
      '<break time="200ms"/>That was a nice break. <break time="150ms"/>Music can really shift your energy.',
      '<break time="200ms"/>Love it. <break time="150ms"/>How are you feeling after that?',
      '<break time="200ms"/>Nice choice. <break time="150ms"/>Sometimes we just need a moment with good music.',
    ],
    'maya-santos': [
      '<break time="200ms"/>That was a nice break. <break time="150ms"/>Music can really shift your energy.',
      '<break time="200ms"/>Love it. <break time="150ms"/>How are you feeling after that?',
      '<break time="200ms"/>Nice choice. <break time="150ms"/>Sometimes we just need a moment with good music.',
    ],
    jordan: [
      '<emotion value="happy"/><break time="150ms"/>That was fun! <break time="100ms"/>Great pick!',
      '<emotion value="happy"/><break time="100ms"/>Love it! <break time="150ms"/>What\'s next on the agenda?',
      '<break time="150ms"/>Nice one! <break time="100ms"/>Music always makes things better.',
    ],
    'jordan-taylor': [
      '<emotion value="happy"/><break time="150ms"/>That was fun! <break time="100ms"/>Great pick!',
      '<emotion value="happy"/><break time="100ms"/>Love it! <break time="150ms"/>What\'s next on the agenda?',
      '<break time="150ms"/>Nice one! <break time="100ms"/>Music always makes things better.',
    ],
    alex: [
      '<break time="150ms"/>Good track. <break time="100ms"/>Ready to get back to it?',
      '<break time="150ms"/>Nice. <break time="100ms"/>What were we discussing?',
      '<break time="150ms"/>That was a good one. <break time="100ms"/>Shall we continue?',
    ],
    'alex-chen': [
      '<break time="150ms"/>Good track. <break time="100ms"/>Ready to get back to it?',
      '<break time="150ms"/>Nice. <break time="100ms"/>What were we discussing?',
      '<break time="150ms"/>That was a good one. <break time="100ms"/>Shall we continue?',
    ],
    ferni: [
      '<break time="200ms"/>That was nice. <break time="150ms"/>I love when we can just share a moment like that.',
      '<break time="200ms"/>Good music. <break time="150ms"/>How are you feeling?',
      '<break time="200ms"/>Beautiful. <break time="150ms"/>Sometimes we just need a musical pause.',
    ],
  };

  // Default DJ-style phrases (friendly, casual, like a good radio host)
  const defaultPhrases = [
    '<break time="200ms"/>That was a good one. <break time="150ms"/>Hope you enjoyed that.',
    '<break time="200ms"/>Nice. <break time="150ms"/>Sometimes you just need a little music.',
    '<break time="200ms"/>Good stuff. <break time="150ms"/>How you feeling?',
  ];

  const phrases = personaId && personaPhrases[personaId] 
    ? personaPhrases[personaId] 
    : defaultPhrases;

  const basePhrase = phrases[Math.floor(Math.random() * phrases.length)];
  
  // Optionally prepend a DJ-style track callout (30% chance for variety)
  if (trackName && Math.random() < 0.3) {
    const callouts = artistName 
      ? [
          `<break time="100ms"/>That was "${trackName}" by ${artistName}. `,
          `<break time="100ms"/>"${trackName}", ${artistName}. `,
        ]
      : [
          `<break time="100ms"/>That was "${trackName}". `,
          `<break time="100ms"/>"${trackName}". `,
        ];
    const callout = callouts[Math.floor(Math.random() * callouts.length)];
    return callout + basePhrase;
  }
  
  return basePhrase;
}

// ============================================================================
// 🎧 UNEXPECTED MUSIC STOP HANDLING
// ============================================================================

/**
 * Get a phrase when music stops unexpectedly (crash, network issue, user pause).
 * The agent acknowledges something happened without making it awkward.
 * 
 * These are casual, human reactions - not error messages!
 * 
 * @param personaId - The persona speaking
 * @param wasPaused - True if user explicitly paused (vs stopped/crashed)
 */
export function getMusicStoppedPhrase(personaId?: string, wasPaused = false): string {
  // If user paused, we acknowledge but don't make a big deal
  if (wasPaused) {
    const pausePhrases: Record<string, string[]> = {
      'jack-b': [
        '<break time="150ms"/>Got it. <break time="100ms"/>Music on pause.',
        '<break time="150ms"/>Sure. <break time="100ms"/>We can get back to that later.',
      ],
      'jack-bogle': [
        '<break time="200ms"/>Alright. <break time="150ms"/>Music paused.',
        '<break time="200ms"/>Sure thing. <break time="150ms"/>What\'s on your mind?',
      ],
      maya: [
        '<break time="150ms"/>Pausing the music. <break time="100ms"/>What\'s up?',
        '<break time="150ms"/>Okay. <break time="100ms"/>Silence can be nice too.',
      ],
      'maya-santos': [
        '<break time="150ms"/>Pausing the music. <break time="100ms"/>What\'s up?',
        '<break time="150ms"/>Okay. <break time="100ms"/>Silence can be nice too.',
      ],
      jordan: [
        '<break time="100ms"/>Got it! <break time="100ms"/>Music paused.',
        '<break time="100ms"/>Sure! <break time="100ms"/>What do you need?',
      ],
      'jordan-taylor': [
        '<break time="100ms"/>Got it! <break time="100ms"/>Music paused.',
        '<break time="100ms"/>Sure! <break time="100ms"/>What do you need?',
      ],
      ferni: [
        '<break time="200ms"/>Okay. <break time="150ms"/>What\'s on your mind?',
        '<break time="200ms"/>Sure. <break time="150ms"/>I\'m here.',
      ],
    };
    
    const defaultPause = [
      '<break time="150ms"/>Music paused. <break time="100ms"/>What\'s up?',
      '<break time="150ms"/>Got it. <break time="100ms"/>I\'m listening.',
    ];
    
    const phrases = personaId && pausePhrases[personaId] 
      ? pausePhrases[personaId] 
      : defaultPause;
    return phrases[Math.floor(Math.random() * phrases.length)];
  }
  
  // Music stopped unexpectedly (crash, network, etc.) - acknowledge casually
  const stoppedPhrases: Record<string, string[]> = {
    'peter-john': [
      '<break time="200ms"/>Hm, <break time="100ms"/>looks like the music stopped. <break time="150ms"/>Anyway, where were we?',
      '<break time="200ms"/>Music cut out. <break time="150ms"/>No worries. <break time="100ms"/>What were you saying?',
    ],
    'nayan-patel': [
      '<break time="300ms"/>Ah, <break time="150ms"/>the music seems to have stopped. <break time="200ms"/>Perhaps it\'s a sign to continue our conversation.',
      '<break time="300ms"/>Music ended. <break time="200ms"/>Sometimes silence is its own music.',
    ],
    'jack-b': [
      '<break time="150ms"/>Oh! <break time="100ms"/>Music stopped. <break time="150ms"/>All good though. <break time="100ms"/>What\'s up?',
      '<break time="150ms"/>Hm, music cut out. <break time="100ms"/>No biggie. <break time="100ms"/>How you doing?',
    ],
    'jack-bogle': [
      '<break time="200ms"/>Looks like the music stopped. <break time="150ms"/>Well, <break time="100ms"/>silence is golden too.',
      '<break time="200ms"/>Music ended there. <break time="150ms"/>Anyway, <break time="100ms"/>what were we discussing?',
    ],
    maya: [
      '<break time="150ms"/>Oh, music stopped. <break time="100ms"/>That\'s okay. <break time="150ms"/>I\'m here.',
      '<break time="150ms"/>Looks like the music ended. <break time="100ms"/>How are you feeling?',
    ],
    'maya-santos': [
      '<break time="150ms"/>Oh, music stopped. <break time="100ms"/>That\'s okay. <break time="150ms"/>I\'m here.',
      '<break time="150ms"/>Looks like the music ended. <break time="100ms"/>How are you feeling?',
    ],
    jordan: [
      '<emotion value="curious"/><break time="100ms"/>Oh! <break time="100ms"/>Music stopped. <break time="150ms"/>No worries! <break time="100ms"/>What\'s next?',
      '<break time="100ms"/>Hm, music cut out. <break time="100ms"/>That\'s okay! <break time="100ms"/>I\'m still here.',
    ],
    'jordan-taylor': [
      '<emotion value="curious"/><break time="100ms"/>Oh! <break time="100ms"/>Music stopped. <break time="150ms"/>No worries! <break time="100ms"/>What\'s next?',
      '<break time="100ms"/>Hm, music cut out. <break time="100ms"/>That\'s okay! <break time="100ms"/>I\'m still here.',
    ],
    alex: [
      '<break time="150ms"/>Music stopped. <break time="100ms"/>All good. <break time="100ms"/>Ready to continue?',
      '<break time="150ms"/>Looks like the music ended. <break time="100ms"/>Where were we?',
    ],
    'alex-chen': [
      '<break time="150ms"/>Music stopped. <break time="100ms"/>All good. <break time="100ms"/>Ready to continue?',
      '<break time="150ms"/>Looks like the music ended. <break time="100ms"/>Where were we?',
    ],
    ferni: [
      '<break time="200ms"/>Oh, the music stopped. <break time="150ms"/>That\'s alright. <break time="100ms"/>I\'m here with you.',
      '<break time="200ms"/>Music ended. <break time="150ms"/>How are you feeling?',
    ],
  };

  const defaultStopped = [
    '<break time="200ms"/>Music stopped. <break time="150ms"/>That\'s okay. <break time="100ms"/>What\'s on your mind?',
    '<break time="200ms"/>Looks like the music ended. <break time="150ms"/>How are you doing?',
  ];

  const phrases = personaId && stoppedPhrases[personaId] 
    ? stoppedPhrases[personaId] 
    : defaultStopped;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export default {
  playAmbientMusic,
  stopAmbientMusic,
  isAmbientMusicEnabled,
  getAmbientTracks,
  getRandomAmbientTrack,
  getAmbientMusicEndedPhrase,
  getDJOutroPhrase,
  getMusicStoppedPhrase,
};

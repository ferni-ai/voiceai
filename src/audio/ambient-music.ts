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
export function getDJOutroPhrase(
  trackName?: string,
  artistName?: string,
  personaId?: string
): string {
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

  const phrases =
    personaId && personaPhrases[personaId] ? personaPhrases[personaId] : defaultPhrases;

  const basePhrase = phrases[Math.floor(Math.random() * phrases.length)];

  // Optionally prepend a DJ-style track callout (30% chance for variety)
  if (trackName && Math.random() < 0.3) {
    const callouts = artistName
      ? [
          `<break time="100ms"/>That was "${trackName}" by ${artistName}. `,
          `<break time="100ms"/>"${trackName}", ${artistName}. `,
        ]
      : [`<break time="100ms"/>That was "${trackName}". `, `<break time="100ms"/>"${trackName}". `];
    const callout = callouts[Math.floor(Math.random() * callouts.length)];
    return callout + basePhrase;
  }

  return basePhrase;
}

// ============================================================================
// 🎧 DJ-STYLE TRACK CHANGE TRANSITIONS
// ============================================================================

/**
 * Get a DJ-style transition phrase when changing tracks.
 * Spoken DURING the crossfade as we switch from one track to another.
 *
 * This is the magic that makes Ferni feel like a real DJ - acknowledging
 * the current track while building excitement for what's next!
 *
 * @param currentTrack - The track we're switching FROM (for context)
 * @param newTrackName - The track we're switching TO (may be unknown yet)
 * @param personaId - The persona speaking (for voice variation)
 */
export function getDJTrackChangePhrase(
  currentTrack?: { name: string; artist?: string },
  newTrackName?: string,
  personaId?: string
): string {
  // Persona-specific DJ transition styles - these should be SHORT (~1.5s max)
  const personaPhrases: Record<string, string[]> = {
    'peter-john': [
      '<break time="100ms"/>Alright, <break time="100ms"/>switching it up.',
      '<break time="100ms"/>Coming right up.',
      '<break time="100ms"/>Let me change that for you.',
    ],
    'nayan-patel': [
      '<break time="150ms"/>Of course. <break time="100ms"/>A new selection.',
      '<break time="150ms"/>Certainly. <break time="100ms"/>Let\'s explore something different.',
      '<break time="150ms"/>A change in melody, then.',
    ],
    'jack-b': [
      '<emotion value="happy"/><break time="100ms"/>Got it! <break time="100ms"/>Coming up!',
      '<break time="100ms"/>Switching tracks!',
      '<emotion value="happy"/><break time="100ms"/>On it!',
    ],
    maya: [
      '<break time="100ms"/>Sure, let me switch that.',
      '<break time="100ms"/>Coming right up.',
      '<break time="100ms"/>New vibes on the way.',
    ],
    'maya-santos': [
      '<break time="100ms"/>Sure, let me switch that.',
      '<break time="100ms"/>Coming right up.',
      '<break time="100ms"/>New vibes on the way.',
    ],
    jordan: [
      '<emotion value="happy"/><break time="100ms"/>Ooh yes! <break time="100ms"/>Switching!',
      '<emotion value="happy"/><break time="100ms"/>Coming up!',
      '<break time="100ms"/>Let\'s go!',
    ],
    'jordan-taylor': [
      '<emotion value="happy"/><break time="100ms"/>Ooh yes! <break time="100ms"/>Switching!',
      '<emotion value="happy"/><break time="100ms"/>Coming up!',
      '<break time="100ms"/>Let\'s go!',
    ],
    alex: [
      '<break time="100ms"/>Switching tracks.',
      '<break time="100ms"/>Got it. Coming up.',
      '<break time="100ms"/>New track incoming.',
    ],
    'alex-chen': [
      '<break time="100ms"/>Switching tracks.',
      '<break time="100ms"/>Got it. Coming up.',
      '<break time="100ms"/>New track incoming.',
    ],
    ferni: [
      '<break time="100ms"/>Sure! <break time="100ms"/>Let me change that.',
      '<break time="100ms"/>Coming right up.',
      '<break time="100ms"/>New music on the way.',
    ],
  };

  // Default DJ transition phrases (short, snappy, professional)
  const defaultPhrases = [
    '<break time="100ms"/>Switching it up.',
    '<break time="100ms"/>Coming right up.',
    '<break time="100ms"/>New track incoming.',
    '<break time="100ms"/>Got it. <break time="100ms"/>On it.',
  ];

  const phrases =
    personaId && personaPhrases[personaId] ? personaPhrases[personaId] : defaultPhrases;

  const basePhrase = phrases[Math.floor(Math.random() * phrases.length)];

  // Optionally add context about what was playing (20% chance, keeps it snappy)
  if (currentTrack && Math.random() < 0.2) {
    return `<break time="100ms"/>Good choice with "${currentTrack.name}". ${basePhrase}`;
  }

  return basePhrase;
}

/**
 * Get a DJ-style intro phrase for when the new track starts after a crossfade.
 * This is spoken right as the new track kicks in - the "drop" moment!
 *
 * @param trackName - The new track name
 * @param artistName - The artist name
 * @param personaId - The persona speaking
 */
export function getDJDropPhrase(trackName: string, artistName: string, personaId?: string): string {
  // Persona-specific drop styles - SHORT and punchy!
  const personaPhrases: Record<string, string[]> = {
    'jack-b': [
      `<emotion value="happy"/>Here's "${trackName}"!`,
      `<emotion value="happy"/>"${trackName}" by ${artistName}!`,
      `<emotion value="happy"/>There we go!`,
    ],
    jordan: [
      `<emotion value="happy"/>Here it is!`,
      `<emotion value="happy"/>"${trackName}"!`,
      `<emotion value="happy"/>Yes!`,
    ],
    'jordan-taylor': [
      `<emotion value="happy"/>Here it is!`,
      `<emotion value="happy"/>"${trackName}"!`,
      `<emotion value="happy"/>Yes!`,
    ],
    ferni: [`Here's "${trackName}".`, `"${trackName}" by ${artistName}.`, `There we go.`],
  };

  const defaultPhrases = [
    `Here's "${trackName}".`,
    `"${trackName}" by ${artistName}.`,
    `And here we go.`,
  ];

  const phrases =
    personaId && personaPhrases[personaId] ? personaPhrases[personaId] : defaultPhrases;

  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// 🎤 MID-SONG "WAIT FOR IT..." MOMENTS
// ============================================================================

/**
 * Get a "Wait for it..." phrase for mid-song interjections.
 * These make the DJ feel alive and present - like they're enjoying the music with you!
 *
 * @param momentType - 'buildup' (anticipation) or 'highlight' (appreciation)
 * @param trackName - The track name for personalization
 * @param personaId - The persona speaking
 */
export function getMidSongMomentPhrase(
  momentType: 'buildup' | 'drop' | 'highlight',
  trackName?: string,
  personaId?: string
): string {
  // Persona-specific mid-song reactions
  const personaPhrases: Record<string, Record<string, string[]>> = {
    'jack-b': {
      buildup: [
        '<emotion value="happy"/><break time="100ms"/>Ooh, here it comes...',
        '<break time="100ms"/>Wait for it...',
        '<emotion value="happy"/><break time="100ms"/>This part right here...',
      ],
      highlight: [
        '<emotion value="happy"/><break time="100ms"/>Yes! Love this part.',
        '<break time="100ms"/>This is the good stuff.',
        '<emotion value="happy"/><break time="100ms"/>Ha! Gets me every time.',
      ],
      drop: [
        '<emotion value="happy"/>There it is!',
        '<emotion value="happy"/>Yes!',
        '<emotion value="happy"/>Boom!',
      ],
    },
    jordan: {
      buildup: [
        '<emotion value="happy"/><break time="100ms"/>Ooh ooh, here we go!',
        '<break time="100ms"/>Wait for it!',
        '<emotion value="happy"/><break time="100ms"/>Coming up!',
      ],
      highlight: [
        '<emotion value="happy"/><break time="100ms"/>YES! So good!',
        '<break time="100ms"/>This part! I love it!',
        '<emotion value="happy"/><break time="100ms"/>Amazing!',
      ],
      drop: [
        '<emotion value="happy"/>Yes yes yes!',
        '<emotion value="happy"/>There it is!',
        '<emotion value="happy"/>Woo!',
      ],
    },
    'jordan-taylor': {
      buildup: [
        '<emotion value="happy"/><break time="100ms"/>Ooh ooh, here we go!',
        '<break time="100ms"/>Wait for it!',
        '<emotion value="happy"/><break time="100ms"/>Coming up!',
      ],
      highlight: [
        '<emotion value="happy"/><break time="100ms"/>YES! So good!',
        '<break time="100ms"/>This part! I love it!',
        '<emotion value="happy"/><break time="100ms"/>Amazing!',
      ],
      drop: [
        '<emotion value="happy"/>Yes yes yes!',
        '<emotion value="happy"/>There it is!',
        '<emotion value="happy"/>Woo!',
      ],
    },
    maya: {
      buildup: [
        '<break time="150ms"/>Mm, this part is beautiful...',
        '<break time="150ms"/>Here comes my favorite moment...',
        '<break time="150ms"/>Listen to this...',
      ],
      highlight: [
        '<break time="150ms"/>So beautiful.',
        '<break time="150ms"/>I love this melody.',
        '<break time="150ms"/>This part always gets me.',
      ],
      drop: [
        '<break time="100ms"/>There it is.',
        '<break time="100ms"/>Beautiful.',
        '<break time="100ms"/>Yes.',
      ],
    },
    'maya-santos': {
      buildup: [
        '<break time="150ms"/>Mm, this part is beautiful...',
        '<break time="150ms"/>Here comes my favorite moment...',
        '<break time="150ms"/>Listen to this...',
      ],
      highlight: [
        '<break time="150ms"/>So beautiful.',
        '<break time="150ms"/>I love this melody.',
        '<break time="150ms"/>This part always gets me.',
      ],
      drop: [
        '<break time="100ms"/>There it is.',
        '<break time="100ms"/>Beautiful.',
        '<break time="100ms"/>Yes.',
      ],
    },
    ferni: {
      buildup: [
        '<break time="150ms"/>Ooh, here comes the good part...',
        '<break time="150ms"/>Wait for it...',
        '<break time="150ms"/>Listen to this...',
      ],
      highlight: [
        '<break time="150ms"/>Love this part.',
        '<break time="150ms"/>This is it.',
        '<break time="150ms"/>So good.',
      ],
      drop: [
        '<break time="100ms"/>There we go.',
        '<break time="100ms"/>Yes.',
        '<break time="100ms"/>There it is.',
      ],
    },
  };

  // Default phrases
  const defaultPhrases: Record<string, string[]> = {
    buildup: [
      '<break time="150ms"/>Ooh, here it comes...',
      '<break time="150ms"/>Wait for it...',
      '<break time="150ms"/>This part right here...',
    ],
    highlight: [
      '<break time="150ms"/>Love this part.',
      '<break time="150ms"/>This is the good stuff.',
      '<break time="150ms"/>Gets me every time.',
    ],
    drop: [
      '<break time="100ms"/>There it is.',
      '<break time="100ms"/>Yes.',
      '<break time="100ms"/>There we go.',
    ],
  };

  const personaSet =
    personaId && personaPhrases[personaId] ? personaPhrases[personaId] : defaultPhrases;

  const phrases = personaSet[momentType] || defaultPhrases[momentType];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// 🎭 MOOD-AWARE MUSIC OFFERS
// ============================================================================

/**
 * Get a proactive music offer based on detected user mood.
 * The agent notices how the user is feeling and offers music to match or soothe.
 *
 * @param mood - Detected user mood (happy, sad, stressed, excited, etc.)
 * @param personaId - The persona speaking
 */
export function getMoodAwareMusicOffer(mood: string, personaId?: string): string | null {
  // Map moods to music suggestions
  const moodOffers: Record<string, string[]> = {
    // Stressed/anxious - offer calming music
    stressed: [
      'You sound like you could use some calming music. Want me to put something on?',
      'How about some relaxing music to help you decompress?',
      'Let me play something soothing for you.',
    ],
    anxious: [
      'Want me to put on something calming?',
      'Some peaceful music might help. Shall I?',
      'Let me find something relaxing for you.',
    ],
    // Sad - offer comforting or uplifting music
    sad: [
      'Want me to play something? Sometimes music helps.',
      'How about some music to lift your spirits?',
      'Let me put on something nice for you.',
    ],
    // Happy/excited - match the energy
    happy: [
      'Your energy is great! Want some music to match?',
      'You sound like you could use a soundtrack. Want me to play something?',
      'How about some music to celebrate?',
    ],
    excited: [
      'I love this energy! Want some music to go with it?',
      'Let me put on something upbeat!',
      'This calls for a good song. Ready?',
    ],
    // Tired/low energy - offer energizing music
    tired: [
      'Need a pick-me-up? I could play something energizing.',
      'Want some music to boost your energy?',
      'How about some upbeat music to wake you up?',
    ],
    // Focused - offer focus music
    focused: [
      'Want some background music while you work?',
      "I could put on some focus music if you'd like.",
      'Some ambient music might help you concentrate.',
    ],
    // Neutral - general offer
    neutral: ['Want me to put on some music?', 'How about some tunes?', 'Shall I play something?'],
  };

  // Persona-specific offer styles
  const personaStyles: Record<string, (offer: string) => string> = {
    'jack-b': (offer) => `<emotion value="happy"/><break time="100ms"/>${offer}`,
    jordan: (offer) => `<emotion value="happy"/><break time="100ms"/>${offer}`,
    'jordan-taylor': (offer) => `<emotion value="happy"/><break time="100ms"/>${offer}`,
    maya: (offer) => `<break time="200ms"/>${offer.replace('!', '.')}`,
    'maya-santos': (offer) => `<break time="200ms"/>${offer.replace('!', '.')}`,
    ferni: (offer) => `<break time="150ms"/>${offer}`,
  };

  const normalizedMood = mood.toLowerCase();
  const offers = moodOffers[normalizedMood] || moodOffers.neutral;

  if (!offers) return null;

  let offer = offers[Math.floor(Math.random() * offers.length)];

  // Apply persona style if available
  if (personaId && personaStyles[personaId]) {
    offer = personaStyles[personaId](offer);
  }

  return offer;
}

/**
 * Get a session callback phrase - referencing music played earlier.
 * "We listened to some jazz earlier - want to keep that vibe?"
 *
 * @param sessionVibe - The vibe from the session (genres, artists)
 * @param personaId - The persona speaking
 */
export function getSessionCallbackPhrase(
  sessionVibe: { genres: string[]; artists: string[] },
  personaId?: string
): string | null {
  if (sessionVibe.artists.length === 0) return null;

  const lastArtist = sessionVibe.artists[sessionVibe.artists.length - 1];

  const callbacks = [
    `We listened to ${lastArtist} earlier. Want more of that vibe?`,
    `Remember that ${lastArtist} track? Want something similar?`,
    `You seemed to like ${lastArtist}. More of that?`,
    `Shall we keep the ${lastArtist} energy going?`,
  ];

  return callbacks[Math.floor(Math.random() * callbacks.length)];
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

    const phrases = personaId && pausePhrases[personaId] ? pausePhrases[personaId] : defaultPause;
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

  const phrases =
    personaId && stoppedPhrases[personaId] ? stoppedPhrases[personaId] : defaultStopped;
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
  getDJTrackChangePhrase,
  getDJDropPhrase,
  getMidSongMomentPhrase,
  getMoodAwareMusicOffer,
  getSessionCallbackPhrase,
  getMusicStoppedPhrase,
};

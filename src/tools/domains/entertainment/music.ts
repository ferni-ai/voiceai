/**
 * Unified Music Tool
 *
 * Plays music for ALL users with a delightful experience:
 *
 * 1. iTunes (Default) - Free 30-second previews for everyone, no auth needed
 * 2. Spotify (Upgrade) - Full playback for users with linked Premium accounts
 *
 * This ensures every user can enjoy music without requiring a subscription.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getDJDropPhrase } from '../../../audio/ambient-music.js';
import { getMusicPlayer, isMusicAvailable, type MusicTrack } from '../../../audio/index.js';
import { isMusicEnabled } from '../../../config/environment.js';
import { getMusicDiscoveryOffer, getQueueTeaser } from '../../../services/dj-service.js';
import { findTrack, searchByMood, searchItunes } from '../../../services/itunes.js';
import {
  getSpotifyAccessToken,
  isSpotifyConfigured,
} from '../../../services/identity/spotify-auth.js';
import {
  getAirDJMoment,
  getDancingComment,
  getExcitedMusicReaction,
  getFunDJMoment,
  getGenreReaction,
  getMoodMusicReaction,
  getMusicReaction,
  getPlayfulMusicComment,
  getPlayfulMusicIntro,
  shouldReactToMusic,
} from '../../../speech/music-reactions.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription, getParameterDescription } from '../../utils/tool-descriptions.js';

// ============================================================================
// MUSIC SOURCE CONFIGURATION
// ============================================================================

interface MusicConfig {
  /** Is Spotify linked and working? (auto-detected at session start) */
  spotifyLinked: boolean;
}

// Session-level config
// 🐛 FIX BUG-012: Add default config factory to prevent cross-session pollution
const DEFAULT_MUSIC_CONFIG: MusicConfig = {
  spotifyLinked: false,
};

// Mutable config - reset at start of each session via initializeMusicConfig()
let musicConfig: MusicConfig = { ...DEFAULT_MUSIC_CONFIG };

// ============================================================================
// MUSIC INTENT DETECTION
// ============================================================================

/**
 * Music intent types:
 * - AMBIENT: Background music while chatting (30-sec previews are perfect)
 * - LISTENING: User wants to actually hear a specific song (Spotify preferred)
 */
export type MusicIntent = 'ambient' | 'listening';

/**
 * Detect whether the user wants ambient background music or to actually listen.
 *
 * AMBIENT signals (iTunes DJ mode - chains previews):
 * - "Play some..." (vague/mood-based)
 * - "Put on something..."
 * - "While we talk/chat..."
 * - Mood words: relaxing, upbeat, focus, chill, background
 *
 * LISTENING signals (Spotify full track):
 * - "Play THE song..." (specific)
 * - "I want to hear [artist/song]"
 * - "On Spotify..."
 * - Specific artist + song name together
 */
export function detectMusicIntent(query: string): MusicIntent {
  const q = query.toLowerCase().trim();

  // LISTENING intent signals - user wants a specific full song
  const listeningPatterns = [
    /\bthe song\b/, // "play the song..."
    /\bi want to hear\b/, // "I want to hear..."
    /\bi want to listen\b/, // "I want to listen to..."
    /\bon spotify\b/, // "...on Spotify"
    /\bfull (song|track|version)\b/, // "full song"
    /\bactually (play|listen|hear)\b/, // "actually play..."
    /\bqueue\b/, // "queue up..."
    /\bby .+ called\b/, // "by Taylor Swift called..."
    /^play .+ by .+ $/, // "play [song] by [artist]" (specific)
  ];

  // AMBIENT intent signals - background music for conversation
  const ambientPatterns = [
    /\bsome\b/, // "play some jazz"
    /\bsomething\b/, // "put on something"
    /\bwhile we\b/, // "while we talk"
    /\bbackground\b/, // "background music"
    /\bambient\b/, // "ambient"
    /\bmood\b/, // "set the mood"
    /\bvibes?\b/, // "good vibes"
    /\brelaxing\b/, // mood-based
    /\bchill\b/,
    /\bupbeat\b/,
    /\bfocus\b/,
    /\bcalm\b/,
    /\benergetic\b/,
    /\bmellow\b/,
  ];

  // Check for explicit listening intent first
  for (const pattern of listeningPatterns) {
    if (pattern.test(q)) {
      getLogger().debug({ query, pattern: pattern.source }, '🎵 Detected LISTENING intent');
      return 'listening';
    }
  }

  // Check for ambient intent
  for (const pattern of ambientPatterns) {
    if (pattern.test(q)) {
      getLogger().debug({ query, pattern: pattern.source }, '🎵 Detected AMBIENT intent');
      return 'ambient';
    }
  }

  // Default: short/vague queries → ambient, longer specific queries → listening
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (words.length <= 3) {
    getLogger().debug({ query, wordCount: words.length }, '🎵 Short query → AMBIENT intent');
    return 'ambient';
  }

  getLogger().debug({ query, wordCount: words.length }, '🎵 Specific query → LISTENING intent');
  return 'listening';
}

/**
 * Check if Spotify is available for this session.
 */
async function checkSpotifyAvailability(): Promise<boolean> {
  if (!isSpotifyConfigured()) {
    return false;
  }

  // Check if we can get a valid token
  const token = await getSpotifyAccessToken();
  return !!token;
}

/**
 * Initialize music config for the session.
 * Called when the voice agent starts.
 * Auto-detects if Spotify is available.
 */
export async function initializeMusicConfig(): Promise<void> {
  // Reset to defaults first to prevent cross-session pollution
  musicConfig = { ...DEFAULT_MUSIC_CONFIG };

  musicConfig.spotifyLinked = await checkSpotifyAvailability();

  getLogger().info(
    {
      spotifyLinked: musicConfig.spotifyLinked,
      musicSource: musicConfig.spotifyLinked ? 'spotify' : 'itunes',
    },
    '🎵 Music auto-configured'
  );
}

/**
 * Reset music config to defaults.
 * Call this when a session ends to ensure clean state for next session.
 */
export function resetMusicConfig(): void {
  musicConfig = { ...DEFAULT_MUSIC_CONFIG };
  getLogger().debug('🎵 Music config reset to defaults');
}

// ============================================================================
// UNIFIED PLAYBACK (Intent-Based Routing)
// ============================================================================

/**
 * Play music using INTENT-BASED routing for the best experience.
 *
 * 🎵 AMBIENT (background music while chatting):
 *    - Uses iTunes DJ mode - chains 30-second previews with crossfades
 *    - ALWAYS works, no device issues
 *    - Perfect for conversation - natural segments
 *    - Example: "Play some jazz", "Put on something relaxing"
 *
 * 🎧 LISTENING (user wants to actually hear a song):
 *    - Uses Spotify if linked + device available
 *    - Falls back to iTunes preview with helpful message
 *    - Example: "Play 'All Too Well' by Taylor Swift", "I want to hear..."
 */
export async function playMusicUnified(query: string): Promise<string> {
  const log = getLogger();
  const intent = detectMusicIntent(query);

  log.info(
    {
      query,
      intent,
      spotifyLinked: musicConfig.spotifyLinked,
    },
    '🎵 Playing music (intent-based routing)'
  );

  // 🚨 CRITICAL: Check if music is available FIRST
  // This provides a clear error to the LLM so it knows music won't work this session
  const musicAvailability = isMusicAvailable();
  if (!musicAvailability.available) {
    log.warn(
      { query, reason: musicAvailability.reason },
      '🎵 Music playback NOT available for this session'
    );
    // Return a clear message that tells the LLM music isn't working (not just one track)
    return `I'd love to play "${query}" for you, but music isn't available in this session. The audio system didn't initialize properly - you might need to reconnect. In the meantime, let's keep chatting!`;
  }

  // AMBIENT INTENT: Always use iTunes DJ mode (chains previews, always works)
  if (intent === 'ambient') {
    log.info({ query }, '🎵 AMBIENT mode: Using iTunes DJ (chains previews)');
    return playAmbientMusic(query);
  }

  // LISTENING INTENT: Try Spotify first, graceful fallback
  if (musicConfig.spotifyLinked) {
    log.info({ query }, '🎵 LISTENING mode: Trying Spotify...');
    const result = await playViaSpotify(query);

    // Check if Spotify failed due to device issue
    if (result.includes("can't play it yet") || result.includes('no active device')) {
      log.info({ query }, '🎵 Spotify device unavailable, falling back to iTunes preview');
      return playViaItunesWithListeningFallback(query);
    }

    return result;
  }

  // No Spotify: Use iTunes with "listening" framing
  log.info({ query }, '🎵 LISTENING mode: No Spotify, using iTunes preview');
  return playViaItunesWithListeningFallback(query);
}

/**
 * Play ambient background music - chains iTunes previews like a DJ.
 * Perfect for conversation - 30-second segments with smooth crossfades.
 *
 * 🎧 DJ AMBIENT MODE:
 * - Searches for multiple tracks matching the mood/genre
 * - Queues them up for continuous playback
 * - Music player handles crossfades between tracks
 * - Each preview is ~30 seconds - perfect for conversation!
 */
async function playAmbientMusic(query: string): Promise<string> {
  const log = getLogger();
  log.info({ query }, '🎧 DJ Ambient Mode: Starting...');

  // Search for multiple tracks to queue
  const searchResults = await searchItunes(query, 5);

  if (searchResults.resultCount === 0 || !searchResults.results.length) {
    log.warn({ query }, '🎧 No tracks found for ambient mode');
    return `Couldn't find any ${query} tracks. Want to try something else?`;
  }

  // Filter to only tracks with preview URLs
  const tracksWithPreviews = searchResults.results.filter((t) => t.previewUrl);

  if (tracksWithPreviews.length === 0) {
    log.warn({ query }, '🎧 Found tracks but none have previews');
    return `Found some ${query} tracks but none have previews available. Try a different search?`;
  }

  // Get the music player
  const musicPlayer = getMusicPlayer();

  // 🚨 IMPROVED: Better check with clear error message
  const musicAvailability = isMusicAvailable();
  if (!musicAvailability.available) {
    log.warn(
      { query, reason: musicAvailability.reason },
      '🎧 Music player not available for ambient mode'
    );
    return `I'd love to set the mood with some ${query} music, but the audio system isn't ready this session. Let's keep chatting!`;
  }

  // Play the first track immediately
  const firstTrack = tracksWithPreviews[0];
  const ITUNES_PREVIEW_DURATION_MS = 30000;

  const musicTrack: MusicTrack = {
    name: firstTrack.trackName,
    artist: firstTrack.artistName,
    previewUrl: firstTrack.previewUrl!,
    duration: ITUNES_PREVIEW_DURATION_MS,
  };

  const success = await musicPlayer.playFromUrl(firstTrack.previewUrl!, musicTrack);

  if (!success) {
    log.error({ track: firstTrack.trackName }, '🎧 Failed to start ambient playback');
    // 🚨 IMPROVED: Better error message - system issue, not track issue
    return `Something went wrong with the audio system while trying to play ${query} music. You might need to reconnect for music to work.`;
  }

  // 🎧 DJ MODE: Queue just ONE backup track for smooth transition
  // After that, let the DJ decide whether to keep it going with personality!
  // This makes the DJ feel more alive - not just an auto-queue robot.
  if (tracksWithPreviews.length > 1) {
    const backupTrack = tracksWithPreviews[1];
    musicPlayer.addToQueue({
      name: backupTrack.trackName,
      artist: backupTrack.artistName,
      previewUrl: backupTrack.previewUrl!,
      duration: ITUNES_PREVIEW_DURATION_MS,
    });
  }

  log.info(
    {
      firstTrack: firstTrack.trackName,
      backupTrack: tracksWithPreviews[1]?.trackName || 'none',
      totalTracksFound: tracksWithPreviews.length,
    },
    '🎧 DJ Mode: Playing with one backup, DJ will decide from there!'
  );

  // Return ambient-style response (short, doesn't interrupt conversation)
  const ambientResponses = [
    "Here's some vibes...",
    'Setting the mood...',
    'Got something for you...',
    `Some ${query} coming up...`,
    '', // Sometimes just play silently and let the music speak!
  ];

  return ambientResponses[Math.floor(Math.random() * ambientResponses.length)];
}

/**
 * iTunes fallback when user wanted Spotify but it's unavailable.
 * Provides helpful context about the preview.
 */
async function playViaItunesWithListeningFallback(query: string): Promise<string> {
  const log = getLogger();
  const result = await playViaItunes(query);

  // If playback succeeded, add context about it being a preview
  if (!result.includes("couldn't") && !result.includes('trouble')) {
    // Extract track name from result if possible
    const trackMatch = result.match(/"([^"]+)"/);
    const trackName = trackMatch ? trackMatch[1] : 'that';

    const fallbackResponses = [
      `Here's a taste of ${trackName}... open Spotify to hear the full thing!`,
      `Playing a preview... want the full song? Open Spotify and I'll queue it up.`,
      `Here's 30 seconds of ${trackName}. The full track's on Spotify when you're ready!`,
    ];
    return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
  }

  return result;
}

/**
 * Play via iTunes - Free 30-second previews.
 *
 * 🎧 DJ-STYLE: If music is already playing, we do a smooth crossfade!
 * This makes Ferni feel like a real DJ - seamless track transitions.
 */
export async function playViaItunes(query: string, personaId?: string): Promise<string> {
  const log = getLogger();
  const startTime = Date.now();

  // 🔍 DIAGNOSTIC: Log full state at tool entry
  const musicPlayer = getMusicPlayer();
  log.info(
    {
      timestamp: new Date().toISOString(),
      query,
      personaId,
      musicPlayerInitialized: musicPlayer.isInitialized(),
      musicPlayerSessionId: musicPlayer.getSessionId(),
      musicEnabled: isMusicEnabled(),
    },
    '🎵 [DIAG] playViaItunes START - checking player state'
  );

  // 🐛 FIX: Check if music is enabled FIRST before doing anything
  // This provides a clear error message instead of "audio system isn't ready"
  if (!isMusicEnabled()) {
    log.warn(
      { query, elapsed: Date.now() - startTime },
      '🎵 [DIAG] Music feature is disabled (MUSIC_ENABLED=false)'
    );
    return `I'd love to play "${query}" for you, but music playback is currently disabled. Let's keep chatting instead!`;
  }

  log.info({ query }, '🎵 [iTunes] Starting search...');

  try {
    // Step 1: Search iTunes
    log.debug('Step 1: Calling findTrack...');
    const result = await findTrack(query);
    log.debug('findTrack result', {
      found: result.found,
      trackName: result.track?.name,
      hasPreviewUrl: !!result.track?.previewUrl,
      error: result.error,
    });

    if (!result.found || !result.track) {
      log.warn({ query, error: result.error }, '🎵 [iTunes] Track not found');
      // 🎯 IMPROVED: More helpful suggestions
      const suggestions = [
        `Couldn't find "${query}". Try the artist name, or a different spelling?`,
        `No results for "${query}". Maybe try just the song title or artist?`,
        `"${query}" isn't in my catalog. Want to try something else?`,
      ];
      return result.error || suggestions[Math.floor(Math.random() * suggestions.length)];
    }

    const { track } = result;

    // 🚨 CRITICAL: Check if preview URL exists
    if (!track.previewUrl) {
      log.warn(
        { track: track.name, artist: track.artist },
        '🎵 [iTunes] Track found but no preview URL available!'
      );
      // 🎯 IMPROVED: Offer alternatives instead of just failing
      if (result.alternatives && result.alternatives.length > 0) {
        const alt = result.alternatives[0];
        return `I found "${track.name}" by ${track.artist}, but that one doesn't have a preview. Want me to try "${alt.name}" by ${alt.artist} instead?`;
      }
      return `I found "${track.name}" by ${track.artist}, but I can't play a preview of this one. Try a different song by them, or another artist?`;
    }

    log.debug('Track found', {
      name: track.name,
      artist: track.artist,
      previewUrl: track.previewUrl,
    });
    log.info(
      {
        name: track.name,
        artist: track.artist,
        previewUrl: track.previewUrl?.slice(0, 50),
      },
      '🎵 [iTunes] Track found!'
    );

    // Step 2: Get music player and wait for initialization (fixed race condition)
    log.debug('Step 2: Getting music player...');
    // Re-get the player in case it changed (singleton may have been reset)
    const currentMusicPlayer = getMusicPlayer();

    // 🔍 DIAGNOSTIC: Check if the player instance changed
    if (currentMusicPlayer !== musicPlayer) {
      log.warn(
        {
          timestamp: new Date().toISOString(),
          originalSessionId: musicPlayer.getSessionId(),
          currentSessionId: currentMusicPlayer.getSessionId(),
          elapsed: Date.now() - startTime,
        },
        '🎵 [DIAG] WARNING: Music player instance CHANGED between checks! Singleton may have been reset.'
      );
    }

    // 🐛 FIX: Use the new waitForInitialization method instead of manual retry loop
    // This properly awaits the initialization promise with a 5-second timeout
    if (!currentMusicPlayer.isInitialized()) {
      log.warn(
        {
          timestamp: new Date().toISOString(),
          query,
          sessionId: currentMusicPlayer.getSessionId(),
          elapsed: Date.now() - startTime,
        },
        '🎵 [DIAG] Music player NOT initialized! Waiting up to 5s...'
      );
      const initialized = await currentMusicPlayer.waitForInitialization(5000);

      if (!initialized) {
        const sessionId = currentMusicPlayer.getSessionId();
        const playerState = currentMusicPlayer.getState();

        // 🐛 FIX: Better diagnostics to understand WHY initialization failed
        log.error(
          {
            timestamp: new Date().toISOString(),
            query,
            trackName: track.name,
            playerState,
            sessionId,
            musicEnabled: isMusicEnabled(),
            elapsed: Date.now() - startTime,
            // If sessionId is null, initialization was never started
            initializationNeverStarted: sessionId === null,
            stack: new Error().stack?.split('\n').slice(1, 6).join(' <- '),
          },
          '🎵 [DIAG] Music player FAILED to initialize! Was dispose() called? Check previous logs!'
        );

        // 🎯 IMPROVED: Different error messages based on what went wrong
        if (sessionId === null) {
          // Initialization was never started - likely a setup issue
          log.error(
            '🎵 [DIAG] CRITICAL: Music player sessionId is NULL - dispose() was likely called!'
          );
          return `I found "${track.name}" by ${track.artist}, but the audio system didn't start up properly this session. Try reconnecting, and if this keeps happening, let the team know!`;
        }

        // Initialization was started but timed out - transient issue
        return `I found "${track.name}" by ${track.artist}, but the audio system is still warming up. Give me a second and ask again!`;
      }
      log.info(
        { elapsed: Date.now() - startTime },
        '🎵 [DIAG] Music player initialization complete, proceeding with playback'
      );
    }

    const wasPlaying = currentMusicPlayer.isCurrentlyPlaying();
    const previousTrack = currentMusicPlayer.getCurrentPlayingTrack();

    const playerState = {
      isInitialized: currentMusicPlayer.isInitialized(),
      isPlaying: currentMusicPlayer.isPlaying(),
      wasAlreadyPlaying: wasPlaying,
      previousTrack: previousTrack?.name,
    };
    log.debug('Music player state', playerState);

    // Step 3: Create track object
    // 🐛 FIX: iTunes API returns full track duration (e.g., 3 min), but we play 30-second PREVIEWS!
    // The fade-out timer was being set for the full duration, so it never triggered.
    // Use 30000ms (30 seconds) for previews, regardless of full track length.
    const ITUNES_PREVIEW_DURATION_MS = 30000;
    const musicTrack: MusicTrack = {
      name: track.name,
      artist: track.artist,
      previewUrl: track.previewUrl,
      duration: ITUNES_PREVIEW_DURATION_MS, // Use preview duration, NOT full track duration
    };

    // Step 4: Play the track - use crossfade if something is already playing!
    let success: boolean;
    let usedCrossfade = false;

    if (wasPlaying && previousTrack) {
      // 🎧 DJ CROSSFADE: Smooth transition from current track to new track!
      log.info(
        { from: previousTrack.name, to: track.name },
        '🎧 DJ Crossfade: Switching tracks smoothly'
      );
      const crossfadeResult = await currentMusicPlayer.crossfadeTo(track.previewUrl, musicTrack);
      success = crossfadeResult.success;
      usedCrossfade = true;
    } else {
      // Normal play (nothing was playing before)
      log.debug('Step 4: Calling playFromUrl', { previewUrl: track.previewUrl });
      success = await currentMusicPlayer.playFromUrl(track.previewUrl, musicTrack);
    }

    log.debug('Play returned', { success, usedCrossfade });

    if (!success) {
      log.error(
        {
          timestamp: new Date().toISOString(),
          track: track.name,
          artist: track.artist,
          previewUrl: track.previewUrl?.slice(0, 50),
          elapsed: Date.now() - startTime,
        },
        '🎵 [DIAG] playFromUrl returned false! Music will NOT play.'
      );
      // 🎯 IMPROVED: Diagnose the failure and give helpful suggestions
      const failurePlayerState = currentMusicPlayer.getState();
      log.error(
        {
          isInitialized: currentMusicPlayer.isInitialized(),
          sessionId: currentMusicPlayer.getSessionId(),
          isPlaying: failurePlayerState.isPlaying,
          hasCurrentTrack: !!failurePlayerState.currentTrack,
        },
        '🎵 [DIAG] Player state at failure - was it disposed?'
      );

      // Try to offer alternatives if we have them
      if (result.alternatives && result.alternatives.length > 0) {
        const alt = result.alternatives[0];
        return `I had trouble playing "${track.name}". Let me try "${alt.name}" by ${alt.artist} instead - say yes if you want me to!`;
      }
      return `I found "${track.name}" by ${track.artist}, but couldn't play it. This sometimes happens with certain tracks. Try a different song?`;
    }

    log.info(
      {
        track: track.name,
        artist: track.artist,
        duration: Math.round(track.duration / 1000),
        crossfade: usedCrossfade,
      },
      '🎵 [iTunes] ✅ NOW PLAYING'
    );

    // 🎧 DJ-STYLE RESPONSE: Different response for crossfade vs fresh start
    if (usedCrossfade) {
      // Used crossfade - give a snappy DJ drop response!
      // The transition phrase was already spoken during crossfade
      const djDrop = getDJDropPhrase(track.name, track.artist, personaId);
      return djDrop;
    }

    // Build a delightful, playful response for fresh starts
    // The DJ experience should feel human and fun!

    let intro = '';
    let outro = '';

    // 🎧 SPECIAL DJ MOMENTS - rare but delightful (10% chance)
    const funMoment = getFunDJMoment();
    if (funMoment) {
      // Got a special DJ moment! Use it as the intro
      intro = `${funMoment} `;
    } else {
      // Regular intro selection (60% chance of playful intro)
      const usePlayfulIntro = Math.random() < 0.6;

      if (usePlayfulIntro) {
        // 8% chance of air DJ moment (rare and fun!)
        if (Math.random() < 0.08) {
          intro = `${getAirDJMoment()} `;
        } else {
          // Try genre-specific first for extra personality
          const genreReaction = getGenreReaction(query);
          if (genreReaction && Math.random() < 0.4) {
            intro = `${genreReaction} `;
          } else {
            intro = `${getPlayfulMusicIntro()} `;
          }
        }
      } else if (shouldReactToMusic()) {
        intro = `${getMusicReaction('intro')} `;
      }
    }

    // Sometimes add a playful comment or dancing comment after the track info
    const addComment = Math.random() < 0.3; // 30% chance
    if (addComment) {
      // 20% of comments are dancing-related, 80% are regular playful
      outro = Math.random() < 0.2 ? ` ${getDancingComment()}` : ` ${getPlayfulMusicComment()}`;
    }

    // Occasionally add excited reaction for variety (5% chance)
    if (!outro && Math.random() < 0.05) {
      outro = ` ${getExcitedMusicReaction()}`;
    }

    const baseResponse = `${intro}Here's "${track.name}" by ${track.artist}!${outro}`;

    // Add Spotify upsell if not linked (subtle, helpful)
    const spotifyHint = !musicConfig.spotifyLinked
      ? '\n\nPS: Link your Spotify for full songs instead of previews!'
      : '';

    return baseResponse + spotifyHint;
  } catch (error) {
    getLogger().error({ error, query }, '🎵 [iTunes] EXCEPTION in playViaItunes');
    return 'I had trouble finding that song. Try a different one?';
  }
}

/**
 * Play via Spotify - Full playback for linked Premium users.
 * Dynamically imports Spotify module to avoid loading if not needed.
 */
async function playViaSpotify(query: string): Promise<string> {
  getLogger().info({ query }, '🎵 Playing via Spotify (full track)');

  try {
    // Dynamically import Spotify to avoid circular deps
    const { default: createSpotifyTools } = await import('./spotify.js');
    const tools = createSpotifyTools();

    // Use Spotify's playMusic tool
    // The tool execute function expects (args, context) but context is optional
    type ToolExecuteFn = (args: { query: string }, context?: unknown) => Promise<string>;
    const playMusicTool = tools.playMusic as unknown as { execute: ToolExecuteFn };
    const result = await playMusicTool.execute({ query });
    return result;
  } catch (error) {
    getLogger().error({ error }, '🎵 Spotify playback failed, falling back to iTunes');

    // Fallback to iTunes
    return playViaItunes(query);
  }
}

/**
 * Search for music across sources.
 */
export async function searchMusic(query: string, limit = 5): Promise<string> {
  const results = await searchItunes(query, limit);

  if (results.resultCount === 0) {
    const noResultsResponses = [
      `Couldn't find anything matching "${query}". <break time=\"200ms\"/>Try a different search?`,
      `Drawing a blank on "${query}". <break time=\"150ms\"/>Maybe try a different spelling or another song?`,
      `No luck with "${query}". <break time=\"200ms\"/>What else you got?`,
    ];
    return noResultsResponses[Math.floor(Math.random() * noResultsResponses.length)];
  }

  const trackList = results.results
    .filter((t) => t.previewUrl)
    .slice(0, 5)
    .map((t, i) => `${i + 1}. "${t.trackName}" by ${t.artistName}`)
    .join('\n');

  const searchIntros = [
    `Found some good stuff:\n${trackList}\n\nWant me to play one?`,
    `Here's what I found:\n${trackList}\n\nAny of these catch your ear?`,
    `Ooh, options:\n${trackList}\n\nWhich one's calling to you?`,
    `Got some hits:\n${trackList}\n\nJust say which one!`,
  ];

  return searchIntros[Math.floor(Math.random() * searchIntros.length)];
}

/**
 * Get music recommendation based on mood.
 */
export async function suggestAndPlayMusic(mood: string): Promise<string> {
  const log = getLogger();

  // 🐛 FIX: Check if music is enabled FIRST before doing anything
  if (!isMusicEnabled()) {
    log.warn({ mood }, '🎵 [Mood Music] Music feature is disabled (MUSIC_ENABLED=false)');
    return `I'd love to play some ${mood} music for you, but music playback is currently disabled. What else can we chat about?`;
  }

  const result = await searchByMood(mood);

  if (!result.found || !result.track) {
    // Even the "not found" response can be playful
    const notFoundResponses = [
      `Hmm, I couldn't quite find the right vibe for "${mood}". <break time=\"200ms\"/>Got a specific song in mind?`,
      `My musical intuition is failing me on "${mood}". <break time=\"150ms\"/>Help me out - what are you thinking?`,
      `I'm drawing a blank on "${mood}" vibes. <break time=\"200ms\"/>Sometimes my DJ skills need direction.`,
    ];
    return notFoundResponses[Math.floor(Math.random() * notFoundResponses.length)];
  }

  // Play the suggestion
  // 🐛 FIX: Use preview duration (30s), not full track duration from iTunes API
  const ITUNES_PREVIEW_DURATION_MS = 30000;
  const musicPlayer = getMusicPlayer();

  // 🐛 FIX: Wait for initialization before playing
  if (!musicPlayer.isInitialized()) {
    const initialized = await musicPlayer.waitForInitialization(5000);
    if (!initialized) {
      const sessionId = musicPlayer.getSessionId();
      if (sessionId === null) {
        log.error('🎵 [Mood Music] Music player was never initialized');
        return `I found a great ${mood} track - "${result.track.name}" by ${result.track.artist}. But the audio system didn't start up properly. Try reconnecting!`;
      }
      return `I found a great ${mood} track - "${result.track.name}" by ${result.track.artist}. The audio system is still warming up. Ask me again in a moment!`;
    }
  }

  const musicTrack: MusicTrack = {
    name: result.track.name,
    artist: result.track.artist,
    previewUrl: result.track.previewUrl,
    duration: ITUNES_PREVIEW_DURATION_MS, // Use preview duration for proper fade-out
  };

  const success = await musicPlayer.playFromUrl(result.track.previewUrl, musicTrack);

  if (!success) {
    return 'Had trouble playing that suggestion. <break time="150ms"/>Technology and I have a complicated relationship. <break time="200ms"/>Let me try something else.';
  }

  // Use the mood-specific reaction for extra personality
  const moodIntro = getMoodMusicReaction(mood);

  // Sometimes add extra flavor
  const addFlavor = Math.random() < 0.3;
  const flavor = addFlavor ? ` ${getPlayfulMusicComment()}` : '';

  return `${moodIntro} For that ${mood} vibe, here's "${result.track.name}" by ${result.track.artist}!${flavor}`;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createMusicTools() {
  getLogger().info('🎵 Creating unified music tools (iTunes default, Spotify upgrade)');

  // Initialize config on first tool creation
  initializeMusicConfig().catch((err) => {
    getLogger().warn({ err }, '🎵 Music config init warning (non-fatal)');
  });

  return {
    playMusic: llm.tool({
      description: getToolDescription('playMusic'),
      parameters: z.object({
        query: z.string().describe(getParameterDescription('playMusic', 'query')),
      }),
      execute: async ({ query }) => {
        const log = getLogger();
        log.debug('playMusic TOOL INVOKED BY LLM', { query });
        log.info({ query }, '🎵 TOOL: playMusic CALLED');
        try {
          const result = await playMusicUnified(query);
          log.debug('playMusic SUCCESS', { resultPreview: result.slice(0, 150) });
          log.info({ query, resultPreview: result.slice(0, 100) }, '🎵 TOOL: playMusic SUCCESS');
          return result;
        } catch (error) {
          log.error({ query, error }, '🎵 TOOL: playMusic ERROR');
          // 🚨 IMPROVED: Clear error that helps LLM understand the issue
          // Check if music system is working at all
          const musicAvailability = isMusicAvailable();
          if (!musicAvailability.available) {
            return `I tried to play "${query}" but the music system isn't working this session. The audio didn't initialize properly - reconnecting might help. For now, let's keep talking!`;
          }
          // Music system is working, just this track/request failed
          return `I had trouble with "${query}". Maybe try a different song or artist?`;
        }
      },
    }),

    searchMusic: llm.tool({
      description: getToolDescription('searchMusic'),
      parameters: z.object({
        query: z.string().describe('Search query'),
        limit: z.number().optional().describe('Number of results (default 5)'),
      }),
      execute: async ({ query, limit }) => {
        return searchMusic(query, limit || 5);
      },
    }),

    suggestMusic: llm.tool({
      description: getToolDescription('suggestMusic'),
      parameters: z.object({
        mood: z
          .string()
          .describe(
            'Mood or activity: focus, relaxing, energizing, stressed, celebrating, workout, sleep'
          ),
      }),
      execute: async ({ mood }) => {
        return suggestAndPlayMusic(mood);
      },
    }),

    pauseMusic: llm.tool({
      description: getToolDescription('pauseMusic'),
      parameters: z.object({}),
      execute: async () => {
        const musicPlayer = getMusicPlayer();
        const currentTrack = musicPlayer.getCurrentTrack();
        musicPlayer.pause();

        if (currentTrack) {
          const pauseResponses = [
            `Pausing "${currentTrack.name}". <break time=\"200ms\"/>Just say the word when you want it back.`,
            `Okay, putting "${currentTrack.name}" on hold. <break time=\"150ms\"/>It'll be here when you're ready.`,
            `"${currentTrack.name}" on pause. <break time=\"200ms\"/>Good song, by the way.`,
            `Paused! <break time=\"150ms\"/>We can pick "${currentTrack.name}" back up whenever.`,
          ];
          return pauseResponses[Math.floor(Math.random() * pauseResponses.length)];
        }
        return 'Music paused. <break time="200ms"/>It\'s quiet now. <break time="150ms"/>Almost too quiet.';
      },
    }),

    resumeMusic: llm.tool({
      description: getToolDescription('resumeMusic'),
      parameters: z.object({}),
      execute: async () => {
        const musicPlayer = getMusicPlayer();
        const currentTrack = musicPlayer.getCurrentTrack();

        if (!currentTrack) {
          const noMusicResponses = [
            'Nothing to resume right now. <break time="200ms"/>Want me to put something on?',
            'The queue\'s empty. <break time="150ms"/>What are we feeling?',
            'No music in the chamber. <break time="200ms"/>Give me a song and I\'ll make it happen.',
          ];
          return noMusicResponses[Math.floor(Math.random() * noMusicResponses.length)];
        }

        await musicPlayer.resume();
        const resumeResponses = [
          `And we're back! <break time=\"150ms\"/>"${currentTrack.name}" resuming.`,
          `Where were we... <break time=\"200ms\"/>ah yes, "${currentTrack.name}"!`,
          `Picking up "${currentTrack.name}" right where we left off.`,
          `Unpausing "${currentTrack.name}". <break time=\"150ms\"/>Good choice, by the way.`,
        ];
        return resumeResponses[Math.floor(Math.random() * resumeResponses.length)];
      },
    }),

    stopMusic: llm.tool({
      description: getToolDescription('stopMusic'),
      parameters: z.object({}),
      execute: async () => {
        const musicPlayer = getMusicPlayer();
        const wasPlaying = musicPlayer.getCurrentTrack();
        musicPlayer.stop();

        const transition = getMusicReaction('transition');
        if (wasPlaying) {
          const stopResponses = [
            `${transition} <break time=\"200ms\"/>What else can I help you with?`,
            `${transition} <break time=\"200ms\"/>Okay, back to business. What's on your mind?`,
            `${transition} <break time=\"200ms\"/>Music's off. I'm all ears now.`,
          ];
          return stopResponses[Math.floor(Math.random() * stopResponses.length)];
        }
        const silentStopResponses = [
          'Music stopped. <break time="200ms"/>What would you like to talk about?',
          'All quiet on the music front. <break time="150ms"/>What\'s up?',
          'Done with the tunes. <break time="200ms"/>What else is on your mind?',
        ];
        return silentStopResponses[Math.floor(Math.random() * silentStopResponses.length)];
      },
    }),

    setMusicVolume: llm.tool({
      description: getToolDescription('setMusicVolume'),
      parameters: z.object({
        volume: z
          .number()
          .min(0)
          .max(100)
          .describe('Volume percentage (0-100). 20-30% is good for background.'),
      }),
      execute: async ({ volume }) => {
        const musicPlayer = getMusicPlayer();
        musicPlayer.setVolume(volume / 100);

        // Playful volume responses based on the level
        if (volume >= 80) {
          const loudResponses = [
            `Volume at ${volume}%! <break time=\"150ms\"/>Now we're talking!`,
            `Cranking it to ${volume}%. <break time=\"200ms\"/>I like your style.`,
            `${volume}%! <break time=\"150ms\"/>Neighbors might have opinions. <break time=\"200ms\"/>Worth it.`,
          ];
          return loudResponses[Math.floor(Math.random() * loudResponses.length)];
        } else if (volume <= 20) {
          const quietResponses = [
            `Volume down to ${volume}%. <break time=\"200ms\"/>Nice and subtle.`,
            `${volume}% - background vibes mode activated.`,
            `Keeping it quiet at ${volume}%. <break time=\"150ms\"/>Very chill.`,
          ];
          return quietResponses[Math.floor(Math.random() * quietResponses.length)];
        } else {
          const normalResponses = [
            `Volume set to ${volume}%. <break time=\"150ms\"/>Goldilocks zone.`,
            `${volume}% - just right.`,
            `Volume's at ${volume}% now.`,
          ];
          return normalResponses[Math.floor(Math.random() * normalResponses.length)];
        }
      },
    }),

    whatsPlaying: llm.tool({
      description: getToolDescription('whatsPlaying'),
      parameters: z.object({}),
      execute: async () => {
        const musicPlayer = getMusicPlayer();
        const state = musicPlayer.getState();

        if (state.isPlaying && state.currentTrack) {
          const playingResponses = [
            `This is "${state.currentTrack.name}" by ${state.currentTrack.artist}. <break time=\"150ms\"/>Good one, right?`,
            `Currently vibing to "${state.currentTrack.name}" by ${state.currentTrack.artist}.`,
            `That's "${state.currentTrack.name}" by ${state.currentTrack.artist}. <break time=\"200ms\"/>Want me to find more like this?`,
            `Playing "${state.currentTrack.name}" by ${state.currentTrack.artist}. <break time=\"150ms\"/>Solid choice.`,
          ];
          return playingResponses[Math.floor(Math.random() * playingResponses.length)];
        }

        if (state.currentTrack) {
          const pausedResponses = [
            `"${state.currentTrack.name}" by ${state.currentTrack.artist} is paused. <break time=\"200ms\"/>Want me to keep it going?`,
            `We've got "${state.currentTrack.name}" on standby. <break time=\"150ms\"/>Say the word.`,
            `"${state.currentTrack.name}" is waiting patiently. <break time=\"200ms\"/>Resume?`,
          ];
          return pausedResponses[Math.floor(Math.random() * pausedResponses.length)];
        }

        const nothingPlayingResponses = [
          'Nothing\'s playing right now. <break time="200ms"/>Want me to set the mood?',
          'It\'s quiet over here. <break time="150ms"/>What should we listen to?',
          'No music at the moment. <break time="200ms"/>I\'ve got suggestions if you need them.',
        ];
        return nothingPlayingResponses[Math.floor(Math.random() * nothingPlayingResponses.length)];
      },
    }),

    useSpotify: llm.tool({
      description: getToolDescription('useSpotify'),
      parameters: z.object({}),
      execute: async () => {
        if (!musicConfig.spotifyLinked) {
          return "Spotify isn't linked yet. Link your account in settings to enjoy full songs!";
        }
        // Auto-detection handles source selection - Spotify is already active
        return "Spotify is linked and ready! I'll play full songs from your library.";
      },
    }),

    useFreePreviews: llm.tool({
      description: getToolDescription('useFreePreviews'),
      parameters: z.object({}),
      execute: async () => {
        // iTunes previews are always available as fallback
        return 'Free 30-second previews are always available - no subscription needed!';
      },
    }),

    discoverMusic: llm.tool({
      description: getToolDescription('discoverMusic'),
      parameters: z.object({
        personaId: z.string().optional().describe('Current persona ID for style'),
      }),
      execute: async ({ personaId }) => {
        const offer = getMusicDiscoveryOffer(personaId || 'ferni');
        return `${offer} I could play something from an artist you might not know, or a hidden gem in a genre you like.`;
      },
    }),

    keepVibeGoing: llm.tool({
      description: getToolDescription('keepVibeGoing'),
      parameters: z.object({
        personaId: z.string().optional().describe('Current persona ID for style'),
      }),
      execute: async ({ personaId }) => {
        const musicPlayer = getMusicPlayer();
        const hasQueue = musicPlayer.getState().queue.length > 0;
        const teaser = getQueueTeaser(personaId || 'ferni', hasQueue);
        return teaser || 'Want me to keep the music going?';
      },
    }),
  };
}

export default createMusicTools;

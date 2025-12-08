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

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { getMusicPlayer, type MusicTrack } from '../audio/index.js';
import { findTrack, searchItunes, searchByMood, isItunesAvailable } from '../services/itunes.js';
import { isSpotifyConfigured, getSpotifyAccessToken } from '../services/spotify-auth.js';
import {
  getMusicReaction,
  shouldReactToMusic,
  getPlayfulMusicIntro,
  getGenreReaction,
  getMoodMusicReaction,
  getPlayfulMusicComment,
  getFunDJMoment,
  getAirDJMoment,
  getExcitedMusicReaction,
  getDancingComment,
} from '../speech/music-reactions.js';
import { getDJTrackChangePhrase, getDJDropPhrase } from '../audio/ambient-music.js';
import { 
  getDJStyle, 
  getMusicAppreciationComment,
  getQueueTeaser,
  getMusicDiscoveryOffer,
} from '../services/dj-service.js';

// ============================================================================
// MUSIC SOURCE CONFIGURATION
// ============================================================================

type MusicSource = 'itunes' | 'spotify';

interface MusicConfig {
  /** Preferred source (itunes = free previews, spotify = full playback if linked) */
  preferredSource: MusicSource;
  /** Is Spotify linked and working? */
  spotifyLinked: boolean;
  /** User explicitly requested Spotify? */
  userRequestedSpotify: boolean;
}

// Session-level config
const musicConfig: MusicConfig = {
  preferredSource: 'itunes', // Default to free previews
  spotifyLinked: false,
  userRequestedSpotify: false,
};

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
 */
export async function initializeMusicConfig(): Promise<void> {
  musicConfig.spotifyLinked = await checkSpotifyAvailability();

  getLogger().info(
    {
      spotifyLinked: musicConfig.spotifyLinked,
      preferredSource: musicConfig.preferredSource,
    },
    '🎵 Music config initialized'
  );
}

/**
 * Set user's preferred music source.
 */
export function setMusicSource(source: MusicSource): void {
  musicConfig.preferredSource = source;
  musicConfig.userRequestedSpotify = source === 'spotify';
  getLogger().info({ source }, '🎵 Music source preference set');
}

// ============================================================================
// UNIFIED PLAYBACK
// ============================================================================

/**
 * Play music using the best available source.
 *
 * Priority:
 * 1. If user explicitly requested Spotify AND it's linked → Spotify
 * 2. Otherwise → iTunes previews (works for everyone!)
 *
 * This ensures delightful music for all users, regardless of subscriptions.
 */
export async function playMusicUnified(query: string): Promise<string> {
  const log = getLogger();
  log.debug('playMusicUnified called', {
    query,
    userRequestedSpotify: musicConfig.userRequestedSpotify,
    spotifyLinked: musicConfig.spotifyLinked,
    preferredSource: musicConfig.preferredSource,
  });
  log.info({ query, config: musicConfig }, '🎵 Playing music');

  // Check if user wants Spotify AND it's available
  if (musicConfig.userRequestedSpotify && musicConfig.spotifyLinked) {
    log.debug('Taking SPOTIFY path');
    return playViaSpotify(query);
  }

  // Default: Play via iTunes (free for everyone!)
  log.debug('Taking iTunes path (default)');
  return playViaItunes(query);
}

/**
 * Play via iTunes - Free 30-second previews.
 * 
 * 🎧 DJ-STYLE: If music is already playing, we do a smooth crossfade!
 * This makes Ferni feel like a real DJ - seamless track transitions.
 */
export async function playViaItunes(query: string, personaId?: string): Promise<string> {
  const log = getLogger();
  log.debug('playViaItunes called', { query });
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
      return result.error || `Couldn't find "${query}". Try a different song?`;
    }

    const { track } = result;
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

    // Step 2: Get music player
    log.debug('Step 2: Getting music player...');
    const musicPlayer = getMusicPlayer();
    const wasPlaying = musicPlayer.isCurrentlyPlaying();
    const previousTrack = musicPlayer.getCurrentPlayingTrack();
    
    const playerState = {
      isInitialized: musicPlayer.isInitialized(),
      isPlaying: musicPlayer.isPlaying(),
      wasAlreadyPlaying: wasPlaying,
      previousTrack: previousTrack?.name,
    };
    log.debug('Music player state', playerState);

    // Step 3: Create track object
    const musicTrack: MusicTrack = {
      name: track.name,
      artist: track.artist,
      previewUrl: track.previewUrl,
      duration: track.duration,
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
      const crossfadeResult = await musicPlayer.crossfadeTo(track.previewUrl, musicTrack);
      success = crossfadeResult.success;
      usedCrossfade = true;
    } else {
      // Normal play (nothing was playing before)
      log.debug('Step 4: Calling playFromUrl', { previewUrl: track.previewUrl });
      success = await musicPlayer.playFromUrl(track.previewUrl, musicTrack);
    }

    log.debug('Play returned', { success, usedCrossfade });

    if (!success) {
      log.error({ track: track.name }, '🎵 [iTunes] playFromUrl returned false!');
      return 'Had trouble playing that. Let me try again in a moment.';
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
      outro = Math.random() < 0.2 
        ? ` ${getDancingComment()}`
        : ` ${getPlayfulMusicComment()}`;
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
  const musicPlayer = getMusicPlayer();
  const musicTrack: MusicTrack = {
    name: result.track.name,
    artist: result.track.artist,
    previewUrl: result.track.previewUrl,
    duration: result.track.duration,
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
      description: `Play music! Works for everyone - no subscription needed.
Use when user asks to:
- Play a song, artist, or genre
- "Put on some music"
- "Play something"
- "Let me hear [song]"

Plays a 30-second preview that everyone can enjoy.
Users with Spotify linked get full tracks.`,
      parameters: z.object({
        query: z.string().describe('Song name, artist, genre, or search query'),
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
          return `I had trouble playing "${query}". Let me try again in a moment.`;
        }
      },
    }),

    searchMusic: llm.tool({
      description: `Search for songs without playing them.
Use when user asks "what songs by..." or wants to browse options.`,
      parameters: z.object({
        query: z.string().describe('Search query'),
        limit: z.number().optional().describe('Number of results (default 5)'),
      }),
      execute: async ({ query, limit }) => {
        return searchMusic(query, limit || 5);
      },
    }),

    suggestMusic: llm.tool({
      description: `Suggest and play music based on mood or activity.
Use when user says "put on something relaxing" or asks for recommendations.`,
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
      description: `Pause the currently playing music.
Use when user says "stop", "pause", "quiet", etc.`,
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
      description: `Resume paused music.
Use when user says "continue", "resume", "play again".`,
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
      description: `Stop music completely and clear the queue.
Use when user wants to move on or says "no more music".`,
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
      description: `Adjust music volume.
Use when user says "turn it up", "quieter", "volume".`,
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
      description: `Check what's currently playing.
Use when user asks "what song is this?", "what's playing?"`,
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
      description: `Switch to Spotify for full songs (requires linked account).
Use when user asks to "use Spotify" or "play full songs".`,
      parameters: z.object({}),
      execute: async () => {
        if (!musicConfig.spotifyLinked) {
          return "Spotify isn't linked yet. For now, I'll play 30-second previews that work for everyone!";
        }

        setMusicSource('spotify');
        return "Switched to Spotify! I'll play full songs from your library now.";
      },
    }),

    useFreePreviews: llm.tool({
      description: `Switch back to free 30-second previews (works for everyone).
Use when user says "use previews" or doesn't have Spotify.`,
      parameters: z.object({}),
      execute: async () => {
        setMusicSource('itunes');
        return 'Using free previews now - works without any subscriptions!';
      },
    }),

    discoverMusic: llm.tool({
      description: `Offer to introduce the user to new music they might not have heard.
Use when:
- User seems open to suggestions
- Conversation naturally leads to music discovery
- User asks "play me something new" or "surprise me"`,
      parameters: z.object({
        personaId: z.string().optional().describe('Current persona ID for style'),
      }),
      execute: async ({ personaId }) => {
        const offer = getMusicDiscoveryOffer(personaId || 'ferni');
        return `${offer} I could play something from an artist you might not know, or a hidden gem in a genre you like.`;
      },
    }),

    keepVibeGoing: llm.tool({
      description: `Offer to continue playing similar music after a track ends.
Use when a track finishes and you want to maintain the mood.`,
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

/**
 * Entertainment Domain Tools
 *
 * Tools for music playback and media.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: entertainment
 * TOOLS:
 *   Music Playback: playMusic, pauseMusic, resumeMusic, skipSong, setMusicVolume
 *   Music Discovery: searchMusic, suggestMusic, tellMeAboutThisMusic
 *   Music Status: whatsPlaying, getMusicStatus, checkSpotifyHealth
 *   Call Music: playPreview, pauseCallMusic, resumeCallMusic, stopCallMusic
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, ExternalService } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';

// Import legacy tool creators
import { createMusicTools } from './music.js';
import { createSpotifyTools } from './spotify.js';

// Import Apple Music tools
import { appleMusicTools } from './apple-music-tools.js';

// Import Spotify Connect multi-room tools
import { spotifyConnectTools } from './spotify-connect.js';

// Import movie tools
import { createMovieTools } from './movies.js';

// Import Sonos music tools
import { createSonosMusicTools } from './sonos-music.js';

const log = getLogger();

// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================

function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  options?: {
    tags?: string[];
    requiredServices?: ExternalService[];
  }
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'entertainment',
    tags: ['entertainment', 'music', ...(options?.tags || [])],
    requiredServices: options?.requiredServices,
    create: (_ctx: ToolContext) => legacyTool as any,
  };
}

// ============================================================================
// UNIFIED MUSIC TOOLS (Consolidated: 10 → 4 essential tools)
// These work for everyone - free 30-second previews via iTunes by default!
// ============================================================================

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getMusicPlayer } from '../../../audio/index.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

/**
 * Create a proper musicControl tool that dispatches based on action.
 * This fixes the bug where calling musicControl with action="stop" would only pause.
 */
function createMusicControlTool(legacyTools: ReturnType<typeof createMusicTools>) {
  return llm.tool({
    description:
      getToolDescription('musicControl') ||
      'Control music playback: pause, resume, stop, skip, or adjust volume. Actions: "pause", "resume", "stop", "skip", or "volume" (with level 0-100).',
    parameters: z.object({
      action: z
        .enum(['pause', 'resume', 'stop', 'skip', 'volume'])
        .describe('The action to perform'),
      level: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe('Volume level (0-100), only used when action is "volume"'),
    }),
    execute: async ({ action, level }) => {
      log.info({ action, level }, '🎵 TOOL: musicControl CALLED');

      try {
        switch (action) {
          case 'pause': {
            const musicPlayer = getMusicPlayer();
            const currentTrack = musicPlayer.getCurrentTrack();
            musicPlayer.pause();
            log.info({ action, track: currentTrack?.name }, '🎵 TOOL: musicControl - paused');

            if (currentTrack) {
              const pauseResponses = [
                `Pausing "${currentTrack.name}". <break time="200ms"/>Just say the word when you want it back.`,
                `Okay, putting "${currentTrack.name}" on hold. <break time="150ms"/>It'll be here when you're ready.`,
                `"${currentTrack.name}" on pause. <break time="200ms"/>Good song, by the way.`,
              ];
              return pauseResponses[Math.floor(Math.random() * pauseResponses.length)];
            }
            return 'Music paused. <break time="200ms"/>It\'s quiet now.';
          }

          case 'resume': {
            const musicPlayer = getMusicPlayer();
            const currentTrack = musicPlayer.getCurrentTrack();

            if (!currentTrack) {
              log.info({ action }, '🎵 TOOL: musicControl - nothing to resume');
              return 'Nothing to resume right now. <break time="200ms"/>Want me to put something on?';
            }

            await musicPlayer.resume();
            log.info({ action, track: currentTrack.name }, '🎵 TOOL: musicControl - resumed');

            const resumeResponses = [
              `And we're back! <break time="150ms"/>"${currentTrack.name}" resuming.`,
              `Where were we... <break time="200ms"/>ah yes, "${currentTrack.name}"!`,
              `Picking up "${currentTrack.name}" right where we left off.`,
            ];
            return resumeResponses[Math.floor(Math.random() * resumeResponses.length)];
          }

          case 'stop': {
            const musicPlayer = getMusicPlayer();
            const wasPlaying = musicPlayer.getCurrentTrack();
            musicPlayer.stop();
            log.info({ action, wasPlaying: wasPlaying?.name }, '🎵 TOOL: musicControl - stopped');

            if (wasPlaying) {
              const stopResponses = [
                'Alright, music\'s off. <break time="200ms"/>What else can I help you with?',
                'Music stopped. <break time="200ms"/>Okay, back to business. What\'s on your mind?',
                'Done with the tunes. <break time="200ms"/>I\'m all ears now.',
              ];
              return stopResponses[Math.floor(Math.random() * stopResponses.length)];
            }
            return 'Music stopped. <break time="200ms"/>What would you like to talk about?';
          }

          case 'skip': {
            const musicPlayer = getMusicPlayer();
            musicPlayer.skip(); // skip() returns void, triggers onTrackEnded

            // Wait a moment for the next track to start
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 100);
            });

            const nextTrack = musicPlayer.getCurrentTrack();
            log.info({ action, nextTrack: nextTrack?.name }, '🎵 TOOL: musicControl - skipped');

            if (nextTrack) {
              return `Skipping ahead... <break time="200ms"/>Now playing "${nextTrack.name}" by ${nextTrack.artist}.`;
            }
            return 'That was the last track in the queue. <break time="200ms"/>Want me to play something else?';
          }

          case 'volume': {
            const musicPlayer = getMusicPlayer();
            const volumeLevel = level ?? 50;
            musicPlayer.setVolume(volumeLevel / 100);
            log.info({ action, level: volumeLevel }, '🎵 TOOL: musicControl - volume set');

            if (volumeLevel >= 80) {
              return `Volume at ${volumeLevel}%! <break time="150ms"/>Now we're talking!`;
            } else if (volumeLevel <= 20) {
              return `Volume down to ${volumeLevel}%. <break time="200ms"/>Nice and subtle.`;
            }
            return `Volume set to ${volumeLevel}%. <break time="150ms"/>Perfect.`;
          }

          default:
            log.warn({ action }, '🎵 TOOL: musicControl - unknown action');
            return `I'm not sure how to "${action}" the music. Try pause, resume, stop, skip, or volume.`;
        }
      } catch (error) {
        log.error({ action, error: String(error) }, '🎵 TOOL: musicControl ERROR');
        return `Hmm, couldn't ${action} the music right now. Let me try again?`;
      }
    },
  });
}

/**
 * Create a proper musicInfo tool that dispatches based on action.
 */
function createMusicInfoTool(legacyTools: ReturnType<typeof createMusicTools>) {
  return llm.tool({
    description:
      getToolDescription('musicInfo') ||
      'Get info about current music: what\'s playing now, or get suggestions for a mood/activity. Actions: "playing" (current track info) or "suggest" (recommendations based on mood).',
    parameters: z.object({
      action: z.enum(['playing', 'suggest']).describe('The action to perform'),
      mood: z
        .string()
        .optional()
        .describe('Mood or activity for suggestions (e.g., "relaxing", "workout", "focus")'),
    }),
    execute: async ({ action, mood }) => {
      log.info({ action, mood }, '🎵 TOOL: musicInfo CALLED');

      try {
        if (action === 'playing') {
          const musicPlayer = getMusicPlayer();
          const state = musicPlayer.getState();

          if (state.isPlaying && state.currentTrack) {
            return `This is "${state.currentTrack.name}" by ${state.currentTrack.artist}. <break time="150ms"/>Good one, right?`;
          }

          if (state.currentTrack) {
            return `"${state.currentTrack.name}" by ${state.currentTrack.artist} is paused. <break time="200ms"/>Want me to resume it?`;
          }

          return 'Nothing\'s playing right now. <break time="200ms"/>Want me to set the mood?';
        }

        if (action === 'suggest') {
          const moodText = mood || 'relaxing';
          // Use the legacy suggestMusic tool - pass empty context as second arg
          const result = await legacyTools.suggestMusic.execute(
            { mood: moodText },
            {} as Parameters<typeof legacyTools.suggestMusic.execute>[1]
          );
          return result;
        }

        return "Let me check what's playing for you.";
      } catch (error) {
        log.error({ action, error: String(error) }, '🎵 TOOL: musicInfo ERROR');
        return "Couldn't get that info right now. What else can I help with?";
      }
    },
  });
}

function getUnifiedMusicToolDefinitions(): ToolDefinition[] {
  log.info('🎵 [DIAG] getUnifiedMusicToolDefinitions() called - creating music tools');

  const legacyTools = createMusicTools();

  const toolNames = Object.keys(legacyTools);
  log.info(
    { toolCount: toolNames.length, tools: toolNames },
    '🎵 [DIAG] Legacy music tools created'
  );

  // Consolidated: playMusic is main entry, musicControl for pause/resume/stop/volume,
  // musicInfo for status/suggestions
  const definitions: ToolDefinition[] = [
    wrapLegacyTool(
      'playMusic',
      'Play Music',
      'Play music by song, artist, genre, or mood. Searches music catalog and starts playback. Returns track information and playback status.',
      legacyTools.playMusic,
      { tags: ['playback', 'primary', 'search', 'suggestions'] }
    ),
    // FIXED: musicControl now properly dispatches based on action parameter
    {
      id: 'musicControl',
      name: 'Music Control',
      description:
        'Control music playback: pause, resume, stop, skip, or adjust volume. Actions: "pause", "resume", "stop", "skip", or "volume" (with level 0-100).',
      domain: 'entertainment',
      tags: ['entertainment', 'music', 'playback', 'pause', 'resume', 'stop', 'volume'],
      create: (_ctx: ToolContext) => createMusicControlTool(legacyTools),
    },
    // FIXED: musicInfo now properly dispatches based on action parameter
    {
      id: 'musicInfo',
      name: 'Music Info',
      description:
        'Get info about current music: what\'s playing now, or get suggestions for a mood/activity. Actions: "playing" (current track info) or "suggest" (recommendations based on mood).',
      domain: 'entertainment',
      tags: ['entertainment', 'music', 'status', 'suggestions', 'info'],
      create: (_ctx: ToolContext) => createMusicInfoTool(legacyTools),
    },
    wrapLegacyTool(
      'musicProvider',
      'Music Provider',
      'Switch between music providers. Actions: "spotify" (requires Premium account for full songs) or "free" (30-second previews, works for everyone).',
      legacyTools.useSpotify,
      { tags: ['provider', 'spotify', 'free'] }
    ),
  ];

  log.info(
    { definitionCount: definitions.length, ids: definitions.map((d) => d.id) },
    '🎵 [DIAG] Unified music tool definitions created'
  );

  return definitions;
}

// ============================================================================
// SPOTIFY-SPECIFIC TOOLS (Consolidated: 12 → 3 essential tools)
// Advanced features for users with linked Spotify Premium
// ============================================================================

function getSpotifyToolDefinitions(): ToolDefinition[] {
  log.info('🎵 [DIAG] getSpotifyToolDefinitions() called');

  const legacyTools = createSpotifyTools();

  const toolNames = Object.keys(legacyTools);
  log.info(
    { toolCount: toolNames.length, tools: toolNames },
    '🎵 [DIAG] Legacy Spotify tools created'
  );

  // Consolidated: spotifyAdvanced for transfer/search/details, callMusic for in-call audio,
  // spotifyStatus for health/status
  const definitions: ToolDefinition[] = [
    wrapLegacyTool(
      'spotifyAdvanced',
      'Spotify Advanced',
      'Advanced Spotify features: transfer playback to another device, search Spotify library, skip songs, or get detailed info about current song/artist/album. Actions: "transfer", "search", "skip", or "details". Requires linked Spotify Premium.',
      legacyTools.transferMusic,
      { tags: ['spotify', 'transfer', 'search', 'skip', 'details'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'callMusic',
      'Call Music',
      'Play background music during voice calls: play preview clips, pause, resume, stop, or adjust volume. Actions: "play", "pause", "resume", "stop", or "volume". Great for hold music or ambiance.',
      legacyTools.playPreview,
      { tags: ['call', 'preview', 'background', 'ambient'] }
    ),
    wrapLegacyTool(
      'spotifyStatus',
      'Spotify Status',
      'Check Spotify connection status and health. Returns current playback state, linked account info, and connection health.',
      legacyTools.checkSpotifyHealth,
      { tags: ['spotify', 'status', 'health'], requiredServices: ['spotify'] }
    ),
  ];

  log.info(
    { definitionCount: definitions.length, ids: definitions.map((d) => d.id) },
    '🎵 [DIAG] Spotify tool definitions created'
  );

  return definitions;
}

// ============================================================================
// SONOS MUSIC TOOLS
// ============================================================================

function getSonosMusicToolDefinitions(): ToolDefinition[] {
  return [
    {
      id: 'playSonosMusic',
      name: 'Play Music on Sonos',
      description:
        'Play music on Sonos speakers by searching favorites. Use when user says "play jazz on Sonos", "play music in living room", etc.',
      domain: 'entertainment',
      tags: ['sonos', 'music', 'playback', 'smart-home'],
      requiredServices: ['sonos'],
      create: (ctx: ToolContext) => {
        const tools = createSonosMusicTools(ctx.userId);
        return tools.playSonosMusic;
      },
    },
    {
      id: 'playSonosFavorite',
      name: 'Play Sonos Favorite',
      description: 'Play a specific Sonos favorite by name.',
      domain: 'entertainment',
      tags: ['sonos', 'music', 'favorites'],
      requiredServices: ['sonos'],
      create: (ctx: ToolContext) => {
        const tools = createSonosMusicTools(ctx.userId);
        return tools.playSonosFavorite;
      },
    },
    {
      id: 'pauseSonos',
      name: 'Pause Sonos',
      description: 'Pause music playback on Sonos speakers.',
      domain: 'entertainment',
      tags: ['sonos', 'music', 'control'],
      requiredServices: ['sonos'],
      create: (ctx: ToolContext) => {
        const tools = createSonosMusicTools(ctx.userId);
        return tools.pauseSonos;
      },
    },
    {
      id: 'resumeSonos',
      name: 'Resume Sonos',
      description: 'Resume paused music on Sonos speakers.',
      domain: 'entertainment',
      tags: ['sonos', 'music', 'control'],
      requiredServices: ['sonos'],
      create: (ctx: ToolContext) => {
        const tools = createSonosMusicTools(ctx.userId);
        return tools.resumeSonos;
      },
    },
    {
      id: 'setSonosVolume',
      name: 'Set Sonos Volume',
      description: 'Set volume level on Sonos speakers.',
      domain: 'entertainment',
      tags: ['sonos', 'volume', 'control'],
      requiredServices: ['sonos'],
      create: (ctx: ToolContext) => {
        const tools = createSonosMusicTools(ctx.userId);
        return tools.setSonosVolume;
      },
    },
    {
      id: 'whatsSonosPlaying',
      name: "What's Playing on Sonos",
      description: 'Check what music is currently playing on Sonos.',
      domain: 'entertainment',
      tags: ['sonos', 'status'],
      requiredServices: ['sonos'],
      create: (ctx: ToolContext) => {
        const tools = createSonosMusicTools(ctx.userId);
        return tools.whatsSonosPlaying;
      },
    },
    {
      id: 'setSonosRoom',
      name: 'Set Default Sonos Room',
      description: 'Set the default Sonos room for music playback.',
      domain: 'entertainment',
      tags: ['sonos', 'room', 'config'],
      requiredServices: ['sonos'],
      create: (ctx: ToolContext) => {
        const tools = createSonosMusicTools(ctx.userId);
        return tools.setSonosRoom;
      },
    },
    {
      id: 'listSonosRooms',
      name: 'List Sonos Rooms',
      description: 'List all available Sonos rooms and speakers.',
      domain: 'entertainment',
      tags: ['sonos', 'rooms', 'discovery'],
      requiredServices: ['sonos'],
      create: (ctx: ToolContext) => {
        const tools = createSonosMusicTools(ctx.userId);
        return tools.listSonosRooms;
      },
    },
    {
      id: 'searchSonosFavorites',
      name: 'Search Sonos Favorites',
      description: "Search the user's Sonos favorites.",
      domain: 'entertainment',
      tags: ['sonos', 'favorites', 'search'],
      requiredServices: ['sonos'],
      create: (ctx: ToolContext) => {
        const tools = createSonosMusicTools(ctx.userId);
        return tools.searchSonosFavorites;
      },
    },
  ];
}

// ============================================================================
// MOVIE TOOLS
// ============================================================================

function getMovieToolDefinitions(): ToolDefinition[] {
  const legacyTools = createMovieTools();

  return [
    wrapLegacyTool(
      'getMovieInfo',
      'Get Movie Info',
      'Get information about a specific movie including rating, runtime, genres, and description.',
      legacyTools.getMovieInfo,
      { tags: ['movie', 'film', 'info'] }
    ),
    wrapLegacyTool(
      'getMoviesNowPlaying',
      'Movies Now Playing',
      'Get a list of movies currently playing in theaters.',
      legacyTools.getMoviesNowPlaying,
      { tags: ['movie', 'theater', 'now playing'] }
    ),
    wrapLegacyTool(
      'getUpcomingMovies',
      'Upcoming Movies',
      'Get a list of upcoming movies coming to theaters soon.',
      legacyTools.getUpcomingMovies,
      { tags: ['movie', 'upcoming', 'coming soon'] }
    ),
    wrapLegacyTool(
      'getMovieShowtimes',
      'Movie Showtimes',
      'Get showtime information for a movie in a specific location.',
      legacyTools.getMovieShowtimes,
      { tags: ['movie', 'showtimes', 'theater'] }
    ),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

log.info('🎵 [DIAG] Building entertainmentTools array...');

// FIX (Jan 2026): Wrap tool creation in try-catch to prevent partial loading failures
// If one tool creator fails, the whole domain would be empty, breaking native function calling
const entertainmentTools: ToolDefinition[] = [];

try {
  const unifiedTools = getUnifiedMusicToolDefinitions();
  entertainmentTools.push(...unifiedTools);
  log.info({ count: unifiedTools.length, ids: unifiedTools.map((t) => t.id) }, '🎵 [DIAG] Unified music tools loaded');
} catch (err) {
  log.error({ error: String(err) }, '🚨 CRITICAL: Failed to load unified music tools (playMusic, etc.)');
  process.stderr.write(`\n🚨 CRITICAL: Unified music tools failed to load: ${err}\n`);
}

try {
  const spotifyTools = getSpotifyToolDefinitions();
  entertainmentTools.push(...spotifyTools);
  log.debug({ count: spotifyTools.length }, '🎵 Spotify tools loaded');
} catch (err) {
  log.warn({ error: String(err) }, '⚠️ Spotify tools failed to load (non-critical)');
}

try {
  entertainmentTools.push(...spotifyConnectTools);
  log.debug({ count: spotifyConnectTools.length }, '🎵 Spotify Connect tools loaded');
} catch (err) {
  log.warn({ error: String(err) }, '⚠️ Spotify Connect tools failed to load');
}

try {
  entertainmentTools.push(...appleMusicTools);
  log.debug({ count: appleMusicTools.length }, '🎵 Apple Music tools loaded');
} catch (err) {
  log.warn({ error: String(err) }, '⚠️ Apple Music tools failed to load');
}

try {
  const sonosTools = getSonosMusicToolDefinitions();
  entertainmentTools.push(...sonosTools);
  log.debug({ count: sonosTools.length }, '🎵 Sonos tools loaded');
} catch (err) {
  log.warn({ error: String(err) }, '⚠️ Sonos tools failed to load');
}

try {
  const movieTools = getMovieToolDefinitions();
  entertainmentTools.push(...movieTools);
  log.debug({ count: movieTools.length }, '🎵 Movie tools loaded');
} catch (err) {
  log.warn({ error: String(err) }, '⚠️ Movie tools failed to load');
}

// Verify critical music tools are present
const criticalMusicTools = ['playMusic', 'musicControl', 'musicInfo'];
const missingCritical = criticalMusicTools.filter(
  (id) => !entertainmentTools.some((t) => t.id === id)
);
if (missingCritical.length > 0) {
  log.error(
    { missingCritical, loadedTools: entertainmentTools.map((t) => t.id) },
    '🚨 CRITICAL: Core music tools missing from entertainment domain!'
  );
  process.stderr.write(
    `\n🚨 CRITICAL: Missing music tools: ${missingCritical.join(', ')}\n` +
      `Loaded tools: ${entertainmentTools.map((t) => t.id).join(', ')}\n\n`
  );
}

log.info(
  {
    totalTools: entertainmentTools.length,
    toolIds: entertainmentTools.map((t) => t.id),
  },
  '🎵 [DIAG] Entertainment domain tools built'
);

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'entertainment',
  entertainmentTools
);

export {
  getUnifiedMusicToolDefinitions,
  getSpotifyToolDefinitions,
  getSonosMusicToolDefinitions,
  getMovieToolDefinitions,
};

export default getToolDefinitions;

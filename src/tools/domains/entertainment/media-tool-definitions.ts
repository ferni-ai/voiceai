/**
 * Spotify, Sonos and movie tool definitions.
 * Extracted from entertainment/index.ts.
 */

import type { ToolDefinition, ToolContext } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { createSpotifyTools } from './spotify.js';
import { createMovieTools } from './movies.js';
import { createSonosMusicTools } from './sonos-music.js';
import { wrapLegacyTool } from './legacy-tool-wrapper.js';

const log = getLogger();

// ============================================================================
// SPOTIFY-SPECIFIC TOOLS (Consolidated: 12 → 3 essential tools)
// Advanced features for users with linked Spotify Premium
// ============================================================================

export function getSpotifyToolDefinitions(): ToolDefinition[] {
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

export function getSonosMusicToolDefinitions(): ToolDefinition[] {
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

export function getMovieToolDefinitions(): ToolDefinition[] {
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

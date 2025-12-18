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
import { createSpotifyTools } from '../../spotify.js';

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
      'Play music by song, artist, genre, or mood. Works for everyone with free 30-second previews. Examples: "play some jazz", "play Taylor Swift", "put on relaxing music", "play Happy by Pharrell". If user has Spotify Premium linked, plays full songs.',
      legacyTools.playMusic,
      { tags: ['playback', 'primary', 'search', 'suggestions'] }
    ),
    wrapLegacyTool(
      'musicControl',
      'Music Control',
      'Control music playback: pause, resume, stop, skip, or adjust volume. Actions: "pause", "resume", "stop", "skip", or "volume" (with level 0-100).',
      legacyTools.pauseMusic,
      { tags: ['playback', 'pause', 'resume', 'stop', 'volume'] }
    ),
    wrapLegacyTool(
      'musicInfo',
      'Music Info',
      'Get info about current music: what\'s playing now, or get suggestions for a mood/activity. Actions: "playing" (current track info) or "suggest" (recommendations based on mood).',
      legacyTools.whatsPlaying,
      { tags: ['status', 'suggestions', 'info'] }
    ),
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
// DOMAIN TOOLS COLLECTION
// ============================================================================

log.info('🎵 [DIAG] Building entertainmentTools array...');

const entertainmentTools: ToolDefinition[] = [
  ...getUnifiedMusicToolDefinitions(), // PRIMARY: iTunes-based, works for everyone
  ...getSpotifyToolDefinitions(), // SECONDARY: Spotify-specific tools
];

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

export { getUnifiedMusicToolDefinitions, getSpotifyToolDefinitions };

export default getToolDefinitions;

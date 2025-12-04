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

// Import legacy tool creators
import { createMusicTools } from '../../music.js';
import { createSpotifyTools } from '../../spotify.js';

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
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// SIMPLE MUSIC TOOLS (from music.ts - free previews)
// ============================================================================

function getBasicMusicToolDefinitions(): ToolDefinition[] {
  const legacyTools = createMusicTools();

  return [
    wrapLegacyTool(
      'playMusicBasic',
      'Play Music (Basic)',
      'Play music using free preview feature',
      legacyTools.playMusic,
      { tags: ['playback', 'basic'] }
    ),
    wrapLegacyTool(
      'searchMusicBasic',
      'Search Music (Basic)',
      'Search for music',
      legacyTools.searchMusic,
      { tags: ['search', 'basic'] }
    ),
    wrapLegacyTool(
      'suggestMusicBasic',
      'Suggest Music (Basic)',
      'Get music suggestions based on mood or activity',
      legacyTools.suggestMusic,
      { tags: ['suggestions', 'basic'] }
    ),
    wrapLegacyTool(
      'pauseMusicBasic',
      'Pause Music (Basic)',
      'Pause currently playing music',
      legacyTools.pauseMusic,
      { tags: ['playback', 'pause', 'basic'] }
    ),
    wrapLegacyTool(
      'resumeMusicBasic',
      'Resume Music (Basic)',
      'Resume paused music',
      legacyTools.resumeMusic,
      { tags: ['playback', 'resume', 'basic'] }
    ),
    wrapLegacyTool(
      'stopMusicBasic',
      'Stop Music (Basic)',
      'Stop playing music',
      legacyTools.stopMusic,
      { tags: ['playback', 'stop', 'basic'] }
    ),
    wrapLegacyTool(
      'setMusicVolumeBasic',
      'Set Music Volume (Basic)',
      'Adjust the music volume',
      legacyTools.setMusicVolume,
      { tags: ['playback', 'volume', 'basic'] }
    ),
    wrapLegacyTool(
      'whatsPlayingBasic',
      'What\'s Playing (Basic)',
      'Get information about the currently playing track',
      legacyTools.whatsPlaying,
      { tags: ['status', 'basic'] }
    ),
    wrapLegacyTool(
      'useSpotify',
      'Use Spotify',
      'Switch to using Spotify for music playback',
      legacyTools.useSpotify,
      { tags: ['provider', 'spotify'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'useFreePreviews',
      'Use Free Previews',
      'Switch to using free preview music',
      legacyTools.useFreePreviews,
      { tags: ['provider', 'free'] }
    ),
  ];
}

// ============================================================================
// SPOTIFY TOOLS (from spotify.ts - full Spotify integration)
// ============================================================================

function getSpotifyToolDefinitions(): ToolDefinition[] {
  const legacyTools = createSpotifyTools();

  return [
    wrapLegacyTool(
      'playMusic',
      'Play Music',
      'Play music on Spotify',
      legacyTools.playMusic,
      { tags: ['playback', 'spotify'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'searchMusic',
      'Search Music',
      'Search for music on Spotify',
      legacyTools.searchMusic,
      { tags: ['search', 'spotify'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'pauseMusic',
      'Pause Music',
      'Pause Spotify playback',
      legacyTools.pauseMusic,
      { tags: ['playback', 'pause', 'spotify'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'resumeMusic',
      'Resume Music',
      'Resume Spotify playback',
      legacyTools.resumeMusic,
      { tags: ['playback', 'resume', 'spotify'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'skipSong',
      'Skip Song',
      'Skip to the next song',
      legacyTools.skipSong,
      { tags: ['playback', 'skip', 'spotify'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'whatsPlaying',
      'What\'s Playing',
      'Get information about the currently playing Spotify track',
      legacyTools.whatsPlaying,
      { tags: ['status', 'spotify'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'setMusicVolume',
      'Set Music Volume',
      'Adjust Spotify playback volume',
      legacyTools.setMusicVolume,
      { tags: ['playback', 'volume', 'spotify'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'suggestMusic',
      'Suggest Music',
      'Get Spotify music suggestions based on mood, activity, or preferences',
      legacyTools.suggestMusic,
      { tags: ['suggestions', 'spotify'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'tellMeAboutThisMusic',
      'Tell Me About This Music',
      'Get information about the current song, artist, or album',
      legacyTools.tellMeAboutThisMusic,
      { tags: ['info', 'spotify'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'playPreview',
      'Play Preview',
      'Play a preview clip of a song',
      legacyTools.playPreview,
      { tags: ['playback', 'preview'] }
    ),
    wrapLegacyTool(
      'pauseCallMusic',
      'Pause Call Music',
      'Pause background music during a call',
      legacyTools.pauseCallMusic,
      { tags: ['call', 'pause'] }
    ),
    wrapLegacyTool(
      'resumeCallMusic',
      'Resume Call Music',
      'Resume background music during a call',
      legacyTools.resumeCallMusic,
      { tags: ['call', 'resume'] }
    ),
    wrapLegacyTool(
      'stopCallMusic',
      'Stop Call Music',
      'Stop background music during a call',
      legacyTools.stopCallMusic,
      { tags: ['call', 'stop'] }
    ),
    wrapLegacyTool(
      'setCallMusicVolume',
      'Set Call Music Volume',
      'Adjust background music volume during a call',
      legacyTools.setCallMusicVolume,
      { tags: ['call', 'volume'] }
    ),
    wrapLegacyTool(
      'transferMusic',
      'Transfer Music',
      'Transfer music playback to another device',
      legacyTools.transferMusic,
      { tags: ['transfer', 'spotify'], requiredServices: ['spotify'] }
    ),
    wrapLegacyTool(
      'getMusicStatus',
      'Get Music Status',
      'Get current music playback status',
      legacyTools.getMusicStatus,
      { tags: ['status'] }
    ),
    wrapLegacyTool(
      'checkSpotifyHealth',
      'Check Spotify Health',
      'Check if Spotify connection is healthy',
      legacyTools.checkSpotifyHealth,
      { tags: ['health', 'spotify'], requiredServices: ['spotify'] }
    ),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const entertainmentTools: ToolDefinition[] = [
  ...getBasicMusicToolDefinitions(),
  ...getSpotifyToolDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'entertainment',
  entertainmentTools
);

export {
  getBasicMusicToolDefinitions,
  getSpotifyToolDefinitions,
};

export default getToolDefinitions;


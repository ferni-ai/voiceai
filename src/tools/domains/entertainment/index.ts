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
import type { ToolDefinition, ToolContext } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { setSpotifyUser } from '../../../services/identity/spotify-linked-tokens.js';

// Import Apple Music tools
import { appleMusicTools } from './apple-music-tools.js';

// Import Spotify Connect multi-room tools
import { spotifyConnectTools } from './spotify-connect.js';

// Tool definition builders (split out of this file)
import { getUnifiedMusicToolDefinitions } from './unified-music-tools.js';
import {
  getMovieToolDefinitions,
  getSonosMusicToolDefinitions,
  getSpotifyToolDefinitions,
} from './media-tool-definitions.js';

const log = getLogger();

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

// Tools are created per session/turn with the caller's context: bind that user
// so Spotify calls use their own linked account (global token only as fallback).
const userBoundEntertainmentTools: ToolDefinition[] = entertainmentTools.map((def) => ({
  ...def,
  create: (ctx: ToolContext) => {
    void setSpotifyUser(ctx.userId);
    return def.create(ctx);
  },
}));

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'entertainment',
  userBoundEntertainmentTools
);

export {
  getUnifiedMusicToolDefinitions,
  getSpotifyToolDefinitions,
  getSonosMusicToolDefinitions,
  getMovieToolDefinitions,
};

export default getToolDefinitions;

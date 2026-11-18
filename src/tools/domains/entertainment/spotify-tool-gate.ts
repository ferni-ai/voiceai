/**
 * Spotify-only tools leave the toolset while the house Spotify is down
 * (SPOTIFY_TOOLS_HIDE_WHEN_DOWN).
 *
 * The house refresh token has been revoked since 2026-10-22, yet the tools
 * that only work through Spotify (Connect rooms, device transfer, in-call
 * Spotify previews, Spotify status) were still offered on every call, and
 * playMusicInRoom is essential, so it kept a tool-cap slot. With the flag on,
 * while the token is revoked or none is configured, the registry does not hold
 * them, so no session path offers them. The music tools that play iTunes
 * previews without Spotify stay (playMusic, musicControl, musicInfo,
 * musicProvider), and say Spotify isn't connected under
 * MUSIC_HONEST_WHEN_UNLINKED (music-honesty.ts).
 *
 * No polling: the registry follows Spotify's state when spotify-auth reports
 * a revoked token or a newly stored one. A refresh that merely failed hides
 * nothing, since it may recover.
 *
 * @module tools/domains/entertainment/spotify-tool-gate
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { toolRegistry, type ToolRegistry } from '../../registry/index.js';
import type { ToolDefinition } from '../../registry/types.js';
import { spotifyDownReason, type SpotifyDownReason } from './music-honesty.js';

/** Tools that can do nothing without a working house Spotify token. */
const SPOTIFY_ONLY_TOOL_IDS: ReadonlySet<string> = new Set([
  'spotifyAdvanced',
  'callMusic',
  'spotifyStatus',
  'playMusicInRoom',
  'transferToRoom',
  'setRoomVolume',
  'listMusicRooms',
  'syncMusicRooms',
  'discoverSpotifyDevices',
]);

function hideSpotifyToolsWhenDownOn(env: Env = process.env): boolean {
  return flagOn('SPOTIFY_TOOLS_HIDE_WHEN_DOWN', env);
}

/** Why the Spotify-only tools are hidden, or null to offer them (flag off, or Spotify up). */
function spotifyToolsHiddenReason(env: Env = process.env): SpotifyDownReason | null {
  return hideSpotifyToolsWhenDownOn(env) ? spotifyDownReason() : null;
}

/** The same definitions; the registry refuses a Spotify-only one while hidden (tool-availability.ts). */
export function gateSpotifyOnlyTools(defs: ToolDefinition[]): ToolDefinition[] {
  return defs.map((def) => {
    if (!SPOTIFY_ONLY_TOOL_IDS.has(def.id)) return def;
    const ownCheck = def.availableWhen;
    return {
      ...def,
      availableWhen: () => (ownCheck?.() ?? true) && spotifyToolsHiddenReason() === null,
    };
  });
}

type Registry = Pick<ToolRegistry, 'register' | 'unregister'>;
let hiddenFor: SpotifyDownReason | null = null;

/**
 * Brings the registry in line with Spotify's state: the Spotify-only tools are
 * unregistered while hidden and registered again once Spotify is up. Logs once
 * per state change, never per call.
 */
export function syncSpotifyOnlyTools(
  defs: readonly ToolDefinition[],
  registry: Registry = toolRegistry
): void {
  if (!hideSpotifyToolsWhenDownOn()) return;
  const spotifyOnly = defs.filter((def) => SPOTIFY_ONLY_TOOL_IDS.has(def.id));
  const reason = spotifyDownReason();
  if (reason === null) {
    if (hiddenFor === null) return;
    hiddenFor = null;
    for (const def of spotifyOnly) registry.register(def);
    getLogger().info({ toolCount: spotifyOnly.length }, 'SPOTIFY_TOOLS_RESTORED');
    return;
  }
  for (const def of spotifyOnly) registry.unregister(def.id);
  if (hiddenFor === reason) return;
  hiddenFor = reason;
  getLogger().info({ reason, toolCount: spotifyOnly.length }, 'SPOTIFY_TOOLS_HIDDEN');
}

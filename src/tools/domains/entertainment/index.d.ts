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
import type { ToolDefinition } from '../../registry/types.js';
declare function getUnifiedMusicToolDefinitions(): ToolDefinition[];
declare function getSpotifyToolDefinitions(): ToolDefinition[];
declare function getSonosMusicToolDefinitions(): ToolDefinition[];
declare function getMovieToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getUnifiedMusicToolDefinitions, getSpotifyToolDefinitions, getSonosMusicToolDefinitions, getMovieToolDefinitions, };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map
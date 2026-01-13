/**
 * Podcast Domain Tools
 *
 * Tools for podcast discovery and exploration.
 * Uses iTunes Podcast API (free, no auth required).
 *
 * DOMAIN: podcasts
 * TOOLS:
 *   Discovery: searchPodcasts, getPodcastRecommendations
 *   Episodes: getPodcastEpisodes
 *   Trending: getTopPodcasts
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map
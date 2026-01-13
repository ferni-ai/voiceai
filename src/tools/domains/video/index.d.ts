/**
 * Video Domain Tools
 *
 * Tools for YouTube video discovery.
 * Uses YouTube Data API v3 (requires API key).
 *
 * DOMAIN: video
 * TOOLS:
 *   Discovery: searchYouTube, getVideoRecommendations
 *   Trending: getTrendingVideos
 *   Details: getVideoDetails
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map
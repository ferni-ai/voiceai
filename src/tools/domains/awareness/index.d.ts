/**
 * World Awareness Domain Tools
 *
 * Tools that give agents contextual awareness of time, environment, and world state.
 * These make conversations feel more grounded, natural, and contextually relevant.
 *
 * DOMAIN: awareness
 * TOOLS:
 *   Time: getCurrentContext, getTimeAwareness, getSeasonalContext
 *   Environment: getUserContext, getLocationContext
 *   World: getWorldContext, getTodaySignificance
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map
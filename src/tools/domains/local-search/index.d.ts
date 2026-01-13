/**
 * Local Search Tools
 *
 * Find local businesses, restaurants, reviews using Google Places (primary)
 * with Yelp fallback. Users can also explicitly request a specific source.
 *
 * Strategy:
 * - Google Places = Primary (always available via GOOGLE_API_KEY)
 * - Yelp = Fallback + explicit requests (when YELP_API_KEY configured)
 * - User says "check Yelp" or "search Google" → honor explicit preference
 *
 * @module tools/domains/local-search
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
declare const _default: {
    getToolDefinitions: () => Promise<ToolDefinition[]>;
    domain: import("../../registry/types.js").ToolDomain;
    definitions: ToolDefinition[];
};
export default _default;
//# sourceMappingURL=index.d.ts.map
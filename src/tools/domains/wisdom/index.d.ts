/**
 * Wisdom Domain Tools
 *
 * Tools for wisdom, quotes, principles, and educational content.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: wisdom
 * TOOLS:
 *   Quotes: getWisdomQuote, getBogleQuote, getThisDayInHistory
 *   Perspective: getCrashPerspective, explainPrinciple
 */
import type { ToolDefinition } from '../../registry/types.js';
declare function getWisdomToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getWisdomToolDefinitions };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map
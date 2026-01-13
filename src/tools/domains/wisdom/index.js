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
import { createDomainExport } from '../../registry/loader.js';
// Import legacy tool creators
import { createWisdomTools } from './wisdom.js';
// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================
function wrapLegacyTool(id, name, description, legacyTool, tags) {
    return {
        id,
        name,
        description,
        domain: 'wisdom',
        tags: ['wisdom', ...(tags || [])],
        create: (_ctx) => legacyTool,
    };
}
// ============================================================================
// WISDOM TOOLS
// ============================================================================
function getWisdomToolDefinitions() {
    const legacyTools = createWisdomTools();
    return [
        wrapLegacyTool('getWisdomQuote', 'Get Wisdom Quote', 'Get an inspirational quote about investing, money, or life wisdom', legacyTools.getWisdomQuote, ['quotes', 'inspiration']),
        wrapLegacyTool('getBogleQuote', 'Get Bogle Quote', 'Get a quote from John Bogle about investing and life', legacyTools.getBogleQuote, ['quotes', 'bogle', 'investing']),
        wrapLegacyTool('getThisDayInHistory', 'Get This Day in History', 'Get a notable financial or historical event from this day in history', legacyTools.getThisDayInHistory, ['history', 'education']),
        wrapLegacyTool('getCrashPerspective', 'Get Crash Perspective', 'Get historical perspective on market crashes to provide context', legacyTools.getCrashPerspective, ['perspective', 'crashes', 'history']),
    ];
}
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const wisdomTools = getWisdomToolDefinitions();
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('wisdom', wisdomTools);
export { getWisdomToolDefinitions };
export default getToolDefinitions;
//# sourceMappingURL=index.js.map
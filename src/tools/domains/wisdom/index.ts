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
import type { ToolDefinition, ToolContext } from '../../registry/types.js';

// Import legacy tool creators
import { createWisdomTools } from './wisdom.js';

// Merged sub-domain (consolidated from wisdom-intelligence/)
import { wisdomIntelligenceTools } from './intelligence.js';

// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================

function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  tags?: string[]
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'wisdom',
    tags: ['wisdom', ...(tags || [])],
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// WISDOM TOOLS
// ============================================================================

function getWisdomToolDefinitions(): ToolDefinition[] {
  const legacyTools = createWisdomTools();

  return [
    wrapLegacyTool(
      'getWisdomQuote',
      'Get Wisdom Quote',
      'Get an inspirational quote about investing, money, or life wisdom',
      legacyTools.getWisdomQuote,
      ['quotes', 'inspiration']
    ),
    wrapLegacyTool(
      'getBogleQuote',
      'Get Bogle Quote',
      'Get a quote from John Bogle about investing and life',
      legacyTools.getBogleQuote,
      ['quotes', 'bogle', 'investing']
    ),
    wrapLegacyTool(
      'getThisDayInHistory',
      'Get This Day in History',
      'Get a notable financial or historical event from this day in history',
      legacyTools.getThisDayInHistory,
      ['history', 'education']
    ),
    wrapLegacyTool(
      'getCrashPerspective',
      'Get Crash Perspective',
      'Get historical perspective on market crashes to provide context',
      legacyTools.getCrashPerspective,
      ['perspective', 'crashes', 'history']
    ),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const wisdomTools: ToolDefinition[] = [
  ...getWisdomToolDefinitions(),
  ...wisdomIntelligenceTools, // Superhuman wisdom intelligence (merged from wisdom-intelligence/)
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'wisdom',
  wisdomTools
);

export { getWisdomToolDefinitions };

// Re-export merged sub-domain tools
export { wisdomIntelligenceTools } from './intelligence.js';

export default getToolDefinitions;

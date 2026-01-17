/**
 * Tool Deprecation Timeline
 *
 * Tracks deprecated tools and their migration paths.
 * Use this to plan migrations and ensure smooth transitions.
 *
 * @module tools/deprecation-timeline
 *
 * ## CLEANUP STATUS (December 2024)
 *
 * The domain-based tool system (src/tools/domains/) is the canonical source.
 * The legacy createXxxTools() functions are WRAPPED by domain modules
 * for backward compatibility. They can be removed once:
 *
 * 1. Agent persona classes (src/agents/personas/*.ts) migrate to domain imports
 * 2. Tests update to use domain tools directly
 *
 * For now, the legacy files are kept but wrapped by domains.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface DeprecationEntry {
  /** Tool or function name being deprecated */
  name: string;
  /** Version where deprecation was announced */
  deprecatedIn: string;
  /** Version where it will be removed */
  removeIn: string;
  /** Replacement tool or approach */
  replacement: string;
  /** Migration guide or notes */
  migrationNotes?: string;
  /** Category of the deprecated item */
  category: 'tool-creator' | 'tool' | 'export' | 'pattern';
}

// ============================================================================
// DEPRECATION SCHEDULE
// ============================================================================

/**
 * Complete list of deprecated tools and their migration timeline.
 *
 * VERSIONING:
 * - v2.0: Current version with registry-based tools
 * - v3.0: Target version for removal of legacy tools
 */
export const DEPRECATION_SCHEDULE: DeprecationEntry[] = [
  // ============================================================================
  // FINANCIAL DOMAIN
  // ============================================================================
  {
    name: 'createCalculatorTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/finance/',
    migrationNotes: 'Use buildAgentTools("agent-id") which includes finance domain automatically',
    category: 'tool-creator',
  },
  {
    name: 'createEconomicTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/finance/',
    category: 'tool-creator',
  },
  {
    name: 'createMarketDataTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/research/',
    category: 'tool-creator',
  },
  {
    name: 'createPersonalFinanceTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/finance/',
    category: 'tool-creator',
  },

  // ============================================================================
  // INFORMATION DOMAIN
  // ============================================================================
  {
    name: 'createNewsTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/information/',
    category: 'tool-creator',
  },
  {
    name: 'createSearchTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/information/',
    category: 'tool-creator',
  },
  {
    name: 'createSportsTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/information/',
    category: 'tool-creator',
  },
  {
    name: 'createWeatherTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/information/',
    category: 'tool-creator',
  },
  {
    name: 'createWisdomTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/wisdom/',
    category: 'tool-creator',
  },

  // ============================================================================
  // HUMAN CONNECTION DOMAIN
  // ============================================================================
  {
    name: 'createLifeEventsTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/life-planning/',
    category: 'tool-creator',
  },
  // NOTE: createSmallTalkTools was REMOVED in Dec 2024 (small-talk.ts deleted)
  {
    name: 'createWellnessTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/wellness/',
    category: 'tool-creator',
  },

  // ============================================================================
  // CONVERSATION DOMAIN
  // ============================================================================
  {
    name: 'createAwarenessTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/awareness/',
    category: 'tool-creator',
  },
  {
    name: 'createBackgroundTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() - background tools auto-included',
    migrationNotes: 'Background tools are automatically included when using buildAgentTools()',
    category: 'tool-creator',
  },
  {
    name: 'createConversationTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools()',
    category: 'tool-creator',
  },
  {
    name: 'createMemoryTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/memory/',
    category: 'tool-creator',
  },
  {
    name: 'createProactiveTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/proactive/',
    category: 'tool-creator',
  },
  {
    name: 'createResearchTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/research/',
    category: 'tool-creator',
  },

  // ============================================================================
  // CAMEO
  // ============================================================================
  {
    name: 'createCameoTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools() or domains/cameo/',
    category: 'tool-creator',
  },
  {
    name: 'cameoTools',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'Import from domains/cameo/',
    category: 'export',
  },

  // ============================================================================
  // PATTERNS
  // ============================================================================
  {
    name: 'Persona-specific tool creators (createMayaTools, etc.)',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'buildAgentTools(personaId)',
    migrationNotes:
      'Tools are now domain-based, not persona-based. Use buildAgentTools() with the agent ID.',
    category: 'pattern',
  },
  {
    name: 'Direct tool imports from top-level files',
    deprecatedIn: '2.0',
    removeIn: '3.0',
    replacement: 'Import from domains/ or use buildAgentTools()',
    migrationNotes: 'Organize imports by domain: domains/finance/, domains/memory/, etc.',
    category: 'pattern',
  },
];

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get all deprecated items.
 */
export function getDeprecatedItems(): DeprecationEntry[] {
  return DEPRECATION_SCHEDULE;
}

/**
 * Get items scheduled for removal in a specific version.
 */
export function getItemsToRemove(version: string): DeprecationEntry[] {
  return DEPRECATION_SCHEDULE.filter((entry) => entry.removeIn === version);
}

/**
 * Get items deprecated in a specific version.
 */
export function getItemsDeprecatedIn(version: string): DeprecationEntry[] {
  return DEPRECATION_SCHEDULE.filter((entry) => entry.deprecatedIn === version);
}

/**
 * Check if a tool/function is deprecated.
 */
export function isDeprecated(name: string): boolean {
  return DEPRECATION_SCHEDULE.some((entry) => entry.name === name);
}

/**
 * Get deprecation info for a tool/function.
 */
export function getDeprecationInfo(name: string): DeprecationEntry | undefined {
  return DEPRECATION_SCHEDULE.find((entry) => entry.name === name);
}

/**
 * Get migration guide for a deprecated tool.
 */
export function getMigrationGuide(name: string): string {
  const entry = getDeprecationInfo(name);
  if (!entry) {
    return `'${name}' is not deprecated.`;
  }

  let guide = `# Migration Guide: ${entry.name}\n\n`;
  guide += `**Deprecated in:** v${entry.deprecatedIn}\n`;
  guide += `**Will be removed in:** v${entry.removeIn}\n\n`;
  guide += `## Replacement\n\n`;
  guide += `Use \`${entry.replacement}\` instead.\n\n`;

  if (entry.migrationNotes) {
    guide += `## Notes\n\n${entry.migrationNotes}\n`;
  }

  return guide;
}

/**
 * Generate a full deprecation report.
 */
export function generateDeprecationReport(): string {
  let report = '# Tool Deprecation Report\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;

  const byVersion = new Map<string, DeprecationEntry[]>();
  for (const entry of DEPRECATION_SCHEDULE) {
    const items = byVersion.get(entry.removeIn) || [];
    items.push(entry);
    byVersion.set(entry.removeIn, items);
  }

  for (const [version, items] of Array.from(byVersion.entries()).sort()) {
    report += `## To Be Removed in v${version}\n\n`;
    report += `| Name | Category | Replacement |\n`;
    report += `|------|----------|-------------|\n`;

    for (const item of items) {
      report += `| ${item.name} | ${item.category} | ${item.replacement} |\n`;
    }

    report += '\n';
  }

  return report;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  DEPRECATION_SCHEDULE,
  getDeprecatedItems,
  getItemsToRemove,
  getItemsDeprecatedIn,
  isDeprecated,
  getDeprecationInfo,
  getMigrationGuide,
  generateDeprecationReport,
};

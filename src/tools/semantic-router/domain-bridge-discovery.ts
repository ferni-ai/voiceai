/**
 * Domain Bridge Discovery
 *
 * Automatically discovers mappings between semantic tool IDs and domain tool IDs
 * using naming conventions, fuzzy matching, and category analysis.
 *
 * This enables scaling to 100% coverage without manual mapping of each tool.
 *
 * @module tools/semantic-router/domain-bridge-discovery
 */

import { createLogger } from '../../utils/safe-logger.js';
import { toolRegistry } from '../registry/index.js';
import { getToolRegistry as getSemanticRegistry } from './registry.js';

const log = createLogger({ module: 'domain-bridge-discovery' });

// ============================================================================
// TYPES
// ============================================================================

export interface DiscoveryResult {
  /** Semantic tool ID */
  semanticId: string;
  /** Matched domain tool ID (or null if no match) */
  domainId: string | null;
  /** Confidence in the match */
  confidence: 'high' | 'medium' | 'low' | 'none';
  /** How the match was found */
  matchType: 'exact' | 'camelCase' | 'fuzzy' | 'category' | 'manual' | 'none';
  /** Whether argument transformation is likely needed */
  needsTransform: boolean;
  /** Suggested transform function name */
  suggestedTransform?: string;
}

export interface DiscoverySummary {
  total: number;
  mapped: number;
  unmapped: number;
  coverage: number;
  byConfidence: Record<DiscoveryResult['confidence'], number>;
  byMatchType: Record<DiscoveryResult['matchType'], number>;
  byCategory: Record<string, { mapped: number; total: number }>;
}

// ============================================================================
// NAMING CONVENTIONS
// ============================================================================

/**
 * Category prefixes in semantic IDs mapped to common domain patterns.
 */
const CATEGORY_PATTERNS: Record<string, string[]> = {
  // Music & Entertainment
  spotify_: ['playMusic', 'musicControl', 'spotify', 'music'],
  music_: ['music', 'playMusic', 'spotify'],
  entertainment_: ['movie', 'tv', 'show', 'entertainment'],

  // Information
  weather_: ['weather', 'getWeather', 'forecast'],
  news_: ['news', 'getNews', 'headlines'],
  sports_: ['sports', 'scores', 'schedule'],

  // Calendar & Time
  calendar_: ['calendar', 'event', 'appointment'],
  alarms_: ['alarm', 'setAlarm'],
  reminders_: ['reminder', 'setReminder'],
  timers_: ['timer', 'setTimer'],

  // Communication
  comm_: ['message', 'email', 'sms', 'communication'],
  contact_: ['contact', 'person'],

  // Life Coaching
  habits_: ['habit', 'routine', 'tracker'],
  dreams_: ['dream', 'goal', 'bucket'],
  decisions_: ['decision', 'choose', 'procon'],
  burnout_: ['burnout', 'recovery', 'energy'],
  career_: ['career', 'job', 'resume', 'interview'],
  family_: ['family', 'parenting', 'elder'],
  connection_: ['connection', 'loneliness', 'friend'],
  grief_: ['grief', 'loss', 'mourning'],
  anger_: ['anger', 'calm', 'cool'],

  // Finance
  finance_: ['budget', 'money', 'bill', 'finance'],
  currency_: ['currency', 'convert', 'exchange'],

  // Utilities
  dictionary_: ['define', 'synonym', 'word'],
  books_: ['book', 'reading', 'read'],
  games_: ['game', 'play', 'trivia'],

  // Crisis
  crisis_: ['crisis', 'safety', 'emergency'],
};

/**
 * Verb transformations for matching.
 */
const VERB_MAPPINGS: Record<string, string[]> = {
  list: ['list', 'get', 'fetch', 'show', 'all'],
  create: ['create', 'add', 'new', 'make', 'set'],
  delete: ['delete', 'remove', 'cancel', 'clear'],
  update: ['update', 'edit', 'modify', 'change'],
  get: ['get', 'fetch', 'show', 'check'],
  search: ['search', 'find', 'lookup', 'query'],
  send: ['send', 'post', 'deliver'],
  play: ['play', 'start', 'begin'],
  stop: ['stop', 'pause', 'end', 'cancel'],
};

// ============================================================================
// MATCHING FUNCTIONS
// ============================================================================

/**
 * Convert snake_case to camelCase.
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert snake_case to PascalCase.
 */
function snakeToPascal(str: string): string {
  const camel = snakeToCamel(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Extract verb and noun from semantic ID.
 * e.g., "calendar_list_events" → { verb: "list", noun: "events", category: "calendar" }
 */
function parseSemanticId(id: string): { category: string; verb: string; noun: string } {
  const parts = id.split('_');
  if (parts.length < 2) {
    return { category: id, verb: '', noun: '' };
  }
  if (parts.length === 2) {
    return { category: parts[0], verb: parts[1], noun: '' };
  }
  return {
    category: parts[0],
    verb: parts[1],
    noun: parts.slice(2).join('_'),
  };
}

/**
 * Calculate string similarity (Levenshtein-based).
 */
function similarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 1;
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8;

  // Simple character overlap
  const aChars = new Set(aLower.split(''));
  const bChars = new Set(bLower.split(''));
  const intersection = [...aChars].filter((c) => bChars.has(c)).length;
  const union = new Set([...aChars, ...bChars]).size;

  return intersection / union;
}

/**
 * Try to find an exact match for semantic ID in domain tools.
 */
function findExactMatch(semanticId: string, domainIds: string[]): string | null {
  // Direct match
  if (domainIds.includes(semanticId)) {
    return semanticId;
  }

  // camelCase version
  const camelVersion = snakeToCamel(semanticId);
  if (domainIds.includes(camelVersion)) {
    return camelVersion;
  }

  return null;
}

/**
 * Try to find a fuzzy match using naming patterns.
 */
function findFuzzyMatch(semanticId: string, domainIds: string[]): string | null {
  const { category, verb, noun } = parseSemanticId(semanticId);

  // Try variations
  const variations = [
    // verb + Category + Noun
    `${verb}${snakeToPascal(category)}${noun ? snakeToPascal(noun) : ''}`,
    // verb + Noun (if category is implicit)
    noun ? `${verb}${snakeToPascal(noun)}` : null,
    // category + Verb + Noun
    `${category}${snakeToPascal(verb)}${noun ? snakeToPascal(noun) : ''}`,
    // Noun + Verb (alternative ordering)
    noun ? `${noun}${snakeToPascal(verb)}` : null,
  ].filter(Boolean) as string[];

  for (const variation of variations) {
    if (domainIds.includes(variation)) {
      return variation;
    }
  }

  // Try verb mapping variations
  if (verb && VERB_MAPPINGS[verb]) {
    for (const altVerb of VERB_MAPPINGS[verb]) {
      const variations2 = [
        `${altVerb}${snakeToPascal(category)}${noun ? snakeToPascal(noun) : ''}`,
        noun ? `${altVerb}${snakeToPascal(noun)}` : null,
      ].filter(Boolean) as string[];

      for (const v of variations2) {
        if (domainIds.includes(v)) {
          return v;
        }
      }
    }
  }

  return null;
}

/**
 * Try to find a category-based match.
 */
function findCategoryMatch(semanticId: string, domainIds: string[]): string | null {
  const { category } = parseSemanticId(semanticId);
  const categoryKey = `${category}_`;

  const patterns = CATEGORY_PATTERNS[categoryKey];
  if (!patterns) return null;

  // Find domain tools that match category patterns
  const candidates = domainIds.filter((id) => {
    const idLower = id.toLowerCase();
    return patterns.some((p) => idLower.includes(p.toLowerCase()));
  });

  if (candidates.length === 0) return null;

  // Score candidates by similarity to semantic ID
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = similarity(semanticId, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestScore > 0.3 ? bestMatch : null;
}

// ============================================================================
// MAIN DISCOVERY FUNCTION
// ============================================================================

/**
 * Discover all mappings between semantic and domain tools.
 */
export async function discoverMappings(): Promise<DiscoveryResult[]> {
  // Get all semantic tool IDs
  const semanticRegistry = getSemanticRegistry();
  const semanticIds = semanticRegistry.getAll().map((t) => t.id);

  // Get all domain tool IDs
  const domainIds = toolRegistry.getAll().map((t) => t.id);

  log.info(
    {
      semanticCount: semanticIds.length,
      domainCount: domainIds.length,
    },
    '🔍 Starting domain bridge discovery'
  );

  const results: DiscoveryResult[] = [];

  for (const semanticId of semanticIds) {
    // Try exact match first
    let domainId = findExactMatch(semanticId, domainIds);
    if (domainId) {
      results.push({
        semanticId,
        domainId,
        confidence: 'high',
        matchType: domainId === semanticId ? 'exact' : 'camelCase',
        needsTransform: false,
      });
      continue;
    }

    // Try fuzzy match
    domainId = findFuzzyMatch(semanticId, domainIds);
    if (domainId) {
      results.push({
        semanticId,
        domainId,
        confidence: 'medium',
        matchType: 'fuzzy',
        needsTransform: true,
        suggestedTransform: `transform_${semanticId}`,
      });
      continue;
    }

    // Try category match
    domainId = findCategoryMatch(semanticId, domainIds);
    if (domainId) {
      results.push({
        semanticId,
        domainId,
        confidence: 'low',
        matchType: 'category',
        needsTransform: true,
        suggestedTransform: `transform_${semanticId}`,
      });
      continue;
    }

    // No match found
    results.push({
      semanticId,
      domainId: null,
      confidence: 'none',
      matchType: 'none',
      needsTransform: false,
    });
  }

  log.info(
    {
      total: results.length,
      mapped: results.filter((r) => r.domainId).length,
      unmapped: results.filter((r) => !r.domainId).length,
    },
    '🔍 Discovery complete'
  );

  return results;
}

/**
 * Generate a summary of discovery results.
 */
export function summarizeDiscovery(results: DiscoveryResult[]): DiscoverySummary {
  const mapped = results.filter((r) => r.domainId !== null).length;

  const byConfidence: Record<DiscoveryResult['confidence'], number> = {
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
  };

  const byMatchType: Record<DiscoveryResult['matchType'], number> = {
    exact: 0,
    camelCase: 0,
    fuzzy: 0,
    category: 0,
    manual: 0,
    none: 0,
  };

  const byCategory: Record<string, { mapped: number; total: number }> = {};

  for (const result of results) {
    byConfidence[result.confidence]++;
    byMatchType[result.matchType]++;

    const { category } = parseSemanticId(result.semanticId);
    if (!byCategory[category]) {
      byCategory[category] = { mapped: 0, total: 0 };
    }
    byCategory[category].total++;
    if (result.domainId) {
      byCategory[category].mapped++;
    }
  }

  return {
    total: results.length,
    mapped,
    unmapped: results.length - mapped,
    coverage: mapped / results.length,
    byConfidence,
    byMatchType,
    byCategory,
  };
}

/**
 * Generate TypeScript code for discovered mappings.
 */
export function generateMappingsCode(results: DiscoveryResult[]): string {
  const mappedResults = results.filter((r) => r.domainId && r.confidence !== 'none');

  const imports = `import type { ToolMapping } from './domain-bridge.js';`;

  const mappings = mappedResults
    .map((r) => {
      const transform = r.needsTransform ? `\n    // TODO: Add transform function` : '';
      return `  // ${r.matchType} match (${r.confidence} confidence)
  '${r.semanticId}': {
    domainToolId: '${r.domainId}',${transform}
  },`;
    })
    .join('\n\n');

  return `/**
 * Auto-Generated Domain Bridge Mappings
 *
 * Generated by: pnpm bridge:discover
 * Total Mappings: ${mappedResults.length}
 * Coverage: ${((mappedResults.length / results.length) * 100).toFixed(1)}%
 *
 * DO NOT EDIT DIRECTLY - Re-run discovery to update
 */

${imports}

export const AUTO_DISCOVERED_MAPPINGS: Record<string, ToolMapping> = {
${mappings}
};

// ============================================================================
// UNMAPPED TOOLS (Need manual mapping)
// ============================================================================

/**
 * Semantic tools that need manual mapping:
${results
  .filter((r) => r.confidence === 'none')
  .map((r) => ` * - ${r.semanticId}`)
  .join('\n')}
 */
`;
}

/**
 * Print a human-readable report.
 */
export function printDiscoveryReport(results: DiscoveryResult[]): void {
  const summary = summarizeDiscovery(results);

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║              DOMAIN BRIDGE DISCOVERY REPORT                    ║
╠════════════════════════════════════════════════════════════════╣
║  Total Semantic Tools:  ${String(summary.total).padStart(4)}                              ║
║  Mapped:                ${String(summary.mapped).padStart(4)}                              ║
║  Unmapped:              ${String(summary.unmapped).padStart(4)}                              ║
║  Coverage:              ${(summary.coverage * 100).toFixed(1).padStart(5)}%                            ║
╠════════════════════════════════════════════════════════════════╣
║  BY CONFIDENCE                                                 ║
║    High:   ${String(summary.byConfidence.high).padStart(4)}  (exact/camelCase matches)              ║
║    Medium: ${String(summary.byConfidence.medium).padStart(4)}  (fuzzy matches, may need review)      ║
║    Low:    ${String(summary.byConfidence.low).padStart(4)}  (category matches, needs review)       ║
║    None:   ${String(summary.byConfidence.none).padStart(4)}  (no match, needs manual mapping)      ║
╠════════════════════════════════════════════════════════════════╣
║  TOP UNMAPPED CATEGORIES                                       ║
${Object.entries(summary.byCategory)
  .filter(([_, v]) => v.total - v.mapped > 0)
  .sort((a, b) => b[1].total - b[1].mapped - (a[1].total - a[1].mapped))
  .slice(0, 8)
  .map(([cat, v]) => `║    ${cat.padEnd(20)} ${v.mapped}/${v.total} mapped                        ║`)
  .join('\n')}
╚════════════════════════════════════════════════════════════════╝
  `);
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

/**
 * Run discovery from command line.
 */
export async function runDiscovery(): Promise<void> {
  try {
    // Ensure registries are initialized
    const { initializeSemanticRouter } = await import('./integration/init.js');
    await initializeSemanticRouter();

    const results = await discoverMappings();
    printDiscoveryReport(results);

    // Optionally generate code
    if (process.argv.includes('--generate')) {
      const code = generateMappingsCode(results);
      console.log('\n--- Generated Mappings Code ---\n');
      console.log(code);
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Discovery failed');
    process.exit(1);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { parseSemanticId, similarity, snakeToCamel, snakeToPascal };


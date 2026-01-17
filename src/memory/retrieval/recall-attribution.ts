/**
 * Recall Attribution Parser
 *
 * Tracks whether recalled memories are actually used in LLM responses.
 * Supports both explicit tag detection and fuzzy content matching.
 *
 * This enables:
 * - Measuring memory recall quality
 * - Boosting frequently-used memories in ranking
 * - Identifying unused memory injections (waste)
 *
 * @module memory/retrieval/recall-attribution
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { InjectedMemory } from './hybrid-continuity-retrieval.js';

const log = createLogger({ module: 'RecallAttribution' });

// ============================================================================
// TYPES
// ============================================================================

export interface AttributionResult {
  /** Memory tag that was referenced */
  tag: string;
  /** Full memory ID */
  fullId: string;
  /** Memory type */
  type: 'thread' | 'anchor' | 'semantic';
  /** Whether the reference was explicit (tag found) or implicit (content matched) */
  explicit: boolean;
  /** Confidence of attribution (1.0 for explicit, lower for fuzzy) */
  confidence: number;
  /** Matched text snippet from response */
  matchedText?: string;
}

export interface AttributionSummary {
  /** Total memories injected */
  totalInjected: number;
  /** Memories explicitly referenced (tag found) */
  explicitlyReferenced: number;
  /** Memories implicitly referenced (content matched) */
  implicitlyReferenced: number;
  /** Memories not referenced at all */
  unused: number;
  /** Attribution rate (0-1) */
  attributionRate: number;
  /** Individual attributions */
  attributions: AttributionResult[];
  /** Memory IDs that were not used */
  unusedMemories: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Regex to match memory tags in response: [MEM:type_id] */
const MEMORY_TAG_REGEX = /\[MEM:(thread|anchor|sem)_([a-z0-9]+)\]/gi;

/** Minimum word overlap for fuzzy matching */
const MIN_FUZZY_OVERLAP = 0.3;

/** Minimum words in memory text for fuzzy matching */
const MIN_WORDS_FOR_FUZZY = 3;

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Parse LLM response for memory attributions
 *
 * @param response - The LLM response text
 * @param injectedMemories - Memories that were injected into context
 * @returns Attribution summary with all matches
 */
export function parseAttributions(
  response: string,
  injectedMemories: InjectedMemory[]
): AttributionSummary {
  const attributions: AttributionResult[] = [];
  const attributedTags = new Set<string>();

  // 1. Find explicit tag references
  const explicitMatches = findExplicitTags(response);
  for (const match of explicitMatches) {
    const memory = injectedMemories.find((m) => m.tag === match.tag);
    if (memory) {
      attributions.push({
        tag: memory.tag,
        fullId: memory.fullId,
        type: memory.type,
        explicit: true,
        confidence: 1.0,
        matchedText: match.context,
      });
      attributedTags.add(memory.tag);
    }
  }

  // 2. Find implicit references via fuzzy matching
  for (const memory of injectedMemories) {
    if (attributedTags.has(memory.tag)) continue; // Already explicitly matched

    const fuzzyMatch = findFuzzyMatch(response, memory.text);
    if (fuzzyMatch) {
      attributions.push({
        tag: memory.tag,
        fullId: memory.fullId,
        type: memory.type,
        explicit: false,
        confidence: fuzzyMatch.confidence,
        matchedText: fuzzyMatch.matchedText,
      });
      attributedTags.add(memory.tag);
    }
  }

  // 3. Calculate summary
  const unusedMemories = injectedMemories
    .filter((m) => !attributedTags.has(m.tag))
    .map((m) => m.fullId);

  const explicitCount = attributions.filter((a) => a.explicit).length;
  const implicitCount = attributions.filter((a) => !a.explicit).length;

  const summary: AttributionSummary = {
    totalInjected: injectedMemories.length,
    explicitlyReferenced: explicitCount,
    implicitlyReferenced: implicitCount,
    unused: unusedMemories.length,
    attributionRate:
      injectedMemories.length > 0 ? attributions.length / injectedMemories.length : 0,
    attributions,
    unusedMemories,
  };

  log.debug(
    {
      injected: summary.totalInjected,
      explicit: summary.explicitlyReferenced,
      implicit: summary.implicitlyReferenced,
      unused: summary.unused,
      rate: Math.round(summary.attributionRate * 100) + '%',
    },
    '📊 Memory attribution parsed'
  );

  return summary;
}

/**
 * Find explicit memory tags in response
 */
function findExplicitTags(response: string): Array<{ tag: string; context: string }> {
  const matches: Array<{ tag: string; context: string }> = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  MEMORY_TAG_REGEX.lastIndex = 0;

  while ((match = MEMORY_TAG_REGEX.exec(response)) !== null) {
    const fullTag = `${match[1]}_${match[2]}`;
    // Get surrounding context (50 chars before and after)
    const start = Math.max(0, match.index - 50);
    const end = Math.min(response.length, match.index + match[0].length + 50);
    const context = response.slice(start, end);

    matches.push({ tag: fullTag, context });
  }

  return matches;
}

/**
 * Find fuzzy matches between response and memory text
 */
function findFuzzyMatch(
  response: string,
  memoryText: string
): { confidence: number; matchedText: string } | null {
  // Normalize texts
  const responseWords = extractSignificantWords(response);
  const memoryWords = extractSignificantWords(memoryText);

  if (memoryWords.length < MIN_WORDS_FOR_FUZZY) {
    return null;
  }

  // Find overlapping words
  const responseWordSet = new Set(responseWords);
  const matchingWords = memoryWords.filter((w) => responseWordSet.has(w));
  const overlap = matchingWords.length / memoryWords.length;

  if (overlap < MIN_FUZZY_OVERLAP) {
    return null;
  }

  // Find the best matching snippet in response
  const matchedText = findBestSnippet(response, matchingWords);

  return {
    confidence: overlap,
    matchedText,
  };
}

/**
 * Extract significant words (remove stop words, normalize)
 */
function extractSignificantWords(text: string): string[] {
  const stopWords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'can',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
    'also',
    'now',
    'about',
    'your',
    'you',
    'me',
    'my',
    'i',
    'we',
    'they',
    'them',
    'their',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Find the best matching snippet containing the most matching words
 */
function findBestSnippet(response: string, matchingWords: string[]): string {
  if (matchingWords.length === 0) return '';

  const lowerResponse = response.toLowerCase();
  const wordSet = new Set(matchingWords);

  // Find sentences containing matching words
  const sentences = response.split(/[.!?]+/).map((s) => s.trim());
  let bestSentence = '';
  let bestScore = 0;

  for (const sentence of sentences) {
    const sentenceWords = extractSignificantWords(sentence);
    const score = sentenceWords.filter((w) => wordSet.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  // Return truncated snippet
  return bestSentence.slice(0, 100) + (bestSentence.length > 100 ? '...' : '');
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick check if response contains any memory references
 */
export function containsMemoryReferences(response: string): boolean {
  MEMORY_TAG_REGEX.lastIndex = 0;
  return MEMORY_TAG_REGEX.test(response);
}

/**
 * Extract just the memory tags from a response (for quick counting)
 */
export function extractMemoryTags(response: string): string[] {
  const tags: string[] = [];
  let match: RegExpExecArray | null;

  MEMORY_TAG_REGEX.lastIndex = 0;
  while ((match = MEMORY_TAG_REGEX.exec(response)) !== null) {
    tags.push(`${match[1]}_${match[2]}`);
  }

  return tags;
}

/**
 * Calculate attribution metrics from multiple parsing results
 */
export function aggregateAttributionStats(summaries: AttributionSummary[]): {
  totalInjected: number;
  totalAttributed: number;
  overallRate: number;
  explicitRate: number;
  implicitRate: number;
  byType: Record<string, { injected: number; attributed: number; rate: number }>;
} {
  let totalInjected = 0;
  let totalAttributed = 0;
  let totalExplicit = 0;
  const byType: Record<string, { injected: number; attributed: number }> = {
    thread: { injected: 0, attributed: 0 },
    anchor: { injected: 0, attributed: 0 },
    semantic: { injected: 0, attributed: 0 },
  };

  for (const summary of summaries) {
    totalInjected += summary.totalInjected;
    totalAttributed += summary.explicitlyReferenced + summary.implicitlyReferenced;
    totalExplicit += summary.explicitlyReferenced;

    for (const attr of summary.attributions) {
      if (byType[attr.type]) {
        byType[attr.type].attributed++;
      }
    }
  }

  // Calculate rates
  const overallRate = totalInjected > 0 ? totalAttributed / totalInjected : 0;
  const explicitRate = totalInjected > 0 ? totalExplicit / totalInjected : 0;
  const implicitRate = totalInjected > 0 ? (totalAttributed - totalExplicit) / totalInjected : 0;

  const byTypeWithRates = Object.fromEntries(
    Object.entries(byType).map(([type, stats]) => [
      type,
      {
        ...stats,
        rate: stats.injected > 0 ? stats.attributed / stats.injected : 0,
      },
    ])
  );

  return {
    totalInjected,
    totalAttributed,
    overallRate,
    explicitRate,
    implicitRate,
    byType: byTypeWithRates,
  };
}

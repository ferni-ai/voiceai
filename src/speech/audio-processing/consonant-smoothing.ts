/**
 * Consonant Cluster Smoothing
 *
 * TTS engines often struggle with certain consonant clusters, producing
 * slurred or dropped sounds. This module adds subtle micro-breaks to help
 * the TTS engine articulate these difficult combinations more clearly.
 *
 * Common problematic patterns:
 * - "nth" (monthly, strength) - the 'n' often gets swallowed
 * - "sts" (costs, tests) - the final 's' often gets dropped
 * - "sks" (tasks, risks) - mumbled middle consonants
 * - "xth" (sixth, growth) - difficult transition
 * - "lths" (healths, wealths) - tongue twister
 * - "ngths" (strengths, lengths) - very difficult
 *
 * @module ConsonantSmoothing
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// CONSONANT CLUSTER PATTERNS
// ============================================================================

/**
 * Patterns that benefit from subtle spacing for clearer articulation.
 * We insert a very brief pause (using SSML break or just spacing) to help TTS.
 */
interface ClusterPattern {
  /** Regex pattern to match */
  pattern: RegExp;
  /** Replacement with subtle break for clarity */
  replacement: string;
  /** Description for logging/debugging */
  description: string;
  /** Priority (higher = apply first) */
  priority: number;
}

/**
 * Consonant cluster patterns that cause TTS issues.
 * Ordered by priority (most specific first).
 */
const CLUSTER_PATTERNS: ClusterPattern[] = [
  // ============================================================================
  // VERY DIFFICULT CLUSTERS (priority 3)
  // ============================================================================
  {
    pattern: /\b(strength)s\b/gi,
    replacement: '$1-s',
    description: 'strengths - ngths cluster',
    priority: 3,
  },
  {
    pattern: /\b(length)s\b/gi,
    replacement: '$1-s',
    description: 'lengths - ngths cluster',
    priority: 3,
  },
  {
    pattern: /\b(health)s\b/gi,
    replacement: '$1-s',
    description: 'healths - lths cluster',
    priority: 3,
  },
  {
    pattern: /\b(wealth)s\b/gi,
    replacement: '$1-s',
    description: 'wealths - lths cluster',
    priority: 3,
  },
  {
    pattern: /\b(stealth)s?\b/gi,
    replacement: 'stel-th$1',
    description: 'stealth - lth cluster',
    priority: 3,
  },

  // ============================================================================
  // ORDINALS - xth clusters (priority 2)
  // ============================================================================
  {
    pattern: /\bsixth\b/gi,
    replacement: 'siks-th',
    description: 'sixth - xth cluster',
    priority: 2,
  },
  {
    pattern: /\btwelfth\b/gi,
    replacement: 'twelf-th',
    description: 'twelfth - fth cluster',
    priority: 2,
  },
  {
    pattern: /\beighth\b/gi,
    replacement: 'eighth',
    description: 'eighth - usually okay',
    priority: 2,
  },
  {
    pattern: /\bfifth\b/gi,
    replacement: 'fif-th',
    description: 'fifth - fth cluster',
    priority: 2,
  },

  // ============================================================================
  // COMMON -STS and -SKS endings (priority 1)
  // ============================================================================
  {
    pattern: /\b(cost)s\b/gi,
    replacement: '$1-s',
    description: 'costs - sts cluster',
    priority: 1,
  },
  {
    pattern: /\b(test)s\b/gi,
    replacement: '$1-s',
    description: 'tests - sts cluster',
    priority: 1,
  },
  {
    pattern: /\b(invest)s\b/gi,
    replacement: '$1-s',
    description: 'invests - sts cluster',
    priority: 1,
  },
  {
    pattern: /\b(suggest)s\b/gi,
    replacement: '$1-s',
    description: 'suggests - sts cluster',
    priority: 1,
  },
  {
    pattern: /\b(exist)s\b/gi,
    replacement: '$1-s',
    description: 'exists - sts cluster',
    priority: 1,
  },
  {
    pattern: /\b(assist)s\b/gi,
    replacement: '$1-s',
    description: 'assists - sts cluster',
    priority: 1,
  },
  {
    pattern: /\b(task)s\b/gi,
    replacement: '$1-s',
    description: 'tasks - sks cluster',
    priority: 1,
  },
  {
    pattern: /\b(risk)s\b/gi,
    replacement: '$1-s',
    description: 'risks - sks cluster',
    priority: 1,
  },
  {
    pattern: /\b(desk)s\b/gi,
    replacement: '$1-s',
    description: 'desks - sks cluster',
    priority: 1,
  },
  {
    pattern: /\b(ask)s\b/gi,
    replacement: '$1-s',
    description: 'asks - sks cluster',
    priority: 1,
  },

  // ============================================================================
  // COMMON -NTH endings (priority 1)
  // ============================================================================
  {
    pattern: /\bmonthly\b/gi,
    replacement: 'month-lee',
    description: 'monthly - nthl cluster',
    priority: 1,
  },
  {
    pattern: /\bmonths\b/gi,
    replacement: 'month-s',
    description: 'months - nths cluster',
    priority: 1,
  },

  // ============================================================================
  // WORDS WITH "OULD" that TTS sometimes mumbles (priority 0)
  // ============================================================================
  {
    pattern: /\bshouldn't\b/gi,
    replacement: "should-n't",
    description: "shouldn't - ldn't cluster",
    priority: 0,
  },
  {
    pattern: /\bwouldn't\b/gi,
    replacement: "would-n't",
    description: "wouldn't - ldn't cluster",
    priority: 0,
  },
  {
    pattern: /\bcouldn't\b/gi,
    replacement: "could-n't",
    description: "couldn't - ldn't cluster",
    priority: 0,
  },
];

// Sort by priority (highest first)
const SORTED_PATTERNS = [...CLUSTER_PATTERNS].sort((a, b) => b.priority - a.priority);

// ============================================================================
// SMOOTHING FUNCTIONS
// ============================================================================

/**
 * Apply consonant cluster smoothing to text.
 * This helps TTS engines articulate difficult consonant combinations.
 *
 * @param text - The text to process
 * @param options - Optional configuration
 * @returns Text with smoothing applied
 */
export function applyConsonantSmoothing(
  text: string,
  options: {
    /** Enable debug logging */
    debug?: boolean;
    /** Use SSML breaks instead of hyphens */
    useSSMLBreaks?: boolean;
  } = {}
): string {
  const { debug = false, useSSMLBreaks = false } = options;

  let result = text;
  let appliedCount = 0;

  for (const { pattern, replacement, description } of SORTED_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;

    if (pattern.test(result)) {
      pattern.lastIndex = 0;

      // If using SSML breaks, convert hyphens to micro-breaks
      const finalReplacement = useSSMLBreaks
        ? replacement.replace(/-/g, '<break time="30ms"/>')
        : replacement;

      result = result.replace(pattern, finalReplacement);
      appliedCount++;

      if (debug) {
        log.debug({ pattern: description, replacement: finalReplacement }, 'Applied smoothing');
      }
    }
  }

  if (debug && appliedCount > 0) {
    log.debug({ appliedCount, inputLength: text.length }, 'Consonant smoothing complete');
  }

  return result;
}

/**
 * Check if text contains any difficult consonant clusters.
 * Useful for deciding whether to apply smoothing.
 *
 * @param text - Text to analyze
 * @returns Array of detected difficult clusters
 */
export function detectDifficultClusters(text: string): string[] {
  const detected: string[] = [];

  for (const { pattern, description } of SORTED_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      detected.push(description);
    }
  }

  return detected;
}

/**
 * Get smoothing statistics for a text.
 *
 * @param text - Text to analyze
 * @returns Statistics about difficult clusters
 */
export function getClusterStats(text: string): {
  totalClusters: number;
  byPriority: Record<number, number>;
  clusterTypes: string[];
} {
  const byPriority: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const clusterTypes: string[] = [];

  for (const { pattern, description, priority } of SORTED_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches) {
      byPriority[priority] += matches.length;
      clusterTypes.push(description);
    }
  }

  return {
    totalClusters: Object.values(byPriority).reduce((a, b) => a + b, 0),
    byPriority,
    clusterTypes,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { CLUSTER_PATTERNS, type ClusterPattern };

export default {
  applyConsonantSmoothing,
  detectDifficultClusters,
  getClusterStats,
};

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
declare const CLUSTER_PATTERNS: ClusterPattern[];
/**
 * Apply consonant cluster smoothing to text.
 * This helps TTS engines articulate difficult consonant combinations.
 *
 * @param text - The text to process
 * @param options - Optional configuration
 * @returns Text with smoothing applied
 */
export declare function applyConsonantSmoothing(text: string, options?: {
    /** Enable debug logging */
    debug?: boolean;
    /** Use SSML breaks instead of hyphens */
    useSSMLBreaks?: boolean;
}): string;
/**
 * Check if text contains any difficult consonant clusters.
 * Useful for deciding whether to apply smoothing.
 *
 * @param text - Text to analyze
 * @returns Array of detected difficult clusters
 */
export declare function detectDifficultClusters(text: string): string[];
/**
 * Get smoothing statistics for a text.
 *
 * @param text - Text to analyze
 * @returns Statistics about difficult clusters
 */
export declare function getClusterStats(text: string): {
    totalClusters: number;
    byPriority: Record<number, number>;
    clusterTypes: string[];
};
export { CLUSTER_PATTERNS, type ClusterPattern };
declare const _default: {
    applyConsonantSmoothing: typeof applyConsonantSmoothing;
    detectDifficultClusters: typeof detectDifficultClusters;
    getClusterStats: typeof getClusterStats;
};
export default _default;
//# sourceMappingURL=consonant-smoothing.d.ts.map
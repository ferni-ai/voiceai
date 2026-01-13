/**
 * Locality-Sensitive Hashing (LSH) for Memory Deduplication
 *
 * Replaces O(n²) pairwise comparison with O(n) approximate matching.
 * Uses MinHash for Jaccard similarity estimation.
 *
 * Philosophy: Fast is better than perfect. Near-duplicates are good enough.
 *
 * Performance: 100 memories → 4,950 comparisons → ~100 hash lookups
 *
 * Native acceleration:
 * - Uses rust-accelerator for xxHash-based MinHash when available (10-20x faster)
 * - Falls back to MD5-based JS implementation when Rust module unavailable
 */
export interface LSHConfig {
    /** Number of hash functions for MinHash (more = more accurate, slower) */
    numHashes: number;
    /** Number of bands for LSH (more bands = catch more duplicates, more false positives) */
    numBands: number;
    /** Similarity threshold (0-1) */
    threshold: number;
}
export interface DuplicatePair<T> {
    first: T;
    second: T;
    similarity: number;
}
/**
 * LSH Index for efficient near-duplicate detection
 *
 * Uses banding technique: divide signature into bands,
 * items that share a band are candidate duplicates.
 */
export declare class LSHIndex<T extends {
    id: string;
    content: string;
}> {
    private config;
    private signatures;
    private bands;
    private rowsPerBand;
    constructor(config?: Partial<LSHConfig>);
    /**
     * Add an item to the index
     */
    add(item: T): void;
    /**
     * Add multiple items to the index
     */
    addAll(items: T[]): void;
    /**
     * Find candidate duplicates (items that share at least one band)
     */
    private findCandidates;
    /**
     * Find all duplicate pairs above the threshold
     * O(n) average case instead of O(n²)
     */
    findDuplicates(): Array<DuplicatePair<T>>;
    /**
     * Get index statistics
     */
    getStats(): {
        itemCount: number;
        bandCount: number;
        avgBucketSize: number;
    };
    /**
     * Clear the index
     */
    clear(): void;
}
/**
 * Find duplicates in a list of items using LSH
 * Drop-in replacement for O(n²) comparison
 *
 * Uses native Rust implementation when available for 10-20x speedup.
 * Falls back to JS implementation when native module unavailable.
 */
export declare function findDuplicatesLSH<T extends {
    id: string;
    content: string;
}>(items: T[], config?: Partial<LSHConfig>): Array<DuplicatePair<T>>;
/**
 * Compute exact Jaccard similarity (for verification/fallback)
 */
export declare function exactJaccardSimilarity(text1: string, text2: string): number;
/**
 * Check if native LSH acceleration is available.
 * When true, `findDuplicatesLSH` uses Rust xxHash for 10-20x speedup.
 */
export declare function isNativeLshAvailable(): boolean;
//# sourceMappingURL=lsh-deduplication.d.ts.map
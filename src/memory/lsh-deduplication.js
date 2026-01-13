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
import { createHash } from 'crypto';
import { getLogger } from '../utils/safe-logger.js';
import { isRustAvailable, findDuplicatesLsh as findDuplicatesLshNative, } from './rust-accelerator.js';
const log = getLogger();
// ============================================================================
// DEFAULT CONFIG
// ============================================================================
const DEFAULT_CONFIG = {
    numHashes: 100, // 100 hash functions
    numBands: 20, // 20 bands of 5 rows each
    threshold: 0.7, // 70% similarity
};
// ============================================================================
// MINHASH IMPLEMENTATION
// ============================================================================
/**
 * Generate k-shingles (character n-grams) from text
 */
function getShingles(text, k = 3) {
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const shingles = new Set();
    for (let i = 0; i <= normalized.length - k; i++) {
        shingles.add(normalized.slice(i, i + k));
    }
    return shingles;
}
/**
 * Generate a hash function that maps strings to numbers
 */
function createHashFunction(seed) {
    return (shingle) => {
        const hash = createHash('md5').update(`${seed}:${shingle}`).digest();
        // Use first 4 bytes as unsigned 32-bit integer
        return hash.readUInt32BE(0);
    };
}
/**
 * Compute MinHash signature for a set of shingles
 */
function computeMinHash(shingles, numHashes) {
    const signature = new Array(numHashes).fill(Infinity);
    if (shingles.size === 0) {
        return signature.fill(0);
    }
    const shingleArray = Array.from(shingles);
    for (let i = 0; i < numHashes; i++) {
        const hashFn = createHashFunction(i);
        for (const shingle of shingleArray) {
            const hash = hashFn(shingle);
            if (hash < signature[i]) {
                signature[i] = hash;
            }
        }
    }
    return signature;
}
/**
 * Estimate Jaccard similarity from MinHash signatures
 */
function estimateSimilarity(sig1, sig2) {
    if (sig1.length !== sig2.length)
        return 0;
    let matches = 0;
    for (let i = 0; i < sig1.length; i++) {
        if (sig1[i] === sig2[i])
            matches++;
    }
    return matches / sig1.length;
}
// ============================================================================
// LSH INDEX
// ============================================================================
/**
 * LSH Index for efficient near-duplicate detection
 *
 * Uses banding technique: divide signature into bands,
 * items that share a band are candidate duplicates.
 */
export class LSHIndex {
    config;
    signatures = new Map();
    bands = [];
    rowsPerBand;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.rowsPerBand = Math.floor(this.config.numHashes / this.config.numBands);
        // Initialize band hash tables
        for (let i = 0; i < this.config.numBands; i++) {
            this.bands.push(new Map());
        }
    }
    /**
     * Add an item to the index
     */
    add(item) {
        const shingles = getShingles(item.content);
        const signature = computeMinHash(shingles, this.config.numHashes);
        this.signatures.set(item.id, {
            id: item.id,
            signature,
            item,
        });
        // Hash each band and add to bucket
        for (let band = 0; band < this.config.numBands; band++) {
            const start = band * this.rowsPerBand;
            const end = start + this.rowsPerBand;
            const bandSlice = signature.slice(start, end);
            const bandHash = createHash('md5').update(bandSlice.join(',')).digest('hex');
            if (!this.bands[band].has(bandHash)) {
                this.bands[band].set(bandHash, new Set());
            }
            this.bands[band].get(bandHash).add(item.id);
        }
    }
    /**
     * Add multiple items to the index
     */
    addAll(items) {
        for (const item of items) {
            this.add(item);
        }
    }
    /**
     * Find candidate duplicates (items that share at least one band)
     */
    findCandidates(id) {
        const candidates = new Set();
        const sig = this.signatures.get(id);
        if (!sig)
            return candidates;
        for (let band = 0; band < this.config.numBands; band++) {
            const start = band * this.rowsPerBand;
            const end = start + this.rowsPerBand;
            const bandSlice = sig.signature.slice(start, end);
            const bandHash = createHash('md5').update(bandSlice.join(',')).digest('hex');
            const bucket = this.bands[band].get(bandHash);
            if (bucket) {
                for (const candidateId of bucket) {
                    if (candidateId !== id) {
                        candidates.add(candidateId);
                    }
                }
            }
        }
        return candidates;
    }
    /**
     * Find all duplicate pairs above the threshold
     * O(n) average case instead of O(n²)
     */
    findDuplicates() {
        const duplicates = [];
        const processed = new Set();
        for (const [id, sig] of this.signatures.entries()) {
            processed.add(id);
            const candidates = this.findCandidates(id);
            for (const candidateId of candidates) {
                // Skip if we already processed this pair
                if (processed.has(candidateId))
                    continue;
                const candidateSig = this.signatures.get(candidateId);
                if (!candidateSig)
                    continue;
                const similarity = estimateSimilarity(sig.signature, candidateSig.signature);
                if (similarity >= this.config.threshold) {
                    duplicates.push({
                        first: sig.item,
                        second: candidateSig.item,
                        similarity,
                    });
                }
            }
        }
        return duplicates;
    }
    /**
     * Get index statistics
     */
    getStats() {
        let totalBuckets = 0;
        let totalItems = 0;
        for (const band of this.bands) {
            totalBuckets += band.size;
            for (const bucket of band.values()) {
                totalItems += bucket.size;
            }
        }
        return {
            itemCount: this.signatures.size,
            bandCount: this.config.numBands,
            avgBucketSize: totalBuckets > 0 ? totalItems / totalBuckets : 0,
        };
    }
    /**
     * Clear the index
     */
    clear() {
        this.signatures.clear();
        for (const band of this.bands) {
            band.clear();
        }
    }
}
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Find duplicates in a list of items using LSH
 * Drop-in replacement for O(n²) comparison
 *
 * Uses native Rust implementation when available for 10-20x speedup.
 * Falls back to JS implementation when native module unavailable.
 */
export function findDuplicatesLSH(items, config = {}) {
    const startTime = Date.now();
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    // Try native Rust path for better performance
    if (isRustAvailable() && items.length >= 5) {
        try {
            const texts = items.map((item) => item.content);
            const nativeResults = findDuplicatesLshNative(texts, mergedConfig.threshold, mergedConfig.numHashes, mergedConfig.numBands);
            // Convert native results (indices) back to item pairs
            const duplicates = nativeResults.map((pair) => ({
                first: items[pair.firstIdx],
                second: items[pair.secondIdx],
                similarity: pair.similarity,
            }));
            const elapsed = Date.now() - startTime;
            log.debug({
                itemCount: items.length,
                duplicatesFound: duplicates.length,
                elapsedMs: elapsed,
                native: true,
            }, 'LSH deduplication complete (native)');
            return duplicates;
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Native LSH failed, falling back to JS');
        }
    }
    // JS fallback
    const index = new LSHIndex(config);
    index.addAll(items);
    const duplicates = index.findDuplicates();
    const elapsed = Date.now() - startTime;
    const stats = index.getStats();
    log.debug({
        itemCount: items.length,
        duplicatesFound: duplicates.length,
        elapsedMs: elapsed,
        avgBucketSize: stats.avgBucketSize.toFixed(2),
        native: false,
    }, 'LSH deduplication complete (JS fallback)');
    return duplicates;
}
/**
 * Compute exact Jaccard similarity (for verification/fallback)
 */
export function exactJaccardSimilarity(text1, text2) {
    const shingles1 = getShingles(text1);
    const shingles2 = getShingles(text2);
    if (shingles1.size === 0 && shingles2.size === 0)
        return 1;
    if (shingles1.size === 0 || shingles2.size === 0)
        return 0;
    let intersection = 0;
    for (const shingle of shingles1) {
        if (shingles2.has(shingle))
            intersection++;
    }
    const union = shingles1.size + shingles2.size - intersection;
    return union > 0 ? intersection / union : 0;
}
/**
 * Check if native LSH acceleration is available.
 * When true, `findDuplicatesLSH` uses Rust xxHash for 10-20x speedup.
 */
export function isNativeLshAvailable() {
    return isRustAvailable();
}
//# sourceMappingURL=lsh-deduplication.js.map
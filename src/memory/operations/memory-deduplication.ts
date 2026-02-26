/**
 * Memory Deduplication
 *
 * Prevents storing semantically duplicate memories to maintain
 * a clean, efficient memory store.
 *
 * Philosophy: When someone tells you the same story twice, you don't
 * store two separate memories. You recognize it's the same story,
 * maybe with new details, and update your understanding accordingly.
 *
 * Deduplication ensures we:
 * 1. Don't waste storage on near-identical memories
 * 2. Merge new details into existing memories
 * 3. Track how often topics come up (frequency signal)
 * 4. Maintain a single source of truth per topic
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { MemoryItem } from '../advanced-retrieval.js';
import { embedCached } from '../embedding-cache.js';
import { embed } from '../embeddings.js';
import { type MemoryError, type Result, err, isOk, memoryError, ok } from '../result.js';
// Centralized cosine similarity - uses SIMD-ready implementation from rust-accelerator
import { cosineSimilarity, findSimilarPairs } from '../rust-accelerator.js';
import type { VectorDocument } from '../vector-store-interface.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of a duplicate check
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateOf?: string;
  similarity: number;
  recommendation: 'store' | 'skip' | 'merge';
  mergeTarget?: MemoryItem | VectorDocument;
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  merged: MemoryItem;
  sourceIds: string[];
  newDetails: string[];
}

/**
 * Configuration for deduplication
 */
export interface DeduplicationConfig {
  /** Similarity threshold for exact duplicates (default: 0.95) */
  exactDuplicateThreshold: number;

  /** Similarity threshold for merge candidates (default: 0.85) */
  mergeThreshold: number;

  /** Minimum similarity to consider related (default: 0.70) */
  relatedThreshold: number;

  /** Maximum age difference (days) for merge candidates (default: 90) */
  maxAgeDifferenceForMerge: number;

  /** Whether to allow cross-topic merging (default: false) */
  allowCrossTopicMerge: boolean;

  /** Use cached embeddings for efficiency (default: true) */
  useCachedEmbeddings: boolean;
}

/**
 * Deduplication statistics
 */
export interface DeduplicationStats {
  checksPerformed: number;
  duplicatesFound: number;
  mergesPerformed: number;
  storageBypass: number;
  averageSimilarity: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: DeduplicationConfig = {
  exactDuplicateThreshold: 0.95,
  mergeThreshold: 0.85,
  relatedThreshold: 0.7,
  maxAgeDifferenceForMerge: 90,
  allowCrossTopicMerge: false,
  useCachedEmbeddings: true,
};

// ============================================================================
// MEMORY DEDUPLICATOR
// ============================================================================

export class MemoryDeduplicator {
  private config: DeduplicationConfig;
  private stats: DeduplicationStats = {
    checksPerformed: 0,
    duplicatesFound: 0,
    mergesPerformed: 0,
    storageBypass: 0,
    averageSimilarity: 0,
  };
  private similaritySum = 0;

  constructor(config?: Partial<DeduplicationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a new memory is a duplicate of any existing memory
   */
  async checkDuplicate(
    newMemory: MemoryItem | VectorDocument,
    existingMemories: Array<MemoryItem | VectorDocument>
  ): Promise<Result<DuplicateCheckResult, MemoryError>> {
    this.stats.checksPerformed++;

    if (existingMemories.length === 0) {
      return ok({
        isDuplicate: false,
        similarity: 0,
        recommendation: 'store',
      });
    }

    try {
      // Get embedding for new memory
      const newText = 'content' in newMemory ? newMemory.content : newMemory.text;
      let newEmbedding: number[];

      if ('embedding' in newMemory && newMemory.embedding) {
        newEmbedding = newMemory.embedding;
      } else if (this.config.useCachedEmbeddings) {
        const result = await embedCached(newText);
        if (!isOk(result)) {
          return err(result.error);
        }
        newEmbedding = result.value;
      } else {
        newEmbedding = await embed(newText);
      }

      // Find most similar existing memory
      let maxSimilarity = 0;
      let mostSimilar: (MemoryItem | VectorDocument) | undefined;

      for (const existing of existingMemories) {
        const existingEmbedding = this.getEmbedding(existing);
        if (!existingEmbedding) continue;

        const similarity = cosineSimilarity(newEmbedding, existingEmbedding);

        // Track for stats
        this.similaritySum += similarity;

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          mostSimilar = existing;
        }
      }

      // Update stats
      this.stats.averageSimilarity = this.similaritySum / this.stats.checksPerformed;

      // Determine recommendation
      let recommendation: DuplicateCheckResult['recommendation'] = 'store';
      let isDuplicate = false;

      if (maxSimilarity >= this.config.exactDuplicateThreshold) {
        isDuplicate = true;
        recommendation = 'skip';
        this.stats.duplicatesFound++;
        this.stats.storageBypass++;

        log.debug(
          { similarity: maxSimilarity, threshold: this.config.exactDuplicateThreshold },
          'Exact duplicate detected'
        );
      } else if (maxSimilarity >= this.config.mergeThreshold) {
        // Check if merge is appropriate
        if (this.shouldMerge(newMemory, mostSimilar!)) {
          isDuplicate = true;
          recommendation = 'merge';
          this.stats.duplicatesFound++;

          log.debug(
            { similarity: maxSimilarity, threshold: this.config.mergeThreshold },
            'Merge candidate detected'
          );
        }
      }

      const result: DuplicateCheckResult = {
        isDuplicate,
        similarity: maxSimilarity,
        recommendation,
      };

      if (mostSimilar && maxSimilarity >= this.config.relatedThreshold) {
        result.duplicateOf = this.getId(mostSimilar);
        result.mergeTarget = mostSimilar;
      }

      return ok(result);
    } catch (error) {
      return err(
        memoryError('deduplication_failed', `Duplicate check failed: ${error}`, {
          cause: error instanceof Error ? error : undefined,
        })
      );
    }
  }

  /**
   * Merge two similar memories into one enhanced memory
   */
  async mergeMemories(
    existing: MemoryItem,
    incoming: MemoryItem
  ): Promise<Result<MergeResult, MemoryError>> {
    try {
      this.stats.mergesPerformed++;

      // Extract new details from incoming that aren't in existing
      const newDetails = this.extractNewDetails(existing.content, incoming.content);

      // Merge content
      let mergedContent = existing.content;
      if (newDetails.length > 0) {
        mergedContent += `\n\nAdditional details:\n${newDetails.join('\n')}`;
      }

      // Merge topics
      const mergedTopics = [...new Set([...(existing.topics || []), ...(incoming.topics || [])])];

      // Take higher emotional weight
      const mergedEmotionalWeight = Math.max(existing.emotionalWeight, incoming.emotionalWeight);

      // Keep earlier timestamp, update as more recent access
      const mergedTimestamp = new Date(
        Math.min(existing.timestamp.getTime(), incoming.timestamp.getTime())
      );

      // Generate new embedding for merged content
      const mergedEmbedding = await embed(mergedContent);

      const merged: MemoryItem = {
        ...existing,
        content: mergedContent,
        topics: mergedTopics,
        emotionalWeight: mergedEmotionalWeight,
        timestamp: mergedTimestamp,
        embedding: mergedEmbedding,
        // Preserve commitment if either is a commitment
        commitment: existing.commitment || incoming.commitment,
        // Preserve person mentioned
        personMentioned: existing.personMentioned || incoming.personMentioned,
      };

      log.info(
        {
          existingId: existing.id,
          incomingId: incoming.id,
          newDetails: newDetails.length,
        },
        'Merged memories'
      );

      return ok({
        merged,
        sourceIds: [existing.id, incoming.id],
        newDetails,
      });
    } catch (error) {
      return err(
        memoryError('consolidation_failed', `Memory merge failed: ${error}`, {
          cause: error instanceof Error ? error : undefined,
        })
      );
    }
  }

  /**
   * Find all near-duplicates in a set of memories
   *
   * Uses SIMD-accelerated findSimilarPairs for O(n²) pairwise comparison,
   * then builds clusters with same greedy semantics as original algorithm.
   */
  async findDuplicateClusters(memories: MemoryItem[]): Promise<Map<string, string[]>> {
    const clusters = new Map<string, string[]>();
    const processed = new Set<string>();

    // Filter to memories that have embeddings
    const memoriesWithEmbeddings = memories.filter((m) => m.embedding != null);

    if (memoriesWithEmbeddings.length < 2) {
      return clusters;
    }

    // Extract embeddings array for batch comparison
    const embeddings = memoriesWithEmbeddings.map((m) => m.embedding!);

    // Get all similar pairs using SIMD-accelerated function
    // findSimilarPairs guarantees firstIdx < secondIdx
    const similarPairs = findSimilarPairs(embeddings, this.config.mergeThreshold);

    // Build adjacency map: index → list of similar indices (j > i only)
    const adjacencyFromLower = new Map<number, number[]>();
    for (const pair of similarPairs) {
      if (!adjacencyFromLower.has(pair.firstIdx)) {
        adjacencyFromLower.set(pair.firstIdx, []);
      }
      adjacencyFromLower.get(pair.firstIdx)!.push(pair.secondIdx);
    }

    // Greedy clustering (same semantics as original O(n²) loop)
    for (let i = 0; i < memoriesWithEmbeddings.length; i++) {
      const memory = memoriesWithEmbeddings[i];
      if (processed.has(memory.id)) continue;

      const cluster: string[] = [memory.id];
      processed.add(memory.id);

      // Add similar memories that come after this one in index order
      const similar = adjacencyFromLower.get(i) || [];
      for (const j of similar) {
        const similarMemory = memoriesWithEmbeddings[j];
        if (!processed.has(similarMemory.id)) {
          cluster.push(similarMemory.id);
          processed.add(similarMemory.id);
        }
      }

      // Only store clusters with more than one member
      if (cluster.length > 1) {
        clusters.set(cluster[0], cluster);
      }
    }

    log.info(
      { totalMemories: memories.length, clusters: clusters.size },
      'Found duplicate clusters'
    );

    return clusters;
  }

  /**
   * Get deduplication statistics
   */
  getStats(): DeduplicationStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      checksPerformed: 0,
      duplicatesFound: 0,
      mergesPerformed: 0,
      storageBypass: 0,
      averageSimilarity: 0,
    };
    this.similaritySum = 0;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Check if two memories should be merged
   */
  private shouldMerge(
    newMemory: MemoryItem | VectorDocument,
    existing: MemoryItem | VectorDocument
  ): boolean {
    // Check age difference
    const newTimestamp = this.getTimestamp(newMemory);
    const existingTimestamp = this.getTimestamp(existing);

    if (newTimestamp && existingTimestamp) {
      const ageDiffDays = Math.abs(
        (newTimestamp.getTime() - existingTimestamp.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (ageDiffDays > this.config.maxAgeDifferenceForMerge) {
        return false;
      }
    }

    // Check topic overlap if cross-topic merge is disabled
    if (!this.config.allowCrossTopicMerge) {
      const newTopics = this.getTopics(newMemory);
      const existingTopics = this.getTopics(existing);

      if (newTopics.length > 0 && existingTopics.length > 0) {
        const hasOverlap = newTopics.some((t) =>
          existingTopics.some(
            (et) =>
              t.toLowerCase().includes(et.toLowerCase()) ||
              et.toLowerCase().includes(t.toLowerCase())
          )
        );

        if (!hasOverlap) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Extract details from new content that aren't in existing
   */
  private extractNewDetails(existingContent: string, newContent: string): string[] {
    const newDetails: string[] = [];

    // Split into sentences
    const existingSentences = new Set(
      existingContent
        .split(/[.!?]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 10)
    );

    const newSentences = newContent
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    for (const sentence of newSentences) {
      const normalized = sentence.toLowerCase();

      // Check if this sentence is substantially different
      let isNew = true;
      for (const existing of existingSentences) {
        // Simple overlap check
        const words = normalized.split(/\s+/);
        const existingWords = new Set(existing.split(/\s+/));
        const overlap = words.filter((w) => existingWords.has(w)).length;

        if (overlap / words.length > 0.7) {
          isNew = false;
          break;
        }
      }

      if (isNew) {
        newDetails.push(sentence);
      }
    }

    return newDetails.slice(0, 5); // Limit to 5 new details
  }

  /**
   * Get embedding from memory or document
   */
  private getEmbedding(item: MemoryItem | VectorDocument): number[] | undefined {
    return item.embedding;
  }

  /**
   * Get ID from memory or document
   */
  private getId(item: MemoryItem | VectorDocument): string {
    return item.id;
  }

  /**
   * Get timestamp from memory or document
   */
  private getTimestamp(item: MemoryItem | VectorDocument): Date | undefined {
    if ('timestamp' in item) {
      return item.timestamp as Date;
    }
    if ('metadata' in item && item.metadata.timestamp) {
      const ts = item.metadata.timestamp;
      if (ts instanceof Date) return ts;
      return new Date(ts as unknown as string | number);
    }
    return undefined;
  }

  /**
   * Get topics from memory or document
   */
  private getTopics(item: MemoryItem | VectorDocument): string[] {
    if ('topics' in item && item.topics) {
      return item.topics as string[];
    }
    if ('metadata' in item && item.metadata.topics) {
      return item.metadata.topics as string[];
    }
    return [];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultDeduplicator: MemoryDeduplicator | null = null;

/**
 * Get the default deduplicator
 */
export function getMemoryDeduplicator(config?: Partial<DeduplicationConfig>): MemoryDeduplicator {
  if (!defaultDeduplicator) {
    defaultDeduplicator = new MemoryDeduplicator(config);
  }
  return defaultDeduplicator;
}

/**
 * Reset the deduplicator (for testing)
 */
export function resetMemoryDeduplicator(): void {
  defaultDeduplicator = null;
}

export default {
  MemoryDeduplicator,
  getMemoryDeduplicator,
  resetMemoryDeduplicator,
};

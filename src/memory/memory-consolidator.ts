/**
 * Memory Consolidator
 *
 * Automatically consolidates related memories over time to maintain
 * a coherent, efficient memory representation.
 *
 * Philosophy: Like human memory, we don't need to remember every detail
 * of every conversation. We consolidate related memories into richer,
 * more meaningful representations - keeping the essence while letting
 * go of redundancy.
 *
 * When a user mentions their daughter's college plans 8 times across
 * different conversations, we don't need 8 separate memories. We need
 * ONE rich memory that captures the full picture and evolving story.
 */

import { getLogger } from '../utils/safe-logger.js';
import type { MemoryItem } from './advanced-retrieval.js';
import { cosineSimilarity, embed } from './embeddings.js';
import { err, memoryError, ok, type MemoryError, type Result } from './result.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * A consolidated memory that combines multiple related memories
 */
export interface ConsolidatedMemory {
  id: string;
  topic: string;
  consolidatedContent: string;

  /** IDs of memories that were consolidated */
  sourceMemoryIds: string[];

  /** When this consolidation was created */
  consolidatedAt: Date;

  /** How many times this topic has come up */
  frequency: number;

  /** Aggregate emotional significance */
  emotionalSignature: 'light' | 'medium' | 'heavy';

  /** Key themes extracted from the consolidated memories */
  themes: string[];

  /** Timeline of how the topic evolved */
  evolution: Array<{
    date: Date;
    summary: string;
  }>;

  /** The consolidated embedding */
  embedding?: number[];
}

/**
 * Configuration for memory consolidation
 */
export interface ConsolidationConfig {
  /** Minimum number of related memories before consolidation (default: 5) */
  consolidationThreshold: number;

  /** Similarity threshold for grouping memories (default: 0.75) */
  similarityThreshold: number;

  /** Maximum age of memories to consider for consolidation (days, default: 365) */
  maxAgeDays: number;

  /** Whether to preserve original memories after consolidation (default: true) */
  preserveOriginals: boolean;

  /** Maximum memories to consolidate at once (default: 20) */
  maxBatchSize: number;
}

/**
 * Result of a consolidation pass
 */
export interface ConsolidationResult {
  consolidated: ConsolidatedMemory[];
  memoriesProcessed: number;
  groupsFound: number;
  durationMs: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: ConsolidationConfig = {
  consolidationThreshold: 5,
  similarityThreshold: 0.75,
  maxAgeDays: 365,
  preserveOriginals: true,
  maxBatchSize: 20,
};

// ============================================================================
// MEMORY CONSOLIDATOR
// ============================================================================

export class MemoryConsolidator {
  private config: ConsolidationConfig;

  constructor(config?: Partial<ConsolidationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Find memories that should be consolidated by topic
   */
  async findConsolidationCandidates(
    memories: MemoryItem[],
    topic?: string
  ): Promise<Map<string, MemoryItem[]>> {
    const groups = new Map<string, MemoryItem[]>();

    // Filter by age
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxAgeDays);

    const eligibleMemories = memories.filter((m) => m.timestamp >= cutoffDate);

    if (eligibleMemories.length === 0) {
      return groups;
    }

    // If specific topic provided, filter for it
    if (topic) {
      const topicMemories = eligibleMemories.filter((m) =>
        m.topics?.some((t) => t.toLowerCase().includes(topic.toLowerCase()))
      );

      if (topicMemories.length >= this.config.consolidationThreshold) {
        groups.set(topic, topicMemories);
      }
      return groups;
    }

    // Otherwise, group by semantic similarity
    const embeddings = await this.getOrComputeEmbeddings(eligibleMemories);
    const processed = new Set<string>();

    for (let i = 0; i < eligibleMemories.length; i++) {
      if (processed.has(eligibleMemories[i].id)) continue;

      const group: MemoryItem[] = [eligibleMemories[i]];
      processed.add(eligibleMemories[i].id);

      // Find similar memories
      for (let j = i + 1; j < eligibleMemories.length; j++) {
        if (processed.has(eligibleMemories[j].id)) continue;

        const similarity = cosineSimilarity(embeddings[i], embeddings[j]);

        if (similarity >= this.config.similarityThreshold) {
          group.push(eligibleMemories[j]);
          processed.add(eligibleMemories[j].id);
        }
      }

      // Only keep groups that meet threshold
      if (group.length >= this.config.consolidationThreshold) {
        // Derive topic from common themes
        const commonTopic = this.extractCommonTopic(group);
        groups.set(commonTopic, group);
      }
    }

    return groups;
  }

  /**
   * Consolidate a group of related memories into one
   */
  async consolidateMemories(
    memories: MemoryItem[],
    topic: string
  ): Promise<Result<ConsolidatedMemory, MemoryError>> {
    if (memories.length === 0) {
      return err(memoryError('consolidation_failed', 'No memories to consolidate'));
    }

    try {
      // Sort by timestamp for chronological processing
      const sorted = [...memories].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Build evolution timeline
      const evolution = sorted.map((m) => ({
        date: m.timestamp,
        summary: this.extractSummary(m.content),
      }));

      // Calculate aggregate emotional weight
      const avgEmotionalWeight =
        sorted.reduce((sum, m) => sum + m.emotionalWeight, 0) / sorted.length;

      const emotionalSignature: ConsolidatedMemory['emotionalSignature'] =
        avgEmotionalWeight > 0.7 ? 'heavy' : avgEmotionalWeight > 0.4 ? 'medium' : 'light';

      // Extract themes
      const themes = this.extractThemes(sorted);

      // Generate consolidated content
      const consolidatedContent = this.generateConsolidatedContent(
        topic,
        sorted,
        themes,
        evolution
      );

      // Generate embedding for consolidated content
      const embedding = await embed(consolidatedContent);

      const consolidated: ConsolidatedMemory = {
        id: `consolidated_${topic.replace(/\s+/g, '_')}_${Date.now()}`,
        topic,
        consolidatedContent,
        sourceMemoryIds: sorted.map((m) => m.id),
        consolidatedAt: new Date(),
        frequency: sorted.length,
        emotionalSignature,
        themes,
        evolution,
        embedding,
      };

      log.info(
        {
          topic,
          memoriesConsolidated: sorted.length,
          themes: themes.length,
        },
        'Consolidated memories'
      );

      return ok(consolidated);
    } catch (error) {
      return err(
        memoryError('consolidation_failed', `Failed to consolidate: ${error}`, {
          cause: error instanceof Error ? error : undefined,
        })
      );
    }
  }

  /**
   * Run a full consolidation pass for a user
   */
  async runConsolidationPass(
    memories: MemoryItem[],
    existingConsolidations?: ConsolidatedMemory[]
  ): Promise<ConsolidationResult> {
    const startTime = Date.now();
    const result: ConsolidationResult = {
      consolidated: [],
      memoriesProcessed: memories.length,
      groupsFound: 0,
      durationMs: 0,
    };

    // Filter out already consolidated memories
    const consolidatedIds = new Set(
      existingConsolidations?.flatMap((c) => c.sourceMemoryIds) ?? []
    );

    const unconsolidated = memories.filter((m) => !consolidatedIds.has(m.id));

    if (unconsolidated.length < this.config.consolidationThreshold) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Find consolidation candidates
    const groups = await this.findConsolidationCandidates(unconsolidated);
    result.groupsFound = groups.size;

    // Consolidate each group
    for (const [topic, groupMemories] of groups) {
      // Limit batch size
      const batch = groupMemories.slice(0, this.config.maxBatchSize);

      const consolidationResult = await this.consolidateMemories(batch, topic);

      if (consolidationResult.ok) {
        result.consolidated.push(consolidationResult.value);
      } else {
        const errorResult = consolidationResult as { ok: false; error: MemoryError };
        log.warn({ topic, error: errorResult.error }, 'Failed to consolidate group');
      }
    }

    result.durationMs = Date.now() - startTime;

    log.info(
      {
        memoriesProcessed: result.memoriesProcessed,
        groupsFound: result.groupsFound,
        consolidated: result.consolidated.length,
        durationMs: result.durationMs,
      },
      'Consolidation pass complete'
    );

    return result;
  }

  /**
   * Convert consolidated memory back to a MemoryItem for retrieval
   */
  consolidatedToMemoryItem(consolidated: ConsolidatedMemory): MemoryItem {
    return {
      id: consolidated.id,
      type: 'topic',
      content: consolidated.consolidatedContent,
      timestamp: consolidated.consolidatedAt,
      emotionalWeight:
        consolidated.emotionalSignature === 'heavy'
          ? 0.9
          : consolidated.emotionalSignature === 'medium'
            ? 0.6
            : 0.3,
      relevanceDecay: 0,
      baseImportance: 0.8 + Math.min(0.2, consolidated.frequency * 0.02),
      topics: [consolidated.topic, ...consolidated.themes],
      embedding: consolidated.embedding,
      source: {
        collection: 'consolidated',
        documentId: consolidated.id,
      },
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Get or compute embeddings for memories
   */
  private async getOrComputeEmbeddings(memories: MemoryItem[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const memory of memories) {
      if (memory.embedding) {
        embeddings.push(memory.embedding);
      } else {
        const emb = await embed(memory.content);
        embeddings.push(emb);
      }
    }

    return embeddings;
  }

  /**
   * Extract common topic from a group of memories
   */
  private extractCommonTopic(memories: MemoryItem[]): string {
    // Collect all topics
    const topicCounts = new Map<string, number>();

    for (const memory of memories) {
      for (const topic of memory.topics ?? []) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }

    // Find most common topic
    let maxCount = 0;
    let commonTopic = 'general';

    for (const [topic, count] of topicCounts) {
      if (count > maxCount) {
        maxCount = count;
        commonTopic = topic;
      }
    }

    return commonTopic;
  }

  /**
   * Extract summary from content
   */
  private extractSummary(content: string): string {
    // Take first sentence or first 100 chars
    const firstSentence = content.split(/[.!?]/)[0];
    if (firstSentence.length <= 100) {
      return firstSentence.trim();
    }
    return `${content.slice(0, 100).trim()}...`;
  }

  /**
   * Extract common themes from memories
   */
  private extractThemes(memories: MemoryItem[]): string[] {
    const themeCounts = new Map<string, number>();

    for (const memory of memories) {
      for (const topic of memory.topics ?? []) {
        themeCounts.set(topic, (themeCounts.get(topic) || 0) + 1);
      }
    }

    // Return themes mentioned in at least 30% of memories
    const threshold = memories.length * 0.3;
    return Array.from(themeCounts.entries())
      .filter(([, count]) => count >= threshold)
      .map(([theme]) => theme)
      .slice(0, 5);
  }

  /**
   * Generate consolidated content from memories
   */
  private generateConsolidatedContent(
    topic: string,
    memories: MemoryItem[],
    themes: string[],
    evolution: ConsolidatedMemory['evolution']
  ): string {
    const parts: string[] = [];

    // Topic introduction
    parts.push(`${topic} (discussed ${memories.length} times)`);

    // Key themes
    if (themes.length > 0) {
      parts.push(`Key themes: ${themes.join(', ')}`);
    }

    // Timeline summary
    if (evolution.length > 0) {
      const firstMention = evolution[0];
      const lastMention = evolution[evolution.length - 1];

      parts.push(
        `First discussed: ${firstMention.date.toLocaleDateString()} - ${firstMention.summary}`
      );

      if (evolution.length > 1) {
        parts.push(
          `Most recent: ${lastMention.date.toLocaleDateString()} - ${lastMention.summary}`
        );
      }
    }

    // Notable details (from high emotional weight memories)
    const notable = memories.filter((m) => m.emotionalWeight > 0.6).slice(0, 3);

    if (notable.length > 0) {
      parts.push('Notable moments:');
      for (const m of notable) {
        parts.push(`- ${this.extractSummary(m.content)}`);
      }
    }

    return parts.join('\n');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultConsolidator: MemoryConsolidator | null = null;

/**
 * Get the default memory consolidator
 */
export function getMemoryConsolidator(config?: Partial<ConsolidationConfig>): MemoryConsolidator {
  if (!defaultConsolidator) {
    defaultConsolidator = new MemoryConsolidator(config);
  }
  return defaultConsolidator;
}

/**
 * Reset the consolidator (for testing)
 */
export function resetMemoryConsolidator(): void {
  defaultConsolidator = null;
}

export default {
  MemoryConsolidator,
  getMemoryConsolidator,
  resetMemoryConsolidator,
};

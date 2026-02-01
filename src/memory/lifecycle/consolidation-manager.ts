/**
 * Consolidation Manager
 *
 * Merges similar memories to reduce redundancy and strengthen important patterns.
 * Uses semantic similarity and topic overlap to identify consolidation candidates.
 *
 * @module memory/lifecycle/consolidation-manager
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { StoredMemory } from '../unified-store/types.js';
import type {
  ConsolidationConfig,
  ConsolidationGroup,
  ConsolidationResult,
  ConsolidationBatchResult,
} from './types.js';
import { DEFAULT_CONSOLIDATION_CONFIG } from './types.js';

const log = createLogger({ module: 'ConsolidationManager' });

// ============================================================================
// CONSOLIDATION MANAGER
// ============================================================================

/**
 * Consolidation Manager
 *
 * Merges similar memories to reduce storage and strengthen patterns.
 */
export class ConsolidationManager {
  private config: ConsolidationConfig;

  constructor(config: Partial<ConsolidationConfig> = {}) {
    this.config = { ...DEFAULT_CONSOLIDATION_CONFIG, ...config };
  }

  /**
   * Find groups of memories that can be consolidated
   */
  findConsolidationGroups(memories: StoredMemory[]): ConsolidationGroup[] {
    const groups: ConsolidationGroup[] = [];
    const processed = new Set<string>();

    // Filter memories eligible for consolidation
    const now = new Date();
    const eligibleMemories = memories.filter((m) => {
      const daysSinceCreation = (now.getTime() - m.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return (
        daysSinceCreation >= this.config.minAgeDays &&
        !m.isProtected &&
        !m.isActiveCommitment
      );
    });

    for (const memory of eligibleMemories) {
      if (processed.has(memory.id)) continue;

      // Find similar memories
      const similar = this.findSimilarMemories(memory, eligibleMemories, processed);

      if (similar.length >= 1) {
        // Create group with this memory as representative
        const members = [memory, ...similar];
        const group = this.createGroup(members);
        groups.push(group);

        // Mark all as processed
        members.forEach((m) => processed.add(m.id));
      }
    }

    // Sort groups by potential value (more members = more value)
    groups.sort((a, b) => b.members.length - a.members.length);

    return groups;
  }

  /**
   * Find memories similar to a given memory
   */
  private findSimilarMemories(
    target: StoredMemory,
    candidates: StoredMemory[],
    exclude: Set<string>
  ): StoredMemory[] {
    const similar: Array<{ memory: StoredMemory; similarity: number }> = [];

    for (const candidate of candidates) {
      if (candidate.id === target.id || exclude.has(candidate.id)) continue;

      const similarity = this.calculateSimilarity(target, candidate);
      if (similarity >= this.config.similarityThreshold) {
        similar.push({ memory: candidate, similarity });
      }
    }

    // Sort by similarity and limit
    similar.sort((a, b) => b.similarity - a.similarity);
    return similar.slice(0, this.config.maxConsolidationSize - 1).map((s) => s.memory);
  }

  /**
   * Calculate similarity between two memories
   */
  private calculateSimilarity(mem1: StoredMemory, mem2: StoredMemory): number {
    let similarity = 0;
    let factors = 0;

    // 1. Topic overlap (Jaccard similarity)
    if (mem1.topics.length > 0 && mem2.topics.length > 0) {
      const set1 = new Set(mem1.topics.map((t) => t.toLowerCase()));
      const set2 = new Set(mem2.topics.map((t) => t.toLowerCase()));
      const intersection = [...set1].filter((t) => set2.has(t)).length;
      const union = new Set([...set1, ...set2]).size;
      similarity += (intersection / union) * 0.3;
      factors += 0.3;
    }

    // 2. People overlap
    if (mem1.peopleMentioned.length > 0 && mem2.peopleMentioned.length > 0) {
      const set1 = new Set(mem1.peopleMentioned.map((p) => p.toLowerCase()));
      const set2 = new Set(mem2.peopleMentioned.map((p) => p.toLowerCase()));
      const intersection = [...set1].filter((p) => set2.has(p)).length;
      const union = new Set([...set1, ...set2]).size;
      similarity += (intersection / union) * 0.2;
      factors += 0.2;
    }

    // 3. Embedding similarity (if available)
    if (mem1.embedding?.length > 0 && mem2.embedding?.length > 0) {
      const cosineSim = this.cosineSimilarity(mem1.embedding, mem2.embedding);
      similarity += cosineSim * 0.4;
      factors += 0.4;
    }

    // 4. Type match
    if (mem1.type === mem2.type) {
      similarity += 0.1;
      factors += 0.1;
    }

    // Normalize by factors used
    return factors > 0 ? similarity / factors : 0;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Create a consolidation group from members
   */
  private createGroup(members: StoredMemory[]): ConsolidationGroup {
    // Find representative (highest importance)
    const representative = members.reduce((best, current) =>
      current.importance > best.importance ? current : best
    );

    // Calculate average similarity
    let totalSimilarity = 0;
    let pairs = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        totalSimilarity += this.calculateSimilarity(members[i], members[j]);
        pairs++;
      }
    }
    const averageSimilarity = pairs > 0 ? totalSimilarity / pairs : 1;

    // Combine topics and people
    const combinedTopics = [...new Set(members.flatMap((m) => m.topics))];
    const combinedPeople = [...new Set(members.flatMap((m) => m.peopleMentioned))];

    // Find max emotional weight
    const maxEmotionalWeight = Math.max(...members.map((m) => m.emotionalWeight));

    return {
      representative,
      members,
      averageSimilarity,
      combinedTopics,
      combinedPeople,
      maxEmotionalWeight,
    };
  }

  /**
   * Consolidate a group into a single memory
   */
  async consolidateGroup(group: ConsolidationGroup): Promise<ConsolidationResult> {
    const { representative, members, combinedTopics, combinedPeople, maxEmotionalWeight } = group;

    // Create consolidated memory
    const consolidated: StoredMemory = {
      ...representative,
      id: `consolidated_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      topics: combinedTopics,
      peopleMentioned: combinedPeople,
      emotionalWeight: maxEmotionalWeight,
      importance: Math.max(...members.map((m) => m.importance)),
      strength: Math.max(...members.map((m) => m.strength)),
      accessCount: members.reduce((sum, m) => sum + m.accessCount, 0),
      metadata: {
        ...representative.metadata,
        consolidatedFrom: members.map((m) => m.id),
        consolidatedAt: new Date().toISOString(),
        originalCount: members.length,
      },
      createdAt: new Date(Math.min(...members.map((m) => m.createdAt.getTime()))),
      updatedAt: new Date(),
    };

    return {
      consolidated,
      originalIds: members.map((m) => m.id),
      originalsFate: this.config.preserveOriginals ? 'preserved' : 'archived',
      similarityScore: group.averageSimilarity,
    };
  }

  /**
   * Run consolidation on a batch of memories
   */
  async consolidateBatch(memories: StoredMemory[]): Promise<ConsolidationBatchResult> {
    const startTime = Date.now();
    const results: ConsolidationResult[] = [];

    // Find consolidation groups
    const groups = this.findConsolidationGroups(memories);

    // Consolidate each group
    let memoriesConsolidated = 0;
    for (const group of groups) {
      if (group.members.length < 2) continue;

      const result = await this.consolidateGroup(group);
      results.push(result);
      memoriesConsolidated += group.members.length;
    }

    const durationMs = Date.now() - startTime;

    log.debug({
      memoriesProcessed: memories.length,
      groupsFound: groups.length,
      groupsConsolidated: results.length,
      memoriesConsolidated,
      durationMs,
    }, 'Consolidation batch complete');

    return {
      groupsFound: groups.length,
      groupsConsolidated: results.length,
      memoriesProcessed: memories.length,
      memoriesConsolidated,
      results,
      durationMs,
    };
  }

  /**
   * Estimate storage reduction from consolidation
   */
  estimateReduction(memories: StoredMemory[]): {
    currentCount: number;
    estimatedCount: number;
    reductionPercent: number;
  } {
    const groups = this.findConsolidationGroups(memories);
    const consolidatedCount = groups.reduce((sum, g) => sum + g.members.length - 1, 0);

    return {
      currentCount: memories.length,
      estimatedCount: memories.length - consolidatedCount,
      reductionPercent: memories.length > 0
        ? (consolidatedCount / memories.length) * 100
        : 0,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let managerInstance: ConsolidationManager | null = null;

export function getConsolidationManager(config?: Partial<ConsolidationConfig>): ConsolidationManager {
  if (!managerInstance) {
    managerInstance = new ConsolidationManager(config);
  }
  return managerInstance;
}

export function resetConsolidationManager(): void {
  managerInstance = null;
}

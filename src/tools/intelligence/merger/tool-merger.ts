/**
 * Tool Merger
 *
 * Identifies and merges semantically equivalent tools to reduce redundancy.
 * Uses embedding similarity for candidate generation and LLM for equivalence
 * classification.
 *
 * Algorithm:
 * 1. Embed all tool descriptions
 * 2. Find candidate pairs with cosine similarity > threshold
 * 3. Use LLM to classify functional equivalence
 * 4. Build connected components graph
 * 5. Select representative tool per cluster
 * 6. Generate merged tool with unified description
 *
 * @module tools/intelligence/merger/tool-merger
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getEquivalenceClassifier } from './equivalence-classifier.js';
import { getMergeRegistry, type MergeRegistry } from './merge-registry.js';
import type {
  ToolDefinition,
  ToolCluster,
  MergeCandidate,
  MergeStats,
  ToolMergerConfig,
  DEFAULT_MERGER_CONFIG,
} from './types.js';

const log = createLogger({ module: 'tool-merger' });

// ============================================================================
// HELPER: UNION-FIND FOR CLUSTERING
// ============================================================================

class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX) || 0;
    const rankY = this.rank.get(rootY) || 0;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  getGroups(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const node of this.parent.keys()) {
      const root = this.find(node);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(node);
    }
    return groups;
  }
}

// ============================================================================
// TOOL MERGER
// ============================================================================

export class ToolMerger {
  private config: ToolMergerConfig;
  private registry: MergeRegistry;
  private embeddings = new Map<string, number[]>();

  constructor(config: Partial<ToolMergerConfig> = {}) {
    this.config = {
      similarityThreshold: 0.82,
      confidenceThreshold: 0.75,
      maxClusterSize: 10,
      useLLMClassifier: true,
      embeddingBatchSize: 50,
      ...config,
    };
    this.registry = getMergeRegistry();
  }

  // ==========================================================================
  // MAIN API
  // ==========================================================================

  /**
   * Run the full merge process on a set of tools
   */
  async merge(tools: ToolDefinition[]): Promise<{
    clusters: ToolCluster[];
    stats: MergeStats;
  }> {
    const startTime = Date.now();
    log.info({ toolCount: tools.length }, 'Starting tool merge process');

    // Step 1: Generate embeddings for all tools
    await this.generateEmbeddings(tools);
    log.info({ embeddingCount: this.embeddings.size }, 'Generated embeddings');

    // Step 2: Find candidate pairs
    const candidates = this.findCandidatePairs(tools);
    log.info({ candidateCount: candidates.length }, 'Found candidate pairs');

    // Step 3: Classify equivalence
    const equivalentPairs = await this.classifyEquivalentPairs(tools, candidates);
    log.info({ equivalentCount: equivalentPairs.length }, 'Classified equivalent pairs');

    // Step 4: Build clusters using union-find
    const clusters = this.buildClusters(tools, equivalentPairs);
    log.info({ clusterCount: clusters.length }, 'Built clusters');

    // Step 5: Register clusters
    await this.registry.registerClusters(clusters);

    // Calculate stats
    const stats: MergeStats = {
      originalToolCount: tools.length,
      clusterCount: clusters.length,
      reductionPercent: ((tools.length - clusters.length) / tools.length) * 100,
      candidatesEvaluated: candidates.length,
      equivalentPairs: equivalentPairs.length,
      durationMs: Date.now() - startTime,
    };

    log.info(
      {
        originalTools: stats.originalToolCount,
        clusters: stats.clusterCount,
        reductionPercent: stats.reductionPercent.toFixed(1),
        durationMs: stats.durationMs,
      },
      'Tool merge complete'
    );

    return { clusters, stats };
  }

  /**
   * Incrementally merge new tools into existing clusters
   */
  async mergeIncremental(newTools: ToolDefinition[]): Promise<{
    newClusters: ToolCluster[];
    updatedClusters: ToolCluster[];
    stats: MergeStats;
  }> {
    const startTime = Date.now();
    const existingClusters = this.registry.getAllClusters();

    // Generate embeddings for new tools
    await this.generateEmbeddings(newTools);

    const newClusters: ToolCluster[] = [];
    const updatedClusters: ToolCluster[] = [];
    let candidatesEvaluated = 0;
    let equivalentPairs = 0;

    for (const tool of newTools) {
      // Check if tool matches any existing cluster
      let matchedCluster: ToolCluster | null = null;
      let bestSimilarity = 0;

      for (const cluster of existingClusters) {
        const similarity = await this.computeSimilarityToCluster(tool, cluster);
        if (similarity > this.config.similarityThreshold && similarity > bestSimilarity) {
          candidatesEvaluated++;

          // Use LLM to verify
          if (this.config.useLLMClassifier) {
            const canonicalTool = this.toolDefinitionFromCluster(cluster);
            const classifier = getEquivalenceClassifier();
            const result = await classifier.classifyEquivalence(tool, canonicalTool, similarity);

            if (
              result.functionallyEquivalent &&
              result.confidence > this.config.confidenceThreshold
            ) {
              matchedCluster = cluster;
              bestSimilarity = similarity;
              equivalentPairs++;
            }
          } else if (similarity > 0.9) {
            matchedCluster = cluster;
            bestSimilarity = similarity;
            equivalentPairs++;
          }
        }
      }

      if (matchedCluster) {
        // Add to existing cluster
        const updated = this.addToolToCluster(matchedCluster, tool, bestSimilarity);
        updatedClusters.push(updated);
        await this.registry.registerCluster(updated);
      } else {
        // Create new cluster
        const newCluster = this.createSingletonCluster(tool);
        newClusters.push(newCluster);
        await this.registry.registerCluster(newCluster);
      }
    }

    const stats: MergeStats = {
      originalToolCount: newTools.length,
      clusterCount: newClusters.length,
      reductionPercent: ((newTools.length - newClusters.length) / newTools.length) * 100,
      candidatesEvaluated,
      equivalentPairs,
      durationMs: Date.now() - startTime,
    };

    return { newClusters, updatedClusters, stats };
  }

  // ==========================================================================
  // EMBEDDING GENERATION
  // ==========================================================================

  /**
   * Generate embeddings for tools
   */
  private async generateEmbeddings(tools: ToolDefinition[]): Promise<void> {
    // Filter tools that need embeddings
    const toolsNeedingEmbeddings = tools.filter((t) => !this.embeddings.has(t.id) && !t.embedding);

    if (toolsNeedingEmbeddings.length === 0) {
      // Use existing embeddings
      for (const tool of tools) {
        if (tool.embedding) {
          this.embeddings.set(tool.id, tool.embedding);
        }
      }
      return;
    }

    // Generate embeddings in batches
    const { getEmbedding } = await import('../../semantic-router/embedding-providers.js');

    for (let i = 0; i < toolsNeedingEmbeddings.length; i += this.config.embeddingBatchSize) {
      const batch = toolsNeedingEmbeddings.slice(i, i + this.config.embeddingBatchSize);

      const embeddings = await Promise.all(
        batch.map(async (tool) => {
          const text = `${tool.name}: ${tool.description}`;
          const embedding = await getEmbedding(text);
          return { id: tool.id, embedding };
        })
      );

      for (const { id, embedding } of embeddings) {
        // Convert Float32Array to number[] if needed
        const embeddingArray = Array.isArray(embedding) ? embedding : Array.from(embedding);
        this.embeddings.set(id, embeddingArray);
      }

      log.debug(
        {
          batch: i / this.config.embeddingBatchSize + 1,
          processed: Math.min(i + this.config.embeddingBatchSize, toolsNeedingEmbeddings.length),
        },
        'Processed embedding batch'
      );
    }
  }

  // ==========================================================================
  // CANDIDATE GENERATION
  // ==========================================================================

  /**
   * Find candidate pairs based on embedding similarity
   */
  private findCandidatePairs(tools: ToolDefinition[]): MergeCandidate[] {
    const candidates: MergeCandidate[] = [];

    for (let i = 0; i < tools.length; i++) {
      for (let j = i + 1; j < tools.length; j++) {
        const toolA = tools[i];
        const toolB = tools[j];

        // Skip if different domains (unlikely to be equivalent)
        if (toolA.domain !== toolB.domain) {
          continue;
        }

        const embeddingA = this.embeddings.get(toolA.id);
        const embeddingB = this.embeddings.get(toolB.id);

        if (!embeddingA || !embeddingB) {
          continue;
        }

        const similarity = this.cosineSimilarity(embeddingA, embeddingB);

        if (similarity >= this.config.similarityThreshold) {
          candidates.push({
            toolA: toolA.id,
            toolB: toolB.id,
            similarity,
          });
        }
      }
    }

    // Sort by similarity descending
    candidates.sort((a, b) => b.similarity - a.similarity);

    return candidates;
  }

  // ==========================================================================
  // EQUIVALENCE CLASSIFICATION
  // ==========================================================================

  /**
   * Classify which candidate pairs are truly equivalent
   */
  private async classifyEquivalentPairs(
    tools: ToolDefinition[],
    candidates: MergeCandidate[]
  ): Promise<MergeCandidate[]> {
    if (!this.config.useLLMClassifier) {
      // Without LLM, use higher similarity threshold
      return candidates.filter((c) => c.similarity > 0.9);
    }

    const toolMap = new Map(tools.map((t) => [t.id, t]));
    const classifier = getEquivalenceClassifier();
    const equivalentPairs: MergeCandidate[] = [];

    // Classify in batches
    const pairs = candidates
      .map((c) => ({
        toolA: toolMap.get(c.toolA)!,
        toolB: toolMap.get(c.toolB)!,
        similarity: c.similarity,
      }))
      .filter((p) => p.toolA && p.toolB);

    const results = await classifier.classifyBatch(pairs);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.functionallyEquivalent && result.confidence >= this.config.confidenceThreshold) {
        equivalentPairs.push(candidates[i]);
      }
    }

    return equivalentPairs;
  }

  // ==========================================================================
  // CLUSTER BUILDING
  // ==========================================================================

  /**
   * Build clusters from equivalent pairs using union-find
   */
  private buildClusters(tools: ToolDefinition[], equivalentPairs: MergeCandidate[]): ToolCluster[] {
    const toolMap = new Map(tools.map((t) => [t.id, t]));
    const uf = new UnionFind();

    // Initialize all tools
    for (const tool of tools) {
      uf.find(tool.id);
    }

    // Union equivalent pairs
    for (const pair of equivalentPairs) {
      uf.union(pair.toolA, pair.toolB);
    }

    // Get groups
    const groups = uf.getGroups();
    const clusters: ToolCluster[] = [];

    // Build clusters
    for (const [representative, members] of groups) {
      // Enforce max cluster size
      const clusterMembers = members.slice(0, this.config.maxClusterSize);

      // Find canonical tool (shortest name or first alphabetically)
      const canonicalId = clusterMembers.reduce((best, id) => {
        const bestTool = toolMap.get(best);
        const currentTool = toolMap.get(id);
        if (!bestTool || !currentTool) return best;

        if (bestTool.name.length !== currentTool.name.length) {
          return bestTool.name.length < currentTool.name.length ? best : id;
        }
        return best < id ? best : id;
      });

      // Build unified description
      const canonicalTool = toolMap.get(canonicalId);
      const unifiedDescription = canonicalTool?.description || '';

      // Calculate internal similarities
      const internalSimilarities: Array<{ toolA: string; toolB: string; similarity: number }> = [];
      for (const pair of equivalentPairs) {
        if (clusterMembers.includes(pair.toolA) && clusterMembers.includes(pair.toolB)) {
          internalSimilarities.push({
            toolA: pair.toolA,
            toolB: pair.toolB,
            similarity: pair.similarity,
          });
        }
      }

      clusters.push({
        canonicalId,
        mergedToolIds: clusterMembers,
        unifiedDescription,
        inputSchema: canonicalTool?.inputSchema,
        internalSimilarities,
        createdAt: new Date(),
        version: 1,
      });
    }

    return clusters;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Compute similarity between a tool and a cluster
   */
  private async computeSimilarityToCluster(
    tool: ToolDefinition,
    cluster: ToolCluster
  ): Promise<number> {
    const toolEmbedding = this.embeddings.get(tool.id);
    if (!toolEmbedding) return 0;

    // Compute similarity to canonical tool
    const canonicalEmbedding = this.embeddings.get(cluster.canonicalId);
    if (canonicalEmbedding) {
      return this.cosineSimilarity(toolEmbedding, canonicalEmbedding);
    }

    // Fallback: average similarity to all members
    let totalSimilarity = 0;
    let count = 0;

    for (const memberId of cluster.mergedToolIds) {
      const memberEmbedding = this.embeddings.get(memberId);
      if (memberEmbedding) {
        totalSimilarity += this.cosineSimilarity(toolEmbedding, memberEmbedding);
        count++;
      }
    }

    return count > 0 ? totalSimilarity / count : 0;
  }

  /**
   * Create a tool definition from a cluster (for comparison)
   */
  private toolDefinitionFromCluster(cluster: ToolCluster): ToolDefinition {
    return {
      id: cluster.canonicalId,
      name: cluster.canonicalId,
      description: cluster.unifiedDescription,
      domain: 'merged',
      inputSchema: cluster.inputSchema,
    };
  }

  /**
   * Add a tool to an existing cluster
   */
  private addToolToCluster(
    cluster: ToolCluster,
    tool: ToolDefinition,
    similarity: number
  ): ToolCluster {
    return {
      ...cluster,
      mergedToolIds: [...cluster.mergedToolIds, tool.id],
      internalSimilarities: [
        ...cluster.internalSimilarities,
        {
          toolA: cluster.canonicalId,
          toolB: tool.id,
          similarity,
        },
      ],
      version: cluster.version + 1,
    };
  }

  /**
   * Create a singleton cluster for a tool
   */
  private createSingletonCluster(tool: ToolDefinition): ToolCluster {
    return {
      canonicalId: tool.id,
      mergedToolIds: [tool.id],
      unifiedDescription: tool.description,
      inputSchema: tool.inputSchema,
      internalSimilarities: [],
      createdAt: new Date(),
      version: 1,
    };
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get merger statistics
   */
  getStats(): {
    embeddingCount: number;
    registryStats: ReturnType<MergeRegistry['getStats']>;
  } {
    return {
      embeddingCount: this.embeddings.size,
      registryStats: this.registry.getStats(),
    };
  }

  /**
   * Clear embeddings cache
   */
  clearEmbeddings(): void {
    this.embeddings.clear();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let mergerInstance: ToolMerger | null = null;

export function getToolMerger(config?: Partial<ToolMergerConfig>): ToolMerger {
  if (!mergerInstance) {
    mergerInstance = new ToolMerger(config);
  }
  return mergerInstance;
}

export function resetToolMerger(): void {
  mergerInstance = null;
}

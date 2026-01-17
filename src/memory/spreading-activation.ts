/**
 * Spreading Activation
 *
 * Implements spreading activation through the memory graph.
 * When one memory is activated (accessed/relevant), activation
 * spreads to connected memories with decay based on distance.
 *
 * This mimics how human memory works - thinking of one thing
 * naturally brings related things to mind.
 *
 * @module memory/spreading-activation
 */

import { createLogger } from '../utils/safe-logger.js';
import { getMemoryGraph, type MemoryLink, type LinkType } from './memory-graph.js';

const log = createLogger({ module: 'SpreadingActivation' });

// ============================================================================
// TYPES
// ============================================================================

export interface ActivationResult {
  memoryId: string;
  activation: number; // 0-1, strength of activation
  distance: number; // Hops from source
  pathTypes: LinkType[]; // Link types traversed
  reason: string; // Why this memory was activated
}

export interface SpreadingConfig {
  // How much activation decays per hop
  decayFactor: number;

  // Maximum distance to spread
  maxDepth: number;

  // Minimum activation to continue spreading
  minActivation: number;

  // Link type weights (how much activation passes through each type)
  linkWeights: Record<LinkType, number>;

  // Whether to accumulate activation from multiple paths
  accumulatePaths: boolean;
}

const DEFAULT_CONFIG: SpreadingConfig = {
  decayFactor: 0.5,
  maxDepth: 3,
  minActivation: 0.1,
  linkWeights: {
    caused_by: 0.9, // Strong connection
    narrative: 0.8, // Story threads
    about_person: 0.85, // People connect memories strongly
    emotion: 0.7, // Emotional resonance
    topic: 0.6, // Topic similarity
    temporal: 0.5, // Time proximity
    contradiction: 0.3, // Contrast is weaker
    reinforces: 0.75, // Reinforcement is strong
  },
  accumulatePaths: true,
};

// ============================================================================
// SPREADING ACTIVATION ENGINE
// ============================================================================

export class SpreadingActivationEngine {
  private config: SpreadingConfig;

  constructor(config?: Partial<SpreadingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Spread activation from a single source memory
   */
  async spreadFromMemory(
    userId: string,
    sourceMemoryId: string,
    initialActivation = 1.0
  ): Promise<ActivationResult[]> {
    const memoryGraph = getMemoryGraph();
    const allLinks = await memoryGraph.getLinks(userId);

    // Build adjacency map
    const adjacency = this.buildAdjacencyMap(allLinks);

    // BFS with activation decay
    const results = new Map<string, ActivationResult>();
    const queue: Array<{
      memoryId: string;
      activation: number;
      distance: number;
      pathTypes: LinkType[];
    }> = [];

    // Start from source
    queue.push({
      memoryId: sourceMemoryId,
      activation: initialActivation,
      distance: 0,
      pathTypes: [],
    });

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Skip if activation too low
      if (current.activation < this.config.minActivation) continue;

      // Skip if too deep
      if (current.distance > this.config.maxDepth) continue;

      // Get or create result entry
      const existing = results.get(current.memoryId);
      if (existing) {
        if (this.config.accumulatePaths) {
          // Accumulate activation from multiple paths
          existing.activation = Math.min(1, existing.activation + current.activation * 0.5);
          // Keep shortest path
          if (current.distance < existing.distance) {
            existing.distance = current.distance;
            existing.pathTypes = current.pathTypes;
          }
        } else if (current.activation > existing.activation) {
          // Replace with stronger activation
          existing.activation = current.activation;
          existing.distance = current.distance;
          existing.pathTypes = current.pathTypes;
        }
        continue;
      }

      // Add new result
      results.set(current.memoryId, {
        memoryId: current.memoryId,
        activation: current.activation,
        distance: current.distance,
        pathTypes: current.pathTypes,
        reason:
          current.distance === 0
            ? 'Source memory'
            : `Activated via ${current.pathTypes.join(' → ')}`,
      });

      // Spread to neighbors
      const neighbors = adjacency.get(current.memoryId) || [];
      for (const { targetId, linkType, strength } of neighbors) {
        const linkWeight = this.config.linkWeights[linkType] ?? 0.5;
        const spreadActivation =
          current.activation * this.config.decayFactor * linkWeight * strength;

        if (spreadActivation >= this.config.minActivation) {
          queue.push({
            memoryId: targetId,
            activation: spreadActivation,
            distance: current.distance + 1,
            pathTypes: [...current.pathTypes, linkType],
          });
        }
      }
    }

    // Remove source from results
    results.delete(sourceMemoryId);

    // Sort by activation strength
    const sorted = Array.from(results.values()).sort((a, b) => b.activation - a.activation);

    log.debug(
      {
        userId,
        sourceMemoryId,
        activatedCount: sorted.length,
        topActivation: sorted[0]?.activation,
      },
      'Spreading activation complete'
    );

    return sorted;
  }

  /**
   * Spread activation from multiple sources
   */
  async spreadFromMultiple(
    userId: string,
    sourceMemoryIds: string[],
    weights?: number[]
  ): Promise<ActivationResult[]> {
    const allResults = new Map<string, ActivationResult>();

    for (let i = 0; i < sourceMemoryIds.length; i++) {
      const sourceId = sourceMemoryIds[i];
      const weight = weights?.[i] ?? 1.0;

      const results = await this.spreadFromMemory(userId, sourceId, weight);

      for (const result of results) {
        const existing = allResults.get(result.memoryId);
        if (existing) {
          // Accumulate from multiple sources
          existing.activation = Math.min(1, existing.activation + result.activation * 0.5);
          // Prefer shorter paths
          if (result.distance < existing.distance) {
            existing.distance = result.distance;
            existing.pathTypes = result.pathTypes;
            existing.reason = result.reason;
          }
        } else {
          allResults.set(result.memoryId, { ...result });
        }
      }
    }

    // Remove sources from results
    for (const sourceId of sourceMemoryIds) {
      allResults.delete(sourceId);
    }

    return Array.from(allResults.values()).sort((a, b) => b.activation - a.activation);
  }

  /**
   * Get memories activated by a topic/query
   * Uses semantic search to find initial activations, then spreads
   */
  async activateByTopic(
    userId: string,
    seedMemoryIds: string[],
    topK = 10
  ): Promise<ActivationResult[]> {
    // Spread from seed memories
    const activations = await this.spreadFromMultiple(userId, seedMemoryIds);

    // Return top K
    return activations.slice(0, topK);
  }

  /**
   * Find which memories would activate a target
   * (Reverse spreading)
   */
  async findActivators(
    userId: string,
    targetMemoryId: string,
    maxSources = 5
  ): Promise<ActivationResult[]> {
    const memoryGraph = getMemoryGraph();
    const allLinks = await memoryGraph.getLinks(userId);

    // Build reverse adjacency (who points to whom)
    const reverseAdjacency = this.buildReverseAdjacencyMap(allLinks);

    // BFS backwards from target
    const results = new Map<string, ActivationResult>();
    const queue: Array<{
      memoryId: string;
      activation: number;
      distance: number;
      pathTypes: LinkType[];
    }> = [];

    queue.push({
      memoryId: targetMemoryId,
      activation: 1.0,
      distance: 0,
      pathTypes: [],
    });

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.activation < this.config.minActivation) continue;
      if (current.distance > this.config.maxDepth) continue;

      const existing = results.get(current.memoryId);
      if (existing && existing.activation >= current.activation) continue;

      results.set(current.memoryId, {
        memoryId: current.memoryId,
        activation: current.activation,
        distance: current.distance,
        pathTypes: current.pathTypes,
        reason:
          current.distance === 0
            ? 'Target memory'
            : `Can activate via ${current.pathTypes.join(' → ')}`,
      });

      const sources = reverseAdjacency.get(current.memoryId) || [];
      for (const { targetId, linkType, strength } of sources) {
        const linkWeight = this.config.linkWeights[linkType] ?? 0.5;
        const spreadActivation =
          current.activation * this.config.decayFactor * linkWeight * strength;

        if (spreadActivation >= this.config.minActivation) {
          queue.push({
            memoryId: targetId,
            activation: spreadActivation,
            distance: current.distance + 1,
            pathTypes: [...current.pathTypes, linkType],
          });
        }
      }
    }

    // Remove target from results
    results.delete(targetMemoryId);

    return Array.from(results.values())
      .sort((a, b) => b.activation - a.activation)
      .slice(0, maxSources);
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private buildAdjacencyMap(
    links: MemoryLink[]
  ): Map<string, Array<{ targetId: string; linkType: LinkType; strength: number }>> {
    const adj = new Map<
      string,
      Array<{ targetId: string; linkType: LinkType; strength: number }>
    >();

    for (const link of links) {
      // Forward direction
      const forward = adj.get(link.sourceMemoryId) || [];
      forward.push({
        targetId: link.targetMemoryId,
        linkType: link.linkType,
        strength: link.strength,
      });
      adj.set(link.sourceMemoryId, forward);

      // Narrative and emotion links are bidirectional
      const bidirectionalTypes: LinkType[] = ['narrative', 'emotion', 'topic'];
      if (bidirectionalTypes.includes(link.linkType)) {
        const backward = adj.get(link.targetMemoryId) || [];
        backward.push({
          targetId: link.sourceMemoryId,
          linkType: link.linkType,
          strength: link.strength,
        });
        adj.set(link.targetMemoryId, backward);
      }
    }

    return adj;
  }

  private buildReverseAdjacencyMap(
    links: MemoryLink[]
  ): Map<string, Array<{ targetId: string; linkType: LinkType; strength: number }>> {
    const adj = new Map<
      string,
      Array<{ targetId: string; linkType: LinkType; strength: number }>
    >();

    for (const link of links) {
      // Reverse direction (who points to this memory)
      const reverse = adj.get(link.targetMemoryId) || [];
      reverse.push({
        targetId: link.sourceMemoryId,
        linkType: link.linkType,
        strength: link.strength,
      });
      adj.set(link.targetMemoryId, reverse);

      // Narrative and emotion links are bidirectional
      const bidirectionalTypes: LinkType[] = ['narrative', 'emotion', 'topic'];
      if (bidirectionalTypes.includes(link.linkType)) {
        const forward = adj.get(link.sourceMemoryId) || [];
        forward.push({
          targetId: link.targetMemoryId,
          linkType: link.linkType,
          strength: link.strength,
        });
        adj.set(link.sourceMemoryId, forward);
      }
    }

    return adj;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let spreadingActivationInstance: SpreadingActivationEngine | null = null;

export function getSpreadingActivation(): SpreadingActivationEngine {
  if (!spreadingActivationInstance) {
    spreadingActivationInstance = new SpreadingActivationEngine();
  }
  return spreadingActivationInstance;
}

export function resetSpreadingActivation(): void {
  spreadingActivationInstance = null;
}

export default {
  SpreadingActivationEngine,
  getSpreadingActivation,
  resetSpreadingActivation,
};

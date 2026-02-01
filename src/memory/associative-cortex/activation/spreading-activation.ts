/**
 * Spreading Activation Algorithm
 *
 * Implements a graph-based spreading activation for associative memory recall.
 * Models how human memory works - activating one concept spreads activation
 * to related concepts through weighted links.
 *
 * @module memory/associative-cortex/activation/spreading-activation
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  ActivationConfig,
  ActivationNode,
  ActivatedMemorySet,
  MemoryGraph,
  MemoryLink,
} from '../types.js';
import { DEFAULT_ACTIVATION_CONFIG } from '../types.js';
import type { MemoryLinkType } from '../../unified-store/types.js';

const log = createLogger({ module: 'SpreadingActivation' });

// ============================================================================
// PRIORITY QUEUE
// ============================================================================

/**
 * Simple priority queue for activation spreading
 */
class PriorityQueue<T> {
  private items: Array<{ value: T; priority: number }> = [];

  enqueue(value: T, priority: number): void {
    const item = { value, priority };

    // Find insertion point (higher priority = earlier in queue)
    let inserted = false;
    for (let i = 0; i < this.items.length; i++) {
      if (priority > this.items[i].priority) {
        this.items.splice(i, 0, item);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.items.push(item);
    }
  }

  dequeue(): T | undefined {
    const item = this.items.shift();
    return item?.value;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }
}

// ============================================================================
// LINK TYPE WEIGHTS
// ============================================================================

/**
 * Default weights for different link types
 */
export const DEFAULT_LINK_WEIGHTS: Record<MemoryLinkType, number> = {
  causal: 0.9,        // Strongest - direct cause-effect
  reinforced: 0.85,   // Strong - user confirmed connection
  emotional: 0.8,     // Strong - emotional resonance
  person: 0.75,       // Medium-strong - shared people
  topic: 0.7,         // Medium - shared topics
  temporal: 0.6,      // Medium-weak - time proximity
  narrative: 0.65,    // Medium - part of same story
  semantic: 0.5,      // Weak - embedding similarity only
};

// ============================================================================
// SPREADING ACTIVATION
// ============================================================================

/**
 * Spread activation through the memory graph
 *
 * Algorithm:
 * 1. Initialize seed nodes with full activation
 * 2. Use priority queue to process highest-activation nodes first
 * 3. For each node, spread activation to linked nodes (with decay)
 * 4. Aggregate or max activation at each target
 * 5. Continue until min activation threshold or max iterations
 * 6. Return top-K activated nodes
 */
export async function spreadActivation(
  seedMemoryIds: string[],
  graph: MemoryGraph,
  config: Partial<ActivationConfig> = {}
): Promise<ActivatedMemorySet> {
  const startTime = Date.now();
  const cfg: ActivationConfig = { ...DEFAULT_ACTIVATION_CONFIG, ...config };
  const linkWeights = { ...DEFAULT_LINK_WEIGHTS, ...cfg.linkWeights };

  // Track activations
  const activations = new Map<string, ActivationNode>();
  const queue = new PriorityQueue<string>();

  // Stats
  let nodesVisited = 0;
  let linksTraversed = 0;
  let maxDepth = 0;
  let iterations = 0;

  // 1. Initialize seed nodes
  for (const seedId of seedMemoryIds) {
    const node: ActivationNode = {
      memoryId: seedId,
      activation: cfg.initialActivation,
      activationPath: [],
      depth: 0,
      activatedAt: new Date(),
    };
    activations.set(seedId, node);
    queue.enqueue(seedId, cfg.initialActivation);
  }

  // 2. Spread activation
  while (!queue.isEmpty() && iterations < cfg.maxIterations) {
    iterations++;
    const currentId = queue.dequeue();
    if (!currentId) break;

    const currentNode = activations.get(currentId);
    if (!currentNode) continue;

    // Skip if activation too low
    if (currentNode.activation < cfg.minActivation) continue;

    // Skip if too deep
    if (currentNode.depth >= cfg.maxDepth) continue;

    nodesVisited++;

    // Get links from this node
    const links = await graph.getLinksFrom(currentId);
    linksTraversed += links.length;

    // Spread to each linked node
    for (const link of links) {
      // Calculate spread amount
      const typeWeight = linkWeights[link.type] ?? 0.5;
      const spreadAmount = currentNode.activation * link.weight * typeWeight * cfg.decayFactor;

      // Skip if spread is too small
      if (spreadAmount < cfg.minActivation) continue;

      // Update target node
      const existingTarget = activations.get(link.targetId);
      const newDepth = currentNode.depth + 1;

      if (existingTarget) {
        // Update existing node
        const newActivation = cfg.aggregateActivation
          ? Math.min(existingTarget.activation + spreadAmount, cfg.maxActivation)
          : Math.max(existingTarget.activation, spreadAmount);

        if (newActivation > existingTarget.activation) {
          existingTarget.activation = newActivation;
          existingTarget.activationPath.push({
            fromId: currentId,
            linkType: link.type,
            linkWeight: link.weight,
            spreadAmount,
          });

          // Re-queue with new priority if significantly increased
          if (newActivation > existingTarget.activation * 1.1) {
            queue.enqueue(link.targetId, newActivation);
          }
        }
      } else {
        // Create new node
        const newNode: ActivationNode = {
          memoryId: link.targetId,
          activation: spreadAmount,
          activationPath: [{
            fromId: currentId,
            linkType: link.type,
            linkWeight: link.weight,
            spreadAmount,
          }],
          depth: newDepth,
          activatedAt: new Date(),
        };
        activations.set(link.targetId, newNode);
        queue.enqueue(link.targetId, spreadAmount);

        if (newDepth > maxDepth) {
          maxDepth = newDepth;
        }
      }
    }
  }

  // 3. Sort by activation and take top K
  const allNodes = Array.from(activations.values());
  const ranked = allNodes
    .sort((a, b) => b.activation - a.activation)
    .slice(0, cfg.topK);

  // Find peak activation
  const peakActivation = ranked.length > 0 ? ranked[0].activation : 0;

  const durationMs = Date.now() - startTime;

  log.debug({
    seedCount: seedMemoryIds.length,
    nodesActivated: activations.size,
    iterations,
    durationMs,
  }, 'Spreading activation complete');

  return {
    nodes: activations,
    ranked,
    iterations,
    durationMs,
    stats: {
      nodesVisited,
      linksTraversed,
      maxDepth,
      peakActivation,
    },
  };
}

/**
 * Spread activation from a single seed
 */
export async function activateFromSeed(
  seedMemoryId: string,
  graph: MemoryGraph,
  config?: Partial<ActivationConfig>
): Promise<ActivatedMemorySet> {
  return spreadActivation([seedMemoryId], graph, config);
}

/**
 * Find memories most associated with a topic or concept
 */
export async function findAssociations(
  seedMemoryIds: string[],
  graph: MemoryGraph,
  options: {
    minActivation?: number;
    maxResults?: number;
    excludeSeeds?: boolean;
  } = {}
): Promise<ActivationNode[]> {
  const result = await spreadActivation(seedMemoryIds, graph, {
    minActivation: options.minActivation ?? 0.1,
    topK: options.maxResults ?? 10,
  });

  let associations = result.ranked;

  // Optionally exclude seed nodes
  if (options.excludeSeeds) {
    const seedSet = new Set(seedMemoryIds);
    associations = associations.filter((n) => !seedSet.has(n.memoryId));
  }

  return associations;
}

/**
 * Calculate association strength between two memories
 */
export async function calculateAssociationStrength(
  memoryId1: string,
  memoryId2: string,
  graph: MemoryGraph
): Promise<number> {
  // Spread from memory1 and see how much activation reaches memory2
  const result = await spreadActivation([memoryId1], graph, {
    maxIterations: 50,
    topK: 100,
  });

  const targetNode = result.nodes.get(memoryId2);
  return targetNode?.activation ?? 0;
}

/**
 * Find the shortest activation path between two memories
 */
export async function findActivationPath(
  fromId: string,
  toId: string,
  graph: MemoryGraph,
  maxDepth: number = 5
): Promise<string[] | null> {
  // BFS to find shortest path
  const visited = new Set<string>();
  const queue: Array<{ id: string; path: string[] }> = [
    { id: fromId, path: [fromId] },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.id === toId) {
      return current.path;
    }

    if (current.path.length >= maxDepth) continue;
    if (visited.has(current.id)) continue;

    visited.add(current.id);

    const links = await graph.getLinksFrom(current.id);
    for (const link of links) {
      if (!visited.has(link.targetId)) {
        queue.push({
          id: link.targetId,
          path: [...current.path, link.targetId],
        });
      }
    }
  }

  return null; // No path found
}

/**
 * Connection Finder
 *
 * Discovers hidden connections between memories that might not be
 * immediately obvious. Uses graph analysis and pattern detection
 * to surface insights like "your sleep patterns correlate with work stress".
 *
 * @module memory/associative-cortex/discovery/connection-finder
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { StoredMemory } from '../../unified-store/types.js';
import type {
  DiscoveredConnection,
  ConnectionType,
  DiscoveryConfig,
  MemoryGraph,
} from '../types.js';
import { DEFAULT_DISCOVERY_CONFIG } from '../types.js';
import { spreadActivation, findActivationPath } from '../activation/spreading-activation.js';

const log = createLogger({ module: 'ConnectionFinder' });

// ============================================================================
// CONNECTION FINDER
// ============================================================================

/**
 * Connection Finder
 *
 * Discovers meaningful connections between memories.
 */
export class ConnectionFinder {
  private config: DiscoveryConfig;

  constructor(config: Partial<DiscoveryConfig> = {}) {
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
  }

  /**
   * Find all connections to a memory
   */
  async findConnections(
    memory: StoredMemory,
    allMemories: StoredMemory[],
    graph: MemoryGraph
  ): Promise<DiscoveredConnection[]> {
    const connections: DiscoveredConnection[] = [];

    // Run each connection type detector
    for (const connectionType of this.config.connectionTypes) {
      const discovered = await this.findConnectionsOfType(
        memory,
        allMemories,
        graph,
        connectionType
      );
      connections.push(...discovered);
    }

    // Sort by strength and limit
    connections.sort((a, b) => b.strength - a.strength);
    return connections.slice(0, this.config.maxConnections);
  }

  /**
   * Find connections of a specific type
   */
  private async findConnectionsOfType(
    memory: StoredMemory,
    allMemories: StoredMemory[],
    graph: MemoryGraph,
    connectionType: ConnectionType
  ): Promise<DiscoveredConnection[]> {
    switch (connectionType) {
      case 'causal_chain':
        return this.findCausalChains(memory, allMemories, graph);
      case 'pattern_repetition':
        return this.findPatternRepetitions(memory, allMemories);
      case 'emotional_parallel':
        return this.findEmotionalParallels(memory, allMemories);
      case 'person_network':
        return this.findPersonNetworks(memory, allMemories);
      case 'topic_cluster':
        return this.findTopicClusters(memory, allMemories);
      case 'temporal_proximity':
        return this.findTemporalProximity(memory, allMemories);
      case 'value_alignment':
        return this.findValueAlignments(memory, allMemories);
      case 'growth_arc':
        return this.findGrowthArcs(memory, allMemories);
      default:
        return [];
    }
  }

  /**
   * Find causal chains (A led to B led to C)
   */
  private async findCausalChains(
    memory: StoredMemory,
    allMemories: StoredMemory[],
    graph: MemoryGraph
  ): Promise<DiscoveredConnection[]> {
    const connections: DiscoveredConnection[] = [];

    // Use spreading activation to find connected memories
    const activated = await spreadActivation([memory.id], graph, {
      maxDepth: 3,
      topK: 10,
    });

    // Look for chains
    for (const node of activated.ranked) {
      if (node.memoryId === memory.id) continue;
      if (node.activationPath.length < 2) continue;

      const targetMemory = allMemories.find((m) => m.id === node.memoryId);
      if (!targetMemory) continue;

      // Check if path suggests causality
      const hasCausalPath = node.activationPath.some(
        (p) => p.linkType === 'causal' || p.linkType === 'temporal'
      );

      if (hasCausalPath && node.activation >= this.config.minStrength) {
        connections.push({
          sourceMemory: memory,
          targetMemory,
          connectionType: 'causal_chain',
          strength: node.activation,
          description: this.describeCausalChain(memory, targetMemory, node.activationPath),
          path: node.activationPath.map((p) => p.fromId),
          discoveredAt: new Date(),
        });
      }
    }

    return connections;
  }

  /**
   * Find pattern repetitions (same situation recurring)
   */
  private async findPatternRepetitions(
    memory: StoredMemory,
    allMemories: StoredMemory[]
  ): Promise<DiscoveredConnection[]> {
    const connections: DiscoveredConnection[] = [];

    // Look for memories with similar content patterns
    for (const other of allMemories) {
      if (other.id === memory.id) continue;

      // Same topics recurring?
      const topicOverlap = this.calculateSetOverlap(
        memory.topics.map((t) => t.toLowerCase()),
        other.topics.map((t) => t.toLowerCase())
      );

      // Similar emotional weight?
      const emotionalSimilarity = 1 - Math.abs(memory.emotionalWeight - other.emotionalWeight);

      // Different time periods?
      const daysDiff = Math.abs(
        (memory.createdAt.getTime() - other.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const isTemporallyDistinct = daysDiff > 30;

      // Pattern = similar content but different times
      if (topicOverlap > 0.5 && emotionalSimilarity > 0.7 && isTemporallyDistinct) {
        const strength = (topicOverlap + emotionalSimilarity) / 2;

        if (strength >= this.config.minStrength) {
          connections.push({
            sourceMemory: memory,
            targetMemory: other,
            connectionType: 'pattern_repetition',
            strength,
            description: `Similar situation recurring: both involve ${memory.topics.slice(0, 2).join(' and ')}`,
            discoveredAt: new Date(),
          });
        }
      }
    }

    return connections;
  }

  /**
   * Find emotional parallels (same emotion in different contexts)
   */
  private async findEmotionalParallels(
    memory: StoredMemory,
    allMemories: StoredMemory[]
  ): Promise<DiscoveredConnection[]> {
    const connections: DiscoveredConnection[] = [];

    // Only for emotionally significant memories
    if (memory.emotionalWeight < 0.4) return [];

    for (const other of allMemories) {
      if (other.id === memory.id) continue;
      if (other.emotionalWeight < 0.4) continue;

      // Similar emotional weight?
      const emotionalSimilarity = 1 - Math.abs(memory.emotionalWeight - other.emotionalWeight);

      // Different topics (different context)?
      const topicOverlap = this.calculateSetOverlap(
        memory.topics.map((t) => t.toLowerCase()),
        other.topics.map((t) => t.toLowerCase())
      );
      const differentContext = topicOverlap < 0.3;

      if (emotionalSimilarity > 0.8 && differentContext) {
        const strength = emotionalSimilarity * 0.8;

        if (strength >= this.config.minStrength) {
          connections.push({
            sourceMemory: memory,
            targetMemory: other,
            connectionType: 'emotional_parallel',
            strength,
            description: `Similar emotional experience in different contexts`,
            discoveredAt: new Date(),
          });
        }
      }
    }

    return connections;
  }

  /**
   * Find person networks (shared people)
   */
  private async findPersonNetworks(
    memory: StoredMemory,
    allMemories: StoredMemory[]
  ): Promise<DiscoveredConnection[]> {
    const connections: DiscoveredConnection[] = [];

    if (memory.peopleMentioned.length === 0) return [];

    const memoryPeople = new Set(memory.peopleMentioned.map((p) => p.toLowerCase()));

    for (const other of allMemories) {
      if (other.id === memory.id) continue;
      if (other.peopleMentioned.length === 0) continue;

      const otherPeople = new Set(other.peopleMentioned.map((p) => p.toLowerCase()));
      const sharedPeople = [...memoryPeople].filter((p) => otherPeople.has(p));

      if (sharedPeople.length > 0) {
        const strength = sharedPeople.length / Math.max(memoryPeople.size, otherPeople.size);

        if (strength >= this.config.minStrength) {
          connections.push({
            sourceMemory: memory,
            targetMemory: other,
            connectionType: 'person_network',
            strength: Math.min(1, strength + 0.3),
            description: `Connected through: ${sharedPeople.join(', ')}`,
            discoveredAt: new Date(),
          });
        }
      }
    }

    return connections;
  }

  /**
   * Find topic clusters
   */
  private async findTopicClusters(
    memory: StoredMemory,
    allMemories: StoredMemory[]
  ): Promise<DiscoveredConnection[]> {
    const connections: DiscoveredConnection[] = [];

    if (memory.topics.length === 0) return [];

    const memoryTopics = new Set(memory.topics.map((t) => t.toLowerCase()));

    for (const other of allMemories) {
      if (other.id === memory.id) continue;
      if (other.topics.length === 0) continue;

      const overlap = this.calculateSetOverlap(
        memory.topics.map((t) => t.toLowerCase()),
        other.topics.map((t) => t.toLowerCase())
      );

      if (overlap >= 0.5) {
        const sharedTopics = memory.topics.filter((t) =>
          other.topics.some((ot) => ot.toLowerCase() === t.toLowerCase())
        );

        connections.push({
          sourceMemory: memory,
          targetMemory: other,
          connectionType: 'topic_cluster',
          strength: overlap,
          description: `Part of topic cluster: ${sharedTopics.slice(0, 3).join(', ')}`,
          discoveredAt: new Date(),
        });
      }
    }

    return connections;
  }

  /**
   * Find temporal proximity
   */
  private async findTemporalProximity(
    memory: StoredMemory,
    allMemories: StoredMemory[]
  ): Promise<DiscoveredConnection[]> {
    const connections: DiscoveredConnection[] = [];
    const memoryTime = memory.createdAt.getTime();

    for (const other of allMemories) {
      if (other.id === memory.id) continue;

      const daysDiff = Math.abs(memoryTime - other.createdAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff <= this.config.temporalWindowDays && daysDiff > 0) {
        const strength = 1 - daysDiff / this.config.temporalWindowDays;

        if (strength >= this.config.minStrength) {
          connections.push({
            sourceMemory: memory,
            targetMemory: other,
            connectionType: 'temporal_proximity',
            strength,
            description: `Happened ${daysDiff.toFixed(0)} days apart`,
            discoveredAt: new Date(),
          });
        }
      }
    }

    return connections;
  }

  /**
   * Find value alignments
   */
  private async findValueAlignments(
    memory: StoredMemory,
    allMemories: StoredMemory[]
  ): Promise<DiscoveredConnection[]> {
    // This would require semantic analysis of content
    // For now, use topic-based approximation
    const valueTopics = ['values', 'beliefs', 'principles', 'important', 'meaningful'];

    const memoryHasValues = memory.topics.some((t) =>
      valueTopics.some((v) => t.toLowerCase().includes(v))
    );

    if (!memoryHasValues) return [];

    const connections: DiscoveredConnection[] = [];

    for (const other of allMemories) {
      if (other.id === memory.id) continue;

      const otherHasValues = other.topics.some((t) =>
        valueTopics.some((v) => t.toLowerCase().includes(v))
      );

      if (otherHasValues) {
        const topicOverlap = this.calculateSetOverlap(
          memory.topics.map((t) => t.toLowerCase()),
          other.topics.map((t) => t.toLowerCase())
        );

        if (topicOverlap > 0.3) {
          connections.push({
            sourceMemory: memory,
            targetMemory: other,
            connectionType: 'value_alignment',
            strength: topicOverlap + 0.2,
            description: 'Reflects similar underlying values',
            discoveredAt: new Date(),
          });
        }
      }
    }

    return connections;
  }

  /**
   * Find growth arcs
   */
  private async findGrowthArcs(
    memory: StoredMemory,
    allMemories: StoredMemory[]
  ): Promise<DiscoveredConnection[]> {
    const connections: DiscoveredConnection[] = [];

    // Look for memories with similar topics but at different times
    // that show progression
    const memoryTopics = new Set(memory.topics.map((t) => t.toLowerCase()));

    for (const other of allMemories) {
      if (other.id === memory.id) continue;

      // Must have topic overlap
      const topicOverlap = this.calculateSetOverlap(
        memory.topics.map((t) => t.toLowerCase()),
        other.topics.map((t) => t.toLowerCase())
      );

      if (topicOverlap < 0.4) continue;

      // Must be temporally separated (at least 7 days)
      const daysDiff =
        (memory.createdAt.getTime() - other.createdAt.getTime()) / (1000 * 60 * 60 * 24);

      if (Math.abs(daysDiff) < 7) continue;

      // Check if emotional trajectory suggests growth
      const [earlier, later] = daysDiff > 0 ? [other, memory] : [memory, other];
      const emotionalImprovement = later.emotionalWeight < earlier.emotionalWeight;

      if (emotionalImprovement || earlier.isActiveCommitment) {
        connections.push({
          sourceMemory: earlier,
          targetMemory: later,
          connectionType: 'growth_arc',
          strength: topicOverlap + (emotionalImprovement ? 0.2 : 0),
          description: `Shows growth in ${memory.topics[0] || 'this area'} over time`,
          discoveredAt: new Date(),
        });
      }
    }

    return connections;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate set overlap (Jaccard similarity)
   */
  private calculateSetOverlap(set1: string[], set2: string[]): number {
    const s1 = new Set(set1);
    const s2 = new Set(set2);

    const intersection = [...s1].filter((x) => s2.has(x)).length;
    const union = new Set([...s1, ...s2]).size;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Describe a causal chain
   */
  private describeCausalChain(
    source: StoredMemory,
    target: StoredMemory,
    path: { fromId: string; linkType: string }[]
  ): string {
    const linkTypes = path.map((p) => p.linkType).join(' → ');
    return `Connection through ${linkTypes}: ${source.topics[0] || 'event'} may have influenced ${target.topics[0] || 'outcome'}`;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let finderInstance: ConnectionFinder | null = null;

export function getConnectionFinder(config?: Partial<DiscoveryConfig>): ConnectionFinder {
  if (!finderInstance) {
    finderInstance = new ConnectionFinder(config);
  }
  return finderInstance;
}

export function resetConnectionFinder(): void {
  finderInstance = null;
}

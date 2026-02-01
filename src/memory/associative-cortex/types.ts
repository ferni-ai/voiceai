/**
 * Associative Cortex Types
 *
 * Type definitions for the graph-based associative memory system.
 * Models human-like memory association through spreading activation.
 *
 * @module memory/associative-cortex/types
 */

import type { StoredMemory, MemoryLinkType } from '../unified-store/types.js';

// ============================================================================
// ACTIVATION TYPES
// ============================================================================

/**
 * A node in the activation spread
 */
export interface ActivationNode {
  /** Memory ID */
  memoryId: string;

  /** Current activation level (0-1) */
  activation: number;

  /** How this node was activated */
  activationPath: ActivationPath[];

  /** Depth from initial node */
  depth: number;

  /** When activated */
  activatedAt: Date;
}

/**
 * Path showing how activation reached this node
 */
export interface ActivationPath {
  /** Source node that activated this one */
  fromId: string;

  /** Link type used */
  linkType: MemoryLinkType;

  /** Link weight (0-1) */
  linkWeight: number;

  /** Activation amount that spread */
  spreadAmount: number;
}

/**
 * Result of spreading activation
 */
export interface ActivatedMemorySet {
  /** All activated nodes */
  nodes: Map<string, ActivationNode>;

  /** Sorted by activation (highest first) */
  ranked: ActivationNode[];

  /** Total iterations performed */
  iterations: number;

  /** Time taken (ms) */
  durationMs: number;

  /** Statistics */
  stats: {
    nodesVisited: number;
    linksTraversed: number;
    maxDepth: number;
    peakActivation: number;
  };
}

/**
 * Configuration for spreading activation
 */
export interface ActivationConfig {
  /** Initial activation for seed nodes (default: 1.0) */
  initialActivation: number;

  /** Decay factor per hop (default: 0.7) */
  decayFactor: number;

  /** Minimum activation to continue spreading (default: 0.05) */
  minActivation: number;

  /** Maximum iterations (default: 100) */
  maxIterations: number;

  /** Maximum depth to explore (default: 4) */
  maxDepth: number;

  /** Top K results to return (default: 20) */
  topK: number;

  /** Link type weights (optional overrides) */
  linkWeights?: Partial<Record<MemoryLinkType, number>>;

  /** Whether to aggregate activation (true) or take max (false) */
  aggregateActivation: boolean;

  /** Maximum activation cap (default: 2.0) */
  maxActivation: number;
}

/**
 * Default activation config
 */
export const DEFAULT_ACTIVATION_CONFIG: ActivationConfig = {
  initialActivation: 1.0,
  decayFactor: 0.7,
  minActivation: 0.05,
  maxIterations: 100,
  maxDepth: 4,
  topK: 20,
  aggregateActivation: true,
  maxActivation: 2.0,
};

// ============================================================================
// GRAPH TYPES
// ============================================================================

/**
 * A link in the memory graph
 */
export interface MemoryLink {
  /** Source memory ID */
  sourceId: string;

  /** Target memory ID */
  targetId: string;

  /** Type of link */
  type: MemoryLinkType;

  /** Link strength (0-1) */
  weight: number;

  /** When the link was created */
  createdAt: Date;

  /** Metadata about the link */
  metadata?: {
    /** Why this link was created */
    reason?: string;
    /** Confidence in the link */
    confidence?: number;
    /** Number of times this association was reinforced */
    reinforcements?: number;
  };
}

/**
 * Memory graph interface
 */
export interface MemoryGraph {
  /** Get all links from a memory */
  getLinksFrom(memoryId: string): Promise<MemoryLink[]>;

  /** Get all links to a memory */
  getLinksTo(memoryId: string): Promise<MemoryLink[]>;

  /** Get all links for a memory (both directions) */
  getLinks(memoryId: string): Promise<MemoryLink[]>;

  /** Add a link */
  addLink(link: Omit<MemoryLink, 'createdAt'>): Promise<void>;

  /** Remove a link */
  removeLink(sourceId: string, targetId: string, type: MemoryLinkType): Promise<void>;

  /** Check if link exists */
  hasLink(sourceId: string, targetId: string, type?: MemoryLinkType): Promise<boolean>;

  /** Get link count for a memory */
  getLinkCount(memoryId: string): Promise<number>;
}

// ============================================================================
// DISCOVERY TYPES
// ============================================================================

/**
 * A discovered connection between memories
 */
export interface DiscoveredConnection {
  /** Source memory */
  sourceMemory: StoredMemory;

  /** Target memory */
  targetMemory: StoredMemory;

  /** Type of connection */
  connectionType: ConnectionType;

  /** Strength of connection (0-1) */
  strength: number;

  /** Human-readable description */
  description: string;

  /** Intermediate nodes in the path (if indirect) */
  path?: string[];

  /** When discovered */
  discoveredAt: Date;
}

/**
 * Types of connections that can be discovered
 */
export type ConnectionType =
  | 'causal_chain'        // A led to B led to C
  | 'pattern_repetition'  // Similar situations recurring
  | 'emotional_parallel'  // Same emotion in different contexts
  | 'person_network'      // Shared people
  | 'topic_cluster'       // Related topics grouping
  | 'temporal_proximity'  // Things that happened around same time
  | 'value_alignment'     // Reflects same underlying value
  | 'growth_arc';         // Shows growth over time

/**
 * Configuration for connection discovery
 */
export interface DiscoveryConfig {
  /** Minimum connection strength to report */
  minStrength: number;

  /** Maximum connections to return */
  maxConnections: number;

  /** Connection types to look for */
  connectionTypes: ConnectionType[];

  /** Time window for temporal proximity (days) */
  temporalWindowDays: number;

  /** Whether to include indirect connections */
  includeIndirect: boolean;

  /** Maximum path length for indirect */
  maxPathLength: number;
}

/**
 * Default discovery config
 */
export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  minStrength: 0.4,
  maxConnections: 10,
  connectionTypes: [
    'causal_chain',
    'pattern_repetition',
    'emotional_parallel',
    'person_network',
    'topic_cluster',
  ],
  temporalWindowDays: 30,
  includeIndirect: true,
  maxPathLength: 3,
};

// ============================================================================
// NARRATIVE TYPES
// ============================================================================

/**
 * A narrative arc built from memories
 */
export interface NarrativeArc {
  /** Arc ID */
  id: string;

  /** User ID */
  userId: string;

  /** Theme of this arc */
  theme: string;

  /** Memories in this arc (ordered chronologically) */
  memories: StoredMemory[];

  /** Key moments in the arc */
  keyMoments: KeyMoment[];

  /** Overall emotional trajectory */
  emotionalTrajectory: EmotionalTrajectory;

  /** Insights from this arc */
  insights: string[];

  /** Arc type */
  type: NarrativeType;

  /** When this arc was identified */
  identifiedAt: Date;
}

/**
 * A key moment in a narrative
 */
export interface KeyMoment {
  /** Memory ID */
  memoryId: string;

  /** Type of moment */
  type: 'turning_point' | 'realization' | 'challenge' | 'success' | 'setback' | 'growth';

  /** Why this is a key moment */
  significance: string;

  /** Emotional intensity at this moment */
  emotionalIntensity: number;
}

/**
 * Emotional trajectory over time
 */
export interface EmotionalTrajectory {
  /** Overall direction */
  direction: 'improving' | 'declining' | 'stable' | 'fluctuating';

  /** Starting emotional weight */
  startWeight: number;

  /** Ending emotional weight */
  endWeight: number;

  /** Key shifts in the trajectory */
  shifts: Array<{
    memoryId: string;
    from: number;
    to: number;
    reason?: string;
  }>;
}

/**
 * Types of narrative arcs
 */
export type NarrativeType =
  | 'growth_journey'      // Shows development over time
  | 'challenge_overcome'  // Facing and beating a challenge
  | 'recurring_pattern'   // Same situation repeating
  | 'relationship_arc'    // Story about a relationship
  | 'value_evolution'     // How values changed
  | 'life_chapter';       // Major life phase

// ============================================================================
// CORTEX INTERFACE
// ============================================================================

/**
 * Main interface for the Associative Cortex
 */
export interface AssociativeCortex {
  /**
   * Spread activation from seed memories
   */
  spreadActivation(
    seedMemoryIds: string[],
    config?: Partial<ActivationConfig>
  ): Promise<ActivatedMemorySet>;

  /**
   * Find connections to a memory
   */
  findConnections(
    memoryId: string,
    config?: Partial<DiscoveryConfig>
  ): Promise<DiscoveredConnection[]>;

  /**
   * Build a narrative arc from memories
   */
  buildNarrative(
    userId: string,
    theme: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<NarrativeArc | null>;

  /**
   * Get all narrative arcs for a user
   */
  getUserNarratives(userId: string): Promise<NarrativeArc[]>;

  /**
   * Auto-detect and create links between memories
   */
  autoLink(memory: StoredMemory, existingMemories: StoredMemory[]): Promise<MemoryLink[]>;

  /**
   * Prune weak or old links
   */
  pruneLinks(userId: string, minWeight?: number, maxAge?: number): Promise<number>;

  /**
   * Get graph statistics
   */
  getStats(userId: string): Promise<{
    totalMemories: number;
    totalLinks: number;
    averageLinksPerMemory: number;
    linkTypeDistribution: Record<MemoryLinkType, number>;
    strongestConnections: MemoryLink[];
  }>;
}

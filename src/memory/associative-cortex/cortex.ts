/**
 * Associative Cortex
 *
 * Main implementation of the associative memory system.
 * Coordinates spreading activation, link detection, connection discovery,
 * and narrative building to provide human-like associative recall.
 *
 * @module memory/associative-cortex/cortex
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { StoredMemory, MemoryLinkType } from '../unified-store/types.js';
import type {
  AssociativeCortex,
  ActivationConfig,
  ActivatedMemorySet,
  DiscoveryConfig,
  DiscoveredConnection,
  NarrativeArc,
  MemoryGraph,
  MemoryLink,
} from './types.js';
import { DEFAULT_ACTIVATION_CONFIG, DEFAULT_DISCOVERY_CONFIG } from './types.js';
import { spreadActivation } from './activation/spreading-activation.js';
import { LinkDetector, getLinkDetector } from './graph/link-detector.js';
import { ConnectionFinder, getConnectionFinder } from './discovery/connection-finder.js';
import { NarrativeBuilder, getNarrativeBuilder } from './discovery/narrative-builder.js';

const log = createLogger({ module: 'AssociativeCortex' });

// ============================================================================
// IN-MEMORY GRAPH ADAPTER
// ============================================================================

/**
 * In-memory implementation of MemoryGraph for testing and fallback
 */
class InMemoryGraph implements MemoryGraph {
  private links: Map<string, MemoryLink[]> = new Map();
  private reverseLinks: Map<string, MemoryLink[]> = new Map();

  async getLinksFrom(memoryId: string): Promise<MemoryLink[]> {
    return this.links.get(memoryId) || [];
  }

  async getLinksTo(memoryId: string): Promise<MemoryLink[]> {
    return this.reverseLinks.get(memoryId) || [];
  }

  async getLinks(memoryId: string): Promise<MemoryLink[]> {
    const from = await this.getLinksFrom(memoryId);
    const to = await this.getLinksTo(memoryId);
    return [...from, ...to];
  }

  async addLink(link: Omit<MemoryLink, 'createdAt'>): Promise<void> {
    const fullLink: MemoryLink = { ...link, createdAt: new Date() };

    // Add to forward links
    const existing = this.links.get(link.sourceId) || [];
    existing.push(fullLink);
    this.links.set(link.sourceId, existing);

    // Add to reverse links
    const reverse = this.reverseLinks.get(link.targetId) || [];
    reverse.push(fullLink);
    this.reverseLinks.set(link.targetId, reverse);
  }

  async removeLink(sourceId: string, targetId: string, type: MemoryLinkType): Promise<void> {
    const fromLinks = this.links.get(sourceId) || [];
    this.links.set(
      sourceId,
      fromLinks.filter((l) => !(l.targetId === targetId && l.type === type))
    );

    const toLinks = this.reverseLinks.get(targetId) || [];
    this.reverseLinks.set(
      targetId,
      toLinks.filter((l) => !(l.sourceId === sourceId && l.type === type))
    );
  }

  async hasLink(sourceId: string, targetId: string, type?: MemoryLinkType): Promise<boolean> {
    const links = this.links.get(sourceId) || [];
    return links.some((l) => l.targetId === targetId && (type === undefined || l.type === type));
  }

  async getLinkCount(memoryId: string): Promise<number> {
    const from = this.links.get(memoryId) || [];
    const to = this.reverseLinks.get(memoryId) || [];
    return from.length + to.length;
  }

  clear(): void {
    this.links.clear();
    this.reverseLinks.clear();
  }
}

// ============================================================================
// ASSOCIATIVE CORTEX IMPLEMENTATION
// ============================================================================

/**
 * Associative Cortex Implementation
 *
 * Main orchestrator for associative memory operations.
 */
export class AssociativeCortexImpl implements AssociativeCortex {
  private graph: MemoryGraph;
  private linkDetector: LinkDetector;
  private connectionFinder: ConnectionFinder;
  private narrativeBuilder: NarrativeBuilder;
  private initialized = false;

  // Caches
  private memoryCache: Map<string, StoredMemory[]> = new Map();
  private narrativeCache: Map<string, NarrativeArc[]> = new Map();

  constructor(graph?: MemoryGraph) {
    this.graph = graph || new InMemoryGraph();
    this.linkDetector = getLinkDetector();
    this.connectionFinder = getConnectionFinder();
    this.narrativeBuilder = getNarrativeBuilder();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    log.info('AssociativeCortex initialized');
  }

  /**
   * Spread activation from seed memories
   */
  async spreadActivation(
    seedMemoryIds: string[],
    config?: Partial<ActivationConfig>
  ): Promise<ActivatedMemorySet> {
    await this.ensureInitialized();

    const fullConfig = { ...DEFAULT_ACTIVATION_CONFIG, ...config };
    return spreadActivation(seedMemoryIds, this.graph, fullConfig);
  }

  /**
   * Find connections to a memory
   */
  async findConnections(
    memoryId: string,
    config?: Partial<DiscoveryConfig>
  ): Promise<DiscoveredConnection[]> {
    await this.ensureInitialized();

    // Get memory and related memories
    const allMemories = await this.getMemoriesForUser(memoryId);
    const sourceMemory = allMemories.find((m) => m.id === memoryId);

    if (!sourceMemory) {
      log.warn({ memoryId }, 'Memory not found for connection discovery');
      return [];
    }

    return this.connectionFinder.findConnections(sourceMemory, allMemories, this.graph);
  }

  /**
   * Build a narrative arc from memories
   */
  async buildNarrative(
    userId: string,
    theme: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<NarrativeArc | null> {
    await this.ensureInitialized();

    const memories = await this.getMemoriesForUser(userId);
    return this.narrativeBuilder.buildNarrative(userId, theme, memories, timeRange);
  }

  /**
   * Get all narrative arcs for a user
   */
  async getUserNarratives(userId: string): Promise<NarrativeArc[]> {
    await this.ensureInitialized();

    // Check cache
    const cached = this.narrativeCache.get(userId);
    if (cached) return cached;

    const memories = await this.getMemoriesForUser(userId);
    const narratives = await this.narrativeBuilder.findNarratives(userId, memories);

    // Cache for 5 minutes
    this.narrativeCache.set(userId, narratives);
    setTimeout(() => this.narrativeCache.delete(userId), 5 * 60 * 1000);

    return narratives;
  }

  /**
   * Auto-detect and create links between memories
   */
  async autoLink(memory: StoredMemory, existingMemories: StoredMemory[]): Promise<MemoryLink[]> {
    await this.ensureInitialized();

    const detections = await this.linkDetector.detectLinks(memory, existingMemories);
    const createdLinks: MemoryLink[] = [];

    for (const detection of detections) {
      // Check if link already exists
      const exists = await this.graph.hasLink(
        detection.link.sourceId,
        detection.link.targetId,
        detection.link.type
      );

      if (!exists) {
        await this.graph.addLink(detection.link);
        createdLinks.push({ ...detection.link, createdAt: new Date() });
      }
    }

    log.debug({
      memoryId: memory.id,
      detected: detections.length,
      created: createdLinks.length,
    }, 'Auto-linked memory');

    return createdLinks;
  }

  /**
   * Prune weak or old links
   */
  async pruneLinks(userId: string, minWeight: number = 0.3, maxAgeDays: number = 365): Promise<number> {
    await this.ensureInitialized();

    let pruned = 0;
    const memories = await this.getMemoriesForUser(userId);
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    for (const memory of memories) {
      const links = await this.graph.getLinksFrom(memory.id);

      for (const link of links) {
        const age = now - link.createdAt.getTime();
        const shouldPrune = link.weight < minWeight || age > maxAgeMs;

        if (shouldPrune) {
          await this.graph.removeLink(link.sourceId, link.targetId, link.type);
          pruned++;
        }
      }
    }

    log.info({ userId, pruned }, 'Pruned links');
    return pruned;
  }

  /**
   * Get graph statistics
   */
  async getStats(userId: string): Promise<{
    totalMemories: number;
    totalLinks: number;
    averageLinksPerMemory: number;
    linkTypeDistribution: Record<MemoryLinkType, number>;
    strongestConnections: MemoryLink[];
  }> {
    await this.ensureInitialized();

    const memories = await this.getMemoriesForUser(userId);
    const allLinks: MemoryLink[] = [];
    const linkTypeDistribution: Record<string, number> = {};

    for (const memory of memories) {
      const links = await this.graph.getLinksFrom(memory.id);
      allLinks.push(...links);

      for (const link of links) {
        linkTypeDistribution[link.type] = (linkTypeDistribution[link.type] || 0) + 1;
      }
    }

    // Find strongest connections
    const strongestConnections = [...allLinks]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    return {
      totalMemories: memories.length,
      totalLinks: allLinks.length,
      averageLinksPerMemory: memories.length > 0 ? allLinks.length / memories.length : 0,
      linkTypeDistribution: linkTypeDistribution as Record<MemoryLinkType, number>,
      strongestConnections,
    };
  }

  /**
   * Set the memory graph implementation
   */
  setGraph(graph: MemoryGraph): void {
    this.graph = graph;
  }

  /**
   * Load memories for a user from the UnifiedMemoryStore
   * 
   * Uses dynamic import to avoid circular dependency with facade.ts
   * Caches results for subsequent calls within the same session.
   */
  private async getMemoriesForUser(userIdOrMemoryId: string): Promise<StoredMemory[]> {
    // Check cache first
    const cached = this.memoryCache.get(userIdOrMemoryId);
    if (cached) return cached;

    try {
      // Dynamic import to avoid circular dependency with facade
      const { getUnifiedStore } = await import('../unified-store/facade.js');
      const store = getUnifiedStore();

      // Recall memories for this user with a broad query
      // This returns recent and relevant memories
      const recallResult = await store.recall({
        userId: userIdOrMemoryId,
        query: '', // Empty query to get recent memories
        limit: 100, // Get up to 100 memories for association analysis
        minScore: 0, // No minimum score to get all memories
      });

      const memories = recallResult.memories.map((m) => m.memory);

      // Cache for subsequent calls (5 minute TTL)
      this.memoryCache.set(userIdOrMemoryId, memories);
      setTimeout(() => this.memoryCache.delete(userIdOrMemoryId), 5 * 60 * 1000);

      log.debug(
        { userId: userIdOrMemoryId, memoriesLoaded: memories.length },
        'Loaded memories from UnifiedStore for associative analysis'
      );

      return memories;
    } catch (error) {
      log.warn(
        { error: String(error), userId: userIdOrMemoryId },
        'Failed to fetch memories from UnifiedStore, returning empty'
      );
      return [];
    }
  }

  /**
   * Cache memories for a user (used by callers)
   */
  cacheMemories(userId: string, memories: StoredMemory[]): void {
    this.memoryCache.set(userId, memories);
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.memoryCache.clear();
    this.narrativeCache.clear();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let cortexInstance: AssociativeCortexImpl | null = null;

/**
 * Get the Associative Cortex singleton
 *
 * By default, uses SpannerMemoryGraph for persistent storage.
 * Falls back to InMemoryGraph when Spanner is unavailable.
 *
 * @param graph Optional graph implementation to use (overrides default)
 */
export function getAssociativeCortex(graph?: MemoryGraph): AssociativeCortexImpl {
  if (!cortexInstance) {
    // Default to SpannerMemoryGraph if no graph provided
    if (!graph) {
      try {
        // Dynamic import to avoid circular dependencies
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { getSpannerMemoryGraph } = require('./graph/spanner-graph.js');
        graph = getSpannerMemoryGraph();
        log.info('AssociativeCortex using SpannerMemoryGraph');
      } catch (error) {
        log.debug({ error: String(error) }, 'SpannerMemoryGraph not available, using InMemoryGraph');
        graph = new InMemoryGraph();
      }
    }
    cortexInstance = new AssociativeCortexImpl(graph);
  }
  return cortexInstance;
}

export function resetAssociativeCortex(): void {
  cortexInstance = null;
}

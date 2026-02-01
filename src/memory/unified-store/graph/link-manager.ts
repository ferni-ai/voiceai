/**
 * Memory Link Manager
 *
 * Orchestrates link operations including auto-detection, maintenance, and graph traversal.
 *
 * @module memory/unified-store/graph/link-manager
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { MemoryLink, MemoryLinkType, MemoryLinkInput, StoredMemory } from '../types.js';
import { getFirestoreLinkStore, FirestoreLinkStore } from './firestore-links.js';
import { detectLinks, applyLinkDecay, LINK_TYPE_CONFIGS } from './link-types.js';

const log = createLogger({ module: 'LinkManager' });

// ============================================================================
// TYPES
// ============================================================================

export interface LinkManagerConfig {
  /** Enable automatic link detection */
  enableAutoDetection?: boolean;

  /** Maximum links to auto-create per memory */
  maxAutoLinksPerMemory?: number;

  /** Minimum link weight to keep during maintenance */
  minLinkWeight?: number;

  /** Run decay on access? */
  decayOnAccess?: boolean;
}

export interface GraphTraversalResult {
  /** Memories found via graph traversal */
  memories: Array<{
    memoryId: string;
    path: MemoryLink[];
    totalWeight: number;
    hops: number;
  }>;

  /** Total memories visited */
  visitedCount: number;

  /** Traversal time (ms) */
  traversalTimeMs: number;
}

export interface MaintenanceReport {
  /** User ID */
  userId: string;

  /** When maintenance ran */
  ranAt: Date;

  /** Duration (ms) */
  durationMs: number;

  /** Links processed */
  linksProcessed: number;

  /** Links decayed */
  linksDecayed: number;

  /** Links pruned (removed) */
  linksPruned: number;

  /** Links reinforced */
  linksReinforced: number;
}

const DEFAULT_CONFIG: LinkManagerConfig = {
  enableAutoDetection: true,
  maxAutoLinksPerMemory: 10,
  minLinkWeight: 0.1,
  decayOnAccess: true,
};

// ============================================================================
// LINK MANAGER
// ============================================================================

/**
 * Manages memory links including detection, maintenance, and traversal
 */
export class LinkManager {
  private store: FirestoreLinkStore;
  private config: LinkManagerConfig;
  private initialized = false;

  constructor(config?: Partial<LinkManagerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = getFirestoreLinkStore();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.store.initialize();
    this.initialized = true;

    log.info('Link manager initialized');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LINK CRUD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a link manually
   */
  async createLink(userId: string, input: MemoryLinkInput): Promise<MemoryLink> {
    await this.ensureInitialized();
    return this.store.createLink(userId, input);
  }

  /**
   * Get links for a memory
   */
  async getLinks(
    userId: string,
    memoryId: string,
    type?: MemoryLinkType
  ): Promise<MemoryLink[]> {
    await this.ensureInitialized();

    const links = await this.store.getLinksForMemory(userId, memoryId, { type });

    // Apply decay if configured
    if (this.config.decayOnAccess) {
      return links.map((link) => ({
        ...link,
        weight: applyLinkDecay(link),
      }));
    }

    return links;
  }

  /**
   * Remove a link
   */
  async removeLink(userId: string, linkId: string): Promise<void> {
    await this.ensureInitialized();
    await this.store.deleteLink(userId, linkId);
  }

  /**
   * Reinforce a link (increase weight)
   */
  async reinforceLink(userId: string, linkId: string): Promise<MemoryLink | null> {
    await this.ensureInitialized();
    return this.store.reinforceLink(userId, linkId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Auto-detect and create links for a new memory
   */
  async detectAndCreateLinks(
    userId: string,
    newMemory: StoredMemory,
    existingMemories: StoredMemory[]
  ): Promise<MemoryLink[]> {
    await this.ensureInitialized();

    if (!this.config.enableAutoDetection) {
      return [];
    }

    const createdLinks: MemoryLink[] = [];
    const potentialLinks: Array<{
      targetId: string;
      type: MemoryLinkType;
      weight: number;
      confidence: number;
    }> = [];

    // Detect potential links with each existing memory
    for (const existing of existingMemories) {
      if (existing.id === newMemory.id) continue;

      const detected = detectLinks(newMemory, existing);
      for (const link of detected) {
        potentialLinks.push({
          targetId: existing.id,
          ...link,
        });
      }
    }

    // Sort by weight and take top N
    potentialLinks.sort((a, b) => b.weight - a.weight);
    const topLinks = potentialLinks.slice(0, this.config.maxAutoLinksPerMemory);

    // Create links
    for (const linkData of topLinks) {
      // Check if link already exists
      const exists = await this.store.linkExists(
        userId,
        newMemory.id,
        linkData.targetId,
        linkData.type
      );

      if (!exists) {
        const link = await this.store.createLink(userId, {
          sourceId: newMemory.id,
          targetId: linkData.targetId,
          type: linkData.type,
          weight: linkData.weight,
          bidirectional: LINK_TYPE_CONFIGS[linkData.type].defaultBidirectional,
          detectedBy: 'auto',
          confidence: linkData.confidence,
        });
        createdLinks.push(link);
      }
    }

    log.debug(
      {
        userId,
        memoryId: newMemory.id,
        linksCreated: createdLinks.length,
      },
      'Auto-detected links'
    );

    return createdLinks;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPH TRAVERSAL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Traverse the graph from a starting memory
   */
  async traverse(
    userId: string,
    startMemoryId: string,
    options?: {
      maxHops?: number;
      minWeight?: number;
      linkTypes?: MemoryLinkType[];
    }
  ): Promise<GraphTraversalResult> {
    await this.ensureInitialized();
    const startTime = Date.now();

    const maxHops = options?.maxHops || 3;
    const minWeight = options?.minWeight || 0.3;

    const visited = new Set<string>();
    const results: GraphTraversalResult['memories'] = [];

    // BFS traversal
    const queue: Array<{
      memoryId: string;
      path: MemoryLink[];
      totalWeight: number;
      hops: number;
    }> = [{ memoryId: startMemoryId, path: [], totalWeight: 1.0, hops: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.memoryId)) continue;
      visited.add(current.memoryId);

      // Add to results (except start node)
      if (current.memoryId !== startMemoryId) {
        results.push(current);
      }

      // Stop if max hops reached
      if (current.hops >= maxHops) continue;

      // Get outgoing links
      const links = await this.getLinks(userId, current.memoryId);

      for (const link of links) {
        // Filter by type if specified
        if (options?.linkTypes && !options.linkTypes.includes(link.type)) continue;

        // Filter by weight
        const decayedWeight = applyLinkDecay(link);
        if (decayedWeight < minWeight) continue;

        // Determine next memory
        const nextMemoryId =
          link.sourceId === current.memoryId ? link.targetId : link.sourceId;

        // Skip if already visited
        if (visited.has(nextMemoryId)) continue;

        // Calculate cumulative weight
        const newWeight = current.totalWeight * decayedWeight;

        queue.push({
          memoryId: nextMemoryId,
          path: [...current.path, link],
          totalWeight: newWeight,
          hops: current.hops + 1,
        });
      }
    }

    // Sort by total weight
    results.sort((a, b) => b.totalWeight - a.totalWeight);

    return {
      memories: results,
      visitedCount: visited.size,
      traversalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Find shortest path between two memories
   */
  async findPath(
    userId: string,
    fromMemoryId: string,
    toMemoryId: string,
    maxHops?: number
  ): Promise<MemoryLink[] | null> {
    await this.ensureInitialized();

    const result = await this.traverse(userId, fromMemoryId, { maxHops: maxHops || 5 });

    const found = result.memories.find((m) => m.memoryId === toMemoryId);
    return found ? found.path : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAINTENANCE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run maintenance on links for a user
   */
  async runMaintenance(userId: string): Promise<MaintenanceReport> {
    await this.ensureInitialized();
    const startTime = Date.now();

    let linksProcessed = 0;
    let linksDecayed = 0;
    let linksPruned = 0;
    let linksReinforced = 0;

    // Get all links for user
    const stats = await this.store.getLinkStats(userId);

    // Process each link type
    for (const type of Object.keys(LINK_TYPE_CONFIGS) as MemoryLinkType[]) {
      const links = await this.store.getLinksByType(userId, type);

      for (const link of links) {
        linksProcessed++;

        // Calculate decayed weight
        const decayedWeight = applyLinkDecay(link);

        // Prune if below threshold
        if (decayedWeight < this.config.minLinkWeight!) {
          await this.store.deleteLink(userId, link.id);
          linksPruned++;
          continue;
        }

        // Update weight if significantly different
        if (Math.abs(decayedWeight - link.weight) > 0.01) {
          await this.store.updateLink(userId, link.id, { weight: decayedWeight });
          linksDecayed++;
        }
      }
    }

    const report: MaintenanceReport = {
      userId,
      ranAt: new Date(),
      durationMs: Date.now() - startTime,
      linksProcessed,
      linksDecayed,
      linksPruned,
      linksReinforced,
    };

    log.debug({ userId, report }, 'Link maintenance complete');
    return report;
  }

  /**
   * Get link statistics for a user
   */
  async getStats(userId: string): Promise<{
    total: number;
    byType: Record<MemoryLinkType, number>;
  }> {
    await this.ensureInitialized();
    return this.store.getLinkStats(userId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: LinkManager | null = null;

/**
 * Get or create the link manager singleton
 */
export function getLinkManager(config?: Partial<LinkManagerConfig>): LinkManager {
  if (!instance) {
    instance = new LinkManager(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetLinkManager(): void {
  instance = null;
}

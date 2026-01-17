/**
 * Merge Registry
 *
 * Maintains the mapping from original tool IDs to canonical (merged) tool IDs.
 * Provides fast lookup for tool resolution during runtime.
 *
 * @module tools/intelligence/merger/merge-registry
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { MergeRegistryEntry, ToolCluster, FirestoreMergeRegistry } from './types.js';

const log = createLogger({ module: 'tool-merger:registry' });

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION_NAME = 'tool_merge_registry';
const CLUSTERS_COLLECTION = 'tool_merge_clusters';
const REGISTRY_DOC_ID = 'current';

// ============================================================================
// MERGE REGISTRY
// ============================================================================

export class MergeRegistry {
  /** In-memory mapping from original ID to canonical ID */
  private mappings = new Map<string, string>();
  /** Reverse mapping from canonical ID to original IDs */
  private reverseMappings = new Map<string, Set<string>>();
  /** Clusters by canonical ID */
  private clusters = new Map<string, ToolCluster>();
  /** Current version */
  private version = 0;
  /** Firestore instance */
  private db: FirebaseFirestore.Firestore | null = null;
  /** Whether registry has been initialized */
  private initialized = false;

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the registry, optionally loading from Firestore
   */
  async initialize(db?: FirebaseFirestore.Firestore): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (db) {
      this.db = db;
      await this.loadFromFirestore();
    }

    this.initialized = true;
    log.info(
      { mappingCount: this.mappings.size, clusterCount: this.clusters.size },
      'Merge registry initialized'
    );
  }

  /**
   * Load registry from Firestore
   */
  private async loadFromFirestore(): Promise<void> {
    if (!this.db) return;

    try {
      // Load registry document
      const registryDoc = await this.db.collection(COLLECTION_NAME).doc(REGISTRY_DOC_ID).get();

      if (registryDoc.exists) {
        const data = registryDoc.data() as FirestoreMergeRegistry;
        this.version = data.version;

        // Load mappings
        for (const [originalId, canonicalId] of Object.entries(data.mappings)) {
          this.mappings.set(originalId, canonicalId);

          if (!this.reverseMappings.has(canonicalId)) {
            this.reverseMappings.set(canonicalId, new Set());
          }
          this.reverseMappings.get(canonicalId)!.add(originalId);
        }
      }

      // Load clusters
      const clustersSnapshot = await this.db.collection(CLUSTERS_COLLECTION).get();
      for (const doc of clustersSnapshot.docs) {
        const data = doc.data();
        const cluster: ToolCluster = {
          canonicalId: data.canonicalId,
          mergedToolIds: data.mergedToolIds,
          unifiedDescription: data.unifiedDescription,
          inputSchema: data.inputSchema,
          internalSimilarities: data.internalSimilarities || [],
          createdAt: data.createdAt?.toDate() || new Date(),
          version: data.version || 1,
        };
        this.clusters.set(cluster.canonicalId, cluster);
      }

      log.info(
        { mappings: this.mappings.size, clusters: this.clusters.size, version: this.version },
        'Loaded merge registry from Firestore'
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to load merge registry from Firestore');
    }
  }

  // ==========================================================================
  // LOOKUP OPERATIONS
  // ==========================================================================

  /**
   * Get the canonical ID for a tool (or return original if not merged)
   */
  getCanonicalId(toolId: string): string {
    return this.mappings.get(toolId) || toolId;
  }

  /**
   * Check if a tool has been merged
   */
  isMerged(toolId: string): boolean {
    return this.mappings.has(toolId);
  }

  /**
   * Get all original IDs that map to a canonical ID
   */
  getOriginalIds(canonicalId: string): string[] {
    const originals = this.reverseMappings.get(canonicalId);
    return originals ? Array.from(originals) : [canonicalId];
  }

  /**
   * Get a cluster by canonical ID
   */
  getCluster(canonicalId: string): ToolCluster | undefined {
    return this.clusters.get(canonicalId);
  }

  /**
   * Get all clusters
   */
  getAllClusters(): ToolCluster[] {
    return Array.from(this.clusters.values());
  }

  /**
   * Get all canonical IDs
   */
  getCanonicalIds(): string[] {
    return Array.from(this.clusters.keys());
  }

  // ==========================================================================
  // MUTATION OPERATIONS
  // ==========================================================================

  /**
   * Register a new cluster
   */
  async registerCluster(cluster: ToolCluster): Promise<void> {
    // Update in-memory state
    this.clusters.set(cluster.canonicalId, cluster);

    for (const toolId of cluster.mergedToolIds) {
      if (toolId !== cluster.canonicalId) {
        this.mappings.set(toolId, cluster.canonicalId);

        if (!this.reverseMappings.has(cluster.canonicalId)) {
          this.reverseMappings.set(cluster.canonicalId, new Set());
        }
        this.reverseMappings.get(cluster.canonicalId)!.add(toolId);
      }
    }

    // Persist to Firestore
    if (this.db) {
      await this.persistCluster(cluster);
    }

    log.debug(
      { canonicalId: cluster.canonicalId, mergedCount: cluster.mergedToolIds.length },
      'Registered cluster'
    );
  }

  /**
   * Register multiple clusters and update the registry atomically
   */
  async registerClusters(clusters: ToolCluster[]): Promise<void> {
    // Update in-memory state
    for (const cluster of clusters) {
      this.clusters.set(cluster.canonicalId, cluster);

      for (const toolId of cluster.mergedToolIds) {
        if (toolId !== cluster.canonicalId) {
          this.mappings.set(toolId, cluster.canonicalId);

          if (!this.reverseMappings.has(cluster.canonicalId)) {
            this.reverseMappings.set(cluster.canonicalId, new Set());
          }
          this.reverseMappings.get(cluster.canonicalId)!.add(toolId);
        }
      }
    }

    // Persist to Firestore
    if (this.db) {
      await this.persistAll();
    }

    log.info(
      { clusterCount: clusters.length, totalMappings: this.mappings.size },
      'Registered clusters batch'
    );
  }

  /**
   * Remove a cluster
   */
  async removeCluster(canonicalId: string): Promise<void> {
    const cluster = this.clusters.get(canonicalId);
    if (!cluster) return;

    // Remove from in-memory state
    for (const toolId of cluster.mergedToolIds) {
      this.mappings.delete(toolId);
    }
    this.reverseMappings.delete(canonicalId);
    this.clusters.delete(canonicalId);

    // Remove from Firestore
    if (this.db) {
      await this.db.collection(CLUSTERS_COLLECTION).doc(canonicalId).delete();
      await this.persistRegistry();
    }

    log.debug({ canonicalId }, 'Removed cluster');
  }

  /**
   * Clear all clusters and mappings
   */
  async clear(): Promise<void> {
    this.mappings.clear();
    this.reverseMappings.clear();
    this.clusters.clear();
    this.version = 0;

    if (this.db) {
      // Delete all clusters
      const batch = this.db.batch();
      const clustersSnapshot = await this.db.collection(CLUSTERS_COLLECTION).get();
      for (const doc of clustersSnapshot.docs) {
        batch.delete(doc.ref);
      }

      // Reset registry
      batch.set(this.db.collection(COLLECTION_NAME).doc(REGISTRY_DOC_ID), {
        mappings: {},
        version: 0,
        updatedAt: new Date(),
      });

      await batch.commit();
    }

    log.info('Cleared merge registry');
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Persist a single cluster to Firestore
   */
  private async persistCluster(cluster: ToolCluster): Promise<void> {
    if (!this.db) return;

    const data = cleanForFirestore({
      canonicalId: cluster.canonicalId,
      mergedToolIds: cluster.mergedToolIds,
      unifiedDescription: cluster.unifiedDescription,
      inputSchema: cluster.inputSchema,
      internalSimilarities: cluster.internalSimilarities,
      createdAt: cluster.createdAt,
      updatedAt: new Date(),
      version: cluster.version,
    });

    await this.db.collection(CLUSTERS_COLLECTION).doc(cluster.canonicalId).set(data);
    await this.persistRegistry();
  }

  /**
   * Persist the registry mapping document
   */
  private async persistRegistry(): Promise<void> {
    if (!this.db) return;

    this.version++;
    const mappings: Record<string, string> = {};
    for (const [original, canonical] of this.mappings) {
      mappings[original] = canonical;
    }

    await this.db.collection(COLLECTION_NAME).doc(REGISTRY_DOC_ID).set({
      mappings,
      version: this.version,
      updatedAt: new Date(),
    });
  }

  /**
   * Persist all clusters and registry
   */
  private async persistAll(): Promise<void> {
    if (!this.db) return;

    const batch = this.db.batch();

    // Persist all clusters
    for (const cluster of this.clusters.values()) {
      const data = cleanForFirestore({
        canonicalId: cluster.canonicalId,
        mergedToolIds: cluster.mergedToolIds,
        unifiedDescription: cluster.unifiedDescription,
        inputSchema: cluster.inputSchema,
        internalSimilarities: cluster.internalSimilarities,
        createdAt: cluster.createdAt,
        updatedAt: new Date(),
        version: cluster.version,
      });
      batch.set(this.db.collection(CLUSTERS_COLLECTION).doc(cluster.canonicalId), data);
    }

    // Persist registry
    this.version++;
    const mappings: Record<string, string> = {};
    for (const [original, canonical] of this.mappings) {
      mappings[original] = canonical;
    }
    batch.set(this.db.collection(COLLECTION_NAME).doc(REGISTRY_DOC_ID), {
      mappings,
      version: this.version,
      updatedAt: new Date(),
    });

    await batch.commit();
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get registry statistics
   */
  getStats(): {
    mappingCount: number;
    clusterCount: number;
    version: number;
    avgClusterSize: number;
    largestCluster: number;
  } {
    const clusterSizes = Array.from(this.clusters.values()).map((c) => c.mergedToolIds.length);
    const avgClusterSize =
      clusterSizes.length > 0 ? clusterSizes.reduce((a, b) => a + b, 0) / clusterSizes.length : 0;
    const largestCluster = clusterSizes.length > 0 ? Math.max(...clusterSizes) : 0;

    return {
      mappingCount: this.mappings.size,
      clusterCount: this.clusters.size,
      version: this.version,
      avgClusterSize,
      largestCluster,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let registryInstance: MergeRegistry | null = null;

export function getMergeRegistry(): MergeRegistry {
  if (!registryInstance) {
    registryInstance = new MergeRegistry();
  }
  return registryInstance;
}

export async function initializeMergeRegistry(
  db?: FirebaseFirestore.Firestore
): Promise<MergeRegistry> {
  const registry = getMergeRegistry();
  await registry.initialize(db);
  return registry;
}

export function resetMergeRegistry(): void {
  registryInstance = null;
}

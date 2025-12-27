/**
 * Tool Embedding Index
 *
 * Pre-computes and persists tool embeddings for fast startup.
 * Tools are embedded once and stored in Firestore + Redis cache.
 *
 * ARCHITECTURE:
 * - First startup: Compute embeddings → Store in Firestore + Redis
 * - Subsequent startups: Load from Redis (fast) → Fallback to Firestore
 * - Version-aware: Re-compute only when tool definitions change
 *
 * BENEFITS:
 * - Eliminates cold-start latency for embedding computation
 * - Reduces API costs (embeddings computed once)
 * - Enables multi-instance consistency
 *
 * @module tools/semantic-router/persistence/tool-embedding-index
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  getFirestorePersistence,
  type PersistedToolEmbeddingIndex,
} from './firestore-persistence.js';
import {
  getSemanticRouterCache,
  initializeCache,
  type CachedToolIndex,
} from '../integration/redis-cache.js';
import { getEmbedding, getEmbeddings } from '../embedding-providers.js';
import type { SemanticToolDefinition, EmbeddingVector } from '../types.js';
import { getExampleText, normalizeExamples } from '../types.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'semantic-router:tool-embedding-index' });

// ============================================================================
// TYPES
// ============================================================================

// Use PersistedToolEmbeddingIndex as the canonical type
type ToolEmbeddingIndex = PersistedToolEmbeddingIndex;

interface IndexStats {
  totalTools: number;
  indexedTools: number;
  cacheHits: number;
  firestoreLoads: number;
  computedFresh: number;
  errors: number;
  lastUpdated: Date | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Version format: YYYY.MM.DD.N (increment N for same-day changes)
const INDEX_VERSION = '2024.12.23.1';

// Firestore collection
const COLLECTION_NAME = 'semantic_router_tool_embeddings';

// ============================================================================
// TOOL HASH
// ============================================================================

/**
 * Compute a hash of the tool definition for change detection
 * Only includes fields that affect embeddings
 */
function computeToolHash(tool: SemanticToolDefinition): string {
  const hashInput = JSON.stringify({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    shortDescription: tool.shortDescription,
    examples: tool.examples,
  });

  // Simple hash
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// TOOL EMBEDDING INDEX SERVICE
// ============================================================================

class ToolEmbeddingIndexService {
  private stats: IndexStats = {
    totalTools: 0,
    indexedTools: 0,
    cacheHits: 0,
    firestoreLoads: 0,
    computedFresh: 0,
    errors: 0,
    lastUpdated: null,
  };

  private initialized = false;
  private cache = getSemanticRouterCache();

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await initializeCache();
    await getFirestorePersistence().initialize();

    this.initialized = true;
    log.info('Tool embedding index service initialized');
  }

  /**
   * Get or compute embeddings for a tool
   *
   * Priority:
   * 1. Redis cache (fastest)
   * 2. Firestore (persistent)
   * 3. Compute fresh (API call)
   */
  async getToolEmbeddings(
    tool: SemanticToolDefinition
  ): Promise<{ description: EmbeddingVector; examples: EmbeddingVector[] } | null> {
    this.stats.totalTools++;
    const toolHash = computeToolHash(tool);

    // 1. Try Redis cache
    const cached = await this.cache.getToolIndex(tool.id, INDEX_VERSION);
    if (cached && cached.toolId === tool.id) {
      // Verify hash matches (tool hasn't changed)
      // Note: We trust the cache for now, hash check is for Firestore
      this.stats.cacheHits++;
      this.stats.indexedTools++;
      return {
        description: cached.descriptionEmbedding,
        examples: cached.exampleEmbeddings,
      };
    }

    // 2. Try Firestore
    const firestoreIndex = await this.loadFromFirestore(tool.id, toolHash);
    if (firestoreIndex) {
      this.stats.firestoreLoads++;
      this.stats.indexedTools++;

      // Populate Redis cache for next time
      await this.cache.setToolIndex({
        toolId: tool.id,
        version: INDEX_VERSION,
        descriptionEmbedding: firestoreIndex.descriptionEmbedding,
        exampleEmbeddings: firestoreIndex.exampleEmbeddings,
        model: firestoreIndex.embeddingModel,
        timestamp: Date.now(),
      });

      return {
        description: firestoreIndex.descriptionEmbedding,
        examples: firestoreIndex.exampleEmbeddings,
      };
    }

    // 3. Compute fresh
    try {
      const embeddings = await this.computeEmbeddings(tool);
      this.stats.computedFresh++;
      this.stats.indexedTools++;
      this.stats.lastUpdated = new Date();

      // Store in Firestore and Redis
      await this.storeIndex(tool, embeddings, toolHash);

      return embeddings;
    } catch (error) {
      this.stats.errors++;
      log.error({ error: String(error), toolId: tool.id }, 'Failed to compute tool embeddings');
      return null;
    }
  }

  /**
   * Batch load/compute embeddings for multiple tools
   * More efficient than individual calls
   */
  async batchGetToolEmbeddings(
    tools: SemanticToolDefinition[]
  ): Promise<Map<string, { description: EmbeddingVector; examples: EmbeddingVector[] }>> {
    const results = new Map<
      string,
      { description: EmbeddingVector; examples: EmbeddingVector[] }
    >();
    const toolsToCompute: SemanticToolDefinition[] = [];
    const toolHashes = new Map<string, string>();

    log.info({ toolCount: tools.length }, 'Batch loading tool embeddings');
    const startTime = performance.now();

    // Phase 1: Check cache and Firestore
    for (const tool of tools) {
      const toolHash = computeToolHash(tool);
      toolHashes.set(tool.id, toolHash);

      // Try Redis cache
      const cached = await this.cache.getToolIndex(tool.id, INDEX_VERSION);
      if (cached) {
        this.stats.cacheHits++;
        results.set(tool.id, {
          description: cached.descriptionEmbedding,
          examples: cached.exampleEmbeddings,
        });
        continue;
      }

      // Try Firestore
      const firestoreIndex = await this.loadFromFirestore(tool.id, toolHash);
      if (firestoreIndex) {
        this.stats.firestoreLoads++;
        results.set(tool.id, {
          description: firestoreIndex.descriptionEmbedding,
          examples: firestoreIndex.exampleEmbeddings,
        });

        // Populate cache
        await this.cache.setToolIndex({
          toolId: tool.id,
          version: INDEX_VERSION,
          descriptionEmbedding: firestoreIndex.descriptionEmbedding,
          exampleEmbeddings: firestoreIndex.exampleEmbeddings,
          model: firestoreIndex.embeddingModel,
          timestamp: Date.now(),
        });
        continue;
      }

      // Need to compute
      toolsToCompute.push(tool);
    }

    // Phase 2: Batch compute missing embeddings
    if (toolsToCompute.length > 0) {
      log.info(
        { toCompute: toolsToCompute.length, cached: results.size },
        'Computing missing embeddings'
      );

      // Collect all texts to embed
      const textsToEmbed: Array<{
        toolId: string;
        type: 'description' | 'example';
        index?: number;
      }> = [];
      const texts: string[] = [];

      for (const tool of toolsToCompute) {
        // Description text
        const descText = [tool.name, tool.shortDescription, tool.description].join('. ');
        textsToEmbed.push({ toolId: tool.id, type: 'description' });
        texts.push(descText);

        // Example texts
        for (let i = 0; i < tool.examples.length; i++) {
          textsToEmbed.push({ toolId: tool.id, type: 'example', index: i });
          texts.push(getExampleText(tool.examples[i]));
        }
      }

      // Batch embed
      const embeddings = await getEmbeddings(texts);

      // Organize results by tool
      const toolEmbeddings = new Map<
        string,
        { description?: EmbeddingVector; examples: EmbeddingVector[] }
      >();

      for (let i = 0; i < textsToEmbed.length; i++) {
        const { toolId, type, index } = textsToEmbed[i];

        if (!toolEmbeddings.has(toolId)) {
          toolEmbeddings.set(cleanForFirestore(toolId), { examples: [] });
        }

        const te = toolEmbeddings.get(toolId)!;
        if (type === 'description') {
          te.description = embeddings[i];
        } else if (type === 'example' && index !== undefined) {
          te.examples[index] = embeddings[i];
        }
      }

      // Store results
      for (const tool of toolsToCompute) {
        const te = toolEmbeddings.get(tool.id);
        if (te?.description) {
          this.stats.computedFresh++;
          results.set(tool.id, {
            description: te.description,
            examples: te.examples,
          });

          // Store in Firestore and cache
          const toolHash = toolHashes.get(tool.id)!;
          await this.storeIndex(
            tool,
            { description: te.description, examples: te.examples },
            toolHash
          );
        }
      }
    }

    this.stats.totalTools = tools.length;
    this.stats.indexedTools = results.size;
    this.stats.lastUpdated = new Date();

    const duration = performance.now() - startTime;
    log.info(
      {
        totalTools: tools.length,
        cacheHits: this.stats.cacheHits,
        firestoreLoads: this.stats.firestoreLoads,
        computed: toolsToCompute.length,
        durationMs: duration.toFixed(1),
      },
      'Batch tool embeddings complete'
    );

    return results;
  }

  /**
   * Force recompute embeddings for a tool (e.g., after tool definition changes)
   */
  async recomputeToolEmbeddings(tool: SemanticToolDefinition): Promise<void> {
    const toolHash = computeToolHash(tool);

    try {
      const embeddings = await this.computeEmbeddings(tool);
      await this.storeIndex(tool, embeddings, toolHash);
      log.info({ toolId: tool.id }, 'Tool embeddings recomputed');
    } catch (error) {
      log.error({ error: String(error), toolId: tool.id }, 'Failed to recompute tool embeddings');
      throw error;
    }
  }

  /**
   * Clear all cached embeddings (for testing or version migration)
   */
  async clearAll(): Promise<void> {
    await this.cache.clear();
    // Note: Firestore cleanup would require iterating all docs
    log.info('Tool embedding index cleared (cache only)');
  }

  getStats(): IndexStats {
    return { ...this.stats };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async computeEmbeddings(
    tool: SemanticToolDefinition
  ): Promise<{ description: EmbeddingVector; examples: EmbeddingVector[] }> {
    // Build description text
    const descriptionText = [tool.name, tool.shortDescription, tool.description].join('. ');

    // Get embeddings
    const description = await getEmbedding(descriptionText);
    const exampleTexts = normalizeExamples(tool.examples);
    const examples = await getEmbeddings(exampleTexts);

    return { description, examples };
  }

  private async loadFromFirestore(
    toolId: string,
    expectedHash: string
  ): Promise<ToolEmbeddingIndex | null> {
    const persistence = getFirestorePersistence();

    try {
      const index = await persistence.loadToolEmbedding(toolId, INDEX_VERSION);

      if (index && index.toolHash === expectedHash) {
        return index as ToolEmbeddingIndex;
      }

      // Hash mismatch means tool definition changed
      if (index) {
        log.debug({ toolId, oldHash: index.toolHash, newHash: expectedHash }, 'Tool hash mismatch');
      }

      return null;
    } catch (error) {
      log.warn({ error: String(error), toolId }, 'Failed to load from Firestore');
      return null;
    }
  }

  private async storeIndex(
    tool: SemanticToolDefinition,
    embeddings: { description: EmbeddingVector; examples: EmbeddingVector[] },
    toolHash: string
  ): Promise<void> {
    // Convert EmbeddingVector (which can be Float32Array) to number[] for storage
    const toNumberArray = (vec: EmbeddingVector): number[] =>
      vec instanceof Float32Array ? Array.from(vec) : vec;

    const index: ToolEmbeddingIndex = {
      toolId: tool.id,
      version: INDEX_VERSION,
      descriptionEmbedding: toNumberArray(embeddings.description),
      exampleEmbeddings: embeddings.examples.map(toNumberArray),
      embeddingModel: 'text-embedding-004', // TODO: Get from provider
      createdAt: new Date(),
      toolHash,
    };

    // Store in Firestore
    // Cast to PersistedToolEmbeddingIndex since EmbeddingVector includes Float32Array
    // but persistence always stores as number[]
    const persistence = getFirestorePersistence();
    const persistedIndex: PersistedToolEmbeddingIndex = {
      ...index,
      descriptionEmbedding: Array.from(index.descriptionEmbedding),
      exampleEmbeddings: index.exampleEmbeddings.map((e) => Array.from(e)),
    };
    await persistence.saveToolEmbedding(persistedIndex);

    // Store in Redis cache
    await this.cache.setToolIndex({
      toolId: tool.id,
      version: INDEX_VERSION,
      descriptionEmbedding: toNumberArray(embeddings.description),
      exampleEmbeddings: embeddings.examples.map(toNumberArray),
      model: index.embeddingModel,
      timestamp: Date.now(),
    });

    log.debug({ toolId: tool.id }, 'Tool embedding index stored');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let serviceInstance: ToolEmbeddingIndexService | null = null;

export function getToolEmbeddingIndex(): ToolEmbeddingIndexService {
  if (!serviceInstance) {
    serviceInstance = new ToolEmbeddingIndexService();
  }
  return serviceInstance;
}

export async function initializeToolEmbeddingIndex(): Promise<void> {
  const service = getToolEmbeddingIndex();
  await service.initialize();
}

export type { ToolEmbeddingIndex, IndexStats };

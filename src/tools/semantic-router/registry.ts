/**
 * Semantic Tool Registry
 *
 * Manages tool definitions with pre-computed embeddings for fast matching.
 * Tools are registered once and their semantic representations are cached.
 *
 * @module tools/semantic-router/registry
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  SemanticToolDefinition,
  ToolCategory,
  EmbeddingVector,
  CachedEmbedding,
  EmbeddingProvider,
} from './types.js';
import { getExampleText } from './types.js';

const log = createLogger({ module: 'semantic-router:registry' });

// ============================================================================
// TOOL REGISTRY
// ============================================================================

interface RegisteredTool {
  definition: SemanticToolDefinition;
  /** Pre-computed embedding of description + examples */
  descriptionEmbedding?: EmbeddingVector;
  /** Pre-computed embeddings of examples */
  exampleEmbeddings?: EmbeddingVector[];
  /** Normalized trigger phrases (lowercase, trimmed) */
  normalizedPhrases: string[];
  /** Compiled regex patterns */
  compiledPatterns: RegExp[];
  /** Last used timestamp */
  lastUsed?: Date;
  /** Usage count */
  usageCount: number;
}

class SemanticToolRegistry {
  private tools = new Map<string, RegisteredTool>();
  private toolsByCategory = new Map<ToolCategory, Set<string>>();
  private embeddingProvider: EmbeddingProvider | null = null;
  private embeddingsComputed = false;

  /**
   * Register a tool with the router
   */
  register(definition: SemanticToolDefinition): void {
    // Validate definition
    this.validateDefinition(definition);

    // Normalize triggers
    const normalizedPhrases = (definition.triggers.phrases || []).map((p) =>
      p.toLowerCase().trim()
    );

    // Compile patterns
    const compiledPatterns = (definition.triggers.patterns || []).map((p) =>
      p instanceof RegExp ? p : new RegExp(p, 'i')
    );

    // Create registered tool
    const registered: RegisteredTool = {
      definition,
      normalizedPhrases,
      compiledPatterns,
      usageCount: 0,
    };

    // Store
    this.tools.set(definition.id, registered);

    // Index by category
    if (!this.toolsByCategory.has(definition.category)) {
      this.toolsByCategory.set(definition.category, new Set());
    }
    this.toolsByCategory.get(definition.category)!.add(definition.id);

    // Mark embeddings as needing recomputation
    this.embeddingsComputed = false;

    log.info(
      {
        toolId: definition.id,
        category: definition.category,
        exampleCount: definition.examples.length,
      },
      'Tool registered'
    );
  }

  /**
   * Register multiple tools
   */
  registerMany(definitions: SemanticToolDefinition[]): void {
    for (const def of definitions) {
      this.register(def);
    }
  }

  /**
   * Get a tool by ID
   */
  get(toolId: string): SemanticToolDefinition | undefined {
    return this.tools.get(toolId)?.definition;
  }

  /**
   * Get all tools in a category
   */
  getByCategory(category: ToolCategory): SemanticToolDefinition[] {
    const toolIds = this.toolsByCategory.get(category);
    if (!toolIds) return [];

    return Array.from(toolIds)
      .map((id) => this.tools.get(id)?.definition)
      .filter((d): d is SemanticToolDefinition => d !== undefined);
  }

  /**
   * Get all registered tools
   */
  getAll(): SemanticToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Get internal registered tool (for router use)
   */
  getRegistered(toolId: string): RegisteredTool | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get all registered tools (for router use)
   */
  getAllRegistered(): RegisteredTool[] {
    const result: RegisteredTool[] = [];
    this.tools.forEach((tool) => result.push(tool));
    return result;
  }

  /**
   * Set the embedding provider
   */
  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
    this.embeddingsComputed = false;
  }

  /**
   * Pre-compute embeddings for all tools
   */
  async computeEmbeddings(): Promise<void> {
    if (!this.embeddingProvider) {
      log.warn('No embedding provider set, skipping embedding computation');
      return;
    }

    if (this.embeddingsComputed) {
      log.debug('Embeddings already computed');
      return;
    }

    log.info({ toolCount: this.tools.size }, 'Computing embeddings for tools');
    const startTime = performance.now();

    // Collect all texts to embed
    const textsToEmbed: Array<{
      toolId: string;
      type: 'description' | 'example';
      index?: number;
      text: string;
    }> = [];

    this.tools.forEach((registered, toolId) => {
      // Description + short description + name
      const descriptionText = [
        registered.definition.name,
        registered.definition.shortDescription,
        registered.definition.description,
      ].join('. ');
      textsToEmbed.push({ toolId, type: 'description', text: descriptionText });

      // Examples
      for (let i = 0; i < registered.definition.examples.length; i++) {
        textsToEmbed.push({
          toolId,
          type: 'example',
          index: i,
          text: getExampleText(registered.definition.examples[i]),
        });
      }
    });

    // Batch embed
    const texts = textsToEmbed.map((t) => t.text);
    const embeddings = await this.embeddingProvider.embedBatch(texts);

    // Assign embeddings back to tools
    for (let i = 0; i < textsToEmbed.length; i++) {
      const { toolId, type, index } = textsToEmbed[i];
      const registered = this.tools.get(toolId)!;

      if (type === 'description') {
        registered.descriptionEmbedding = embeddings[i];
      } else if (type === 'example' && index !== undefined) {
        if (!registered.exampleEmbeddings) {
          registered.exampleEmbeddings = [];
        }
        registered.exampleEmbeddings[index] = embeddings[i];
      }
    }

    this.embeddingsComputed = true;
    const duration = performance.now() - startTime;

    log.info(
      {
        toolCount: this.tools.size,
        embeddingCount: embeddings.length,
        durationMs: duration.toFixed(1),
      },
      'Embeddings computed'
    );
  }

  /**
   * Check if embeddings are ready
   */
  hasEmbeddings(): boolean {
    return this.embeddingsComputed;
  }

  /**
   * Record tool usage (for history-based routing)
   */
  recordUsage(toolId: string): void {
    const registered = this.tools.get(toolId);
    if (registered) {
      registered.lastUsed = new Date();
      registered.usageCount++;
    }
  }

  /**
   * Get tool count
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    this.toolsByCategory.clear();
    this.embeddingsComputed = false;
  }

  /**
   * Validate a tool definition
   */
  private validateDefinition(def: SemanticToolDefinition): void {
    if (!def.id) {
      throw new Error('Tool definition must have an id');
    }
    if (!def.name) {
      throw new Error(`Tool ${def.id} must have a name`);
    }
    if (!def.description) {
      throw new Error(`Tool ${def.id} must have a description`);
    }
    if (!def.examples || def.examples.length === 0) {
      throw new Error(`Tool ${def.id} must have at least one example`);
    }
    if (!def.execute || typeof def.execute !== 'function') {
      throw new Error(`Tool ${def.id} must have an execute function`);
    }

    // Warn if no triggers
    if (
      !def.triggers.phrases?.length &&
      !def.triggers.patterns?.length &&
      !def.triggers.keywords?.length
    ) {
      log.warn({ toolId: def.id }, 'Tool has no triggers - will rely on embedding matching only');
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let registryInstance: SemanticToolRegistry | null = null;

/**
 * Get the global tool registry instance
 */
export function getToolRegistry(): SemanticToolRegistry {
  if (!registryInstance) {
    registryInstance = new SemanticToolRegistry();
  }
  return registryInstance;
}

/**
 * Reset the registry (for testing)
 */
export function resetToolRegistry(): void {
  registryInstance = null;
}

// ============================================================================
// EMBEDDING CACHE
// ============================================================================

const embeddingCache = new Map<string, CachedEmbedding>();
const CACHE_MAX_SIZE = 10000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get cached embedding
 */
export function getCachedEmbedding(text: string, model: string): EmbeddingVector | null {
  const key = `${model}:${text}`;
  const cached = embeddingCache.get(key);

  if (!cached) return null;

  // Check TTL
  if (Date.now() - cached.createdAt.getTime() > CACHE_TTL_MS) {
    embeddingCache.delete(key);
    return null;
  }

  return cached.vector;
}

/**
 * Cache an embedding
 */
export function cacheEmbedding(text: string, model: string, vector: EmbeddingVector): void {
  // Evict old entries if at capacity
  if (embeddingCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = embeddingCache.keys().next().value;
    if (oldestKey) embeddingCache.delete(oldestKey);
  }

  const key = `${model}:${text}`;
  embeddingCache.set(key, {
    text,
    vector,
    model,
    createdAt: new Date(),
  });
}

/**
 * Clear embedding cache
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { SemanticToolRegistry };

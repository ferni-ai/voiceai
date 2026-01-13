/**
 * Semantic Tool Registry
 *
 * Manages tool definitions with pre-computed embeddings for fast matching.
 * Tools are registered once and their semantic representations are cached.
 *
 * @module tools/semantic-router/registry
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getExampleText } from './types.js';
const log = createLogger({ module: 'semantic-router:registry' });
class SemanticToolRegistry {
    tools = new Map();
    toolsByCategory = new Map();
    embeddingProvider = null;
    embeddingsComputed = false;
    /**
     * Register a tool with the router
     */
    register(definition) {
        // Validate definition
        this.validateDefinition(definition);
        // Normalize triggers
        const normalizedPhrases = (definition.triggers.phrases || []).map((p) => p.toLowerCase().trim());
        // Compile patterns
        const compiledPatterns = (definition.triggers.patterns || []).map((p) => p instanceof RegExp ? p : new RegExp(p, 'i'));
        // Create registered tool
        const registered = {
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
        this.toolsByCategory.get(definition.category).add(definition.id);
        // Mark embeddings as needing recomputation
        this.embeddingsComputed = false;
        log.info({
            toolId: definition.id,
            category: definition.category,
            exampleCount: definition.examples.length,
        }, 'Tool registered');
    }
    /**
     * Register multiple tools
     */
    registerMany(definitions) {
        for (const def of definitions) {
            this.register(def);
        }
    }
    /**
     * Get a tool by ID
     */
    get(toolId) {
        return this.tools.get(toolId)?.definition;
    }
    /**
     * Get all tools in a category
     */
    getByCategory(category) {
        const toolIds = this.toolsByCategory.get(category);
        if (!toolIds)
            return [];
        return Array.from(toolIds)
            .map((id) => this.tools.get(id)?.definition)
            .filter((d) => d !== undefined);
    }
    /**
     * Get all registered tools
     */
    getAll() {
        return Array.from(this.tools.values()).map((t) => t.definition);
    }
    /**
     * Get internal registered tool (for router use)
     */
    getRegistered(toolId) {
        return this.tools.get(toolId);
    }
    /**
     * Get all registered tools (for router use)
     */
    getAllRegistered() {
        const result = [];
        this.tools.forEach((tool) => result.push(tool));
        return result;
    }
    /**
     * Set the embedding provider
     */
    setEmbeddingProvider(provider) {
        this.embeddingProvider = provider;
        this.embeddingsComputed = false;
    }
    /**
     * Pre-compute embeddings for all tools
     */
    async computeEmbeddings() {
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
        const textsToEmbed = [];
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
            const registered = this.tools.get(toolId);
            if (type === 'description') {
                registered.descriptionEmbedding = embeddings[i];
            }
            else if (type === 'example' && index !== undefined) {
                if (!registered.exampleEmbeddings) {
                    registered.exampleEmbeddings = [];
                }
                registered.exampleEmbeddings[index] = embeddings[i];
            }
        }
        this.embeddingsComputed = true;
        const duration = performance.now() - startTime;
        log.info({
            toolCount: this.tools.size,
            embeddingCount: embeddings.length,
            durationMs: duration.toFixed(1),
        }, 'Embeddings computed');
    }
    /**
     * Check if embeddings are ready
     */
    hasEmbeddings() {
        return this.embeddingsComputed;
    }
    /**
     * Record tool usage (for history-based routing)
     */
    recordUsage(toolId) {
        const registered = this.tools.get(toolId);
        if (registered) {
            registered.lastUsed = new Date();
            registered.usageCount++;
        }
    }
    /**
     * Get tool count
     */
    get size() {
        return this.tools.size;
    }
    /**
     * Clear all tools
     */
    clear() {
        this.tools.clear();
        this.toolsByCategory.clear();
        this.embeddingsComputed = false;
    }
    /**
     * Validate a tool definition
     */
    validateDefinition(def) {
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
        if (!def.triggers.phrases?.length &&
            !def.triggers.patterns?.length &&
            !def.triggers.keywords?.length) {
            log.warn({ toolId: def.id }, 'Tool has no triggers - will rely on embedding matching only');
        }
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let registryInstance = null;
/**
 * Get the global tool registry instance
 */
export function getToolRegistry() {
    if (!registryInstance) {
        registryInstance = new SemanticToolRegistry();
    }
    return registryInstance;
}
/**
 * Reset the registry (for testing)
 */
export function resetToolRegistry() {
    registryInstance = null;
}
// ============================================================================
// EMBEDDING CACHE
// ============================================================================
const embeddingCache = new Map();
const CACHE_MAX_SIZE = 10000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
/**
 * Get cached embedding
 */
export function getCachedEmbedding(text, model) {
    const key = `${model}:${text}`;
    const cached = embeddingCache.get(key);
    if (!cached)
        return null;
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
export function cacheEmbedding(text, model, vector) {
    // Evict old entries if at capacity
    if (embeddingCache.size >= CACHE_MAX_SIZE) {
        const oldestKey = embeddingCache.keys().next().value;
        if (oldestKey)
            embeddingCache.delete(oldestKey);
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
export function clearEmbeddingCache() {
    embeddingCache.clear();
}
// ============================================================================
// EXPORTS
// ============================================================================
export { SemanticToolRegistry };
//# sourceMappingURL=registry.js.map
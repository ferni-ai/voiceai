/**
 * Semantic Tool Registry
 *
 * Manages tool definitions with pre-computed embeddings for fast matching.
 * Tools are registered once and their semantic representations are cached.
 *
 * @module tools/semantic-router/registry
 */
import type { SemanticToolDefinition, ToolCategory, EmbeddingVector, EmbeddingProvider } from './types.js';
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
declare class SemanticToolRegistry {
    private tools;
    private toolsByCategory;
    private embeddingProvider;
    private embeddingsComputed;
    /**
     * Register a tool with the router
     */
    register(definition: SemanticToolDefinition): void;
    /**
     * Register multiple tools
     */
    registerMany(definitions: SemanticToolDefinition[]): void;
    /**
     * Get a tool by ID
     */
    get(toolId: string): SemanticToolDefinition | undefined;
    /**
     * Get all tools in a category
     */
    getByCategory(category: ToolCategory): SemanticToolDefinition[];
    /**
     * Get all registered tools
     */
    getAll(): SemanticToolDefinition[];
    /**
     * Get internal registered tool (for router use)
     */
    getRegistered(toolId: string): RegisteredTool | undefined;
    /**
     * Get all registered tools (for router use)
     */
    getAllRegistered(): RegisteredTool[];
    /**
     * Set the embedding provider
     */
    setEmbeddingProvider(provider: EmbeddingProvider): void;
    /**
     * Pre-compute embeddings for all tools
     */
    computeEmbeddings(): Promise<void>;
    /**
     * Check if embeddings are ready
     */
    hasEmbeddings(): boolean;
    /**
     * Record tool usage (for history-based routing)
     */
    recordUsage(toolId: string): void;
    /**
     * Get tool count
     */
    get size(): number;
    /**
     * Clear all tools
     */
    clear(): void;
    /**
     * Validate a tool definition
     */
    private validateDefinition;
}
/**
 * Get the global tool registry instance
 */
export declare function getToolRegistry(): SemanticToolRegistry;
/**
 * Reset the registry (for testing)
 */
export declare function resetToolRegistry(): void;
/**
 * Get cached embedding
 */
export declare function getCachedEmbedding(text: string, model: string): EmbeddingVector | null;
/**
 * Cache an embedding
 */
export declare function cacheEmbedding(text: string, model: string, vector: EmbeddingVector): void;
/**
 * Clear embedding cache
 */
export declare function clearEmbeddingCache(): void;
export { SemanticToolRegistry };
//# sourceMappingURL=registry.d.ts.map
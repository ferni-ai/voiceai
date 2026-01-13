/**
 * Embeddings Utility
 *
 * Generates text embeddings for semantic search and similarity matching.
 * Uses OpenAI's embedding API by default, but supports other providers.
 * Protected by circuit breaker to prevent cascading failures.
 */
import { cosineSimilarity, type EmbeddingVector as RustEmbeddingVector } from './rust-accelerator.js';
export { cosineSimilarity };
export type { RustEmbeddingVector as EmbeddingVectorLike };
/**
 * Embedding result with metadata
 */
export interface EmbeddingResult {
    text: string;
    embedding: number[];
    model: string;
    tokenCount?: number;
}
/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
    results: EmbeddingResult[];
    totalTokens: number;
}
/**
 * Embedding provider configuration
 */
export interface EmbeddingConfig {
    provider: 'openai' | 'google' | 'local';
    model?: string;
    apiKey?: string;
    dimensions?: number;
}
/**
 * Abstract embedding provider
 */
export declare abstract class EmbeddingProvider {
    abstract embed(text: string): Promise<number[]>;
    abstract embedBatch(texts: string[]): Promise<number[][]>;
    abstract get dimensions(): number;
    abstract get model(): string;
}
/**
 * OpenAI embedding provider
 */
export declare class OpenAIEmbeddings extends EmbeddingProvider {
    private _model;
    private _dimensions;
    private apiKey;
    constructor(config?: {
        model?: string;
        apiKey?: string;
    });
    get dimensions(): number;
    get model(): string;
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[], retryCount?: number): Promise<number[][]>;
}
/**
 * Google AI embedding provider
 * Uses text-embedding-004 model via Google AI Generative Language API
 * Supports 768 dimensions, 2048 token max sequence length
 */
export declare class GoogleEmbeddings extends EmbeddingProvider {
    private _model;
    private _dimensions;
    private apiKey;
    constructor(config?: {
        model?: string;
        apiKey?: string;
        dimensions?: number;
    });
    get dimensions(): number;
    get model(): string;
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
/**
 * Google Vertex AI embedding provider (uses service account auth)
 * For production deployments with Google Cloud
 */
export declare class VertexAIEmbeddings extends EmbeddingProvider {
    private _model;
    private _dimensions;
    private projectId;
    private location;
    private accessToken;
    constructor(config: {
        model?: string;
        projectId: string;
        location?: string;
        dimensions?: number;
        accessToken: string | (() => Promise<string>);
    });
    get dimensions(): number;
    get model(): string;
    private getToken;
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
}
/**
 * Local/fallback embedding provider using simple hashing
 * For development when no API key is available
 */
export declare class LocalEmbeddings extends EmbeddingProvider {
    private _dimensions;
    constructor(dimensions?: number);
    get dimensions(): number;
    readonly model: "local-hash";
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    private hashString;
}
/**
 * Calculate Euclidean distance between two vectors
 */
export declare function euclideanDistance(a: number[], b: number[]): number;
/**
 * Find top-k most similar vectors
 */
export declare function findTopK(query: number[], vectors: number[][], k: number, similarity?: 'cosine' | 'euclidean'): Array<{
    index: number;
    score: number;
}>;
/**
 * Get the default embedding provider
 * Priority: Google AI > OpenAI > Local
 */
export declare function getEmbeddingProvider(): EmbeddingProvider;
/**
 * Set a custom embedding provider
 */
export declare function setEmbeddingProvider(provider: EmbeddingProvider): void;
/**
 * Generate embeddings using the default provider
 */
export declare function embed(text: string): Promise<number[]>;
/**
 * Generate batch embeddings using the default provider
 */
export declare function embedBatch(texts: string[]): Promise<number[][]>;
/**
 * Standard embedding dimensions for various models
 */
export declare const EMBEDDING_DIMENSIONS: Record<string, number>;
/**
 * Get the dimensions for a specific model
 * Returns undefined for unknown models
 */
export declare function getModelDimensions(model: string): number | undefined;
/**
 * Validate that two embeddings have compatible dimensions
 */
export declare function validateEmbeddingDimensions(embedding1: number[], embedding2: number[], context?: string): void;
declare const _default: {
    embed: typeof embed;
    embedBatch: typeof embedBatch;
    cosineSimilarity: typeof cosineSimilarity;
    euclideanDistance: typeof euclideanDistance;
    findTopK: typeof findTopK;
    getEmbeddingProvider: typeof getEmbeddingProvider;
    setEmbeddingProvider: typeof setEmbeddingProvider;
    OpenAIEmbeddings: typeof OpenAIEmbeddings;
    GoogleEmbeddings: typeof GoogleEmbeddings;
    VertexAIEmbeddings: typeof VertexAIEmbeddings;
    LocalEmbeddings: typeof LocalEmbeddings;
    EMBEDDING_DIMENSIONS: Record<string, number>;
    getModelDimensions: typeof getModelDimensions;
    validateEmbeddingDimensions: typeof validateEmbeddingDimensions;
};
export default _default;
//# sourceMappingURL=embeddings.d.ts.map
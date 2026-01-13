/**
 * Embedding Providers
 *
 * Different embedding models for semantic similarity.
 * Choose based on quality vs latency tradeoff.
 *
 * @module tools/semantic-router/embedding-providers
 */
import type { EmbeddingProvider, EmbeddingVector } from './types.js';
import { cosineSimilarity } from '../../memory/rust-accelerator.js';
export type { EmbeddingVector };
export { cosineSimilarity };
/**
 * OpenAI text-embedding-3-small provider
 *
 * Fast and good quality. Recommended for production.
 * Dimensions: 1536
 * Latency: ~50-100ms
 */
export declare class OpenAIEmbeddingProvider implements EmbeddingProvider {
    readonly modelName = "text-embedding-3-small";
    readonly dimensions = 1536;
    private apiKey;
    private baseUrl;
    private useCache;
    constructor(options?: {
        apiKey?: string;
        baseUrl?: string;
        useCache?: boolean;
    });
    embed(text: string): Promise<EmbeddingVector>;
    embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
}
/**
 * Google text-embedding-004 provider
 *
 * Free tier available, good quality.
 * Dimensions: 768
 * Latency: ~30-80ms
 */
export declare class GoogleEmbeddingProvider implements EmbeddingProvider {
    readonly modelName = "text-embedding-004";
    readonly dimensions = 768;
    private apiKey;
    private useCache;
    constructor(options?: {
        apiKey?: string;
        useCache?: boolean;
    });
    embed(text: string): Promise<EmbeddingVector>;
    embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
}
/**
 * Simple local embedding using word hashing
 *
 * For testing only - not semantically meaningful!
 * Very fast, no API calls needed.
 */
export declare class LocalHashEmbeddingProvider implements EmbeddingProvider {
    readonly modelName = "local-hash";
    readonly dimensions = 384;
    embed(text: string): Promise<EmbeddingVector>;
    embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
}
export type EmbeddingModel = 'openai' | 'google' | 'local';
/**
 * Create an embedding provider
 */
export declare function createEmbeddingProvider(model: EmbeddingModel, options?: {
    apiKey?: string;
    useCache?: boolean;
}): EmbeddingProvider;
/**
 * Get embedding for text using default provider
 */
export declare function getEmbedding(text: string): Promise<EmbeddingVector>;
/**
 * Get embeddings for multiple texts
 */
export declare function getEmbeddings(texts: string[]): Promise<EmbeddingVector[]>;
//# sourceMappingURL=embedding-providers.d.ts.map
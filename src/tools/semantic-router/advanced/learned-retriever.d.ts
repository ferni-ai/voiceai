/**
 * Learned Retriever - Fine-tuned semantic tool routing
 *
 * Uses training data to learn query→tool mappings that are better than
 * generic embeddings. Implements:
 *
 * 1. TF-IDF weighted keyword matching (fast baseline)
 * 2. Learned embedding similarity (fine-tuned vectors)
 * 3. Active learning from corrections
 *
 * Based on approaches from:
 * - Aurelio Semantic Router
 * - Gorilla (Berkeley)
 * - ToolBench (Tsinghua)
 *
 * @module tools/semantic-router/advanced/learned-retriever
 */
import type { SemanticToolDefinition } from '../types.js';
import type { TrainingExample } from './datasets.js';
interface RetrievalResult {
    toolId: string;
    score: number;
    matchedKeywords: string[];
    embeddingSimilarity: number;
    confidence: number;
}
interface LearnedRetrieverConfig {
    tfidfWeight: number;
    embeddingWeight: number;
    knnK: number;
    minConfidenceThreshold: number;
    maxExamplesPerTool: number;
}
export declare class LearnedRetriever {
    private profiles;
    private globalIDF;
    private isInitialized;
    private readonly config;
    constructor(customConfig?: Partial<LearnedRetrieverConfig>);
    /**
     * Initialize retriever with training data
     */
    initialize(tools: SemanticToolDefinition[], additionalExamples?: TrainingExample[]): Promise<void>;
    /**
     * Retrieve top-k tools for a query
     */
    retrieve(query: string, k?: number): Promise<RetrievalResult[]>;
    /**
     * Add a correction to improve routing
     */
    addCorrection(query: string, predictedTool: string, actualTool: string): Promise<void>;
    private buildGlobalIDF;
    private buildToolProfile;
    private scoreQueryAgainstProfile;
    private addExampleToProfile;
    private tokenize;
    private computeCentroid;
    private selectDiverseSample;
}
export declare function getLearnedRetriever(): LearnedRetriever;
export declare function initializeLearnedRetriever(tools: SemanticToolDefinition[], customConfig?: Partial<LearnedRetrieverConfig>): Promise<LearnedRetriever>;
export {};
//# sourceMappingURL=learned-retriever.d.ts.map
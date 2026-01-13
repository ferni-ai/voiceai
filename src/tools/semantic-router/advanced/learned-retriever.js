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
import { createLogger } from '../../../utils/safe-logger.js';
import { getKeywordWord, getKeywordWeight } from '../types.js';
import { getEmbedding } from '../embedding-providers.js';
import { loadCombinedTrainingData } from './datasets.js';
// Rust-accelerated operations for KNN scoring
import { cosineSimilarity, batchCosineSimilarityOptimized, } from '../../../memory/rust-accelerator.js';
const log = createLogger({ module: 'semantic-router:learned-retriever' });
// ============================================================================
// LEARNED RETRIEVER CLASS
// ============================================================================
export class LearnedRetriever {
    profiles = new Map();
    globalIDF = new Map(); // word -> inverse document frequency
    isInitialized = false;
    config = {
        tfidfWeight: 0.3,
        embeddingWeight: 0.7,
        knnK: 3,
        minConfidenceThreshold: 0.3,
        maxExamplesPerTool: 100,
    };
    constructor(customConfig) {
        if (customConfig) {
            Object.assign(this.config, customConfig);
        }
    }
    /**
     * Initialize retriever with training data
     */
    async initialize(tools, additionalExamples) {
        log.info('Initializing learned retriever...');
        // Load combined training data
        const { examples: datasetExamples, stats } = loadCombinedTrainingData();
        // Merge with any additional examples
        const allExamples = [...datasetExamples, ...(additionalExamples || [])];
        // Build global vocabulary for IDF
        await this.buildGlobalIDF(allExamples);
        // Build per-tool profiles in parallel
        await Promise.all(tools.map((tool) => this.buildToolProfile(tool, allExamples)));
        this.isInitialized = true;
        log.info({ toolCount: this.profiles.size, exampleCount: allExamples.length }, 'Learned retriever initialized');
    }
    /**
     * Retrieve top-k tools for a query
     */
    async retrieve(query, k = 5) {
        if (!this.isInitialized) {
            throw new Error('Retriever not initialized. Call initialize() first.');
        }
        const results = [];
        // Get query embedding
        const queryEmbedding = await getEmbedding(query);
        // Tokenize query
        const queryTokens = this.tokenize(query);
        // Score against all tool profiles in parallel
        const profileEntries = Array.from(this.profiles.values());
        const scoredResults = await Promise.all(profileEntries.map((profile) => this.scoreQueryAgainstProfile(query, queryTokens, queryEmbedding, profile)));
        results.push(...scoredResults);
        // Sort by score and take top-k
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, k);
    }
    /**
     * Add a correction to improve routing
     */
    async addCorrection(query, predictedTool, actualTool) {
        log.info({ query, predictedTool, actualTool }, 'Processing correction');
        // Get query embedding
        const embedding = await getEmbedding(query);
        // Update actual tool's profile (add positive example)
        const actualProfile = this.profiles.get(actualTool);
        if (actualProfile) {
            this.addExampleToProfile(actualProfile, query, embedding, 0.95);
        }
        // Update predicted tool's profile (potentially negative signal)
        // We don't explicitly add negatives but this could trigger rebalancing
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    async buildGlobalIDF(examples) {
        const documentFrequency = new Map();
        const totalDocs = examples.length;
        // Count document frequency for each word
        for (const ex of examples) {
            const tokenList = this.tokenize(ex.query);
            const tokenSet = {};
            for (const t of tokenList)
                tokenSet[t] = true;
            for (const token of Object.keys(tokenSet)) {
                documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
            }
        }
        // Calculate IDF: log(N / df)
        const dfEntries = Array.from(documentFrequency.entries());
        for (const [word, df] of dfEntries) {
            this.globalIDF.set(word, Math.log(totalDocs / df));
        }
        log.debug({ vocabularySize: this.globalIDF.size }, 'Built global IDF');
    }
    async buildToolProfile(tool, allExamples) {
        // Filter examples for this tool
        const toolExamples = allExamples
            .filter((ex) => ex.toolId === tool.id)
            .slice(0, this.config.maxExamplesPerTool);
        // Initialize profile
        const profile = {
            toolId: tool.id,
            keywords: new Map(),
            centroidEmbedding: null,
            exampleEmbeddings: [],
            exampleCount: toolExamples.length,
            avgQueryLength: 0,
        };
        // Build TF-IDF weighted keywords from examples
        const termFrequency = new Map();
        let totalLength = 0;
        for (const ex of toolExamples) {
            const tokens = this.tokenize(ex.query);
            totalLength += tokens.length;
            for (const token of tokens) {
                const weight = ex.confidence || 0.8;
                termFrequency.set(token, (termFrequency.get(token) || 0) + weight);
            }
        }
        // Calculate TF-IDF scores
        const tfEntries = Array.from(termFrequency.entries());
        for (const [word, tf] of tfEntries) {
            const idf = this.globalIDF.get(word) || 1;
            profile.keywords.set(word, tf * idf);
        }
        profile.avgQueryLength = toolExamples.length > 0 ? totalLength / toolExamples.length : 0;
        // Add description/pattern keywords with base weight
        const descTokens = this.tokenize(tool.description);
        for (const token of descTokens) {
            if (!profile.keywords.has(token)) {
                profile.keywords.set(token, 0.5); // Base weight for description terms
            }
        }
        // Add explicit keywords from triggers with high weight
        if (tool.triggers?.keywords) {
            for (const kwObj of tool.triggers.keywords) {
                const word = getKeywordWord(kwObj);
                const weight = getKeywordWeight(kwObj);
                const tokens = this.tokenize(word);
                for (const token of tokens) {
                    profile.keywords.set(token, (profile.keywords.get(token) || 0) + (weight ?? 2.0));
                }
            }
        }
        // Compute embeddings for a sample of examples
        const sampleSize = Math.min(20, toolExamples.length);
        const sampleIndices = this.selectDiverseSample(toolExamples, sampleSize);
        const embeddings = [];
        for (const idx of sampleIndices) {
            const ex = toolExamples[idx];
            const embedding = await getEmbedding(ex.query);
            embeddings.push(embedding);
            profile.exampleEmbeddings.push({
                query: ex.query,
                embedding,
                confidence: ex.confidence || 0.8,
            });
        }
        // Compute centroid embedding
        if (embeddings.length > 0) {
            profile.centroidEmbedding = this.computeCentroid(embeddings);
        }
        else {
            // Fall back to tool description embedding
            profile.centroidEmbedding = await getEmbedding(tool.description);
        }
        this.profiles.set(tool.id, profile);
    }
    async scoreQueryAgainstProfile(query, queryTokens, queryEmbedding, profile) {
        // TF-IDF score
        let tfidfScore = 0;
        const matchedKeywords = [];
        for (const token of queryTokens) {
            const weight = profile.keywords.get(token);
            if (weight) {
                tfidfScore += weight;
                matchedKeywords.push(token);
            }
        }
        // Normalize by query length
        tfidfScore = queryTokens.length > 0 ? tfidfScore / queryTokens.length : 0;
        // Embedding similarity
        let embeddingSimilarity = 0;
        if (profile.centroidEmbedding) {
            // Centroid similarity (single op - JS is fine)
            embeddingSimilarity = cosineSimilarity(queryEmbedding, profile.centroidEmbedding);
            // KNN boost: check similarity to nearest neighbors
            // Uses SIMD-accelerated batch similarity for 5+ examples
            if (profile.exampleEmbeddings.length > 0) {
                const exampleVectors = profile.exampleEmbeddings.map((ex) => Array.from(ex.embedding));
                const queryArray = Array.from(queryEmbedding);
                // Batch compute all similarities at once (SIMD-accelerated for 5+ candidates)
                const rawSims = batchCosineSimilarityOptimized(queryArray, exampleVectors);
                // Apply confidence weights and get top-K
                const knnSims = rawSims
                    .map((sim, i) => sim * profile.exampleEmbeddings[i].confidence)
                    .sort((a, b) => b - a)
                    .slice(0, this.config.knnK);
                const knnAvg = knnSims.reduce((sum, s) => sum + s, 0) / knnSims.length;
                // Blend centroid and KNN
                embeddingSimilarity = embeddingSimilarity * 0.6 + knnAvg * 0.4;
            }
        }
        // Combined score
        const score = this.config.tfidfWeight * tfidfScore + this.config.embeddingWeight * embeddingSimilarity;
        // Confidence based on evidence
        const confidence = Math.min(1.0, (matchedKeywords.length / 3) * 0.3 + // Keyword evidence
            embeddingSimilarity * 0.7 // Embedding evidence
        );
        return {
            toolId: profile.toolId,
            score,
            matchedKeywords,
            embeddingSimilarity,
            confidence,
        };
    }
    addExampleToProfile(profile, query, embedding, confidence) {
        // Add to examples (with limit)
        if (profile.exampleEmbeddings.length >= this.config.maxExamplesPerTool) {
            // Remove lowest confidence example
            profile.exampleEmbeddings.sort((a, b) => a.confidence - b.confidence);
            profile.exampleEmbeddings.shift();
        }
        profile.exampleEmbeddings.push({ query, embedding, confidence });
        profile.exampleCount++;
        // Update keywords
        const tokens = this.tokenize(query);
        for (const token of tokens) {
            const currentWeight = profile.keywords.get(token) || 0;
            profile.keywords.set(token, currentWeight + confidence);
        }
        // Recompute centroid
        const allEmbeddings = profile.exampleEmbeddings.map((ex) => ex.embedding);
        profile.centroidEmbedding = this.computeCentroid(allEmbeddings);
        log.debug({ toolId: profile.toolId, query }, 'Added example to profile');
    }
    tokenize(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter((t) => t.length > 2);
    }
    computeCentroid(embeddings) {
        if (embeddings.length === 0) {
            return new Array(embeddings[0]?.length || 768).fill(0);
        }
        const dim = embeddings[0].length;
        const centroid = new Array(dim).fill(0);
        for (const emb of embeddings) {
            for (let i = 0; i < dim; i++) {
                centroid[i] += emb[i];
            }
        }
        for (let i = 0; i < dim; i++) {
            centroid[i] /= embeddings.length;
        }
        return centroid;
    }
    selectDiverseSample(examples, size) {
        if (examples.length <= size) {
            return examples.map((_, i) => i);
        }
        // Simple diverse sampling: stratified by position
        const indices = [];
        const step = examples.length / size;
        for (let i = 0; i < size; i++) {
            indices.push(Math.floor(i * step));
        }
        return indices;
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
let retrieverInstance = null;
export function getLearnedRetriever() {
    if (!retrieverInstance) {
        retrieverInstance = new LearnedRetriever();
    }
    return retrieverInstance;
}
export async function initializeLearnedRetriever(tools, customConfig) {
    retrieverInstance = new LearnedRetriever(customConfig);
    await retrieverInstance.initialize(tools);
    return retrieverInstance;
}
//# sourceMappingURL=learned-retriever.js.map
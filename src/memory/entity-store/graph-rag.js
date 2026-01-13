/**
 * Graph-RAG Retrieval
 *
 * State-of-the-art retrieval combining:
 * - Hybrid search (BM25 + Vector)
 * - Graph expansion
 * - Cross-encoder reranking (optional)
 * - Temporal/emotional weighting
 *
 * @module memory/entity-store/graph-rag
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getEntityStore } from './store.js';
const log = createLogger({ module: 'GraphRAG' });
// ============================================================================
// GRAPH-RAG RETRIEVER
// ============================================================================
/**
 * Graph-RAG Retriever - production-grade retrieval for superhuman memory
 */
export class GraphRAGRetriever {
    crossEncoderLoaded = false;
    crossEncoder = null;
    /**
     * Main retrieval function
     */
    async retrieve(userId, query, context = {}, options = {}) {
        const startTime = Date.now();
        const store = getEntityStore();
        const topK = options.topK ?? 10;
        const minScore = options.minScore ?? 0.3;
        const debug = {
            bm25Candidates: 0,
            vectorCandidates: 0,
            graphExpanded: 0,
            afterRerank: 0,
        };
        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 1: Initial retrieval via EntityStore
        // ═══════════════════════════════════════════════════════════════════════
        const searchOptions = {
            userId,
            topK: topK * 3, // Get more candidates for processing
            minScore: minScore * 0.5, // Lower threshold, we'll filter later
            types: options.types,
            expandGraph: options.expandGraph ?? true,
            maxGraphHops: options.maxGraphHops ?? 2,
            hybrid: options.hybrid ?? true,
        };
        const initialResults = await store.searchEntities(query, searchOptions);
        debug.bm25Candidates = initialResults.filter((r) => r.scoreBreakdown.keyword > 0).length;
        debug.vectorCandidates = initialResults.filter((r) => r.scoreBreakdown.semantic > 0).length;
        debug.graphExpanded = initialResults.filter((r) => r.scoreBreakdown.graphDistance > 0).length;
        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 2: Context boosting
        // Boost entities related to current conversation context
        // ═══════════════════════════════════════════════════════════════════════
        const contextBoosted = this.applyContextBoosts(initialResults, context);
        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 3: Cross-encoder reranking (optional)
        // More accurate but expensive - use for high-stakes queries
        // ═══════════════════════════════════════════════════════════════════════
        let finalResults = contextBoosted;
        if (options.rerank && contextBoosted.length > 0) {
            try {
                finalResults = await this.crossEncoderRerank(query, contextBoosted, topK * 2);
                debug.afterRerank = finalResults.length;
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Cross-encoder rerank failed, using initial results');
            }
        }
        // ═══════════════════════════════════════════════════════════════════════
        // STAGE 4: Final filtering and sorting
        // ═══════════════════════════════════════════════════════════════════════
        const filtered = finalResults
            .filter((r) => r.score >= minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
        const latencyMs = Date.now() - startTime;
        log.debug({
            userId: userId.substring(0, 8),
            query: query.substring(0, 50),
            results: filtered.length,
            latencyMs,
        }, '🧠 Graph-RAG retrieval complete');
        return {
            entities: filtered,
            totalConsidered: initialResults.length,
            latencyMs,
            debug,
        };
    }
    /**
     * Apply context-based boosts to search results
     */
    applyContextBoosts(results, context) {
        return results.map((result) => {
            let boost = 1.0;
            // Boost entities mentioned recently in this session
            if (context.recentEntityMentions?.includes(result.entity.id)) {
                boost *= 1.3;
            }
            // Boost entities related to current topic
            if (context.currentTopic) {
                const attrs = result.entity.attributes;
                if ('topics' in attrs && attrs.topics?.includes(context.currentTopic)) {
                    boost *= 1.2;
                }
            }
            // Boost if persona-specific
            if (context.personaId && result.entity.sourcePersonas.includes(context.personaId)) {
                boost *= 1.1;
            }
            return {
                ...result,
                score: result.score * boost,
            };
        });
    }
    /**
     * Cross-encoder reranking for more accurate scoring
     *
     * Uses a transformer cross-encoder to score (query, entity) pairs
     * Much more accurate than cosine similarity but ~10x slower
     */
    async crossEncoderRerank(query, candidates, topK) {
        // Lazy load cross-encoder
        if (!this.crossEncoderLoaded) {
            try {
                // Use transformers.js for browser/Node compatibility
                const { pipeline } = await import('@xenova/transformers');
                this.crossEncoder = await pipeline('text-classification', 'Xenova/ms-marco-MiniLM-L-6-v2');
                this.crossEncoderLoaded = true;
            }
            catch (error) {
                log.warn({ error: String(error) }, 'Failed to load cross-encoder, skipping rerank');
                return candidates;
            }
        }
        if (!this.crossEncoder) {
            return candidates;
        }
        // Score each (query, entity) pair
        const entityTexts = candidates.map((c) => this.entityToSearchText(c.entity));
        const pairs = entityTexts.map((text) => ({
            text: query,
            text_pair: text,
        }));
        // Run cross-encoder (batched)
        const scores = await this.crossEncoder(pairs);
        // Combine cross-encoder score with original score
        const reranked = candidates.map((candidate, i) => ({
            ...candidate,
            score: candidate.score * 0.3 + scores[i].score * 0.7, // Weight cross-encoder higher
            scoreBreakdown: {
                ...candidate.scoreBreakdown,
                crossEncoder: scores[i].score,
            },
        }));
        return reranked.sort((a, b) => b.score - a.score).slice(0, topK);
    }
    /**
     * Convert entity to search-friendly text
     */
    entityToSearchText(entity) {
        const parts = [entity.canonicalName];
        if (entity.aliases.length > 0) {
            parts.push(`(${entity.aliases.slice(0, 3).join(', ')})`);
        }
        const attrs = entity.attributes;
        switch (attrs._type) {
            case 'person':
                parts.push(`- ${attrs.relationship}`);
                if (attrs.lastKnownStatus)
                    parts.push(attrs.lastKnownStatus);
                if (attrs.recentContext?.length)
                    parts.push(attrs.recentContext[0]);
                break;
            case 'commitment':
                parts.push(`- ${attrs.commitmentType}: ${attrs.originalStatement}`);
                parts.push(`Status: ${attrs.status}`);
                break;
            case 'event':
                parts.push(`- ${attrs.eventType}`);
                if (attrs.date)
                    parts.push(`on ${attrs.date.toLocaleDateString()}`);
                break;
            case 'memory':
                parts.push(`- ${attrs.memoryType}`);
                parts.push(attrs.content.substring(0, 100));
                break;
            case 'pattern':
                parts.push(`- ${attrs.patternType} pattern`);
                parts.push(attrs.description);
                break;
            case 'goal':
                parts.push(`- ${attrs.goalCategory} goal`);
                parts.push(`${attrs.progress}% complete`);
                break;
        }
        return parts.join(' ');
    }
}
// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================
let retrieverInstance = null;
/**
 * Get singleton retriever
 */
export function getGraphRAGRetriever() {
    if (!retrieverInstance) {
        retrieverInstance = new GraphRAGRetriever();
    }
    return retrieverInstance;
}
/**
 * Convenience function for Graph-RAG retrieval
 */
export async function graphRAGRetrieve(userId, query, context, options) {
    const retriever = getGraphRAGRetriever();
    return retriever.retrieve(userId, query, context, options);
}
//# sourceMappingURL=graph-rag.js.map
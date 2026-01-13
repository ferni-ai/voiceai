/**
 * Context Module Integrations
 *
 * Helper functions to wire the ContextManager with external systems
 * like trust systems and memory/RAG retrieval.
 *
 * These are kept separate from the core ContextManager to avoid circular
 * dependencies and keep the module boundaries clean.
 *
 * @example
 * ```typescript
 * import { getContextManager, wireContextIntegrations } from '../context/index.js';
 *
 * const contextManager = getContextManager(sessionId, userProfile);
 * wireContextIntegrations(contextManager, { userId, enableMemory: true, enableTrust: true });
 * ```
 *
 * @module context/integrations
 */
import { getLogger } from '../utils/safe-logger.js';
// ============================================================================
// WIRE INTEGRATIONS
// ============================================================================
/**
 * Wire trust and memory integrations into a ContextManager.
 *
 * This should be called once per session after creating the ContextManager.
 * It sets up the trust context builder and memory retriever functions.
 */
export async function wireContextIntegrations(contextManager, options = {}) {
    const { userId, enableTrust = true, enableMemory = true, maxMemories = 5, minMemoryRelevance = 0.6, } = options;
    const log = getLogger();
    // Wire trust context builder
    if (enableTrust && userId) {
        try {
            const { buildTrustContext } = await import('../services/trust-systems/index.js');
            contextManager.setTrustContextBuilder((uid, userText, context) => {
                try {
                    const trustResult = buildTrustContext(uid, userText, context);
                    // Map to our TrustContextResult interface
                    // UnsaidSignal has: type, observation, underlying
                    const result = {
                        unsaidSignals: trustResult.unsaidSignals?.map((s) => `${s.type}: ${s.underlying} (${s.observation})`),
                        topicsToAvoid: trustResult.topicsToAvoid,
                        growthReflection: trustResult.growthReflection?.reflection,
                        callbackOpportunity: trustResult.callbackOpportunity?.suggestedCallback,
                        celebrationOpportunity: trustResult.celebrationOpportunity?.celebration,
                        needsSupport: trustResult.unsaidSignals?.some((s) => s.type === 'emotional_mismatch' || s.type === 'minimizing_pain'),
                        raw: trustResult,
                    };
                    return result;
                }
                catch (error) {
                    log.warn({ error, userId: uid }, 'Trust context build failed');
                    return { needsSupport: false };
                }
            });
            log.debug({ userId }, 'Trust context integration wired');
        }
        catch (error) {
            log.warn({ error }, 'Failed to wire trust context integration');
        }
    }
    // Wire memory retriever
    if (enableMemory && userId) {
        try {
            const { semanticSearch } = await import('../memory/index.js');
            contextManager.setMemoryRetriever(async (uid, query, searchOptions) => {
                const limit = searchOptions?.limit ?? maxMemories;
                const minRelevance = searchOptions?.minRelevance ?? minMemoryRelevance;
                const startTime = Date.now();
                try {
                    // Use semantic search for memory retrieval
                    // semanticSearch(query, options?) - userId goes in options
                    const searchResults = await semanticSearch(query, {
                        topK: limit,
                        userId: uid,
                        minScore: minRelevance,
                    });
                    const memories = searchResults.map((r, idx) => ({
                        id: `mem_${idx}_${Date.now()}`,
                        content: r.content,
                        relevance: r.score,
                        timestamp: new Date(),
                        topics: r.category ? [r.category] : undefined,
                        source: r.source,
                    }));
                    const result = {
                        memories,
                        totalMatches: searchResults.length,
                        retrievalTimeMs: Date.now() - startTime,
                    };
                    return result;
                }
                catch (searchError) {
                    log.warn({ error: searchError, userId: uid }, 'Memory retrieval failed');
                    return {
                        memories: [],
                        totalMatches: 0,
                        retrievalTimeMs: Date.now() - startTime,
                    };
                }
            });
            log.debug({ userId, maxMemories, minMemoryRelevance }, 'Memory retrieval integration wired');
        }
        catch (error) {
            log.warn({ error }, 'Failed to wire memory retrieval integration');
        }
    }
}
/**
 * Quick helper to wire integrations for a new session.
 *
 * This combines getContextManager + wireContextIntegrations for convenience.
 */
export async function getIntegratedContextManager(sessionId, options = {}) {
    const { getContextManager } = await import('./registry.js');
    const contextManager = getContextManager(sessionId, options.userProfile);
    await wireContextIntegrations(contextManager, options);
    return contextManager;
}
//# sourceMappingURL=integrations.js.map
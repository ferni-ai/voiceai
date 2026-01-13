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
import type { ContextManager } from './context-manager.class.js';
export interface ContextIntegrationOptions {
    /** User ID for personalized retrieval */
    userId?: string;
    /** Enable trust systems integration */
    enableTrust?: boolean;
    /** Enable memory/RAG retrieval */
    enableMemory?: boolean;
    /** Max memories to retrieve per query */
    maxMemories?: number;
    /** Minimum relevance score for memories (0-1) */
    minMemoryRelevance?: number;
}
/**
 * Wire trust and memory integrations into a ContextManager.
 *
 * This should be called once per session after creating the ContextManager.
 * It sets up the trust context builder and memory retriever functions.
 */
export declare function wireContextIntegrations(contextManager: ContextManager, options?: ContextIntegrationOptions): Promise<void>;
/**
 * Quick helper to wire integrations for a new session.
 *
 * This combines getContextManager + wireContextIntegrations for convenience.
 */
export declare function getIntegratedContextManager(sessionId: string, options?: ContextIntegrationOptions & {
    userProfile?: Parameters<typeof import('./registry.js').getContextManager>[1];
}): Promise<ContextManager>;
//# sourceMappingURL=integrations.d.ts.map
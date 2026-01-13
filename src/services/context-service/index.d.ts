/**
 * Context Service Client
 *
 * Client for the future Context microservice.
 * Currently runs in-process with stub implementations, designed for easy extraction.
 *
 * Self-healing features (for remote mode):
 * - Circuit breaker prevents cascading failures
 * - Automatic retry with exponential backoff
 * - Graceful degradation to local processing
 *
 * The Context Service will handle:
 * - Building conversation context with RAG
 * - Semantic memory search
 * - User profile enrichment
 * - Emotional state analysis
 *
 * Usage:
 * ```ts
 * const context = await ContextService.buildContext({
 *   userId: 'user-123',
 *   userMessage: 'Tell me about my goals',
 *   personaId: 'ferni',
 *   sessionId: 'session-456',
 * });
 * ```
 */
import { type ResilientClient } from '../self-healing/index.js';
export interface ContextRequest {
    userId: string;
    userMessage: string;
    personaId: string;
    sessionId: string;
    voiceEmotion?: {
        primary: string;
        confidence: number;
    };
    conversationHistory?: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
}
export interface ContextInjection {
    category: string;
    content: string;
    priority: number;
    source?: string;
}
export interface RelevantMemory {
    id: string;
    content: string;
    similarity: number;
    timestamp: number;
    type: 'conversation' | 'key_moment' | 'goal' | 'preference';
}
export interface EmotionalState {
    primary: string;
    intensity: number;
    needsSupport: boolean;
    distressLevel?: number;
}
export interface ContextResponse {
    injections: ContextInjection[];
    relevantMemories: RelevantMemory[];
    emotionalState: EmotionalState;
    userProfile: {
        name?: string;
        relationshipStage?: string;
        conversationCount?: number;
    };
    processingTimeMs: number;
}
export interface SearchRequest {
    query: string;
    userId: string;
    limit?: number;
    filters?: {
        type?: string[];
        minSimilarity?: number;
        dateRange?: {
            start: Date;
            end: Date;
        };
    };
}
export interface SearchResult {
    id: string;
    content: string;
    similarity: number;
    metadata: Record<string, unknown>;
}
export interface ContextServiceConfig {
    /** Use remote service via HTTP/gRPC (Phase 3+) */
    useRemote: boolean;
    /** Remote service URL (only if useRemote is true) */
    remoteUrl?: string;
    /** Timeout for remote calls (ms) */
    timeoutMs?: number;
    /** Enable caching */
    enableCache?: boolean;
    /** Cache TTL (ms) */
    cacheTtlMs?: number;
}
declare class ContextServiceClient {
    private config;
    private cache;
    private remoteClient;
    constructor(config?: Partial<ContextServiceConfig>);
    /**
     * Build context for a conversation turn.
     */
    buildContext(request: ContextRequest): Promise<ContextResponse>;
    /**
     * Search memories semantically.
     */
    search(request: SearchRequest): Promise<SearchResult[]>;
    /**
     * Clear the context cache.
     */
    clearCache(): void;
    /**
     * Update configuration.
     */
    configure(config: Partial<ContextServiceConfig>): void;
    private buildContextLocal;
    private searchLocal;
    private buildContextRemote;
    private searchRemote;
    /**
     * Get health status for remote service
     */
    getRemoteHealth(): {
        healthy: boolean;
        stats?: ReturnType<ResilientClient['getStats']>;
    };
    private getCacheKey;
    private getFromCache;
    private setInCache;
}
export declare function getContextService(): ContextServiceClient;
export declare function configureContextService(config: Partial<ContextServiceConfig>): void;
export declare const ContextService: {
    buildContext: (request: ContextRequest) => Promise<ContextResponse>;
    search: (request: SearchRequest) => Promise<SearchResult[]>;
    clearCache: () => void;
    configure: typeof configureContextService;
};
export default ContextService;
//# sourceMappingURL=index.d.ts.map
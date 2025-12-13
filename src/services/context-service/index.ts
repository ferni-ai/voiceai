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

import { createLogger } from '../../utils/safe-logger.js';
import { createResilientClient, type ResilientClient } from '../self-healing/index.js';

const log = createLogger({ module: 'ContextService' });

// ============================================================================
// TYPES
// ============================================================================

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
    dateRange?: { start: Date; end: Date };
  };
}

export interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

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

const defaultConfig: ContextServiceConfig = {
  useRemote: false,
  timeoutMs: 5000,
  enableCache: true,
  cacheTtlMs: 60_000, // 1 minute
};

// ============================================================================
// CONTEXT SERVICE CLIENT
// ============================================================================

class ContextServiceClient {
  private config: ContextServiceConfig;
  private cache = new Map<string, { response: ContextResponse; expiresAt: number }>();
  private remoteClient: ResilientClient | null = null;
  
  constructor(config: Partial<ContextServiceConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    
    // Initialize resilient client for remote mode
    if (this.config.useRemote && this.config.remoteUrl) {
      this.remoteClient = createResilientClient('context-service', {
        timeout: this.config.timeoutMs,
        maxRetries: 2,
        failureThreshold: 3, // Open circuit after 3 failures
        recoveryTimeout: 30000, // Try again after 30s
      });
    }
  }
  
  /**
   * Build context for a conversation turn.
   */
  async buildContext(request: ContextRequest): Promise<ContextResponse> {
    const start = Date.now();
    
    // Check cache
    if (this.config.enableCache) {
      const cached = this.getFromCache(request);
      if (cached) {
        log.debug({ userId: request.userId }, 'Context cache hit');
        return cached;
      }
    }
    
    let response: ContextResponse;
    
    if (this.config.useRemote && this.config.remoteUrl) {
      response = await this.buildContextRemote(request);
    } else {
      response = await this.buildContextLocal(request);
    }
    
    response.processingTimeMs = Date.now() - start;
    
    // Cache result
    if (this.config.enableCache) {
      this.setInCache(request, response);
    }
    
    return response;
  }
  
  /**
   * Search memories semantically.
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    if (this.config.useRemote && this.config.remoteUrl) {
      return this.searchRemote(request);
    } else {
      return this.searchLocal(request);
    }
  }
  
  /**
   * Clear the context cache.
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Update configuration.
   */
  configure(config: Partial<ContextServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  // ============================================================================
  // LOCAL IMPLEMENTATION (Phase 1-2) - Full Memory Integration
  // ============================================================================
  
  private async buildContextLocal(request: ContextRequest): Promise<ContextResponse> {
    const { userId, userMessage, personaId, voiceEmotion } = request;
    
    log.debug({ userId, personaId }, 'Building context with memory integration');
    
    const injections: ContextInjection[] = [];
    const relevantMemories: RelevantMemory[] = [];
    let userProfile: ContextResponse['userProfile'] = {};
    
    // 1. Search for relevant memories using vector store
    try {
      const memories = await this.searchLocal({ userId, query: userMessage, limit: 5 });
      for (const mem of memories) {
        relevantMemories.push({
          id: mem.id,
          content: mem.content,
          similarity: mem.similarity,
          timestamp: (mem.metadata?.timestamp as number) || Date.now(),
          type: (mem.metadata?.type as RelevantMemory['type']) || 'conversation',
        });
      }
      
      // Add top memories as context injection
      if (relevantMemories.length > 0) {
        const topMemories = relevantMemories.slice(0, 3);
        injections.push({
          category: 'memory',
          content: `Relevant context from past conversations:\n${topMemories.map(m => `- ${m.content}`).join('\n')}`,
          priority: 70,
          source: 'context-service',
        });
      }
    } catch (memErr) {
      log.debug({ error: String(memErr) }, 'Memory search unavailable');
    }
    
    // 2. Get user profile
    try {
      const memoryModule = await import('../../memory/index.js');
      const store = await memoryModule.createStore();
      const profile = await store.getProfile(userId);
      if (profile) {
        userProfile = {
          name: profile.name,
          relationshipStage: profile.relationshipStage,
          conversationCount: profile.totalConversations,
        };
        
        // Add relationship context
        if (profile.relationshipStage) {
          injections.push({
            category: 'relationship',
            content: `User relationship stage: ${profile.relationshipStage}. Conversations: ${profile.totalConversations || 0}.`,
            priority: 60,
            source: 'context-service',
          });
        }
      }
    } catch (profileErr) {
      log.debug({ error: String(profileErr) }, 'Profile lookup unavailable');
    }
    
    // 3. Determine emotional state
    const emotionalState: EmotionalState = {
      primary: voiceEmotion?.primary || 'neutral',
      intensity: voiceEmotion?.confidence || 0.5,
      needsSupport: voiceEmotion?.primary === 'sad' || voiceEmotion?.primary === 'anxious',
    };
    
    // Add emotional context if distress detected
    if (emotionalState.needsSupport) {
      injections.push({
        category: 'emotional',
        content: `User appears to be feeling ${emotionalState.primary}. Approach with extra warmth and care.`,
        priority: 90,
        source: 'context-service',
      });
    }
    
    log.debug({ 
      userId, 
      memoriesFound: relevantMemories.length,
      injectionsAdded: injections.length,
      hasProfile: !!userProfile.name,
    }, 'Context built successfully');
    
    return {
      injections,
      relevantMemories,
      emotionalState,
      userProfile,
      processingTimeMs: 0, // Filled in by caller
    };
  }
  
  private async searchLocal(request: SearchRequest): Promise<SearchResult[]> {
    const { query, limit = 5 } = request;
    
    try {
      const memoryModule = await import('../../memory/index.js');
      
      // Try to get the vector store
      const vectorStore = memoryModule.getVectorStore?.();
      if (!vectorStore) {
        log.debug('Vector store not available');
        return [];
      }
      
      // Perform semantic search
      const results = await vectorStore.search(query, { topK: limit });
      
      return results.map(r => ({
        id: r.document.id,
        content: r.document.text,
        similarity: r.score,
        metadata: r.document.metadata || {},
      }));
    } catch (error) {
      log.debug({ error: String(error) }, 'Search failed');
      return [];
    }
  }
  
  // ============================================================================
  // REMOTE IMPLEMENTATION (Phase 3+) - with self-healing
  // ============================================================================
  
  private async buildContextRemote(request: ContextRequest): Promise<ContextResponse> {
    if (!this.config.remoteUrl || !this.remoteClient) {
      throw new Error('Remote URL not configured');
    }
    
    // Check if circuit is healthy - if not, fall back to local
    if (!this.remoteClient.isHealthy()) {
      log.debug('Context service circuit is open, falling back to local');
      return this.buildContextLocal(request);
    }
    
    const { data, error } = await this.remoteClient.post<ContextResponse>(
      `${this.config.remoteUrl}/context/build`,
      request
    );
    
    if (error || !data) {
      log.warn(
        { error: error?.message, code: error?.code },
        'Remote context build failed, falling back to local'
      );
      return this.buildContextLocal(request);
    }
    
    return data;
  }
  
  private async searchRemote(request: SearchRequest): Promise<SearchResult[]> {
    if (!this.config.remoteUrl || !this.remoteClient) {
      throw new Error('Remote URL not configured');
    }
    
    // Check if circuit is healthy - if not, fall back to local
    if (!this.remoteClient.isHealthy()) {
      log.debug('Context service circuit is open, falling back to local search');
      return this.searchLocal(request);
    }
    
    const { data, error } = await this.remoteClient.post<SearchResult[]>(
      `${this.config.remoteUrl}/context/search`,
      request
    );
    
    if (error || !data) {
      log.warn(
        { error: error?.message, code: error?.code },
        'Remote search failed, falling back to local'
      );
      return this.searchLocal(request);
    }
    
    return data;
  }
  
  /**
   * Get health status for remote service
   */
  getRemoteHealth(): { healthy: boolean; stats?: ReturnType<ResilientClient['getStats']> } {
    if (!this.remoteClient) {
      return { healthy: true }; // Local mode is always healthy
    }
    return {
      healthy: this.remoteClient.isHealthy(),
      stats: this.remoteClient.getStats(),
    };
  }
  
  // ============================================================================
  // CACHING
  // ============================================================================
  
  private getCacheKey(request: ContextRequest): string {
    return `${request.userId}:${request.sessionId}:${request.userMessage.slice(0, 50)}`;
  }
  
  private getFromCache(request: ContextRequest): ContextResponse | null {
    const key = this.getCacheKey(request);
    const cached = this.cache.get(key);
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.response;
    }
    
    if (cached) {
      this.cache.delete(key);
    }
    
    return null;
  }
  
  private setInCache(request: ContextRequest, response: ContextResponse): void {
    const key = this.getCacheKey(request);
    this.cache.set(key, {
      response,
      expiresAt: Date.now() + (this.config.cacheTtlMs || 60_000),
    });
    
    // Limit cache size
    if (this.cache.size > 1000) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ContextServiceClient | null = null;

export function getContextService(): ContextServiceClient {
  if (!instance) {
    instance = new ContextServiceClient();
  }
  return instance;
}

export function configureContextService(config: Partial<ContextServiceConfig>): void {
  getContextService().configure(config);
}

export const ContextService = {
  buildContext: (request: ContextRequest) => getContextService().buildContext(request),
  search: (request: SearchRequest) => getContextService().search(request),
  clearCache: () => getContextService().clearCache(),
  configure: configureContextService,
};

export default ContextService;

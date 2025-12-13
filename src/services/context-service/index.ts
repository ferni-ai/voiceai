/**
 * Context Service Client
 * 
 * Client for the future Context microservice.
 * Currently runs in-process with stub implementations, designed for easy extraction.
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
  
  constructor(config: Partial<ContextServiceConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
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
  // LOCAL IMPLEMENTATION (Phase 1-2) - Stub for now
  // ============================================================================
  
  private async buildContextLocal(request: ContextRequest): Promise<ContextResponse> {
    const { userId, voiceEmotion } = request;
    
    log.debug({ userId }, 'Building context locally (stub)');
    
    // Return minimal context - will be fully implemented when context builders are refactored
    // The actual context building happens in voice-agent.ts and turn-processor.ts for now
    
    const emotionalState: EmotionalState = {
      primary: voiceEmotion?.primary || 'neutral',
      intensity: voiceEmotion?.confidence || 0.5,
      needsSupport: voiceEmotion?.primary === 'sad' || voiceEmotion?.primary === 'anxious',
    };
    
    return {
      injections: [],
      relevantMemories: [],
      emotionalState,
      userProfile: {},
      processingTimeMs: 0, // Filled in by caller
    };
  }
  
  private async searchLocal(_request: SearchRequest): Promise<SearchResult[]> {
    // Stub implementation - will use vector store when fully integrated
    log.debug('Search local (stub)');
    return [];
  }
  
  // ============================================================================
  // REMOTE IMPLEMENTATION (Phase 3+)
  // ============================================================================
  
  private async buildContextRemote(request: ContextRequest): Promise<ContextResponse> {
    if (!this.config.remoteUrl) {
      throw new Error('Remote URL not configured');
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    
    try {
      const response = await fetch(`${this.config.remoteUrl}/context/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      
      if (!response.ok) {
        throw new Error(`Context service error: ${response.status}`);
      }
      
      return await response.json() as ContextResponse;
      
    } finally {
      clearTimeout(timeout);
    }
  }
  
  private async searchRemote(request: SearchRequest): Promise<SearchResult[]> {
    if (!this.config.remoteUrl) {
      throw new Error('Remote URL not configured');
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    
    try {
      const response = await fetch(`${this.config.remoteUrl}/context/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      
      if (!response.ok) {
        throw new Error(`Context service error: ${response.status}`);
      }
      
      return await response.json() as SearchResult[];
      
    } finally {
      clearTimeout(timeout);
    }
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

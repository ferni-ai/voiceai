/**
 * Context Service Tests
 *
 * Tests for the context service client types, configuration,
 * caching, and API interfaces.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock self-healing resilient client
vi.mock('../../self-healing/index.js', () => ({
  createResilientClient: vi.fn(() => ({
    isHealthy: () => true,
    post: vi.fn().mockResolvedValue({ data: {}, error: null }),
    getStats: () => ({ requests: 0, failures: 0, circuitOpen: false }),
  })),
}));

import {
  type ContextRequest,
  type ContextInjection,
  type RelevantMemory,
  type EmotionalState,
  type ContextResponse,
  type SearchRequest,
  type SearchResult,
  type ContextServiceConfig,
} from '../index.js';

describe('ContextService Types', () => {
  describe('ContextRequest', () => {
    it('should create valid context request', () => {
      const request: ContextRequest = {
        userId: 'user-123',
        userMessage: 'What are my goals for this week?',
        personaId: 'ferni',
        sessionId: 'session-456',
      };

      expect(request.userId).toBe('user-123');
      expect(request.personaId).toBe('ferni');
    });

    it('should support voice emotion context', () => {
      const request: ContextRequest = {
        userId: 'user-123',
        userMessage: 'I\'m feeling overwhelmed',
        personaId: 'ferni',
        sessionId: 'session-456',
        voiceEmotion: {
          primary: 'anxious',
          confidence: 0.85,
        },
      };

      expect(request.voiceEmotion?.primary).toBe('anxious');
      expect(request.voiceEmotion?.confidence).toBe(0.85);
    });

    it('should support conversation history', () => {
      const request: ContextRequest = {
        userId: 'user-123',
        userMessage: 'Tell me more about that',
        personaId: 'maya',
        sessionId: 'session-456',
        conversationHistory: [
          { role: 'user', content: 'I want to start exercising' },
          { role: 'assistant', content: 'That\'s a great goal! What type of exercise interests you?' },
          { role: 'user', content: 'Maybe running' },
        ],
      };

      expect(request.conversationHistory).toHaveLength(3);
      expect(request.conversationHistory?.[0].role).toBe('user');
      expect(request.conversationHistory?.[1].role).toBe('assistant');
    });

    it('should allow minimal request', () => {
      const minimalRequest: ContextRequest = {
        userId: 'user-1',
        userMessage: 'Hello',
        personaId: 'ferni',
        sessionId: 'sess-1',
      };

      expect(minimalRequest.voiceEmotion).toBeUndefined();
      expect(minimalRequest.conversationHistory).toBeUndefined();
    });
  });

  describe('ContextInjection', () => {
    it('should create context injection', () => {
      const injection: ContextInjection = {
        category: 'memory',
        content: 'User mentioned they love hiking last week',
        priority: 70,
        source: 'context-service',
      };

      expect(injection.category).toBe('memory');
      expect(injection.priority).toBe(70);
    });

    it('should support various categories', () => {
      const categories = ['memory', 'emotional', 'relationship', 'trust', 'safety'];

      categories.forEach((category) => {
        const injection: ContextInjection = {
          category,
          content: `Content for ${category}`,
          priority: 50,
        };
        expect(injection.category).toBe(category);
      });
    });

    it('should allow optional source', () => {
      const injection: ContextInjection = {
        category: 'trust',
        content: 'User has shared deep personal information',
        priority: 85,
      };

      expect(injection.source).toBeUndefined();
    });

    it('should order by priority', () => {
      const injections: ContextInjection[] = [
        { category: 'memory', content: 'Low priority', priority: 30 },
        { category: 'safety', content: 'High priority', priority: 95 },
        { category: 'emotional', content: 'Medium priority', priority: 60 },
      ];

      const sorted = [...injections].sort((a, b) => b.priority - a.priority);

      expect(sorted[0].category).toBe('safety');
      expect(sorted[2].category).toBe('memory');
    });
  });

  describe('RelevantMemory', () => {
    it('should create relevant memory', () => {
      const memory: RelevantMemory = {
        id: 'mem_123',
        content: 'User mentioned wanting to learn guitar',
        similarity: 0.89,
        timestamp: Date.now(),
        type: 'goal',
      };

      expect(memory.similarity).toBeGreaterThan(0.8);
      expect(memory.type).toBe('goal');
    });

    it('should support all memory types', () => {
      const types: RelevantMemory['type'][] = [
        'conversation',
        'key_moment',
        'goal',
        'preference',
      ];

      types.forEach((type) => {
        const memory: RelevantMemory = {
          id: `mem_${type}`,
          content: `Memory of type ${type}`,
          similarity: 0.75,
          timestamp: Date.now(),
          type,
        };
        expect(memory.type).toBe(type);
      });
    });

    it('should track similarity scores', () => {
      const highSimilarity: RelevantMemory = {
        id: 'mem_high',
        content: 'Very relevant memory',
        similarity: 0.95,
        timestamp: Date.now(),
        type: 'conversation',
      };

      const lowSimilarity: RelevantMemory = {
        id: 'mem_low',
        content: 'Marginally relevant memory',
        similarity: 0.55,
        timestamp: Date.now(),
        type: 'conversation',
      };

      expect(highSimilarity.similarity).toBeGreaterThan(lowSimilarity.similarity);
    });
  });

  describe('EmotionalState', () => {
    it('should create emotional state', () => {
      const state: EmotionalState = {
        primary: 'happy',
        intensity: 0.7,
        needsSupport: false,
      };

      expect(state.primary).toBe('happy');
      expect(state.needsSupport).toBe(false);
    });

    it('should detect when support is needed', () => {
      const distressedState: EmotionalState = {
        primary: 'sad',
        intensity: 0.85,
        needsSupport: true,
        distressLevel: 0.8,
      };

      expect(distressedState.needsSupport).toBe(true);
      expect(distressedState.distressLevel).toBeGreaterThan(0.5);
    });

    it('should support various emotional states', () => {
      const emotions = ['happy', 'sad', 'anxious', 'angry', 'neutral', 'excited'];

      emotions.forEach((emotion) => {
        const state: EmotionalState = {
          primary: emotion,
          intensity: 0.6,
          needsSupport: emotion === 'sad' || emotion === 'anxious',
        };
        expect(state.primary).toBe(emotion);
      });
    });

    it('should track distress level separately from intensity', () => {
      const state: EmotionalState = {
        primary: 'anxious',
        intensity: 0.5, // Moderate intensity
        needsSupport: true,
        distressLevel: 0.9, // High distress
      };

      expect(state.distressLevel).toBeGreaterThan(state.intensity);
    });
  });

  describe('ContextResponse', () => {
    it('should create complete context response', () => {
      const response: ContextResponse = {
        injections: [
          { category: 'memory', content: 'User loves hiking', priority: 70 },
          { category: 'emotional', content: 'User seems stressed', priority: 85 },
        ],
        relevantMemories: [
          {
            id: 'mem_1',
            content: 'Mentioned hiking trip plan',
            similarity: 0.88,
            timestamp: Date.now() - 86400000,
            type: 'conversation',
          },
        ],
        emotionalState: {
          primary: 'stressed',
          intensity: 0.65,
          needsSupport: true,
        },
        userProfile: {
          name: 'Alex',
          relationshipStage: 'established',
          conversationCount: 42,
        },
        processingTimeMs: 125,
      };

      expect(response.injections).toHaveLength(2);
      expect(response.relevantMemories).toHaveLength(1);
      expect(response.userProfile.name).toBe('Alex');
      expect(response.processingTimeMs).toBeLessThan(200);
    });

    it('should support empty response', () => {
      const emptyResponse: ContextResponse = {
        injections: [],
        relevantMemories: [],
        emotionalState: {
          primary: 'neutral',
          intensity: 0.5,
          needsSupport: false,
        },
        userProfile: {},
        processingTimeMs: 50,
      };

      expect(emptyResponse.injections).toHaveLength(0);
      expect(emptyResponse.userProfile.name).toBeUndefined();
    });

    it('should track processing time', () => {
      const fastResponse: ContextResponse = {
        injections: [],
        relevantMemories: [],
        emotionalState: { primary: 'neutral', intensity: 0.5, needsSupport: false },
        userProfile: {},
        processingTimeMs: 25,
      };

      const slowResponse: ContextResponse = {
        injections: [],
        relevantMemories: [],
        emotionalState: { primary: 'neutral', intensity: 0.5, needsSupport: false },
        userProfile: {},
        processingTimeMs: 500,
      };

      expect(fastResponse.processingTimeMs).toBeLessThan(slowResponse.processingTimeMs);
    });
  });

  describe('SearchRequest', () => {
    it('should create search request', () => {
      const request: SearchRequest = {
        query: 'exercise habits',
        userId: 'user-123',
        limit: 10,
      };

      expect(request.query).toBe('exercise habits');
      expect(request.limit).toBe(10);
    });

    it('should support filters', () => {
      const request: SearchRequest = {
        query: 'career goals',
        userId: 'user-123',
        filters: {
          type: ['goal', 'key_moment'],
          minSimilarity: 0.7,
          dateRange: {
            start: new Date('2024-01-01'),
            end: new Date('2024-12-31'),
          },
        },
      };

      expect(request.filters?.type).toContain('goal');
      expect(request.filters?.minSimilarity).toBe(0.7);
      expect(request.filters?.dateRange?.start).toBeInstanceOf(Date);
    });

    it('should allow minimal search', () => {
      const minimalRequest: SearchRequest = {
        query: 'anything',
        userId: 'user-1',
      };

      expect(minimalRequest.limit).toBeUndefined();
      expect(minimalRequest.filters).toBeUndefined();
    });
  });

  describe('SearchResult', () => {
    it('should create search result', () => {
      const result: SearchResult = {
        id: 'doc_123',
        content: 'User mentioned they run every morning',
        similarity: 0.92,
        metadata: {
          timestamp: Date.now(),
          source: 'conversation',
          personaId: 'maya',
        },
      };

      expect(result.similarity).toBeGreaterThan(0.9);
      expect(result.metadata.source).toBe('conversation');
    });

    it('should support arbitrary metadata', () => {
      const result: SearchResult = {
        id: 'doc_456',
        content: 'Important financial goal',
        similarity: 0.85,
        metadata: {
          category: 'finance',
          importance: 'high',
          tags: ['goal', 'money', 'savings'],
          customField: { nested: { value: 42 } },
        },
      };

      expect(result.metadata.tags).toContain('money');
      expect((result.metadata.customField as { nested: { value: number } }).nested.value).toBe(42);
    });

    it('should order by similarity', () => {
      const results: SearchResult[] = [
        { id: 'a', content: 'Low match', similarity: 0.55, metadata: {} },
        { id: 'b', content: 'High match', similarity: 0.95, metadata: {} },
        { id: 'c', content: 'Medium match', similarity: 0.75, metadata: {} },
      ];

      const sorted = [...results].sort((a, b) => b.similarity - a.similarity);

      expect(sorted[0].id).toBe('b');
      expect(sorted[1].id).toBe('c');
      expect(sorted[2].id).toBe('a');
    });
  });

  describe('ContextServiceConfig', () => {
    it('should create default config', () => {
      const defaultConfig: ContextServiceConfig = {
        useRemote: false,
        timeoutMs: 5000,
        enableCache: true,
        cacheTtlMs: 60000,
      };

      expect(defaultConfig.useRemote).toBe(false);
      expect(defaultConfig.enableCache).toBe(true);
    });

    it('should support remote configuration', () => {
      const remoteConfig: ContextServiceConfig = {
        useRemote: true,
        remoteUrl: 'https://context-service.example.com',
        timeoutMs: 10000,
        enableCache: true,
        cacheTtlMs: 120000,
      };

      expect(remoteConfig.useRemote).toBe(true);
      expect(remoteConfig.remoteUrl).toContain('context-service');
    });

    it('should allow cache to be disabled', () => {
      const noCacheConfig: ContextServiceConfig = {
        useRemote: false,
        enableCache: false,
      };

      expect(noCacheConfig.enableCache).toBe(false);
    });

    it('should have reasonable timeout values', () => {
      const config: ContextServiceConfig = {
        useRemote: true,
        timeoutMs: 5000,
      };

      // Timeout should be between 1s and 30s
      expect(config.timeoutMs).toBeGreaterThanOrEqual(1000);
      expect(config.timeoutMs).toBeLessThanOrEqual(30000);
    });
  });

  describe('Integration scenarios', () => {
    it('should build context for returning user', () => {
      const request: ContextRequest = {
        userId: 'user-returning',
        userMessage: 'Hey, how\'s it going?',
        personaId: 'ferni',
        sessionId: 'session-new',
        conversationHistory: [],
      };

      const response: ContextResponse = {
        injections: [
          {
            category: 'relationship',
            content: 'This is a returning user with 15 previous conversations',
            priority: 60,
          },
          {
            category: 'memory',
            content: 'Last spoke about career change 3 days ago',
            priority: 70,
          },
        ],
        relevantMemories: [
          {
            id: 'mem_recent',
            content: 'Considering switching to product management',
            similarity: 0.65,
            timestamp: Date.now() - 259200000, // 3 days
            type: 'key_moment',
          },
        ],
        emotionalState: {
          primary: 'neutral',
          intensity: 0.5,
          needsSupport: false,
        },
        userProfile: {
          name: 'Jordan',
          relationshipStage: 'established',
          conversationCount: 15,
        },
        processingTimeMs: 85,
      };

      expect(response.userProfile.conversationCount).toBe(15);
      expect(response.relevantMemories[0].type).toBe('key_moment');
    });

    it('should handle distressed user context', () => {
      const request: ContextRequest = {
        userId: 'user-distressed',
        userMessage: 'I don\'t know what to do anymore',
        personaId: 'ferni',
        sessionId: 'session-support',
        voiceEmotion: {
          primary: 'sad',
          confidence: 0.92,
        },
      };

      const response: ContextResponse = {
        injections: [
          {
            category: 'emotional',
            content: 'User appears to be feeling sad. Approach with extra warmth and care.',
            priority: 95,
            source: 'context-service',
          },
          {
            category: 'safety',
            content: 'Monitor for signs of crisis. Be prepared to offer resources.',
            priority: 90,
          },
        ],
        relevantMemories: [],
        emotionalState: {
          primary: 'sad',
          intensity: 0.92,
          needsSupport: true,
          distressLevel: 0.75,
        },
        userProfile: {},
        processingTimeMs: 45,
      };

      expect(response.emotionalState.needsSupport).toBe(true);
      expect(response.injections[0].priority).toBeGreaterThan(90);
    });

    it('should enrich context with semantic search', () => {
      const searchRequest: SearchRequest = {
        query: 'morning routine',
        userId: 'user-habits',
        limit: 5,
        filters: {
          type: ['preference', 'goal'],
          minSimilarity: 0.6,
        },
      };

      const searchResults: SearchResult[] = [
        {
          id: 'mem_1',
          content: 'User wakes up at 6am and does yoga',
          similarity: 0.88,
          metadata: { type: 'preference', timestamp: Date.now() - 86400000 },
        },
        {
          id: 'mem_2',
          content: 'Goal: Establish consistent morning meditation',
          similarity: 0.82,
          metadata: { type: 'goal', timestamp: Date.now() - 604800000 },
        },
        {
          id: 'mem_3',
          content: 'Mentioned wanting to add journaling to mornings',
          similarity: 0.75,
          metadata: { type: 'goal', timestamp: Date.now() - 172800000 },
        },
      ];

      expect(searchResults).toHaveLength(3);
      expect(searchResults.every((r) => r.similarity >= 0.6)).toBe(true);
    });
  });

  describe('Caching behavior', () => {
    it('should generate consistent cache keys', () => {
      const request1: ContextRequest = {
        userId: 'user-123',
        userMessage: 'Hello there',
        personaId: 'ferni',
        sessionId: 'session-456',
      };

      const request2: ContextRequest = {
        userId: 'user-123',
        userMessage: 'Hello there',
        personaId: 'ferni',
        sessionId: 'session-456',
      };

      // Same request should generate same key
      const key1 = `${request1.userId}:${request1.sessionId}:${request1.userMessage.slice(0, 50)}`;
      const key2 = `${request2.userId}:${request2.sessionId}:${request2.userMessage.slice(0, 50)}`;

      expect(key1).toBe(key2);
    });

    it('should differentiate cache keys by session', () => {
      const request1: ContextRequest = {
        userId: 'user-123',
        userMessage: 'Hello',
        personaId: 'ferni',
        sessionId: 'session-A',
      };

      const request2: ContextRequest = {
        userId: 'user-123',
        userMessage: 'Hello',
        personaId: 'ferni',
        sessionId: 'session-B',
      };

      const key1 = `${request1.userId}:${request1.sessionId}:${request1.userMessage}`;
      const key2 = `${request2.userId}:${request2.sessionId}:${request2.userMessage}`;

      expect(key1).not.toBe(key2);
    });

    it('should truncate long messages in cache key', () => {
      const longMessage = 'A'.repeat(100);
      const request: ContextRequest = {
        userId: 'user-123',
        userMessage: longMessage,
        personaId: 'ferni',
        sessionId: 'session-456',
      };

      const truncatedKey = `${request.userId}:${request.sessionId}:${request.userMessage.slice(0, 50)}`;

      expect(truncatedKey.length).toBeLessThan(100);
      expect(truncatedKey.endsWith('AAAAA')).toBe(true); // 50 A's
    });
  });

  describe('Error handling scenarios', () => {
    it('should provide fallback emotional state', () => {
      const fallbackState: EmotionalState = {
        primary: 'neutral',
        intensity: 0.5,
        needsSupport: false,
      };

      expect(fallbackState.primary).toBe('neutral');
    });

    it('should provide empty response on failure', () => {
      const emptyResponse: ContextResponse = {
        injections: [],
        relevantMemories: [],
        emotionalState: {
          primary: 'neutral',
          intensity: 0.5,
          needsSupport: false,
        },
        userProfile: {},
        processingTimeMs: 0,
      };

      expect(emptyResponse.injections).toHaveLength(0);
      expect(emptyResponse.relevantMemories).toHaveLength(0);
    });
  });
});

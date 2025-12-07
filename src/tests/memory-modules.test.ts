/**
 * Memory Modules Tests
 *
 * Comprehensive tests for core memory system modules:
 * - history.ts: Conversation history tracking
 * - embeddings.ts: Text embedding generation and similarity
 * - index.ts: Memory system initialization and orchestration
 *
 * @module tests/memory-modules
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// HISTORY MODULE TESTS
// ============================================================================

import {
  ConversationHistoryTracker,
  getHistoryTracker,
  removeHistoryTracker,
  getActiveSessionIds,
  clearAllHistoryTrackers,
  setActivePersonaName,
  getActivePersonaName,
  resetActivePersonaName,
  type TrackedTurn,
  type SessionHistory,
} from '../memory/history.js';

describe('ConversationHistoryTracker', () => {
  let tracker: ConversationHistoryTracker;
  const sessionId = 'test-session-123';
  const userId = 'user-456';

  beforeEach(() => {
    tracker = new ConversationHistoryTracker(sessionId, userId);
    resetActivePersonaName();
  });

  afterEach(() => {
    clearAllHistoryTrackers();
    resetActivePersonaName();
  });

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  describe('Initialization', () => {
    it('should create tracker with session ID', () => {
      expect(tracker).toBeDefined();
      const history = tracker.getSessionHistory();
      expect(history.sessionId).toBe(sessionId);
    });

    it('should create tracker with optional user ID', () => {
      const history = tracker.getSessionHistory();
      expect(history.userId).toBe(userId);
    });

    it('should initialize with empty turns', () => {
      expect(tracker.getTurnCount()).toBe(0);
      expect(tracker.getTurns()).toEqual([]);
    });

    it('should set timestamps on creation', () => {
      const history = tracker.getSessionHistory();
      expect(history.startedAt).toBeInstanceOf(Date);
      expect(history.lastActivityAt).toBeInstanceOf(Date);
    });
  });

  // --------------------------------------------------------------------------
  // Adding Turns
  // --------------------------------------------------------------------------

  describe('Adding Turns', () => {
    it('should add a user turn', () => {
      const turn = tracker.addUserTurn('Hello there!');

      expect(turn.role).toBe('user');
      expect(turn.content).toBe('Hello there!');
      expect(turn.turnIndex).toBe(0);
      expect(turn.wordCount).toBe(2);
      expect(turn.id).toBe(`turn_${sessionId}_0`);
    });

    it('should add an assistant turn', () => {
      const turn = tracker.addAssistantTurn('Hi! How can I help?');

      expect(turn.role).toBe('assistant');
      expect(turn.content).toBe('Hi! How can I help?');
      expect(turn.turnIndex).toBe(0);
      expect(turn.wordCount).toBe(5);
    });

    it('should increment turn indices correctly', () => {
      const turn1 = tracker.addUserTurn('First message');
      const turn2 = tracker.addAssistantTurn('Response');
      const turn3 = tracker.addUserTurn('Follow up');

      expect(turn1.turnIndex).toBe(0);
      expect(turn2.turnIndex).toBe(1);
      expect(turn3.turnIndex).toBe(2);
    });

    it('should count words correctly', () => {
      const turn = tracker.addUserTurn('This is a test message with seven words');
      expect(turn.wordCount).toBe(8);
    });

    it('should handle empty content', () => {
      const turn = tracker.addUserTurn('');
      expect(turn.wordCount).toBe(0);
    });

    it('should add metadata to user turns', () => {
      const turn = tracker.addUserTurn('I feel excited!', {
        emotionDetected: 'joy',
        topicsDetected: ['emotion', 'feelings'],
        durationMs: 2500,
      });

      expect(turn.emotionDetected).toBe('joy');
      expect(turn.topicsDetected).toEqual(['emotion', 'feelings']);
      expect(turn.durationMs).toBe(2500);
    });

    it('should add metadata to assistant turns', () => {
      const turn = tracker.addAssistantTurn('That sounds great!', {
        topicsDetected: ['encouragement'],
      });

      expect(turn.topicsDetected).toEqual(['encouragement']);
    });

    it('should set timestamps for turns', () => {
      const turn = tracker.addUserTurn('Test message');
      expect(turn.timestamp).toBeInstanceOf(Date);
    });

    it('should update last activity time', async () => {
      const history1 = tracker.getSessionHistory();
      const firstActivity = history1.lastActivityAt;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      tracker.addUserTurn('Another message');
      const history2 = tracker.getSessionHistory();

      expect(history2.lastActivityAt.getTime()).toBeGreaterThan(firstActivity.getTime());
    });
  });

  // --------------------------------------------------------------------------
  // Retrieving Turns
  // --------------------------------------------------------------------------

  describe('Retrieving Turns', () => {
    beforeEach(() => {
      tracker.addUserTurn('Message 1');
      tracker.addAssistantTurn('Response 1');
      tracker.addUserTurn('Message 2');
      tracker.addAssistantTurn('Response 2');
      tracker.addUserTurn('Message 3');
    });

    it('should get all turns', () => {
      const turns = tracker.getTurns();
      expect(turns).toHaveLength(5);
    });

    it('should return copy of turns array', () => {
      const turns1 = tracker.getTurns();
      const turns2 = tracker.getTurns();

      expect(turns1).toEqual(turns2);
      expect(turns1).not.toBe(turns2);
    });

    it('should get recent turns', () => {
      const recent = tracker.getRecentTurns(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].content).toBe('Response 2');
      expect(recent[1].content).toBe('Message 3');
    });

    it('should handle requesting more turns than available', () => {
      const recent = tracker.getRecentTurns(100);
      expect(recent).toHaveLength(5);
    });

    it('should get user turns only', () => {
      const userTurns = tracker.getUserTurns();
      expect(userTurns).toHaveLength(3);
      expect(userTurns.every((t) => t.role === 'user')).toBe(true);
    });

    it('should get assistant turns only', () => {
      const assistantTurns = tracker.getAssistantTurns();
      expect(assistantTurns).toHaveLength(2);
      expect(assistantTurns.every((t) => t.role === 'assistant')).toBe(true);
    });

    it('should get simple turns for summarizer', () => {
      const simpleTurns = tracker.getSimpleTurns();
      expect(simpleTurns).toHaveLength(5);

      // Should not have extended metadata
      expect(simpleTurns[0]).toHaveProperty('role');
      expect(simpleTurns[0]).toHaveProperty('content');
      expect(simpleTurns[0]).toHaveProperty('timestamp');
      expect(simpleTurns[0]).not.toHaveProperty('id');
      expect(simpleTurns[0]).not.toHaveProperty('turnIndex');
    });

    it('should get turn count', () => {
      expect(tracker.getTurnCount()).toBe(5);
    });
  });

  // --------------------------------------------------------------------------
  // Metadata Tracking
  // --------------------------------------------------------------------------

  describe('Metadata Tracking', () => {
    it('should track topics across turns', () => {
      tracker.addUserTurn('Talk about finance', {
        topicsDetected: ['finance', 'money'],
      });
      tracker.addUserTurn('Tell me about investing', {
        topicsDetected: ['investing', 'finance'],
      });

      const topics = tracker.getTopicsDiscussed();
      expect(topics).toContain('finance');
      expect(topics).toContain('money');
      expect(topics).toContain('investing');
      expect(topics).toHaveLength(3); // Unique topics
    });

    it('should track emotional journey', () => {
      tracker.addUserTurn('I am happy!', { emotionDetected: 'joy' });
      tracker.addUserTurn('This is frustrating', { emotionDetected: 'frustration' });
      tracker.addUserTurn('I feel calm now', { emotionDetected: 'calm' });

      const emotions = tracker.getEmotionalJourney();
      expect(emotions).toEqual(['joy', 'frustration', 'calm']);
    });

    it('should include topics in session history metadata', () => {
      tracker.addUserTurn('Test', { topicsDetected: ['topic1'] });
      tracker.addUserTurn('Test', { topicsDetected: ['topic2'] });

      const history = tracker.getSessionHistory();
      expect(history.metadata.topicsDiscussed).toContain('topic1');
      expect(history.metadata.topicsDiscussed).toContain('topic2');
    });

    it('should include emotions in session history metadata', () => {
      tracker.addUserTurn('Test', { emotionDetected: 'joy' });
      tracker.addUserTurn('Test', { emotionDetected: 'sadness' });

      const history = tracker.getSessionHistory();
      expect(history.metadata.emotionalJourney).toEqual(['joy', 'sadness']);
    });

    it('should calculate total word count', () => {
      tracker.addUserTurn('One two three'); // 3 words
      tracker.addAssistantTurn('Four five'); // 2 words

      const history = tracker.getSessionHistory();
      expect(history.metadata.totalWordCount).toBe(5);
    });

    it('should calculate average words per turn', () => {
      tracker.addUserTurn('One two three'); // 3 words
      tracker.addAssistantTurn('Four'); // 1 word

      const history = tracker.getSessionHistory();
      expect(history.metadata.averageWordsPerTurn).toBe(2); // (3 + 1) / 2 = 2
    });
  });

  // --------------------------------------------------------------------------
  // Search and Context
  // --------------------------------------------------------------------------

  describe('Search and Context', () => {
    beforeEach(() => {
      tracker.addUserTurn('I want to discuss retirement planning');
      tracker.addAssistantTurn('Sure, what would you like to know about retirement?');
      tracker.addUserTurn('How much should I save?');
      tracker.addAssistantTurn('It depends on your goals and timeline');
    });

    it('should search turns by content', () => {
      const results = tracker.searchTurns('retirement');
      expect(results).toHaveLength(2);
      expect(results[0].content).toContain('retirement');
    });

    it('should search case-insensitively', () => {
      const results = tracker.searchTurns('RETIREMENT');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array for no matches', () => {
      const results = tracker.searchTurns('nonexistent');
      expect(results).toEqual([]);
    });

    it('should generate context window', () => {
      const context = tracker.getContextWindow(10, 4000);

      expect(context).toContain('User:');
      expect(context).toContain('Assistant:');
      expect(context).toContain('retirement planning');
    });

    it('should limit context by turn count', () => {
      tracker.addUserTurn('Turn 5');
      tracker.addUserTurn('Turn 6');
      tracker.addUserTurn('Turn 7');

      const context = tracker.getContextWindow(2, 4000);
      const lines = context.split('\n');

      expect(lines.length).toBeLessThanOrEqual(2);
    });

    it('should limit context by character count', () => {
      const context = tracker.getContextWindow(10, 50);
      expect(context.length).toBeLessThanOrEqual(50);
    });

    it('should use persona name in context window', () => {
      setActivePersonaName('Maya');
      const context = tracker.getContextWindow();

      expect(context).toContain('Maya:');
      expect(context).not.toContain('Assistant:');
    });
  });

  // --------------------------------------------------------------------------
  // Session Analytics
  // --------------------------------------------------------------------------

  describe('Session Analytics', () => {
    it('should calculate session duration', async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      tracker.addUserTurn('Test');

      const duration = tracker.getDurationSeconds();
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should calculate user WPM when duration is available', () => {
      tracker.addUserTurn('One two three four five', { durationMs: 1000 }); // 5 words in 1s
      tracker.addUserTurn('Six seven eight nine ten', { durationMs: 1000 }); // 5 words in 1s

      const wpm = tracker.calculateUserWPM();
      expect(wpm).toBeDefined();
      expect(wpm).toBe(300); // 10 words in 2s = 300 WPM
    });

    it('should return undefined WPM when no duration data', () => {
      tracker.addUserTurn('Test message');
      const wpm = tracker.calculateUserWPM();
      expect(wpm).toBeUndefined();
    });

    it('should handle zero duration', () => {
      tracker.addUserTurn('Test', { durationMs: 0 });
      const wpm = tracker.calculateUserWPM();
      expect(wpm).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Clear
  // --------------------------------------------------------------------------

  describe('Clear', () => {
    it('should clear all turns and metadata', () => {
      tracker.addUserTurn('Test', { emotionDetected: 'joy', topicsDetected: ['topic'] });
      tracker.clear();

      expect(tracker.getTurnCount()).toBe(0);
      expect(tracker.getTopicsDiscussed()).toEqual([]);
      expect(tracker.getEmotionalJourney()).toEqual([]);
    });
  });
});

// ============================================================================
// SESSION MANAGEMENT TESTS
// ============================================================================

describe('Session Management', () => {
  afterEach(() => {
    clearAllHistoryTrackers();
  });

  describe('getHistoryTracker', () => {
    it('should create new tracker for session', () => {
      const tracker = getHistoryTracker('session-1', 'user-1');
      expect(tracker).toBeInstanceOf(ConversationHistoryTracker);
    });

    it('should return existing tracker for same session', () => {
      const tracker1 = getHistoryTracker('session-1');
      const tracker2 = getHistoryTracker('session-1');

      expect(tracker1).toBe(tracker2);
    });

    it('should create different trackers for different sessions', () => {
      const tracker1 = getHistoryTracker('session-1');
      const tracker2 = getHistoryTracker('session-2');

      expect(tracker1).not.toBe(tracker2);
    });
  });

  describe('removeHistoryTracker', () => {
    it('should remove tracker and return history', () => {
      const tracker = getHistoryTracker('session-1');
      tracker.addUserTurn('Test message');

      const history = removeHistoryTracker('session-1');

      expect(history).toBeDefined();
      expect(history?.sessionId).toBe('session-1');
      expect(history?.turns).toHaveLength(1);
    });

    it('should return undefined for non-existent session', () => {
      const history = removeHistoryTracker('nonexistent');
      expect(history).toBeUndefined();
    });

    it('should not return tracker after removal', () => {
      getHistoryTracker('session-1');
      removeHistoryTracker('session-1');

      // Should create new tracker
      const tracker = getHistoryTracker('session-1');
      expect(tracker.getTurnCount()).toBe(0);
    });
  });

  describe('getActiveSessionIds', () => {
    it('should return empty array initially', () => {
      expect(getActiveSessionIds()).toEqual([]);
    });

    it('should return all active session IDs', () => {
      getHistoryTracker('session-1');
      getHistoryTracker('session-2');
      getHistoryTracker('session-3');

      const ids = getActiveSessionIds();
      expect(ids).toContain('session-1');
      expect(ids).toContain('session-2');
      expect(ids).toContain('session-3');
      expect(ids).toHaveLength(3);
    });
  });

  describe('clearAllHistoryTrackers', () => {
    it('should clear all trackers', () => {
      getHistoryTracker('session-1');
      getHistoryTracker('session-2');

      clearAllHistoryTrackers();

      expect(getActiveSessionIds()).toEqual([]);
    });
  });
});

// ============================================================================
// PERSONA NAME MANAGEMENT TESTS
// ============================================================================

describe('Persona Name Management', () => {
  afterEach(() => {
    resetActivePersonaName();
  });

  it('should have default persona name', () => {
    expect(getActivePersonaName()).toBe('Assistant');
  });

  it('should set active persona name', () => {
    setActivePersonaName('Maya');
    expect(getActivePersonaName()).toBe('Maya');
  });

  it('should reset to default', () => {
    setActivePersonaName('Jordan');
    resetActivePersonaName();
    expect(getActivePersonaName()).toBe('Assistant');
  });
});

// ============================================================================
// EMBEDDINGS MODULE TESTS
// ============================================================================

import {
  embed,
  embedBatch,
  cosineSimilarity,
  euclideanDistance,
  findTopK,
  getEmbeddingProvider,
  setEmbeddingProvider,
  validateEmbeddingDimensions,
  getModelDimensions,
  EMBEDDING_DIMENSIONS,
  OpenAIEmbeddings,
  GoogleEmbeddings,
  VertexAIEmbeddings,
  LocalEmbeddings,
  type EmbeddingProvider,
} from '../memory/embeddings.js';

describe('Embeddings Module', () => {
  // --------------------------------------------------------------------------
  // Similarity Functions
  // --------------------------------------------------------------------------

  describe('cosineSimilarity', () => {
    it('should calculate similarity for identical vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2, 3];

      const similarity = cosineSimilarity(v1, v2);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should calculate similarity for opposite vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [-1, -2, -3];

      const similarity = cosineSimilarity(v1, v2);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('should calculate similarity for orthogonal vectors', () => {
      const v1 = [1, 0];
      const v2 = [0, 1];

      const similarity = cosineSimilarity(v1, v2);
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it('should handle zero vectors', () => {
      const v1 = [0, 0, 0];
      const v2 = [1, 2, 3];

      const similarity = cosineSimilarity(v1, v2);
      expect(similarity).toBe(0);
    });

    it('should throw error for mismatched dimensions', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2];

      expect(() => cosineSimilarity(v1, v2)).toThrow(/dimensions must match/i);
    });
  });

  describe('euclideanDistance', () => {
    it('should calculate distance for identical vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2, 3];

      const distance = euclideanDistance(v1, v2);
      expect(distance).toBeCloseTo(0, 5);
    });

    it('should calculate distance correctly', () => {
      const v1 = [0, 0];
      const v2 = [3, 4];

      const distance = euclideanDistance(v1, v2);
      expect(distance).toBeCloseTo(5, 5); // 3-4-5 triangle
    });

    it('should throw error for mismatched dimensions', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2];

      expect(() => euclideanDistance(v1, v2)).toThrow(/dimensions must match/i);
    });
  });

  describe('findTopK', () => {
    const query = [1, 0, 0];
    const vectors = [
      [1, 0, 0], // Perfect match
      [0.9, 0.1, 0], // Close match
      [0, 1, 0], // Orthogonal
      [0.5, 0.5, 0], // Medium match
    ];

    it('should find top-k by cosine similarity', () => {
      const results = findTopK(query, vectors, 2, 'cosine');

      expect(results).toHaveLength(2);
      expect(results[0].index).toBe(0); // Best match
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('should find top-k by euclidean distance', () => {
      const results = findTopK(query, vectors, 2, 'euclidean');

      expect(results).toHaveLength(2);
      expect(results[0].index).toBe(0); // Best match (smallest distance)
    });

    it('should return all vectors if k is larger', () => {
      const results = findTopK(query, vectors, 100, 'cosine');
      expect(results).toHaveLength(4);
    });

    it('should sort by score descending', () => {
      const results = findTopK(query, vectors, 4, 'cosine');

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Local Embeddings (Deterministic Testing)
  // --------------------------------------------------------------------------

  describe('LocalEmbeddings', () => {
    let provider: LocalEmbeddings;

    beforeEach(() => {
      provider = new LocalEmbeddings(384);
    });

    it('should create provider with specified dimensions', () => {
      expect(provider.dimensions).toBe(384);
    });

    it('should have local-hash model name', () => {
      expect(provider.model).toBe('local-hash');
    });

    it('should generate embedding with correct dimensions', async () => {
      const embedding = await provider.embed('test text');
      expect(embedding).toHaveLength(384);
    });

    it('should generate normalized embeddings', async () => {
      const embedding = await provider.embed('test text');

      // Calculate magnitude
      const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeCloseTo(1.0, 5);
    });

    it('should generate different embeddings for different texts', async () => {
      const emb1 = await provider.embed('hello world');
      const emb2 = await provider.embed('goodbye world');

      expect(emb1).not.toEqual(emb2);
    });

    it('should generate same embedding for same text', async () => {
      const emb1 = await provider.embed('test');
      const emb2 = await provider.embed('test');

      expect(emb1).toEqual(emb2);
    });

    it('should embed batch of texts', async () => {
      const texts = ['text1', 'text2', 'text3'];
      const embeddings = await provider.embedBatch(texts);

      expect(embeddings).toHaveLength(3);
      expect(embeddings[0]).toHaveLength(384);
    });

    it('should handle empty text', async () => {
      const embedding = await provider.embed('');
      expect(embedding).toHaveLength(384);
    });
  });

  // --------------------------------------------------------------------------
  // OpenAI Embeddings (Mocked)
  // --------------------------------------------------------------------------

  describe('OpenAIEmbeddings', () => {
    let provider: OpenAIEmbeddings;
    const mockFetch = vi.fn();

    beforeEach(() => {
      mockFetch.mockReset();
      global.fetch = mockFetch;
      provider = new OpenAIEmbeddings({
        model: 'text-embedding-3-small',
        apiKey: 'test-key',
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should have correct dimensions for model', () => {
      expect(provider.dimensions).toBe(1536);
    });

    it('should embed text via API', async () => {
      const mockEmbedding = new Array(1536).fill(0.1);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding, index: 0 }],
          usage: { total_tokens: 10 },
        }),
      });

      const embedding = await provider.embed('test text');
      expect(embedding).toEqual(mockEmbedding);
    });

    it('should embed batch via API', async () => {
      const mockEmbeddings = [
        new Array(1536).fill(0.1),
        new Array(1536).fill(0.2),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { embedding: mockEmbeddings[0], index: 0 },
            { embedding: mockEmbeddings[1], index: 1 },
          ],
          usage: { total_tokens: 20 },
        }),
      });

      const embeddings = await provider.embedBatch(['text1', 'text2']);
      expect(embeddings).toEqual(mockEmbeddings);
    });

    it('should throw error when API key is missing', async () => {
      const noKeyProvider = new OpenAIEmbeddings({ apiKey: '' });

      await expect(noKeyProvider.embed('test')).rejects.toThrow(/API key not configured/i);
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(provider.embed('test')).rejects.toThrow(/OpenAI API error/i);
    });

    it('should retry on rate limit error', async () => {
      // First call fails with rate limit
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      // Second call succeeds
      const mockEmbedding = new Array(1536).fill(0.1);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding, index: 0 }],
          usage: { total_tokens: 10 },
        }),
      });

      const embedding = await provider.embed('test');
      expect(embedding).toEqual(mockEmbedding);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should sort embeddings by index', async () => {
      const mockEmbeddings = [
        new Array(1536).fill(0.1),
        new Array(1536).fill(0.2),
      ];

      // Return in wrong order
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { embedding: mockEmbeddings[1], index: 1 },
            { embedding: mockEmbeddings[0], index: 0 },
          ],
          usage: { total_tokens: 20 },
        }),
      });

      const embeddings = await provider.embedBatch(['text1', 'text2']);
      expect(embeddings).toEqual(mockEmbeddings);
    });
  });

  // --------------------------------------------------------------------------
  // Google Embeddings (Mocked)
  // --------------------------------------------------------------------------

  describe('GoogleEmbeddings', () => {
    let provider: GoogleEmbeddings;
    const mockFetch = vi.fn();

    beforeEach(() => {
      global.fetch = mockFetch;
      provider = new GoogleEmbeddings({
        model: 'text-embedding-004',
        apiKey: 'test-key',
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should have correct dimensions for model', () => {
      expect(provider.dimensions).toBe(768);
    });

    it('should embed text via API', async () => {
      const mockEmbedding = new Array(768).fill(0.1);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embeddings: [{ values: mockEmbedding }],
        }),
      });

      const embedding = await provider.embed('test text');
      expect(embedding).toEqual(mockEmbedding);
    });

    it('should embed batch via API', async () => {
      const mockEmbeddings = [new Array(768).fill(0.1), new Array(768).fill(0.2)];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embeddings: [{ values: mockEmbeddings[0] }, { values: mockEmbeddings[1] }],
        }),
      });

      const embeddings = await provider.embedBatch(['text1', 'text2']);
      expect(embeddings).toEqual(mockEmbeddings);
    });

    it('should throw error when API key is missing', async () => {
      const noKeyProvider = new GoogleEmbeddings({ apiKey: '' });

      await expect(noKeyProvider.embed('test')).rejects.toThrow(/API key not configured/i);
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(provider.embed('test')).rejects.toThrow(/Google AI API error/i);
    });
  });

  // --------------------------------------------------------------------------
  // Vertex AI Embeddings (Mocked)
  // --------------------------------------------------------------------------

  describe('VertexAIEmbeddings', () => {
    let provider: VertexAIEmbeddings;
    const mockFetch = vi.fn();

    beforeEach(() => {
      global.fetch = mockFetch;
      provider = new VertexAIEmbeddings({
        projectId: 'test-project',
        accessToken: 'test-token',
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should have correct dimensions for model', () => {
      expect(provider.dimensions).toBe(768);
    });

    it('should embed text via API', async () => {
      const mockEmbedding = new Array(768).fill(0.1);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          predictions: [
            {
              embeddings: {
                values: mockEmbedding,
                statistics: { truncated: false, token_count: 10 },
              },
            },
          ],
        }),
      });

      const embedding = await provider.embed('test text');
      expect(embedding).toEqual(mockEmbedding);
    });

    it('should handle async token getter', async () => {
      const tokenGetter = vi.fn(async () => 'dynamic-token');
      const dynamicProvider = new VertexAIEmbeddings({
        projectId: 'test-project',
        accessToken: tokenGetter,
      });

      const mockEmbedding = new Array(768).fill(0.1);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          predictions: [
            {
              embeddings: {
                values: mockEmbedding,
                statistics: { truncated: false, token_count: 10 },
              },
            },
          ],
        }),
      });

      await dynamicProvider.embed('test');
      expect(tokenGetter).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Provider Management
  // --------------------------------------------------------------------------

  describe('Provider Management', () => {
    afterEach(() => {
      // Reset to default
      vi.unstubAllEnvs();
    });

    it('should get default provider (local when no API keys)', () => {
      vi.stubEnv('GOOGLE_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', '');

      const provider = getEmbeddingProvider();
      expect(provider.model).toBe('local-hash');
    });

    it('should set custom provider', () => {
      const customProvider = new LocalEmbeddings(256);
      setEmbeddingProvider(customProvider);

      const provider = getEmbeddingProvider();
      expect(provider).toBe(customProvider);
      expect(provider.dimensions).toBe(256);
    });
  });

  // --------------------------------------------------------------------------
  // Utility Functions
  // --------------------------------------------------------------------------

  describe('Utility Functions', () => {
    it('should validate compatible dimensions', () => {
      const emb1 = new Array(1536).fill(0);
      const emb2 = new Array(1536).fill(0);

      expect(() => validateEmbeddingDimensions(emb1, emb2)).not.toThrow();
    });

    it('should throw on incompatible dimensions', () => {
      const emb1 = new Array(1536).fill(0);
      const emb2 = new Array(768).fill(0);

      expect(() => validateEmbeddingDimensions(emb1, emb2)).toThrow(/dimension mismatch/i);
    });

    it('should include context in error message', () => {
      const emb1 = new Array(1536).fill(0);
      const emb2 = new Array(768).fill(0);

      expect(() => validateEmbeddingDimensions(emb1, emb2, 'test context')).toThrow(
        /test context/i
      );
    });

    it('should get model dimensions', () => {
      expect(getModelDimensions('text-embedding-3-small')).toBe(1536);
      expect(getModelDimensions('text-embedding-004')).toBe(768);
      expect(getModelDimensions('unknown-model')).toBeUndefined();
    });

    it('should have embedding dimensions constant', () => {
      expect(EMBEDDING_DIMENSIONS['text-embedding-3-small']).toBe(1536);
      expect(EMBEDDING_DIMENSIONS['text-embedding-3-large']).toBe(3072);
      expect(EMBEDDING_DIMENSIONS['text-embedding-004']).toBe(768);
    });
  });
});

// ============================================================================
// MEMORY INDEX MODULE TESTS
// ============================================================================

import {
  detectStoreType,
  createStore,
  shouldUseRedis,
  initializeMemorySystem,
  shutdownMemorySystem,
  type StoreType,
} from '../memory/index.js';

describe('Memory Index Module', () => {
  // --------------------------------------------------------------------------
  // Store Type Detection
  // --------------------------------------------------------------------------

  describe('detectStoreType', () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
      // Clear all relevant env vars to ensure clean state
      vi.stubEnv('MEMORY_STORE_TYPE', '');
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
      vi.stubEnv('GCLOUD_PROJECT', '');
      vi.stubEnv('DATABASE_URL', '');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should detect memory store by default', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('MEMORY_STORE_TYPE', '');

      expect(detectStoreType()).toBe('memory');
    });

    it('should use explicit MEMORY_STORE_TYPE', () => {
      vi.stubEnv('MEMORY_STORE_TYPE', 'postgres');

      expect(detectStoreType()).toBe('postgres');
    });

    it('should detect firestore in production with GCP project', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'my-project');

      expect(detectStoreType()).toBe('firestore');
    });

    it('should detect postgres in production with DATABASE_URL', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
      vi.stubEnv('DATABASE_URL', 'postgresql://localhost/db');

      expect(detectStoreType()).toBe('postgres');
    });

    it('should fall back to memory in production without credentials', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
      vi.stubEnv('DATABASE_URL', '');

      expect(detectStoreType()).toBe('memory');
    });
  });

  // --------------------------------------------------------------------------
  // Redis Detection
  // --------------------------------------------------------------------------

  describe('shouldUseRedis', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should return false when no Redis configured', () => {
      vi.stubEnv('REDIS_URL', '');
      vi.stubEnv('REDIS_HOST', '');

      expect(shouldUseRedis()).toBe(false);
    });

    it('should return true when REDIS_URL is set', () => {
      vi.stubEnv('REDIS_URL', 'redis://localhost:6379');

      expect(shouldUseRedis()).toBe(true);
    });

    it('should return true when REDIS_HOST is set', () => {
      vi.stubEnv('REDIS_HOST', 'localhost');

      expect(shouldUseRedis()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Store Creation
  // --------------------------------------------------------------------------

  describe('createStore', () => {
    it('should create in-memory store', async () => {
      const store = await createStore('memory');
      expect(store).toBeDefined();
      await store.close();
    });

    it('should create store based on detected type', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const store = await createStore();
      expect(store).toBeDefined();
      await store.close();
    });
  });

  // --------------------------------------------------------------------------
  // Memory System Initialization
  // --------------------------------------------------------------------------

  describe('initializeMemorySystem', () => {
    afterEach(async () => {
      await shutdownMemorySystem();
      vi.unstubAllEnvs();
    });

    it('should initialize with default configuration', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const result = await initializeMemorySystem({
        indexPersona: false,
        rehydrateConversations: false,
        enableRedis: false,
      });

      expect(result.store).toBeDefined();
      expect(result.vectorStore).toBeDefined();
      expect(result.storeType).toBe('memory');
    });

    it('should initialize with custom store type', async () => {
      const result = await initializeMemorySystem({
        storeType: 'memory',
        indexPersona: false,
        rehydrateConversations: false,
        enableRedis: false,
      });

      expect(result.storeType).toBe('memory');
    });

    it('should use persistent vectors when configured', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const result = await initializeMemorySystem({
        usePersistentVectors: false,
        indexPersona: false,
        rehydrateConversations: false,
        enableRedis: false,
      });

      expect(result.usePersistentVectors).toBe(false);
    });

    it('should skip persona indexing when disabled', async () => {
      const result = await initializeMemorySystem({
        storeType: 'memory',
        indexPersona: false,
        rehydrateConversations: false,
        enableRedis: false,
      });

      expect(result.store).toBeDefined();
    });

    it('should skip rehydration when disabled', async () => {
      const result = await initializeMemorySystem({
        storeType: 'memory',
        indexPersona: false,
        rehydrateConversations: false,
        enableRedis: false,
      });

      expect(result.store).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // Memory System Shutdown
  // --------------------------------------------------------------------------

  describe('shutdownMemorySystem', () => {
    it('should shut down cleanly', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      await initializeMemorySystem({
        storeType: 'memory',
        indexPersona: false,
        rehydrateConversations: false,
        enableRedis: false,
      });

      await expect(shutdownMemorySystem()).resolves.not.toThrow();
    });
  });
});

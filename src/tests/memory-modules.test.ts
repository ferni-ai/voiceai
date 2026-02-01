/**
 * Memory Modules Tests
 *
 * Comprehensive tests for core memory system modules:
 * - embeddings.ts: Text embedding generation and similarity
 * - index.ts: Memory system initialization and orchestration
 *
 * NOTE: History tracking tests were removed in January 2026 refactor.
 * History tracking is now handled by the session state layer (services/).
 * See memory/index.ts for the backward-compatible stub implementation.
 *
 * @module tests/memory-modules
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// HISTORY MODULE - REMOVED (January 2026)
// ============================================================================
//
// The original history.ts was deleted as part of the memory refactor.
// History tracking is now handled by session state in services layer.
// The memory/index.ts provides backward-compatible stub implementations
// of getHistoryTracker() and removeHistoryTracker() for any legacy code.
//
// Tests for the deleted ConversationHistoryTracker class have been removed.
// ============================================================================

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

    it('should return 0 for mismatched dimensions', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2];

      // Implementation returns 0 for mismatched dimensions (graceful degradation)
      expect(cosineSimilarity(v1, v2)).toBe(0);
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
      const mockEmbeddings = [new Array(1536).fill(0.1), new Array(1536).fill(0.2)];

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
      const mockEmbeddings = [new Array(1536).fill(0.1), new Array(1536).fill(0.2)];

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

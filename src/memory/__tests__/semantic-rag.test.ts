/**
 * Tests for Semantic RAG
 *
 * Validates semantic search, persona content indexing,
 * and conversation summary storage.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock embeddings module
vi.mock('../embeddings.js', () => ({
  embed: vi.fn(async (text: string) => {
    // Return a deterministic mock embedding based on text hash
    const hash = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return Array.from({ length: 768 }, (_, i) => ((hash + i) % 100) / 100);
  }),
  embedBatch: vi.fn(async (texts: string[]) => {
    return texts.map((text) => {
      const hash = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      return Array.from({ length: 768 }, (_, i) => ((hash + i) % 100) / 100);
    });
  }),
  cosineSimilarity: vi.fn((a: number[], b: number[]) => {
    // Simple mock similarity
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }),
}));

// Mock vector store
const mockVectorStore = {
  isInitialized: true,
  initialize: vi.fn(),
  addDocument: vi.fn(),
  search: vi.fn(),
  getStats: vi.fn(() => ({ documentCount: 0, bySource: {}, byCategory: {} })),
};

vi.mock('../vector-store.js', () => ({
  getVectorStore: () => mockVectorStore,
  VectorStore: vi.fn(),
}));

vi.mock('../firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => mockVectorStore,
  FirestoreVectorStore: vi.fn(),
}));

// Mock embedding cache
vi.mock('../embedding-cache.js', () => ({
  embedCached: vi.fn(async (text: string) => {
    const hash = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
      value: Array.from({ length: 768 }, (_, i) => ((hash + i) % 100) / 100),
    };
  }),
}));

// Mock result types
vi.mock('../result.js', () => ({
  isOk: (r: unknown) => !!(r as { value?: unknown })?.value,
}));

// Mock memory metrics
vi.mock('../memory-metrics.js', () => ({
  getMemoryMetricsCollector: () => ({
    recordRetrieval: vi.fn(),
  }),
}));

// Mock retrieval explanations
vi.mock('../retrieval-explanations.js', () => ({
  getRetrievalExplainer: () => ({
    explain: (memory: unknown, context: unknown) => ({
      naturalExplanation: 'This is relevant because...',
      suggestedReference: 'You mentioned this before...',
    }),
  }),
}));

describe('Semantic RAG', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVectorStore.addDocument.mockClear();
    mockVectorStore.search.mockClear();
  });

  describe('indexPersonaContent', () => {
    it('should chunk and index persona content', async () => {
      const { indexPersonaContent, setActiveVectorStore } = await import('../semantic-rag.js');
      setActiveVectorStore(mockVectorStore as never);

      const content = 'This is test persona content about investing wisely.';
      await indexPersonaContent('test_content', content, 'knowledge', mockVectorStore as never);

      expect(mockVectorStore.addDocument).toHaveBeenCalled();
      const call = mockVectorStore.addDocument.mock.calls[0][0];
      expect(call.id).toContain('test_content');
      expect(call.metadata.source).toBe('persona');
      expect(call.metadata.category).toBe('knowledge');
    });

    it('should handle long content by chunking', async () => {
      const { indexPersonaContent, setActiveVectorStore } = await import('../semantic-rag.js');
      setActiveVectorStore(mockVectorStore as never);

      // Create content that would need chunking
      const longContent = Array(50).fill('This is a long paragraph of test content.').join('\n\n');
      await indexPersonaContent('long_content', longContent, 'stories', mockVectorStore as never);

      // Should have multiple chunks
      expect(mockVectorStore.addDocument.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('indexConversationSummary', () => {
    it('should index conversation summary with user metadata', async () => {
      const { indexConversationSummary, setActiveVectorStore } = await import('../semantic-rag.js');
      setActiveVectorStore(mockVectorStore as never);

      await indexConversationSummary(
        'user123',
        {
          id: 'conv_1',
          text: 'We talked about career goals and work-life balance.',
          topics: ['career', 'wellness'],
          timestamp: new Date(),
        },
        mockVectorStore as never
      );

      expect(mockVectorStore.addDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'conversation_conv_1',
          metadata: expect.objectContaining({
            source: 'conversation',
            category: 'summary',
            userId: 'user123',
            topics: ['career', 'wellness'],
          }),
        })
      );
    });
  });

  describe('semanticSearch', () => {
    it('should search and return results with scores', async () => {
      const { semanticSearch, setActiveVectorStore } = await import('../semantic-rag.js');
      setActiveVectorStore(mockVectorStore as never);

      mockVectorStore.search.mockResolvedValue([
        {
          document: {
            id: 'doc1',
            text: 'Investing in low-cost index funds',
            metadata: { source: 'persona', category: 'knowledge' },
          },
          score: 0.85,
        },
        {
          document: {
            id: 'doc2',
            text: 'Previous conversation about finances',
            metadata: { source: 'conversation', category: 'summary' },
          },
          score: 0.72,
        },
      ]);

      const results = await semanticSearch('How should I invest?');

      expect(results).toHaveLength(2);
      expect(results[0].score).toBe(0.85);
      expect(results[0].source).toBe('persona');
      expect(results[1].source).toBe('conversation');
    });

    it('should filter by source', async () => {
      const { semanticSearch, setActiveVectorStore } = await import('../semantic-rag.js');
      setActiveVectorStore(mockVectorStore as never);

      mockVectorStore.search.mockResolvedValue([]);

      await semanticSearch('test query', {
        sources: ['persona'],
        topK: 3,
      });

      expect(mockVectorStore.search).toHaveBeenCalledWith(
        'test query',
        expect.objectContaining({
          topK: 3,
          filter: expect.objectContaining({
            source: ['persona'],
          }),
        })
      );
    });
  });

  describe('getRAGContext', () => {
    it('should return formatted context for prompt injection', async () => {
      const { getRAGContext, setActiveVectorStore } = await import('../semantic-rag.js');
      setActiveVectorStore(mockVectorStore as never);

      mockVectorStore.search.mockResolvedValue([
        {
          document: {
            id: 'doc1',
            text: 'Index funds are great for long-term investing.',
            metadata: { source: 'persona', category: 'knowledge' },
          },
          score: 0.9,
        },
      ]);

      const context = await getRAGContext('Tell me about index funds');

      expect(context.results).toHaveLength(1);
      expect(context.formattedContext).toContain('RELEVANT KNOWLEDGE');
      expect(context.formattedContext).toContain('Index funds');
    });
  });

  describe('hybridSearch', () => {
    it('should combine semantic and keyword scores', async () => {
      const { hybridSearch, setActiveVectorStore } = await import('../semantic-rag.js');
      setActiveVectorStore(mockVectorStore as never);

      mockVectorStore.search.mockResolvedValue([
        {
          document: {
            id: 'doc1',
            text: 'Investing in index funds for retirement',
            metadata: { source: 'persona' },
          },
          score: 0.8,
        },
        {
          document: {
            id: 'doc2',
            text: 'General financial advice without specific keywords',
            metadata: { source: 'persona' },
          },
          score: 0.85,
        },
      ]);

      const results = await hybridSearch('index funds retirement', {
        keywordWeight: 0.3,
        semanticWeight: 0.7,
      });

      // Doc1 should rank higher due to keyword matches
      expect(results[0].content).toContain('index funds');
    });
  });

  describe('ragLookup (backward compatibility)', () => {
    it('should return top result content', async () => {
      const { ragLookup, setActiveVectorStore } = await import('../semantic-rag.js');
      setActiveVectorStore(mockVectorStore as never);

      mockVectorStore.search.mockResolvedValue([
        {
          document: {
            id: 'doc1',
            text: 'This is relevant knowledge content.',
            metadata: { source: 'persona' },
          },
          score: 0.5,
        },
      ]);

      const result = await ragLookup('test query');

      expect(result).toBe('This is relevant knowledge content.');
    });

    it('should return null when no results', async () => {
      const { ragLookup, setActiveVectorStore } = await import('../semantic-rag.js');
      setActiveVectorStore(mockVectorStore as never);

      mockVectorStore.search.mockResolvedValue([]);

      const result = await ragLookup('test query');

      expect(result).toBeNull();
    });
  });
});


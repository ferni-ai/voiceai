/**
 * Tests for Firestore Vector Store
 *
 * Validates vector storage, search operations, and fallback behavior.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock embeddings
vi.mock('../embeddings.js', () => ({
  embed: vi.fn(async () => Array.from({ length: 768 }, () => Math.random())),
  embedBatch: vi.fn(async (texts: string[]) =>
    texts.map(() => Array.from({ length: 768 }, () => Math.random()))
  ),
  cosineSimilarity: vi.fn((a: number[], b: number[]) => {
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

describe('FirestoreVectorStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reset singleton
    const { resetFirestoreVectorStore } = await import('../firestore-vector-store.js');
    resetFirestoreVectorStore();
  });

  describe('Initialization', () => {
    it('should initialize with default config', async () => {
      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore();

      expect(store).toBeDefined();
      expect(store.isInitialized).toBe(false);
    });

    it('should accept custom config', async () => {
      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore({
        projectId: 'test-project',
        collectionName: 'custom_vectors',
        embeddingDimension: 512,
      });

      expect(store).toBeDefined();
    });

    it('should use fallback mode without credentials', async () => {
      // Clear any credential env vars
      const originalEnv = process.env;
      process.env = {
        ...process.env,
        GOOGLE_APPLICATION_CREDENTIALS: '',
        GCLOUD_SERVICE_KEY: '',
        K_SERVICE: '',
      };

      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore();

      await store.initialize();

      // Should fall back to in-memory mode
      expect(store.isInitialized).toBe(true);

      process.env = originalEnv;
    });
  });

  describe('Singleton management', () => {
    it('should return same instance via getFirestoreVectorStore', async () => {
      const { getFirestoreVectorStore, resetFirestoreVectorStore } =
        await import('../firestore-vector-store.js');

      resetFirestoreVectorStore();
      const store1 = getFirestoreVectorStore();
      const store2 = getFirestoreVectorStore();

      expect(store1).toBe(store2);
    });

    it('should create new instance after reset', async () => {
      const { getFirestoreVectorStore, resetFirestoreVectorStore } =
        await import('../firestore-vector-store.js');

      const store1 = getFirestoreVectorStore();
      resetFirestoreVectorStore();
      const store2 = getFirestoreVectorStore();

      expect(store1).not.toBe(store2);
    });
  });

  describe('Fallback mode operations', () => {
    it('should add document in fallback mode', async () => {
      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore();
      await store.initialize();

      await store.addDocument({
        id: 'test_doc_1',
        text: 'This is test content about investing.',
        metadata: {
          source: 'test',
          category: 'knowledge',
        },
      });

      const doc = await store.getDocument('test_doc_1');
      expect(doc).toBeDefined();
      expect(doc?.text).toBe('This is test content about investing.');
    });

    it('should search documents in fallback mode', async () => {
      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore();
      await store.initialize();

      // Add some test documents
      await store.addDocument({
        id: 'doc1',
        text: 'Investing in index funds is a smart strategy.',
        embedding: Array.from({ length: 768 }, (_, i) => i / 768),
        metadata: { source: 'persona', category: 'knowledge' },
      });

      await store.addDocument({
        id: 'doc2',
        text: 'Career planning involves setting goals.',
        embedding: Array.from({ length: 768 }, (_, i) => (768 - i) / 768),
        metadata: { source: 'persona', category: 'coaching' },
      });

      const results = await store.search('index funds investing');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('document');
    });

    it('should filter by source in fallback mode', async () => {
      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore();
      await store.initialize();

      await store.addDocument({
        id: 'persona_doc',
        text: 'Persona content',
        embedding: Array.from({ length: 768 }, () => 0.5),
        metadata: { source: 'persona', category: 'knowledge' },
      });

      await store.addDocument({
        id: 'conv_doc',
        text: 'Conversation content',
        embedding: Array.from({ length: 768 }, () => 0.5),
        metadata: { source: 'conversation', category: 'summary' },
      });

      const results = await store.search('content', {
        filter: { source: 'persona' },
      });

      // Should only return persona source
      expect(results.every((r) => r.document.metadata.source === 'persona')).toBe(true);
    });

    it('should remove document in fallback mode', async () => {
      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore();
      await store.initialize();

      await store.addDocument({
        id: 'to_delete',
        text: 'This will be deleted',
        metadata: { source: 'test' },
      });

      const beforeDelete = await store.getDocument('to_delete');
      expect(beforeDelete).toBeDefined();

      const success = await store.removeDocument('to_delete');
      expect(success).toBe(true);

      const afterDelete = await store.getDocument('to_delete');
      expect(afterDelete).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    it('should return stats in fallback mode', async () => {
      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore();
      await store.initialize();

      await store.addDocument({
        id: 'stat_test',
        text: 'Test content',
        metadata: { source: 'persona', category: 'knowledge' },
      });

      const stats = await store.getStats();

      expect(stats.documentCount).toBeGreaterThan(0);
      expect(stats.bySource).toBeDefined();
      expect(stats.bySource['persona']).toBe(1);
      expect(stats.usingFallback).toBe(true);
    });
  });

  describe('Clear operation', () => {
    it('should clear all documents in fallback mode', async () => {
      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore();
      await store.initialize();

      await store.addDocument({
        id: 'clear_test_1',
        text: 'Content 1',
        metadata: { source: 'test' },
      });
      await store.addDocument({
        id: 'clear_test_2',
        text: 'Content 2',
        metadata: { source: 'test' },
      });

      const statsBefore = await store.getStats();
      expect(statsBefore.documentCount).toBe(2);

      await store.clear();

      const statsAfter = await store.getStats();
      expect(statsAfter.documentCount).toBe(0);
    });
  });

  describe('Batch operations', () => {
    it('should add multiple documents', async () => {
      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore();
      await store.initialize();

      await store.addDocuments([
        { id: 'batch_1', text: 'Content 1', metadata: { source: 'test' } },
        { id: 'batch_2', text: 'Content 2', metadata: { source: 'test' } },
        { id: 'batch_3', text: 'Content 3', metadata: { source: 'test' } },
      ]);

      const stats = await store.getStats();
      expect(stats.documentCount).toBe(3);
    });
  });

  describe('List operation', () => {
    it('should list all documents', async () => {
      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore();
      await store.initialize();

      await store.addDocuments([
        { id: 'list_1', text: 'Content 1', metadata: { source: 'persona' } },
        { id: 'list_2', text: 'Content 2', metadata: { source: 'conversation' } },
      ]);

      const allDocs = await store.list();
      expect(allDocs.length).toBe(2);
    });

    it('should filter list by source', async () => {
      const { FirestoreVectorStore } = await import('../firestore-vector-store.js');
      const store = new FirestoreVectorStore();
      await store.initialize();

      await store.addDocuments([
        { id: 'filter_1', text: 'Content 1', metadata: { source: 'persona' } },
        { id: 'filter_2', text: 'Content 2', metadata: { source: 'conversation' } },
      ]);

      const filtered = await store.list({ source: 'persona' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].metadata.source).toBe('persona');
    });
  });
});

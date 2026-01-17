/**
 * Memory Executor Tests
 *
 * Tests for memory tools: rememberAboutUser, recallFromMemory, updateMemory,
 * forgetMemory, getRelationshipSummary, reinforceMemory.
 * Covers alias resolution and Firestore persistence.
 *
 * @module agents/shared/tool-executors/__tests__/memory-executor.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryExecutor } from '../memory-executor.js';
import type { ToolExecutionContext } from '../types.js';

// Mock Firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          add: vi.fn().mockResolvedValue({ id: 'mock-memory-id' }),
          doc: vi.fn(() => ({
            update: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn().mockResolvedValue(undefined),
          })),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
            })),
          })),
          get: vi.fn().mockResolvedValue({
            empty: true,
            docs: [],
            size: 0,
          }),
        })),
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ sessionCount: 5 }),
        }),
      })),
    })),
    batch: vi.fn(() => ({
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
  })),
}));

// Mock embeddings
vi.mock('../../../../memory/embeddings.js', () => ({
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  cosineSimilarity: vi.fn().mockReturnValue(0.8),
}));

// Mock RAG
vi.mock('../../../../memory/semantic-rag.js', () => ({
  getRAGContext: vi.fn().mockResolvedValue({
    results: [],
    totalTokens: 0,
  }),
}));

// Mock vector store
vi.mock('../../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: vi.fn(() => ({
    addDocument: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock session optimizations
vi.mock('../../performance/session-optimizations.js', () => ({
  getCachedMemoryResult: vi.fn().mockReturnValue(null),
  cacheMemoryResult: vi.fn(),
}));

describe('MemoryExecutor', () => {
  const createContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'ferni',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executor metadata', () => {
    it('should have correct domain name', () => {
      expect(memoryExecutor.domain).toBe('memory');
    });

    it('should handle all expected tools', () => {
      const expectedTools = [
        'rememberaboutuser',
        'recallfrommemory',
        'updatememory',
        'forgetmemory',
        'getrelationshipsummary',
        'reinforcememory',
        'savememory',
        'searchmemories',
        'remembername',
      ];

      for (const tool of expectedTools) {
        expect(memoryExecutor.handles).toContain(tool);
      }
    });
  });

  describe('tool alias resolution', () => {
    it('should resolve saveMemory to rememberAboutUser', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute('saveMemory', { fact: 'User loves hiking' }, ctx);

      // Should execute without error (returns empty string on success)
      expect(result).toBe('');
    });

    it('should resolve searchMemories to recallFromMemory', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute('searchMemories', { topic: 'hobbies' }, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve rememberName to rememberAboutUser', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute(
        'rememberName',
        { fact: "User's name is John" },
        ctx
      );

      expect(result).toBe('');
    });

    it('should handle case-insensitive tool names', async () => {
      const ctx = createContext();

      const result1 = await memoryExecutor.execute('SAVEMEMORY', { fact: 'Test fact' }, ctx);
      const result2 = await memoryExecutor.execute('SaveMemory', { fact: 'Test fact' }, ctx);
      const result3 = await memoryExecutor.execute('savememory', { fact: 'Test fact' }, ctx);

      expect(result1).toBe('');
      expect(result2).toBe('');
      expect(result3).toBe('');
    });
  });

  describe('rememberAboutUser', () => {
    it('should store a fact', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute(
        'rememberAboutUser',
        { fact: 'User has a dog named Max' },
        ctx
      );

      // Returns empty string on success (no speech output needed)
      expect(result).toBe('');
    });

    it('should prompt for fact if missing', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute('rememberAboutUser', {}, ctx);

      expect(result).toContain('specify');
    });

    it('should handle category and importance', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute(
        'rememberAboutUser',
        {
          fact: 'User is allergic to peanuts',
          category: 'health',
          importance: 'high',
        },
        ctx
      );

      expect(result).toBe('');
    });

    it('should work without userId (returns empty string)', async () => {
      const ctx = createContext({ userId: undefined });
      const result = await memoryExecutor.execute('rememberAboutUser', { fact: 'Test fact' }, ctx);

      expect(result).toBe('');
    });
  });

  describe('recallFromMemory', () => {
    it('should recall memories for a topic', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute('recallFromMemory', { topic: 'pets' }, ctx);

      expect(result).toBeDefined();
    });

    it('should prompt for topic if missing', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute('recallFromMemory', {}, ctx);

      expect(result).toContain('recall');
    });

    it('should indicate when no memories found', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute(
        'recallFromMemory',
        { topic: 'nonexistent-topic-12345' },
        ctx
      );

      expect(result).toContain("don't have");
    });
  });

  describe('updateMemory', () => {
    it('should update an existing memory', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute(
        'updateMemory',
        {
          oldFact: 'User has a dog',
          newFact: 'User has a dog named Max',
        },
        ctx
      );

      expect(result).toBe('');
    });

    it('should prompt if old or new fact missing', async () => {
      const ctx = createContext();

      const result1 = await memoryExecutor.execute('updateMemory', { oldFact: 'Something' }, ctx);
      const result2 = await memoryExecutor.execute(
        'updateMemory',
        { newFact: 'Something else' },
        ctx
      );

      expect(result1).toContain('specify');
      expect(result2).toContain('specify');
    });
  });

  describe('forgetMemory', () => {
    it('should forget memories about a topic', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute('forgetMemory', { topic: 'old job' }, ctx);

      expect(result).toBeDefined();
    });

    it('should use whatToForget arg as fallback', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute('forgetMemory', { whatToForget: 'my ex' }, ctx);

      expect(result).toBeDefined();
    });

    it('should prompt if nothing specified', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute('forgetMemory', {}, ctx);

      expect(result).toContain('forget');
    });
  });

  describe('getRelationshipSummary', () => {
    it('should return relationship summary', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute('getRelationshipSummary', {}, ctx);

      expect(result).toMatchObject({
        sessionsToDate: expect.any(Number),
        memoriesStored: expect.any(Number),
        relationshipStage: expect.any(String),
      });
    });

    it('should work without userId', async () => {
      const ctx = createContext({ userId: undefined });
      const result = await memoryExecutor.execute('getRelationshipSummary', {}, ctx);

      expect(result).toMatchObject({
        sessionsToDate: 0,
        memoriesStored: 0,
        relationshipStage: 'Just getting started',
      });
    });
  });

  describe('reinforceMemory', () => {
    it('should reinforce an existing memory', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute(
        'reinforceMemory',
        { memory: 'User loves hiking' },
        ctx
      );

      expect(result).toBe('');
    });

    it('should return empty if memory not specified', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute('reinforceMemory', {}, ctx);

      expect(result).toBe('');
    });
  });

  describe('unhandled tools', () => {
    it('should return null for unhandled tools', async () => {
      const ctx = createContext();
      const result = await memoryExecutor.execute('unknownTool', {}, ctx);

      expect(result).toBeNull();
    });

    it('should return null for tools from other domains', async () => {
      const ctx = createContext();

      const otherDomainTools = ['playMusic', 'addTask', 'handoffToMaya'];

      for (const tool of otherDomainTools) {
        const result = await memoryExecutor.execute(tool, {}, ctx);
        expect(result).toBeNull();
      }
    });
  });
});

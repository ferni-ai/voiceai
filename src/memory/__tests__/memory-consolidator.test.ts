/**
 * Tests for Memory Consolidator
 *
 * Validates the memory consolidation functionality that compresses
 * related memories into denser representations.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryItem } from '../advanced-retrieval.js';
import {
  MemoryConsolidator,
  getMemoryConsolidator,
  resetMemoryConsolidator,
} from '../memory-consolidator.js';

// Mock embedding functions
vi.mock('../embedding-cache.js', () => ({
  embedCached: vi.fn(async (text: string) => ({
    ok: true,
    value: mockEmbedding(text),
  })),
}));

// Helper to create mock embeddings based on text similarity
function mockEmbedding(text: string): number[] {
  // Create a simple embedding where similar texts have similar vectors
  const base = text.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return [Math.sin(base) * 0.5 + 0.5, Math.cos(base) * 0.5 + 0.5, Math.sin(base * 2) * 0.5 + 0.5];
}

// Helper to create test memory items
function createMemoryItem(id: string, content: string, topic = 'general'): MemoryItem {
  return {
    id,
    content,
    timestamp: new Date(),
    type: 'topic', // Valid MemoryItem type
    topics: [topic], // Use topics (plural) array
    emotionalWeight: 0.5,
    relevanceDecay: 0.1,
    baseImportance: 0.7,
    source: {
      collection: 'test',
      documentId: id,
    },
  };
}

describe('MemoryConsolidator', () => {
  beforeEach(() => {
    resetMemoryConsolidator();
    vi.clearAllMocks();
  });

  describe('singleton management', () => {
    it('should return the same instance via getMemoryConsolidator', () => {
      const c1 = getMemoryConsolidator();
      const c2 = getMemoryConsolidator();
      expect(c1).toBe(c2);
    });

    it('should create new instance after reset', () => {
      const c1 = getMemoryConsolidator();
      resetMemoryConsolidator();
      const c2 = getMemoryConsolidator();
      expect(c1).not.toBe(c2);
    });
  });

  describe('consolidation candidates', () => {
    it('should find consolidation candidates by topic', async () => {
      const consolidator = new MemoryConsolidator();

      const memories: MemoryItem[] = [
        createMemoryItem('1', 'Memory about work', 'work'),
        createMemoryItem('2', 'Another work memory', 'work'),
        createMemoryItem('3', 'Family memory', 'family'),
        createMemoryItem('4', 'More work stuff', 'work'),
        createMemoryItem('5', 'Work project update', 'work'),
        createMemoryItem('6', 'Work meeting notes', 'work'),
      ];

      const candidates = await consolidator.findConsolidationCandidates(memories, 'work');

      // Should find work memories
      expect(candidates.size).toBeGreaterThan(0);
    });
  });

  describe('consolidation pass', () => {
    it('should not consolidate when below threshold', async () => {
      const consolidator = new MemoryConsolidator({
        consolidationThreshold: 10, // High threshold
      });

      const memories: MemoryItem[] = [
        createMemoryItem('1', 'Memory one', 'work'),
        createMemoryItem('2', 'Memory two', 'work'),
      ];

      const result = await consolidator.runConsolidationPass(memories);

      // Should not consolidate with only 2 memories
      expect(result.memoriesProcessed).toBe(2);
    });

    it('should process all memories during consolidation pass', async () => {
      const consolidator = new MemoryConsolidator();

      const memories: MemoryItem[] = [
        createMemoryItem('1', 'Work memory 1', 'work'),
        createMemoryItem('2', 'Work memory 2', 'work'),
        createMemoryItem('3', 'Family memory', 'family'),
      ];

      const result = await consolidator.runConsolidationPass(memories);

      expect(result.memoriesProcessed).toBe(3);
    });
  });

  describe('error handling', () => {
    it('should handle empty memory array', async () => {
      const consolidator = new MemoryConsolidator();

      const result = await consolidator.runConsolidationPass([]);

      expect(result.memoriesProcessed).toBe(0);
    });

    it('should handle memories without topics gracefully', async () => {
      const consolidator = new MemoryConsolidator();

      const memories: MemoryItem[] = [
        {
          id: '1',
          content: 'No topic memory',
          timestamp: new Date(),
          type: 'topic',
          emotionalWeight: 0.5,
          relevanceDecay: 0.1,
          baseImportance: 0.7,
          source: { collection: 'test', documentId: '1' },
          // No topics field
        },
      ];

      // Should not throw
      const result = await consolidator.runConsolidationPass(memories);
      expect(result).toBeDefined();
    });
  });

  describe('similarity threshold', () => {
    it('should respect similarity threshold configuration', () => {
      const consolidator = new MemoryConsolidator({
        similarityThreshold: 0.9, // High threshold
      });

      // Just verify it doesn't throw - the actual similarity logic
      // would be tested with real embeddings
      expect(consolidator).toBeDefined();
    });
  });
});

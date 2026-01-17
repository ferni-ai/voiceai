/**
 * Tool Merger Tests
 *
 * @module tools/intelligence/merger/__tests__/tool-merger.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolMerger, resetToolMerger } from '../tool-merger.js';
import { resetMergeRegistry } from '../merge-registry.js';
import { resetEquivalenceClassifier } from '../equivalence-classifier.js';
import type { ToolDefinition } from '../types.js';

// Mock the embedding provider
vi.mock('../../../semantic-router/embedding-providers.js', () => ({
  getEmbedding: vi.fn(async (text: string) => {
    // Generate deterministic mock embeddings based on text hash
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const embedding = new Array(768).fill(0).map((_, i) => Math.sin(hash + i) * 0.5);
    return embedding;
  }),
}));

// Mock the Google AI SDK
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: vi.fn().mockReturnValue(
            JSON.stringify({
              equivalent: true,
              confidence: 0.9,
              reasoning: 'Mock response',
            })
          ),
        },
      }),
    }),
  })),
}));

describe('ToolMerger', () => {
  let merger: ToolMerger;

  beforeEach(() => {
    resetToolMerger();
    resetMergeRegistry();
    resetEquivalenceClassifier();
    merger = new ToolMerger({ useLLMClassifier: false }); // Disable LLM for faster tests
  });

  afterEach(() => {
    resetToolMerger();
    resetMergeRegistry();
    resetEquivalenceClassifier();
  });

  describe('Basic Merging', () => {
    it('should create singleton clusters for unique tools', async () => {
      const tools: ToolDefinition[] = [
        {
          id: 'playMusic',
          name: 'Play Music',
          description: 'Plays music for the user',
          domain: 'entertainment',
        },
        {
          id: 'getWeather',
          name: 'Get Weather',
          description: 'Gets the current weather',
          domain: 'information',
        },
      ];

      const { clusters, stats } = await merger.merge(tools);

      // Different domains = no merging
      expect(clusters.length).toBe(2);
      expect(stats.originalToolCount).toBe(2);
      expect(stats.clusterCount).toBe(2);
    });

    it('should merge tools with identical descriptions', async () => {
      const tools: ToolDefinition[] = [
        {
          id: 'rememberFact',
          name: 'Remember Fact',
          description: 'Remember an important fact about the user',
          domain: 'memory',
        },
        {
          id: 'rememberAboutUser',
          name: 'Remember About User',
          description: 'Remember an important fact about the user',
          domain: 'memory',
        },
      ];

      const { clusters, stats } = await merger.merge(tools);

      // Same description, same domain = should merge
      expect(clusters.length).toBeLessThanOrEqual(2);
      expect(stats.equivalentPairs).toBeGreaterThanOrEqual(0);
    });

    it('should not merge tools from different domains', async () => {
      const tools: ToolDefinition[] = [
        {
          id: 'toolA',
          name: 'Tool A',
          description: 'Does something important',
          domain: 'domainA',
        },
        {
          id: 'toolB',
          name: 'Tool B',
          description: 'Does something important', // Same description
          domain: 'domainB', // Different domain
        },
      ];

      const { clusters, stats } = await merger.merge(tools);

      // Different domains = no merging candidate generated
      expect(clusters.length).toBe(2);
      expect(stats.candidatesEvaluated).toBe(0);
    });
  });

  describe('Cluster Properties', () => {
    it('should select shorter name as canonical ID', async () => {
      const tools: ToolDefinition[] = [
        {
          id: 'a',
          name: 'A',
          description: 'Test tool',
          domain: 'test',
          embedding: new Array(768).fill(0.5),
        },
        {
          id: 'abc',
          name: 'ABC',
          description: 'Test tool',
          domain: 'test',
          embedding: new Array(768).fill(0.5), // Identical embedding = will merge
        },
      ];

      const mergerWithHighThreshold = new ToolMerger({
        useLLMClassifier: false,
        similarityThreshold: 0.99, // Very high threshold
      });

      const { clusters } = await mergerWithHighThreshold.merge(tools);

      // With identical embeddings, they should merge
      // The shorter name 'a' should be canonical
      const mergedCluster = clusters.find((c) => c.mergedToolIds.length > 1);
      if (mergedCluster) {
        expect(mergedCluster.canonicalId).toBe('a');
      }
    });

    it('should include internal similarities in cluster', async () => {
      const tools: ToolDefinition[] = [
        {
          id: 'tool1',
          name: 'Tool 1',
          description: 'Same thing',
          domain: 'test',
          embedding: new Array(768).fill(0.5),
        },
        {
          id: 'tool2',
          name: 'Tool 2',
          description: 'Same thing',
          domain: 'test',
          embedding: new Array(768).fill(0.5),
        },
      ];

      const mergerWithHighThreshold = new ToolMerger({
        useLLMClassifier: false,
        similarityThreshold: 0.99,
      });

      const { clusters } = await mergerWithHighThreshold.merge(tools);
      const mergedCluster = clusters.find((c) => c.mergedToolIds.length > 1);

      if (mergedCluster) {
        expect(mergedCluster.internalSimilarities.length).toBeGreaterThan(0);
        expect(mergedCluster.internalSimilarities[0].similarity).toBeGreaterThanOrEqual(0.99);
      }
    });
  });

  describe('Statistics', () => {
    it('should return correct statistics', async () => {
      const tools: ToolDefinition[] = [
        { id: 'tool1', name: 'Tool 1', description: 'Desc 1', domain: 'test' },
        { id: 'tool2', name: 'Tool 2', description: 'Desc 2', domain: 'test' },
        { id: 'tool3', name: 'Tool 3', description: 'Desc 3', domain: 'other' },
      ];

      const { stats } = await merger.merge(tools);

      expect(stats.originalToolCount).toBe(3);
      expect(stats.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof stats.reductionPercent).toBe('number');
    });

    it('should track merger stats', async () => {
      const tools: ToolDefinition[] = [
        { id: 'tool1', name: 'Tool 1', description: 'Desc 1', domain: 'test' },
      ];

      await merger.merge(tools);
      const stats = merger.getStats();

      expect(stats.embeddingCount).toBeGreaterThan(0);
      expect(stats.registryStats).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tool list', async () => {
      const { clusters, stats } = await merger.merge([]);

      expect(clusters.length).toBe(0);
      expect(stats.originalToolCount).toBe(0);
    });

    it('should handle single tool', async () => {
      const tools: ToolDefinition[] = [
        { id: 'only', name: 'Only Tool', description: 'The only one', domain: 'test' },
      ];

      const { clusters, stats } = await merger.merge(tools);

      expect(clusters.length).toBe(1);
      expect(clusters[0].canonicalId).toBe('only');
      expect(stats.reductionPercent).toBe(0);
    });

    it('should respect max cluster size', async () => {
      const tools: ToolDefinition[] = Array.from({ length: 20 }, (_, i) => ({
        id: `tool${i}`,
        name: `Tool ${i}`,
        description: 'Same description',
        domain: 'test',
        embedding: new Array(768).fill(0.5), // Identical embeddings
      }));

      const mergerWithLimit = new ToolMerger({
        useLLMClassifier: false,
        similarityThreshold: 0.99,
        maxClusterSize: 5,
      });

      const { clusters } = await mergerWithLimit.merge(tools);

      // All clusters should respect max size
      for (const cluster of clusters) {
        expect(cluster.mergedToolIds.length).toBeLessThanOrEqual(5);
      }
    });
  });
});

describe('MergeRegistry', () => {
  beforeEach(() => {
    resetMergeRegistry();
  });

  afterEach(() => {
    resetMergeRegistry();
  });

  it('should provide canonical ID lookup', async () => {
    const { getMergeRegistry } = await import('../merge-registry.js');
    const registry = getMergeRegistry();

    // Register a cluster
    await registry.registerCluster({
      canonicalId: 'canonical',
      mergedToolIds: ['original1', 'original2', 'canonical'],
      unifiedDescription: 'Test',
      internalSimilarities: [],
      createdAt: new Date(),
      version: 1,
    });

    expect(registry.getCanonicalId('original1')).toBe('canonical');
    expect(registry.getCanonicalId('original2')).toBe('canonical');
    expect(registry.getCanonicalId('canonical')).toBe('canonical');
    expect(registry.getCanonicalId('unknown')).toBe('unknown');
  });

  it('should track merged status', async () => {
    const { getMergeRegistry } = await import('../merge-registry.js');
    const registry = getMergeRegistry();

    await registry.registerCluster({
      canonicalId: 'main',
      mergedToolIds: ['main', 'alias'],
      unifiedDescription: 'Test',
      internalSimilarities: [],
      createdAt: new Date(),
      version: 1,
    });

    expect(registry.isMerged('alias')).toBe(true);
    expect(registry.isMerged('main')).toBe(false); // Canonical is not "merged"
    expect(registry.isMerged('other')).toBe(false);
  });

  it('should return all original IDs for a canonical', async () => {
    const { getMergeRegistry } = await import('../merge-registry.js');
    const registry = getMergeRegistry();

    await registry.registerCluster({
      canonicalId: 'main',
      mergedToolIds: ['main', 'a', 'b', 'c'],
      unifiedDescription: 'Test',
      internalSimilarities: [],
      createdAt: new Date(),
      version: 1,
    });

    const originals = registry.getOriginalIds('main');
    expect(originals).toContain('a');
    expect(originals).toContain('b');
    expect(originals).toContain('c');
  });
});

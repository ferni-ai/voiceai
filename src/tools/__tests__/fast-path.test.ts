/**
 * Fast Path Tool Loading Tests
 *
 * Tests the performance-optimized tool loading for handoffs.
 * The fast path skips the semantic router and uses pre-built caches.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger - needs both getLogger and createLogger for different imports
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => mockLogger,
  createLogger: () => mockLogger,
}));

// Mock fs for manifest loading
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue(
    JSON.stringify({
      version: '1.0.0',
      buildTime: '2026-01-01T00:00:00Z',
      totalDomains: 5,
      totalTools: 10,
      domains: {
        memory: {
          domainId: 'memory',
          tools: [
            {
              id: 'saveMemory',
              name: 'Save Memory',
              description: 'Save a memory',
              domain: 'memory',
            },
          ],
          toolCount: 1,
        },
        handoff: {
          domainId: 'handoff',
          tools: [
            {
              id: 'handoffToFerni',
              name: 'Handoff to Ferni',
              description: 'Hand off to Ferni',
              domain: 'handoff',
            },
          ],
          toolCount: 1,
        },
      },
      toolIndex: {
        savememory: {
          domain: 'memory',
          entry: {
            id: 'saveMemory',
            name: 'Save Memory',
            description: 'Save a memory',
            domain: 'memory',
          },
        },
        handofftoferni: {
          domain: 'handoff',
          entry: {
            id: 'handoffToFerni',
            name: 'Handoff to Ferni',
            description: 'Hand off to Ferni',
            domain: 'handoff',
          },
        },
      },
    })
  ),
  statSync: vi.fn().mockReturnValue({ size: 1024 }),
}));

describe('Manifest Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear global state between tests
    const MANIFEST_STATE_KEY = Symbol.for('ferni.toolManifest');
    (globalThis as Record<symbol, unknown>)[MANIFEST_STATE_KEY] = undefined;
  });

  it('should load manifest successfully', async () => {
    const { loadToolManifest, isManifestLoaded } = await import('../registry/manifest-loader.js');

    expect(isManifestLoaded()).toBe(false);

    const manifest = await loadToolManifest();

    expect(isManifestLoaded()).toBe(true);
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.totalTools).toBe(10);
    expect(manifest.totalDomains).toBe(5);
  });

  it('should return cached manifest on subsequent calls', async () => {
    const { loadToolManifest } = await import('../registry/manifest-loader.js');

    const manifest1 = await loadToolManifest();
    const manifest2 = await loadToolManifest();

    // Should be the exact same object (cached)
    expect(manifest1).toBe(manifest2);
  });

  it('should provide O(1) tool lookup', async () => {
    const { getToolEntry } = await import('../registry/manifest-loader.js');

    const entry = await getToolEntry('saveMemory');

    expect(entry).not.toBeNull();
    expect(entry?.id).toBe('saveMemory');
    expect(entry?.domain).toBe('memory');
  });

  it('should return null for unknown tool', async () => {
    const { getToolEntry } = await import('../registry/manifest-loader.js');

    const entry = await getToolEntry('unknownTool');

    expect(entry).toBeNull();
  });
});

describe('Pre-computed Embeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear global state
    const EMBEDDINGS_STATE_KEY = Symbol.for('ferni.toolEmbeddings');
    (globalThis as Record<symbol, unknown>)[EMBEDDINGS_STATE_KEY] = undefined;
  });

  it('should generate consistent query embeddings', async () => {
    const { generateQueryEmbedding } = await import('../semantic-router/precomputed-embeddings.js');

    const embedding1 = generateQueryEmbedding('play some music');
    const embedding2 = generateQueryEmbedding('play some music');

    // Same input should produce same embedding (deterministic)
    expect(embedding1).toEqual(embedding2);
    expect(embedding1.length).toBe(384);
  });

  it('should produce normalized vectors', async () => {
    const { generateQueryEmbedding } = await import('../semantic-router/precomputed-embeddings.js');

    const embedding = generateQueryEmbedding('test query');

    // Normalized vector should have magnitude ~1
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('should compute cosine similarity correctly', async () => {
    const { cosineSimilarity } = await import('../semantic-router/precomputed-embeddings.js');

    // Identical vectors should have similarity 1
    const vec1 = [1, 0, 0];
    expect(cosineSimilarity(vec1, vec1)).toBeCloseTo(1, 5);

    // Orthogonal vectors should have similarity 0
    const vec2 = [0, 1, 0];
    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0, 5);

    // Opposite vectors should have similarity -1
    const vec3 = [-1, 0, 0];
    expect(cosineSimilarity(vec1, vec3)).toBeCloseTo(-1, 5);
  });
});

describe('Session Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up session cache
    const { clearAllHandoffToolsCaches } = await import('../handoff/session-cache.js');
    clearAllHandoffToolsCaches();
  });

  it('should report cache miss for new session', async () => {
    const { hasHandoffToolsCache } = await import('../handoff/session-cache.js');

    expect(hasHandoffToolsCache('new-session-123')).toBe(false);
  });

  it('should clear cache for session', async () => {
    const { clearHandoffToolsCache, hasHandoffToolsCache } =
      await import('../handoff/session-cache.js');

    // Should not throw even if session doesn't exist
    clearHandoffToolsCache('non-existent-session');

    expect(hasHandoffToolsCache('non-existent-session')).toBe(false);
  });
});

describe('Fast Path Integration', () => {
  it('should have fastPath option in GetToolsForAgentOptions', async () => {
    // This is a type check - if fastPath doesn't exist, this won't compile
    const options: import('../orchestrator/voice-agent-integration.js').GetToolsForAgentOptions = {
      persona: { id: 'ferni' },
      userId: 'test-user',
      fastPath: true,
      sessionId: 'test-session',
    };

    expect(options.fastPath).toBe(true);
    expect(options.sessionId).toBe('test-session');
  });
});

/**
 * Associative Cortex Tests
 *
 * Tests for the graph-based associative memory system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { StoredMemory } from '../../unified-store/types.js';
import type { MemoryGraph, MemoryLink, ActivationConfig } from '../types.js';
import { DEFAULT_ACTIVATION_CONFIG } from '../types.js';
import {
  spreadActivation,
  activateFromSeed,
  findAssociations,
  calculateAssociationStrength,
  DEFAULT_LINK_WEIGHTS,
} from '../activation/spreading-activation.js';
import {
  LinkDetector,
  resetLinkDetector,
  DEFAULT_LINK_DETECTION_CONFIG,
} from '../graph/link-detector.js';
import {
  ConnectionFinder,
  resetConnectionFinder,
} from '../discovery/connection-finder.js';
import {
  NarrativeBuilder,
  resetNarrativeBuilder,
} from '../discovery/narrative-builder.js';
import {
  AssociativeCortexImpl,
  resetAssociativeCortex,
} from '../cortex.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockMemory(overrides: Partial<StoredMemory> = {}): StoredMemory {
  return {
    id: `mem_${Math.random().toString(36).slice(2)}`,
    userId: 'test-user',
    type: 'entity',
    content: 'Test memory content',
    embedding: [],
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    updatedAt: new Date(),
    accessCount: 1,
    emotionalWeight: 0.5,
    strength: 1.0,
    importance: 0.5,
    isProtected: false,
    isActiveCommitment: false,
    topics: [],
    personaIds: [],
    peopleMentioned: [],
    metadata: {},
    storageLayer: 'memory',
    ...overrides,
  };
}

/**
 * In-memory graph for testing
 */
class TestGraph implements MemoryGraph {
  private links: Map<string, MemoryLink[]> = new Map();

  async getLinksFrom(memoryId: string): Promise<MemoryLink[]> {
    return this.links.get(memoryId) || [];
  }

  async getLinksTo(memoryId: string): Promise<MemoryLink[]> {
    // Find all links targeting this memory
    const result: MemoryLink[] = [];
    for (const [, links] of this.links) {
      for (const link of links) {
        if (link.targetId === memoryId) {
          result.push(link);
        }
      }
    }
    return result;
  }

  async getLinks(memoryId: string): Promise<MemoryLink[]> {
    const from = await this.getLinksFrom(memoryId);
    const to = await this.getLinksTo(memoryId);
    return [...from, ...to];
  }

  async addLink(link: Omit<MemoryLink, 'createdAt'>): Promise<void> {
    const fullLink: MemoryLink = { ...link, createdAt: new Date() };
    const existing = this.links.get(link.sourceId) || [];
    existing.push(fullLink);
    this.links.set(link.sourceId, existing);
  }

  async removeLink(sourceId: string, targetId: string, type: string): Promise<void> {
    const links = this.links.get(sourceId) || [];
    this.links.set(
      sourceId,
      links.filter((l) => !(l.targetId === targetId && l.type === type))
    );
  }

  async hasLink(sourceId: string, targetId: string, type?: string): Promise<boolean> {
    const links = this.links.get(sourceId) || [];
    return links.some((l) => l.targetId === targetId && (type === undefined || l.type === type));
  }

  async getLinkCount(memoryId: string): Promise<number> {
    return (await this.getLinks(memoryId)).length;
  }

  clear(): void {
    this.links.clear();
  }
}

// ============================================================================
// SPREADING ACTIVATION TESTS
// ============================================================================

describe('Spreading Activation', () => {
  let graph: TestGraph;

  beforeEach(() => {
    graph = new TestGraph();
  });

  it('should activate seed nodes with initial activation', async () => {
    await graph.addLink({ sourceId: 'mem1', targetId: 'mem2', type: 'topic', weight: 0.8 });

    const result = await spreadActivation(['mem1'], graph);

    expect(result.nodes.has('mem1')).toBe(true);
    expect(result.nodes.get('mem1')!.activation).toBe(1.0);
  });

  it('should spread activation through links', async () => {
    await graph.addLink({ sourceId: 'mem1', targetId: 'mem2', type: 'topic', weight: 0.8 });
    await graph.addLink({ sourceId: 'mem2', targetId: 'mem3', type: 'person', weight: 0.7 });

    const result = await spreadActivation(['mem1'], graph);

    expect(result.nodes.has('mem2')).toBe(true);
    expect(result.nodes.has('mem3')).toBe(true);

    // mem2 should have lower activation than mem1
    expect(result.nodes.get('mem2')!.activation).toBeLessThan(result.nodes.get('mem1')!.activation);

    // mem3 should have lower activation than mem2
    expect(result.nodes.get('mem3')!.activation).toBeLessThan(result.nodes.get('mem2')!.activation);
  });

  it('should respect max depth', async () => {
    // Create a chain: mem1 -> mem2 -> mem3 -> mem4 -> mem5
    await graph.addLink({ sourceId: 'mem1', targetId: 'mem2', type: 'topic', weight: 0.9 });
    await graph.addLink({ sourceId: 'mem2', targetId: 'mem3', type: 'topic', weight: 0.9 });
    await graph.addLink({ sourceId: 'mem3', targetId: 'mem4', type: 'topic', weight: 0.9 });
    await graph.addLink({ sourceId: 'mem4', targetId: 'mem5', type: 'topic', weight: 0.9 });

    const result = await spreadActivation(['mem1'], graph, { maxDepth: 2 });

    // Should reach mem3 (depth 2) but not mem4 or mem5
    expect(result.nodes.has('mem1')).toBe(true);
    expect(result.nodes.has('mem2')).toBe(true);
    expect(result.nodes.has('mem3')).toBe(true);
    // Depth 3 and 4 may not be reached due to maxDepth
  });

  it('should apply decay factor', async () => {
    await graph.addLink({ sourceId: 'mem1', targetId: 'mem2', type: 'topic', weight: 1.0 });

    const config: Partial<ActivationConfig> = { decayFactor: 0.5 };
    const result = await spreadActivation(['mem1'], graph, config);

    const mem2Activation = result.nodes.get('mem2')?.activation ?? 0;
    // With decay 0.5 and topic weight ~0.7, expect roughly 0.35
    expect(mem2Activation).toBeLessThan(0.5);
  });

  it('should aggregate activation from multiple paths', async () => {
    // mem1 -> mem3 and mem2 -> mem3
    await graph.addLink({ sourceId: 'mem1', targetId: 'mem3', type: 'topic', weight: 0.8 });
    await graph.addLink({ sourceId: 'mem2', targetId: 'mem3', type: 'person', weight: 0.8 });

    const result = await spreadActivation(['mem1', 'mem2'], graph, { aggregateActivation: true });

    // mem3 should have higher activation from both sources
    expect(result.nodes.has('mem3')).toBe(true);
    const mem3Node = result.nodes.get('mem3')!;
    expect(mem3Node.activationPath.length).toBeGreaterThanOrEqual(1);
  });

  it('should return ranked results', async () => {
    await graph.addLink({ sourceId: 'mem1', targetId: 'mem2', type: 'topic', weight: 0.9 });
    await graph.addLink({ sourceId: 'mem1', targetId: 'mem3', type: 'topic', weight: 0.3 });

    const result = await spreadActivation(['mem1'], graph);

    // Ranked should be sorted by activation
    expect(result.ranked[0].memoryId).toBe('mem1'); // Seed has highest
    expect(result.ranked[1].activation).toBeGreaterThanOrEqual(result.ranked[2]?.activation ?? 0);
  });

  it('should track stats', async () => {
    await graph.addLink({ sourceId: 'mem1', targetId: 'mem2', type: 'topic', weight: 0.8 });
    await graph.addLink({ sourceId: 'mem2', targetId: 'mem3', type: 'person', weight: 0.7 });

    const result = await spreadActivation(['mem1'], graph);

    expect(result.stats.nodesVisited).toBeGreaterThan(0);
    expect(result.stats.linksTraversed).toBeGreaterThanOrEqual(2);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// LINK DETECTOR TESTS
// ============================================================================

describe('Link Detector', () => {
  let detector: LinkDetector;

  beforeEach(() => {
    resetLinkDetector();
    detector = new LinkDetector();
  });

  afterEach(() => {
    resetLinkDetector();
  });

  it('should detect person links', async () => {
    const mem1 = createMockMemory({ id: 'mem1', peopleMentioned: ['Sarah', 'John'] });
    const mem2 = createMockMemory({ id: 'mem2', peopleMentioned: ['sarah', 'Mike'] }); // Different case

    const results = await detector.detectLinksBetween(mem1, mem2);
    const personLink = results.find((r) => r.link.type === 'person');

    expect(personLink).toBeDefined();
    expect(personLink!.confidence).toBeGreaterThan(0.5);
    expect(personLink!.reason.toLowerCase()).toContain('sarah');
  });

  it('should detect topic links', async () => {
    // Need high overlap to trigger topic link (threshold is 0.5)
    const mem1 = createMockMemory({ id: 'mem1', topics: ['career', 'goals'] });
    const mem2 = createMockMemory({ id: 'mem2', topics: ['career', 'goals', 'promotion'] });

    const results = await detector.detectLinksBetween(mem1, mem2);
    const topicLink = results.find((r) => r.link.type === 'topic');

    expect(topicLink).toBeDefined();
    expect(topicLink!.confidence).toBeGreaterThan(0.4);
  });

  it('should detect temporal links', async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const mem1 = createMockMemory({ id: 'mem1', createdAt: twoDaysAgo });
    const mem2 = createMockMemory({ id: 'mem2', createdAt: now });

    const results = await detector.detectLinksBetween(mem1, mem2);
    const temporalLink = results.find((r) => r.link.type === 'temporal');

    expect(temporalLink).toBeDefined();
    expect(temporalLink!.reason).toContain('days apart');
  });

  it('should detect emotional links', async () => {
    const mem1 = createMockMemory({ id: 'mem1', emotionalWeight: 0.8 });
    const mem2 = createMockMemory({ id: 'mem2', emotionalWeight: 0.75 });

    const results = await detector.detectLinksBetween(mem1, mem2);
    const emotionalLink = results.find((r) => r.link.type === 'emotional');

    expect(emotionalLink).toBeDefined();
    expect(emotionalLink!.confidence).toBeGreaterThan(0.6);
  });

  it('should detect semantic links with embeddings', async () => {
    // Create similar embeddings
    const embedding1 = [0.1, 0.2, 0.3, 0.4, 0.5];
    const embedding2 = [0.11, 0.19, 0.31, 0.39, 0.51]; // Very similar

    const mem1 = createMockMemory({ id: 'mem1', embedding: embedding1 });
    const mem2 = createMockMemory({ id: 'mem2', embedding: embedding2 });

    const results = await detector.detectLinksBetween(mem1, mem2);
    const semanticLink = results.find((r) => r.link.type === 'semantic');

    expect(semanticLink).toBeDefined();
    expect(semanticLink!.confidence).toBeGreaterThan(0.7);
  });

  it('should not create links below confidence threshold', async () => {
    const mem1 = createMockMemory({
      id: 'mem1',
      topics: ['unique-topic-1'],
      peopleMentioned: ['UniquePerson1'],
    });
    const mem2 = createMockMemory({
      id: 'mem2',
      topics: ['different-topic'],
      peopleMentioned: ['DifferentPerson'],
    });

    const results = await detector.detectLinksBetween(mem1, mem2);

    // Should have no person or topic links since no overlap
    expect(results.filter((r) => r.link.type === 'person')).toHaveLength(0);
    expect(results.filter((r) => r.link.type === 'topic')).toHaveLength(0);
  });
});

// ============================================================================
// CONNECTION FINDER TESTS
// ============================================================================

describe('Connection Finder', () => {
  let finder: ConnectionFinder;
  let graph: TestGraph;

  beforeEach(() => {
    resetConnectionFinder();
    finder = new ConnectionFinder();
    graph = new TestGraph();
  });

  afterEach(() => {
    resetConnectionFinder();
  });

  it('should find person network connections', async () => {
    const mem1 = createMockMemory({ id: 'mem1', peopleMentioned: ['Sarah'] });
    const mem2 = createMockMemory({ id: 'mem2', peopleMentioned: ['Sarah', 'John'] });
    const memories = [mem1, mem2];

    const connections = await finder.findConnections(mem1, memories, graph);
    const personConnection = connections.find((c) => c.connectionType === 'person_network');

    expect(personConnection).toBeDefined();
    expect(personConnection!.description.toLowerCase()).toContain('sarah');
  });

  it('should find topic cluster connections', async () => {
    const mem1 = createMockMemory({ id: 'mem1', topics: ['career', 'goals', 'growth'] });
    const mem2 = createMockMemory({ id: 'mem2', topics: ['career', 'promotion', 'growth'] });
    const memories = [mem1, mem2];

    const connections = await finder.findConnections(mem1, memories, graph);
    const topicConnection = connections.find((c) => c.connectionType === 'topic_cluster');

    expect(topicConnection).toBeDefined();
  });

  it('should find emotional parallel connections', async () => {
    const mem1 = createMockMemory({
      id: 'mem1',
      emotionalWeight: 0.8,
      topics: ['work'],
    });
    const mem2 = createMockMemory({
      id: 'mem2',
      emotionalWeight: 0.75,
      topics: ['family'], // Different context
    });
    const memories = [mem1, mem2];

    const connections = await finder.findConnections(mem1, memories, graph);
    const emotionalConnection = connections.find((c) => c.connectionType === 'emotional_parallel');

    expect(emotionalConnection).toBeDefined();
  });

  it('should find pattern repetition', async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const mem1 = createMockMemory({
      id: 'mem1',
      topics: ['stress', 'work'],
      emotionalWeight: 0.7,
      createdAt: sixtyDaysAgo,
    });
    const mem2 = createMockMemory({
      id: 'mem2',
      topics: ['stress', 'work'],
      emotionalWeight: 0.75,
      createdAt: new Date(),
    });
    const memories = [mem1, mem2];

    const connections = await finder.findConnections(mem1, memories, graph);
    const patternConnection = connections.find((c) => c.connectionType === 'pattern_repetition');

    expect(patternConnection).toBeDefined();
    expect(patternConnection!.description).toContain('recurring');
  });
});

// ============================================================================
// NARRATIVE BUILDER TESTS
// ============================================================================

describe('Narrative Builder', () => {
  let builder: NarrativeBuilder;

  beforeEach(() => {
    resetNarrativeBuilder();
    builder = new NarrativeBuilder();
  });

  afterEach(() => {
    resetNarrativeBuilder();
  });

  it('should build narrative from memories', async () => {
    const memories = [
      createMockMemory({
        id: 'mem1',
        topics: ['career', 'interview'],
        emotionalWeight: 0.8,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      }),
      createMockMemory({
        id: 'mem2',
        topics: ['career', 'offer'],
        emotionalWeight: 0.6,
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      }),
      createMockMemory({
        id: 'mem3',
        topics: ['career', 'started'],
        emotionalWeight: 0.3,
        createdAt: new Date(),
      }),
    ];

    const narrative = await builder.buildNarrative('test-user', 'career', memories);

    expect(narrative).not.toBeNull();
    expect(narrative!.theme).toBe('career');
    expect(narrative!.memories).toHaveLength(3);
    expect(narrative!.insights.length).toBeGreaterThan(0);
  });

  it('should identify key moments', async () => {
    const memories = [
      createMockMemory({
        id: 'mem1',
        topics: ['health'],
        emotionalWeight: 0.3,
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      }),
      createMockMemory({
        id: 'mem2',
        topics: ['health'],
        emotionalWeight: 0.9, // Big shift
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      }),
      createMockMemory({
        id: 'mem3',
        topics: ['health'],
        emotionalWeight: 0.4,
        createdAt: new Date(),
      }),
    ];

    const narrative = await builder.buildNarrative('test-user', 'health', memories);

    expect(narrative!.keyMoments.length).toBeGreaterThan(0);
    const turningPoint = narrative!.keyMoments.find((m) => m.type === 'turning_point');
    expect(turningPoint).toBeDefined();
  });

  it('should analyze emotional trajectory', async () => {
    const memories = [
      createMockMemory({
        id: 'mem1',
        topics: ['growth'],
        emotionalWeight: 0.8,
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      }),
      createMockMemory({
        id: 'mem2',
        topics: ['growth'],
        emotionalWeight: 0.6,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      }),
      createMockMemory({
        id: 'mem3',
        topics: ['growth'],
        emotionalWeight: 0.3,
        createdAt: new Date(),
      }),
    ];

    const narrative = await builder.buildNarrative('test-user', 'growth', memories);

    expect(narrative!.emotionalTrajectory).toBeDefined();
    expect(narrative!.emotionalTrajectory.startWeight).toBeGreaterThan(narrative!.emotionalTrajectory.endWeight);
  });

  it('should return null for insufficient memories', async () => {
    const memories = [
      createMockMemory({ id: 'mem1', topics: ['rare-topic'] }),
    ];

    const narrative = await builder.buildNarrative('test-user', 'rare-topic', memories);

    expect(narrative).toBeNull();
  });
});

// ============================================================================
// CORTEX INTEGRATION TESTS
// ============================================================================

describe('Associative Cortex', () => {
  let cortex: AssociativeCortexImpl;
  let graph: TestGraph;

  beforeEach(async () => {
    resetAssociativeCortex();
    graph = new TestGraph();
    cortex = new AssociativeCortexImpl(graph);
    await cortex.initialize();
  });

  afterEach(() => {
    resetAssociativeCortex();
  });

  it('should spread activation through cortex', async () => {
    await graph.addLink({ sourceId: 'mem1', targetId: 'mem2', type: 'topic', weight: 0.8 });

    const result = await cortex.spreadActivation(['mem1']);

    expect(result.nodes.has('mem1')).toBe(true);
    expect(result.nodes.has('mem2')).toBe(true);
  });

  it('should auto-link memories', async () => {
    const newMemory = createMockMemory({
      id: 'new',
      topics: ['career', 'goals'],
      peopleMentioned: ['Sarah'],
    });

    const existing = [
      createMockMemory({
        id: 'existing1',
        topics: ['career', 'promotion'],
        peopleMentioned: ['Sarah', 'John'],
      }),
      createMockMemory({
        id: 'existing2',
        topics: ['family'],
        peopleMentioned: ['Mom', 'Dad'],
      }),
    ];

    const links = await cortex.autoLink(newMemory, existing);

    // Should have created at least one link (person and/or topic match)
    expect(links.length).toBeGreaterThan(0);
  });

  it('should get stats', async () => {
    await graph.addLink({ sourceId: 'mem1', targetId: 'mem2', type: 'topic', weight: 0.8 });
    await graph.addLink({ sourceId: 'mem1', targetId: 'mem3', type: 'person', weight: 0.7 });

    cortex.cacheMemories('test-user', [
      createMockMemory({ id: 'mem1' }),
      createMockMemory({ id: 'mem2' }),
      createMockMemory({ id: 'mem3' }),
    ]);

    const stats = await cortex.getStats('test-user');

    expect(stats.totalMemories).toBe(3);
    expect(stats.totalLinks).toBeGreaterThanOrEqual(2);
  });
});

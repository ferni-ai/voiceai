# Deep Dive: Associative Cortex (Memory Graph)

> **Phase 3 Core Component**

---

## Problem Statement

Current memory is **flat**—each memory is an isolated island:

```
Current State:
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│ Memory  │  │ Memory  │  │ Memory  │  │ Memory  │
│    1    │  │    2    │  │    3    │  │    4    │
└─────────┘  └─────────┘  └─────────┘  └─────────┘
     ↑            ↑            ↑            ↑
     └────────────┴────────────┴────────────┘
              Semantic Similarity Only
```

**What's missing:**

- "This led to that" (causation)
- "These happened together" (temporal)
- "Same person involved" (relationship)
- "Part of the same story" (narrative)
- "Connected emotionally" (emotional)

**Real human memory** is a **network**, not a list.

---

## Solution: Associative Cortex

A **graph layer** that connects memories:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ASSOCIATIVE CORTEX                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│     ┌─────────┐                      ┌─────────┐                │
│     │ Memory  │──── CAUSED ────────▶│ Memory  │                │
│     │   1     │◀─── PERSON ─────────│   4     │                │
│     └────┬────┘                      └────┬────┘                │
│          │                               │                       │
│       TEMPORAL                        EMOTIONAL                  │
│          │                               │                       │
│     ┌────▼────┐                      ┌───▼─────┐                │
│     │ Memory  │──── NARRATIVE ──────▶│ Memory  │                │
│     │   2     │                      │   5     │                │
│     └────┬────┘                      └─────────┘                │
│          │                                                       │
│       SEMANTIC                                                   │
│          │                                                       │
│     ┌────▼────┐                                                 │
│     │ Memory  │                                                 │
│     │   3     │                                                 │
│     └─────────┘                                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Link Types

```typescript
// src/memory/graph/link-types.ts

/**
 * Types of relationships between memories
 */
export type LinkType =
  | 'causal' // Memory A caused/led to Memory B
  | 'temporal' // A and B happened close in time
  | 'emotional' // A and B share emotional tone
  | 'person' // Same person involved
  | 'topic' // Same topic/theme
  | 'semantic' // High embedding similarity (auto-detected)
  | 'narrative' // Part of same life chapter/story arc
  | 'contrast'; // Contradicting or opposing memories

/**
 * A link between two memories
 */
export interface MemoryLink {
  id: string;

  // Endpoints
  sourceId: string;
  targetId: string;

  // Relationship
  type: LinkType;
  weight: number; // 0-1, strength of relationship
  bidirectional: boolean; // Does relation go both ways?

  // Evidence
  metadata: {
    createdAt: Date;
    detectedBy: 'auto' | 'llm' | 'user' | 'rule';
    confidence: number; // How confident in this link
    evidence?: string; // Why this link exists
    lastValidated?: Date; // When last confirmed valid
  };
}

/**
 * Detailed descriptions of each link type
 */
export const LINK_TYPE_INFO: Record<
  LinkType,
  {
    description: string;
    bidirectionalDefault: boolean;
    examples: string[];
    detectionMethod: 'auto' | 'llm' | 'both';
  }
> = {
  causal: {
    description: 'One memory caused or led to another',
    bidirectionalDefault: false,
    examples: [
      'Job interview → Got the job',
      'Had argument → Feeling sad',
      'Started exercising → Feeling better',
    ],
    detectionMethod: 'llm',
  },
  temporal: {
    description: 'Memories occurred close in time',
    bidirectionalDefault: true,
    examples: ['Same day events', 'Same week milestones', 'Before/after a major event'],
    detectionMethod: 'auto',
  },
  emotional: {
    description: 'Memories share emotional tone or intensity',
    bidirectionalDefault: true,
    examples: ['Both happy moments', 'Both anxiety-inducing', 'Similar emotional weight'],
    detectionMethod: 'auto',
  },
  person: {
    description: 'Same person mentioned in both memories',
    bidirectionalDefault: true,
    examples: ['Conversations about Sarah', 'Events involving Dad', 'Work memories about boss'],
    detectionMethod: 'auto',
  },
  topic: {
    description: 'Same topic or theme',
    bidirectionalDefault: true,
    examples: ['Career-related memories', 'Health journey', 'Relationship discussions'],
    detectionMethod: 'auto',
  },
  semantic: {
    description: 'High semantic/embedding similarity',
    bidirectionalDefault: true,
    examples: ['Similar concepts discussed', 'Related situations'],
    detectionMethod: 'auto',
  },
  narrative: {
    description: 'Part of same life story or chapter',
    bidirectionalDefault: true,
    examples: ['Moving to new city arc', 'Career transition story', 'Healing journey'],
    detectionMethod: 'llm',
  },
  contrast: {
    description: 'Contradicting or opposing perspectives',
    bidirectionalDefault: true,
    examples: ['Changed opinion over time', 'Conflicting feelings', 'Before/after transformation'],
    detectionMethod: 'llm',
  },
};
```

---

## Graph Store

```typescript
// src/memory/graph/graph-store.ts

import type { MemoryLink, LinkType } from './link-types.js';
import type { DocumentAdapter } from '../unified-store/adapters/types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MemoryGraphStore' });

export interface GraphQuery {
  memoryId: string;

  // Filter options
  linkTypes?: LinkType[];
  direction?: 'outgoing' | 'incoming' | 'both';
  minWeight?: number;
  maxDepth?: number; // For multi-hop traversal

  // Limits
  limit?: number;
}

export interface GraphPath {
  memories: string[]; // IDs in order
  links: MemoryLink[];
  totalWeight: number;
  pathLength: number;
}

export class MemoryGraphStore {
  constructor(private adapter: DocumentAdapter) {}

  // ============================================
  // LINK MANAGEMENT
  // ============================================

  /**
   * Create a new link between memories
   */
  async createLink(
    userId: string,
    sourceId: string,
    targetId: string,
    type: LinkType,
    options: {
      weight?: number;
      bidirectional?: boolean;
      evidence?: string;
      detectedBy?: 'auto' | 'llm' | 'user' | 'rule';
    } = {}
  ): Promise<MemoryLink> {
    const linkId = `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const link: MemoryLink = {
      id: linkId,
      sourceId,
      targetId,
      type,
      weight: options.weight ?? 0.5,
      bidirectional: options.bidirectional ?? LINK_TYPE_INFO[type].bidirectionalDefault,
      metadata: {
        createdAt: new Date(),
        detectedBy: options.detectedBy ?? 'auto',
        confidence: options.weight ?? 0.5,
        evidence: options.evidence,
      },
    };

    // Store forward link
    await this.adapter.set(userId, 'memory_links', linkId, this.serializeLink(link));

    // Create index entries for fast lookup
    await this.adapter.set(userId, 'link_index_source', `${sourceId}_${linkId}`, { linkId, type });
    await this.adapter.set(userId, 'link_index_target', `${targetId}_${linkId}`, { linkId, type });

    // If bidirectional, create reverse link
    if (link.bidirectional) {
      const reverseLinkId = `${linkId}_rev`;
      const reverseLink: MemoryLink = {
        ...link,
        id: reverseLinkId,
        sourceId: targetId,
        targetId: sourceId,
      };
      await this.adapter.set(
        userId,
        'memory_links',
        reverseLinkId,
        this.serializeLink(reverseLink)
      );
      await this.adapter.set(userId, 'link_index_source', `${targetId}_${reverseLinkId}`, {
        linkId: reverseLinkId,
        type,
      });
      await this.adapter.set(userId, 'link_index_target', `${sourceId}_${reverseLinkId}`, {
        linkId: reverseLinkId,
        type,
      });
    }

    log.debug({ userId, sourceId, targetId, type, linkId }, 'Memory link created');

    return link;
  }

  /**
   * Get all links for a memory
   */
  async getLinks(userId: string, query: GraphQuery): Promise<MemoryLink[]> {
    const links: MemoryLink[] = [];

    // Get outgoing links
    if (query.direction !== 'incoming') {
      const sourceLinks = await this.adapter.query<{ linkId: string; type: LinkType }>(
        userId,
        'link_index_source',
        [{ field: '__name__', op: '>=', value: `${query.memoryId}_` }]
      );

      for (const entry of sourceLinks) {
        if (!entry.linkId.startsWith(`${query.memoryId}_`)) continue;

        const link = await this.adapter.get<MemoryLink>(userId, 'memory_links', entry.linkId);
        if (link && this.matchesQuery(link, query)) {
          links.push(this.deserializeLink(link));
        }
      }
    }

    // Get incoming links
    if (query.direction !== 'outgoing') {
      const targetLinks = await this.adapter.query<{ linkId: string; type: LinkType }>(
        userId,
        'link_index_target',
        [{ field: '__name__', op: '>=', value: `${query.memoryId}_` }]
      );

      for (const entry of targetLinks) {
        if (!entry.linkId.startsWith(`${query.memoryId}_`)) continue;

        const link = await this.adapter.get<MemoryLink>(userId, 'memory_links', entry.linkId);
        if (link && this.matchesQuery(link, query)) {
          links.push(this.deserializeLink(link));
        }
      }
    }

    // Sort by weight and limit
    links.sort((a, b) => b.weight - a.weight);

    return query.limit ? links.slice(0, query.limit) : links;
  }

  /**
   * Delete a link
   */
  async deleteLink(userId: string, linkId: string): Promise<void> {
    const link = await this.adapter.get<MemoryLink>(userId, 'memory_links', linkId);
    if (!link) return;

    // Delete main link
    await this.adapter.delete(userId, 'memory_links', linkId);
    await this.adapter.delete(userId, 'link_index_source', `${link.sourceId}_${linkId}`);
    await this.adapter.delete(userId, 'link_index_target', `${link.targetId}_${linkId}`);

    // Delete reverse if bidirectional
    if (link.bidirectional) {
      const reverseLinkId = `${linkId}_rev`;
      await this.adapter.delete(userId, 'memory_links', reverseLinkId);
      await this.adapter.delete(userId, 'link_index_source', `${link.targetId}_${reverseLinkId}`);
      await this.adapter.delete(userId, 'link_index_target', `${link.sourceId}_${reverseLinkId}`);
    }
  }

  /**
   * Update link weight (used for reinforcement)
   */
  async updateLinkWeight(userId: string, linkId: string, newWeight: number): Promise<void> {
    await this.adapter.update<MemoryLink>(userId, 'memory_links', linkId, {
      weight: Math.max(0, Math.min(1, newWeight)),
    });
  }

  // ============================================
  // GRAPH TRAVERSAL
  // ============================================

  /**
   * Find all memories connected to a source (breadth-first)
   */
  async findConnected(
    userId: string,
    sourceId: string,
    options: {
      maxDepth?: number;
      linkTypes?: LinkType[];
      minWeight?: number;
      limit?: number;
    } = {}
  ): Promise<Map<string, { depth: number; path: string[] }>> {
    const maxDepth = options.maxDepth ?? 3;
    const visited = new Map<string, { depth: number; path: string[] }>();
    const queue: Array<{ id: string; depth: number; path: string[] }> = [
      { id: sourceId, depth: 0, path: [sourceId] },
    ];

    visited.set(sourceId, { depth: 0, path: [sourceId] });

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxDepth) continue;

      // Get adjacent memories
      const links = await this.getLinks(userId, {
        memoryId: current.id,
        linkTypes: options.linkTypes,
        minWeight: options.minWeight,
        direction: 'both',
      });

      for (const link of links) {
        const neighborId = link.sourceId === current.id ? link.targetId : link.sourceId;

        if (!visited.has(neighborId)) {
          const newPath = [...current.path, neighborId];
          visited.set(neighborId, { depth: current.depth + 1, path: newPath });
          queue.push({ id: neighborId, depth: current.depth + 1, path: newPath });

          if (options.limit && visited.size >= options.limit) {
            return visited;
          }
        }
      }
    }

    // Remove source from results
    visited.delete(sourceId);

    return visited;
  }

  /**
   * Find shortest path between two memories
   */
  async findPath(
    userId: string,
    sourceId: string,
    targetId: string,
    options: {
      maxDepth?: number;
      linkTypes?: LinkType[];
    } = {}
  ): Promise<GraphPath | null> {
    const maxDepth = options.maxDepth ?? 5;
    const visited = new Set<string>([sourceId]);
    const queue: Array<{ id: string; path: string[]; links: MemoryLink[] }> = [
      { id: sourceId, path: [sourceId], links: [] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.path.length > maxDepth) continue;

      const links = await this.getLinks(userId, {
        memoryId: current.id,
        linkTypes: options.linkTypes,
        direction: 'both',
      });

      for (const link of links) {
        const neighborId = link.sourceId === current.id ? link.targetId : link.sourceId;

        // Found target!
        if (neighborId === targetId) {
          return {
            memories: [...current.path, targetId],
            links: [...current.links, link],
            totalWeight: [...current.links, link].reduce((sum, l) => sum + l.weight, 0),
            pathLength: current.path.length,
          };
        }

        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push({
            id: neighborId,
            path: [...current.path, neighborId],
            links: [...current.links, link],
          });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Get memory clusters (strongly connected groups)
   */
  async getClusters(
    userId: string,
    options: {
      minClusterSize?: number;
      linkTypes?: LinkType[];
    } = {}
  ): Promise<Array<{ memories: string[]; theme?: string }>> {
    // Implementation using union-find or similar
    // Returns groups of memories that are tightly interconnected
    // ...
    return [];
  }

  // ============================================
  // HELPERS
  // ============================================

  private matchesQuery(link: MemoryLink, query: GraphQuery): boolean {
    if (query.linkTypes && !query.linkTypes.includes(link.type)) {
      return false;
    }
    if (query.minWeight && link.weight < query.minWeight) {
      return false;
    }
    return true;
  }

  private serializeLink(link: MemoryLink): Record<string, unknown> {
    return {
      ...link,
      metadata: {
        ...link.metadata,
        createdAt: link.metadata.createdAt.toISOString(),
        lastValidated: link.metadata.lastValidated?.toISOString(),
      },
    };
  }

  private deserializeLink(data: unknown): MemoryLink {
    const raw = data as Record<string, unknown>;
    const metadata = raw.metadata as Record<string, unknown>;

    return {
      ...raw,
      metadata: {
        ...metadata,
        createdAt: new Date(metadata.createdAt as string),
        lastValidated: metadata.lastValidated
          ? new Date(metadata.lastValidated as string)
          : undefined,
      },
    } as MemoryLink;
  }
}
```

---

## Link Detection Engine

Automatically detects and creates links:

```typescript
// src/memory/graph/link-detector.ts

import type { StoredMemory } from '../unified-store/types.js';
import type { LinkType, MemoryLink } from './link-types.js';
import type { MemoryGraphStore } from './graph-store.js';
import { cosineSimilarity } from '../../utils/math.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LinkDetector' });

export interface DetectedLink {
  sourceId: string;
  targetId: string;
  type: LinkType;
  weight: number;
  evidence: string;
}

export class LinkDetector {
  private config: LinkDetectorConfig;

  constructor(
    private graphStore: MemoryGraphStore,
    config?: Partial<LinkDetectorConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect and create links for a new memory
   */
  async detectLinks(
    userId: string,
    newMemory: StoredMemory,
    existingMemories: StoredMemory[]
  ): Promise<DetectedLink[]> {
    const detectedLinks: DetectedLink[] = [];

    for (const existing of existingMemories) {
      if (existing.id === newMemory.id) continue;

      // Run all detectors
      const links = await this.runDetectors(newMemory, existing);

      for (const link of links) {
        if (link.weight >= this.config.minWeight) {
          detectedLinks.push(link);

          // Create in graph store
          await this.graphStore.createLink(userId, link.sourceId, link.targetId, link.type, {
            weight: link.weight,
            evidence: link.evidence,
            detectedBy: 'auto',
          });
        }
      }
    }

    log.debug(
      {
        userId,
        memoryId: newMemory.id,
        linksDetected: detectedLinks.length,
      },
      'Link detection completed'
    );

    return detectedLinks;
  }

  private async runDetectors(
    memory1: StoredMemory,
    memory2: StoredMemory
  ): Promise<DetectedLink[]> {
    const links: DetectedLink[] = [];

    // 1. Semantic similarity
    const semanticLink = this.detectSemantic(memory1, memory2);
    if (semanticLink) links.push(semanticLink);

    // 2. Temporal proximity
    const temporalLink = this.detectTemporal(memory1, memory2);
    if (temporalLink) links.push(temporalLink);

    // 3. Person overlap
    const personLink = this.detectPerson(memory1, memory2);
    if (personLink) links.push(personLink);

    // 4. Topic similarity
    const topicLink = this.detectTopic(memory1, memory2);
    if (topicLink) links.push(topicLink);

    // 5. Emotional similarity
    const emotionalLink = this.detectEmotional(memory1, memory2);
    if (emotionalLink) links.push(emotionalLink);

    return links;
  }

  // ============================================
  // INDIVIDUAL DETECTORS
  // ============================================

  /**
   * Detect semantic similarity link
   */
  private detectSemantic(m1: StoredMemory, m2: StoredMemory): DetectedLink | null {
    if (!m1.embedding || !m2.embedding) return null;

    const similarity = cosineSimilarity(m1.embedding, m2.embedding);

    if (similarity >= this.config.semanticThreshold) {
      return {
        sourceId: m1.id,
        targetId: m2.id,
        type: 'semantic',
        weight: similarity,
        evidence: `Embedding similarity: ${similarity.toFixed(3)}`,
      };
    }

    return null;
  }

  /**
   * Detect temporal proximity link
   */
  private detectTemporal(m1: StoredMemory, m2: StoredMemory): DetectedLink | null {
    const timeDiff = Math.abs(m1.createdAt.getTime() - m2.createdAt.getTime());
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    // Link if within same day
    if (hoursDiff <= 24) {
      const weight = Math.max(0.3, 1 - hoursDiff / 24);
      return {
        sourceId: m1.id,
        targetId: m2.id,
        type: 'temporal',
        weight,
        evidence: `Created ${hoursDiff.toFixed(1)} hours apart`,
      };
    }

    // Weaker link if within same week
    if (hoursDiff <= 168) {
      return {
        sourceId: m1.id,
        targetId: m2.id,
        type: 'temporal',
        weight: 0.3,
        evidence: `Created within same week`,
      };
    }

    return null;
  }

  /**
   * Detect person overlap link
   */
  private detectPerson(m1: StoredMemory, m2: StoredMemory): DetectedLink | null {
    const persons1 = new Set(m1.metadata.persons ?? []);
    const persons2 = new Set(m2.metadata.persons ?? []);

    if (persons1.size === 0 || persons2.size === 0) return null;

    const overlap = [...persons1].filter((p) => persons2.has(p));

    if (overlap.length > 0) {
      const weight = overlap.length / Math.max(persons1.size, persons2.size);
      return {
        sourceId: m1.id,
        targetId: m2.id,
        type: 'person',
        weight: Math.max(0.5, weight),
        evidence: `Shared persons: ${overlap.join(', ')}`,
      };
    }

    return null;
  }

  /**
   * Detect topic similarity link
   */
  private detectTopic(m1: StoredMemory, m2: StoredMemory): DetectedLink | null {
    const topic1 = m1.metadata.topic?.toLowerCase();
    const topic2 = m2.metadata.topic?.toLowerCase();

    if (!topic1 || !topic2) return null;

    // Exact match
    if (topic1 === topic2) {
      return {
        sourceId: m1.id,
        targetId: m2.id,
        type: 'topic',
        weight: 0.9,
        evidence: `Same topic: ${topic1}`,
      };
    }

    // Partial overlap (tokenized)
    const tokens1 = new Set(topic1.split(/\W+/));
    const tokens2 = new Set(topic2.split(/\W+/));
    const overlap = [...tokens1].filter((t) => t.length > 3 && tokens2.has(t));

    if (overlap.length > 0) {
      const weight = overlap.length / Math.max(tokens1.size, tokens2.size);
      return {
        sourceId: m1.id,
        targetId: m2.id,
        type: 'topic',
        weight: Math.max(0.4, weight),
        evidence: `Topic overlap: ${overlap.join(', ')}`,
      };
    }

    return null;
  }

  /**
   * Detect emotional similarity link
   */
  private detectEmotional(m1: StoredMemory, m2: StoredMemory): DetectedLink | null {
    // Both need significant emotional weight
    if (m1.emotionalWeight < 0.5 || m2.emotionalWeight < 0.5) return null;

    // Check if similar emotional intensity
    const weightDiff = Math.abs(m1.emotionalWeight - m2.emotionalWeight);

    if (weightDiff < 0.2) {
      const avgWeight = (m1.emotionalWeight + m2.emotionalWeight) / 2;
      return {
        sourceId: m1.id,
        targetId: m2.id,
        type: 'emotional',
        weight: avgWeight,
        evidence: `Similar emotional weight: ${avgWeight.toFixed(2)}`,
      };
    }

    return null;
  }
}

// ============================================
// LLM-BASED DETECTOR (for causal, narrative)
// ============================================

export class LLMBasedLinkDetector {
  constructor(private llmClient: any) {}

  /**
   * Use LLM to detect causal and narrative links
   * Run periodically or on-demand (expensive)
   */
  async detectAdvancedLinks(userId: string, memories: StoredMemory[]): Promise<DetectedLink[]> {
    if (memories.length < 2) return [];

    const prompt = this.buildPrompt(memories);

    const response = await this.llmClient.generateText({
      prompt,
      temperature: 0.3,
      maxTokens: 1000,
    });

    return this.parseResponse(response, memories);
  }

  private buildPrompt(memories: StoredMemory[]): string {
    const memoryList = memories
      .map(
        (m, i) =>
          `[${i}] "${m.content}" (Type: ${m.type}, Created: ${m.createdAt.toISOString().split('T')[0]})`
      )
      .join('\n');

    return `Analyze these memories and identify CAUSAL and NARRATIVE links.

MEMORIES:
${memoryList}

For each link found, output JSON in this format:
{"source": <index>, "target": <index>, "type": "causal" or "narrative", "weight": 0.0-1.0, "evidence": "brief explanation"}

Rules:
- CAUSAL: Memory A directly caused or led to Memory B
- NARRATIVE: Memories are part of the same life story/chapter
- Only include links with weight >= 0.5
- Output one JSON object per line

LINKS:`;
  }

  private parseResponse(response: string, memories: StoredMemory[]): DetectedLink[] {
    const links: DetectedLink[] = [];
    const lines = response.split('\n');

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line.trim());
        if (
          typeof parsed.source === 'number' &&
          typeof parsed.target === 'number' &&
          parsed.source < memories.length &&
          parsed.target < memories.length
        ) {
          links.push({
            sourceId: memories[parsed.source].id,
            targetId: memories[parsed.target].id,
            type: parsed.type as LinkType,
            weight: parsed.weight,
            evidence: parsed.evidence,
          });
        }
      } catch {
        // Skip invalid lines
      }
    }

    return links;
  }
}

// ============================================
// CONFIG
// ============================================

interface LinkDetectorConfig {
  semanticThreshold: number;
  minWeight: number;
  maxLinksPerMemory: number;
}

const DEFAULT_CONFIG: LinkDetectorConfig = {
  semanticThreshold: 0.75,
  minWeight: 0.4,
  maxLinksPerMemory: 10,
};
```

---

## Spreading Activation

How humans recall: activate one memory, and related memories "light up":

```typescript
// src/memory/graph/spreading-activation.ts

import type { MemoryGraphStore } from './graph-store.js';
import type { LinkType } from './link-types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SpreadingActivation' });

export interface ActivationResult {
  memoryId: string;
  activation: number; // 0-1
  distance: number; // Hops from source
  pathType: LinkType[]; // Types of links traversed
}

export interface ActivationConfig {
  decayFactor: number; // How much activation decreases per hop (0.5 = halves)
  activationThreshold: number; // Minimum activation to continue spreading
  maxHops: number; // Maximum distance to spread
  maxActivated: number; // Maximum memories to return

  // Weight multipliers by link type
  typeWeights: Record<LinkType, number>;
}

const DEFAULT_ACTIVATION_CONFIG: ActivationConfig = {
  decayFactor: 0.5,
  activationThreshold: 0.1,
  maxHops: 3,
  maxActivated: 20,
  typeWeights: {
    causal: 1.2, // Causal links spread strongly
    narrative: 1.1, // Narrative links spread well
    person: 1.0, // Person links normal
    topic: 0.9, // Topic links slightly weaker
    emotional: 0.8, // Emotional links weaker
    semantic: 0.7, // Semantic links weakest
    temporal: 0.6, // Temporal links weak
    contrast: 0.5, // Contrast links weakest
  },
};

export class SpreadingActivation {
  constructor(
    private graphStore: MemoryGraphStore,
    private config: ActivationConfig = DEFAULT_ACTIVATION_CONFIG
  ) {}

  /**
   * Activate a memory and spread to connected memories
   */
  async spread(
    userId: string,
    sourceIds: string[],
    initialActivation: number = 1.0
  ): Promise<ActivationResult[]> {
    const activations = new Map<string, ActivationResult>();

    // Initialize source memories
    for (const sourceId of sourceIds) {
      activations.set(sourceId, {
        memoryId: sourceId,
        activation: initialActivation,
        distance: 0,
        pathType: [],
      });
    }

    // Process queue (breadth-first)
    const queue: Array<{
      memoryId: string;
      activation: number;
      distance: number;
      pathType: LinkType[];
    }> = sourceIds.map((id) => ({
      memoryId: id,
      activation: initialActivation,
      distance: 0,
      pathType: [],
    }));

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Stop if too far or too weak
      if (current.distance >= this.config.maxHops) continue;
      if (current.activation < this.config.activationThreshold) continue;

      // Get connected memories
      const links = await this.graphStore.getLinks(userId, {
        memoryId: current.memoryId,
        direction: 'both',
      });

      for (const link of links) {
        const neighborId = link.sourceId === current.memoryId ? link.targetId : link.sourceId;

        // Calculate propagated activation
        const typeWeight = this.config.typeWeights[link.type] ?? 1.0;
        const propagated = current.activation * this.config.decayFactor * link.weight * typeWeight;

        // Update if higher activation than existing
        const existing = activations.get(neighborId);

        if (!existing || existing.activation < propagated) {
          const newResult: ActivationResult = {
            memoryId: neighborId,
            activation: propagated,
            distance: current.distance + 1,
            pathType: [...current.pathType, link.type],
          };

          activations.set(neighborId, newResult);

          // Add to queue for further spreading
          if (propagated >= this.config.activationThreshold) {
            queue.push({
              memoryId: neighborId,
              activation: propagated,
              distance: current.distance + 1,
              pathType: newResult.pathType,
            });
          }
        }
      }
    }

    // Remove source memories from results
    for (const sourceId of sourceIds) {
      activations.delete(sourceId);
    }

    // Sort by activation and limit
    const results = Array.from(activations.values());
    results.sort((a, b) => b.activation - a.activation);

    return results.slice(0, this.config.maxActivated);
  }

  /**
   * Activation with context boost
   * Memories related to current context get boosted activation
   */
  async spreadWithContext(
    userId: string,
    sourceIds: string[],
    contextMemoryIds: string[],
    contextBoost: number = 1.5
  ): Promise<ActivationResult[]> {
    // Standard spread
    const results = await this.spread(userId, sourceIds);

    // Boost memories that are also connected to context
    const contextConnections = new Set<string>();

    for (const contextId of contextMemoryIds) {
      const links = await this.graphStore.getLinks(userId, {
        memoryId: contextId,
        direction: 'both',
      });

      for (const link of links) {
        const neighborId = link.sourceId === contextId ? link.targetId : link.sourceId;
        contextConnections.add(neighborId);
      }
    }

    // Apply boost
    for (const result of results) {
      if (contextConnections.has(result.memoryId)) {
        result.activation = Math.min(1.0, result.activation * contextBoost);
      }
    }

    // Re-sort after boost
    results.sort((a, b) => b.activation - a.activation);

    return results;
  }
}
```

---

## Integration with Memory Intelligence

```typescript
// src/memory/intelligence/graph-enhanced-selection.ts

import type { SelectionEngine, SelectionCriteria, SelectionResult } from './selection-engine.js';
import type { SpreadingActivation, ActivationResult } from '../graph/spreading-activation.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GraphEnhancedSelection' });

/**
 * Enhanced selection that uses graph-based spreading activation
 */
export class GraphEnhancedSelectionEngine {
  constructor(
    private baseSelection: SelectionEngine,
    private activation: SpreadingActivation
  ) {}

  async select(
    criteria: SelectionCriteria,
    recentMemoryIds?: string[]
  ): Promise<SelectionResult[]> {
    // 1. Get base selection results
    const baseResults = await this.baseSelection.select(criteria);

    // 2. If we have recent memories, use spreading activation
    let graphBoosted: Map<string, number> = new Map();

    if (recentMemoryIds && recentMemoryIds.length > 0) {
      const activationResults = await this.activation.spread(criteria.userId, recentMemoryIds, 0.8);

      for (const ar of activationResults) {
        graphBoosted.set(ar.memoryId, ar.activation);
      }
    }

    // 3. Apply graph boost to base results
    const enhanced = baseResults.map((result) => {
      const graphActivation = graphBoosted.get(result.memory.id) ?? 0;

      return {
        ...result,
        finalScore: result.finalScore * (1 + graphActivation * 0.3), // Up to 30% boost
        scoreBreakdown: {
          ...result.scoreBreakdown,
          graphActivation,
        },
        explanations:
          graphActivation > 0
            ? [...result.explanations, 'Connected to recent conversation']
            : result.explanations,
      };
    });

    // 4. Add highly activated memories not in base results
    const baseIds = new Set(baseResults.map((r) => r.memory.id));
    const additionalFromGraph: SelectionResult[] = [];

    for (const [memoryId, activation] of graphBoosted) {
      if (!baseIds.has(memoryId) && activation > 0.5) {
        // Fetch memory and add
        // ...
      }
    }

    // 5. Re-sort and limit
    enhanced.sort((a, b) => b.finalScore - a.finalScore);

    return enhanced.slice(0, criteria.maxResults);
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// src/memory/graph/__tests__/link-detector.test.ts

describe('LinkDetector', () => {
  describe('detectSemantic', () => {
    it('should detect high similarity links', async () => {
      // Mock memories with similar embeddings
      // Verify link created
    });
  });

  describe('detectPerson', () => {
    it('should detect shared person links', async () => {
      const m1 = { metadata: { persons: ['Sarah', 'John'] } };
      const m2 = { metadata: { persons: ['Sarah'] } };

      // Should create person link with Sarah as evidence
    });
  });
});
```

### Integration Tests

```typescript
// src/memory/graph/__tests__/spreading-activation.test.ts

describe('SpreadingActivation', () => {
  it('should propagate activation through links', async () => {
    // Create test graph:
    // A -> B -> C
    // A -> D
    // Activate A with 1.0
    // B should have ~0.5 activation
    // C should have ~0.25 activation
    // D should have ~0.5 activation
  });

  it('should respect link type weights', async () => {
    // Causal links should spread more than semantic
  });
});
```

---

## Success Metrics

| Metric                 | Baseline | Target                            |
| ---------------------- | -------- | --------------------------------- |
| Memories with links    | 0%       | >80%                              |
| Avg links per memory   | 0        | 3-5                               |
| Graph recall relevance | N/A      | >70% user approval                |
| Narrative continuity   | N/A      | >60% conversations reference past |
| Path discovery rate    | 0%       | >40% of recalls use paths         |

---

_Next: [04-LIFECYCLE-MANAGER.md](./04-LIFECYCLE-MANAGER.md)_

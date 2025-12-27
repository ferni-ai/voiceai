/**
 * Knowledge Graph Seed Data
 *
 * 50+ core financial concepts for Peter's Big Brain.
 * These form the foundation of Peter's financial knowledge.
 *
 * NOTE: The data is stored in seed-data.json for maintainability.
 * This module loads and hydrates the data with runtime values.
 */

import type { KnowledgeNode, KnowledgeEdge } from './types.js';
import seedDataJson from './seed-data.json' with { type: 'json' };

// ============================================================================
// TYPES FOR JSON DATA
// ============================================================================

interface SeedNodeJson {
  id: string;
  type: string;
  name: string;
  aliases?: string[];
  definition: string;
  context: {
    domain: string;
    subdomains?: string[];
    difficulty?: string;
  };
  examples?: string[];
  commonMisunderstandings?: string[];
  relatedMetrics?: string[];
  ranges?: {
    low?: number;
    typical?: number;
    high?: number;
    extreme?: number;
  };
  source?: string;
  metadata: {
    confidence: number;
    sources?: string[];
    helpfulnessScore?: number;
  };
}

interface SeedEdgeJson {
  id: string;
  from: string;
  to: string;
  type: string;
  strength: number;
  description: string;
  bidirectional?: boolean;
  context?: string;
}

interface SeedDataJson {
  nodes: SeedNodeJson[];
  edges: SeedEdgeJson[];
  _meta: {
    version: string;
    description: string;
    nodeCount: number;
    edgeCount: number;
    lastUpdated: string;
  };
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Core financial concepts organized by domain.
 * Hydrates JSON data with runtime timestamps.
 */
export function getFinancialSeedNodes(): KnowledgeNode[] {
  const now = new Date();
  const data = seedDataJson as SeedDataJson;

  return data.nodes.map((node) => ({
    id: node.id,
    type: node.type as KnowledgeNode['type'],
    name: node.name,
    aliases: node.aliases,
    definition: node.definition,
    context: {
      domain: node.context.domain,
      subdomains: node.context.subdomains ?? [],
      difficulty: (node.context.difficulty ?? 'beginner') as
        | 'beginner'
        | 'intermediate'
        | 'advanced',
    },
    examples: node.examples,
    commonMisunderstandings: node.commonMisunderstandings,
    relatedMetrics: node.relatedMetrics,
    ranges: node.ranges as KnowledgeNode['ranges'],
    source: node.source,
    metadata: {
      confidence: node.metadata.confidence,
      sources: node.metadata.sources ?? [],
      lastVerified: now,
      timesReferenced: 0,
      helpfulnessScore: node.metadata.helpfulnessScore ?? 0.8,
    },
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * Relationships between financial concepts.
 * Hydrates JSON data with runtime timestamps.
 */
export function getFinancialSeedEdges(): KnowledgeEdge[] {
  const now = new Date();
  const data = seedDataJson as SeedDataJson;

  return data.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type: edge.type as KnowledgeEdge['type'],
    strength: edge.strength,
    description: edge.description,
    bidirectional: edge.bidirectional,
    context: edge.context,
    metadata: {
      createdAt: now,
      confidence: 1.0,
    },
  }));
}

// ============================================================================
// METADATA ACCESS
// ============================================================================

/**
 * Get metadata about the seed data.
 */
export function getSeedDataMetadata(): SeedDataJson['_meta'] {
  const data = seedDataJson as SeedDataJson;
  return data._meta;
}

/**
 * Get count of seed nodes by domain.
 */
export function getSeedNodesByDomain(): Map<string, number> {
  const data = seedDataJson as SeedDataJson;
  const counts = new Map<string, number>();

  for (const node of data.nodes) {
    const { domain } = node.context;
    const currentCount = counts.get(domain) ?? 0;
    counts.set(domain, currentCount + 1);
  }

  return counts;
}

/**
 * Knowledge Graph Service
 *
 * Manages Peter's knowledge graph - the interconnected web of financial concepts.
 * Used for personalized learning paths and optimal explanations.
 *
 * @module tools/domains/research/knowledge-graph/graph-service
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import type {
  KnowledgeNode,
  KnowledgeEdge,
  LearningPath,
  ExplanationTemplate,
  GraphQuery,
  PathResult,
  RecommendedConcept,
  DifficultyLevel,
  ExplanationStyle,
  Analogy,
} from './types.js';

const log = getLogger();

// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================

let db: FirebaseFirestore.Firestore | null = null;

async function getFirestore(): Promise<FirebaseFirestore.Firestore> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025',
    });
    return db;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize Knowledge Graph Firestore');
    throw error;
  }
}

const COLLECTIONS = {
  NODES: 'knowledge_nodes',
  EDGES: 'knowledge_edges',
  PATHS: 'learning_paths',
  TEMPLATES: 'explanation_templates',
};

// ============================================================================
// IN-MEMORY CACHE (for fast graph traversal)
// ============================================================================

const nodeCache: Map<string, KnowledgeNode> = new Map();
const edgeCache: Map<string, KnowledgeEdge[]> = new Map(); // nodeId -> edges from that node

let cacheInitialized = false;

async function initializeCache(): Promise<void> {
  if (cacheInitialized) return;

  try {
    const firestore = await getFirestore();

    // Load all nodes
    const nodesSnapshot = await firestore.collection(COLLECTIONS.NODES).get();
    for (const doc of nodesSnapshot.docs) {
      const node = deserializeNode(doc.data());
      nodeCache.set(node.id, node);
    }

    // Load all edges
    const edgesSnapshot = await firestore.collection(COLLECTIONS.EDGES).get();
    for (const doc of edgesSnapshot.docs) {
      const edge = doc.data() as KnowledgeEdge;
      
      // Add to source node's edges
      if (!edgeCache.has(edge.from)) {
        edgeCache.set(edge.from, []);
      }
      edgeCache.get(edge.from)!.push(edge);

      // If bidirectional, add reverse edge
      if (edge.bidirectional) {
        if (!edgeCache.has(edge.to)) {
          edgeCache.set(edge.to, []);
        }
        edgeCache.get(edge.to)!.push({
          ...edge,
          from: edge.to,
          to: edge.from,
        });
      }
    }

    cacheInitialized = true;
    log.info({ nodes: nodeCache.size, edges: edgeCache.size }, 'Knowledge graph cache initialized');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize knowledge graph cache');
  }
}

function deserializeNode(data: Record<string, unknown>): KnowledgeNode {
  return {
    ...data,
    lastUpdated: data.lastUpdated ? new Date(data.lastUpdated as string) : new Date(),
  } as KnowledgeNode;
}

// ============================================================================
// NODE OPERATIONS
// ============================================================================

/**
 * Get a knowledge node by ID
 */
export async function getNode(nodeId: string): Promise<KnowledgeNode | null> {
  await initializeCache();
  return nodeCache.get(nodeId) || null;
}

/**
 * Get a node by name or alias
 */
export async function findNodeByName(name: string): Promise<KnowledgeNode | null> {
  await initializeCache();

  const nameLower = name.toLowerCase();

  for (const node of nodeCache.values()) {
    if (
      node.name.toLowerCase() === nameLower ||
      node.aliases.some((a) => a.toLowerCase() === nameLower)
    ) {
      return node;
    }
  }

  return null;
}

/**
 * Search nodes by keyword
 */
export async function searchNodes(query: string, limit = 10): Promise<KnowledgeNode[]> {
  await initializeCache();

  const queryLower = query.toLowerCase();
  const results: Array<{ node: KnowledgeNode; score: number }> = [];

  for (const node of nodeCache.values()) {
    let score = 0;

    // Name match (highest score)
    if (node.name.toLowerCase().includes(queryLower)) {
      score += 10;
    }

    // Alias match
    if (node.aliases.some((a) => a.toLowerCase().includes(queryLower))) {
      score += 8;
    }

    // Tag match
    if (node.tags.some((t) => t.toLowerCase().includes(queryLower))) {
      score += 5;
    }

    // Definition match
    if (node.content.definition.toLowerCase().includes(queryLower)) {
      score += 3;
    }

    if (score > 0) {
      results.push({ node, score });
    }
  }

  // Sort by score and return
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.node);
}

/**
 * Store or update a knowledge node
 */
export async function saveNode(node: KnowledgeNode): Promise<void> {
  try {
    const firestore = await getFirestore();
    await firestore.collection(COLLECTIONS.NODES).doc(node.id).set({
      ...node,
      lastUpdated: new Date().toISOString(),
    });

    // Update cache
    node.lastUpdated = new Date();
    nodeCache.set(node.id, node);

    log.debug({ nodeId: node.id, name: node.name }, 'Knowledge node saved');
  } catch (error) {
    log.error({ error: String(error), nodeId: node.id }, 'Failed to save knowledge node');
  }
}

// ============================================================================
// EDGE OPERATIONS
// ============================================================================

/**
 * Get edges from a node
 */
export async function getEdgesFrom(nodeId: string): Promise<KnowledgeEdge[]> {
  await initializeCache();
  return edgeCache.get(nodeId) || [];
}

/**
 * Add an edge between nodes
 */
export async function addEdge(edge: KnowledgeEdge): Promise<void> {
  try {
    const firestore = await getFirestore();
    await firestore.collection(COLLECTIONS.EDGES).doc(edge.id).set(edge);

    // Update cache
    if (!edgeCache.has(edge.from)) {
      edgeCache.set(edge.from, []);
    }
    edgeCache.get(edge.from)!.push(edge);

    if (edge.bidirectional) {
      if (!edgeCache.has(edge.to)) {
        edgeCache.set(edge.to, []);
      }
      edgeCache.get(edge.to)!.push({
        ...edge,
        from: edge.to,
        to: edge.from,
      });
    }

    log.debug({ from: edge.from, to: edge.to, relationship: edge.relationship }, 'Edge added');
  } catch (error) {
    log.error({ error: String(error), edgeId: edge.id }, 'Failed to add edge');
  }
}

// ============================================================================
// GRAPH TRAVERSAL
// ============================================================================

/**
 * Get prerequisites for a concept (what you need to understand first)
 */
export async function getPrerequisites(nodeId: string): Promise<KnowledgeNode[]> {
  await initializeCache();

  const node = nodeCache.get(nodeId);
  if (!node) return [];

  const prerequisites: KnowledgeNode[] = [];

  // Direct prerequisites from node
  for (const prereqId of node.prerequisites) {
    const prereqNode = nodeCache.get(prereqId);
    if (prereqNode) {
      prerequisites.push(prereqNode);
    }
  }

  // Also get from edges
  const edges = edgeCache.get(nodeId) || [];
  for (const edge of edges) {
    if (edge.relationship === 'prerequisite') {
      const prereqNode = nodeCache.get(edge.to);
      if (prereqNode && !prerequisites.some((p) => p.id === prereqNode.id)) {
        prerequisites.push(prereqNode);
      }
    }
  }

  return prerequisites;
}

/**
 * Get related concepts
 */
export async function getRelatedConcepts(
  nodeId: string,
  limit = 5
): Promise<RecommendedConcept[]> {
  await initializeCache();

  const edges = edgeCache.get(nodeId) || [];
  const related: RecommendedConcept[] = [];

  for (const edge of edges) {
    if (['related', 'leads_to', 'part_of', 'example_of'].includes(edge.relationship)) {
      const targetNode = nodeCache.get(edge.to);
      if (targetNode) {
        related.push({
          nodeId: targetNode.id,
          name: targetNode.name,
          reason: getRelationshipReason(edge.relationship),
          relevanceScore: edge.strength,
          prerequisitesMet: true, // Would need user context to determine
        });
      }
    }
  }

  return related
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

function getRelationshipReason(relationship: string): string {
  const reasons: Record<string, string> = {
    related: 'Related concept',
    leads_to: 'Builds on this knowledge',
    part_of: 'Component of this concept',
    example_of: 'Example of this concept',
    opposite: 'Contrasting concept',
    applies_to: 'Can be applied here',
  };
  return reasons[relationship] || 'Connected concept';
}

/**
 * Find shortest path between concepts
 */
export async function findPath(
  fromNodeId: string,
  toNodeId: string,
  maxDepth = 5
): Promise<PathResult | null> {
  await initializeCache();

  // BFS to find shortest path
  const queue: Array<{ nodeId: string; path: string[]; relationships: string[] }> = [
    { nodeId: fromNodeId, path: [fromNodeId], relationships: [] },
  ];
  const visited = new Set<string>([fromNodeId]);

  while (queue.length > 0) {
    const { nodeId, path, relationships } = queue.shift()!;

    if (path.length > maxDepth) continue;

    if (nodeId === toNodeId) {
      return {
        path,
        totalDistance: path.length - 1,
        relationships: relationships as any[],
      };
    }

    const edges = edgeCache.get(nodeId) || [];
    for (const edge of edges) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push({
          nodeId: edge.to,
          path: [...path, edge.to],
          relationships: [...relationships, edge.relationship],
        });
      }
    }
  }

  return null;
}

// ============================================================================
// EXPLANATION SELECTION
// ============================================================================

/**
 * Get the best explanation for a concept based on user profile
 */
export async function getBestExplanation(
  nodeId: string,
  userProfile: {
    experienceLevel: DifficultyLevel;
    preferredStyle: ExplanationStyle;
    preferredAnalogies?: string[];
  }
): Promise<{
  node: KnowledgeNode;
  explanation: string;
  analogy?: Analogy;
  style: ExplanationStyle;
} | null> {
  const node = await getNode(nodeId);
  if (!node) return null;

  // Choose explanation based on experience level
  let explanation: string;
  if (userProfile.experienceLevel === 'beginner') {
    explanation = node.content.simpleExplanation;
  } else if (userProfile.experienceLevel === 'advanced') {
    explanation = node.content.technicalExplanation;
  } else {
    explanation = node.content.definition;
  }

  // Find best analogy
  let bestAnalogy: Analogy | undefined;
  if (node.analogies.length > 0) {
    // Prefer user's preferred analogy types
    if (userProfile.preferredAnalogies && userProfile.preferredAnalogies.length > 0) {
      bestAnalogy = node.analogies.find((a) =>
        userProfile.preferredAnalogies!.includes(a.type)
      );
    }

    // Fall back to most effective
    if (!bestAnalogy) {
      bestAnalogy = node.analogies
        .filter((a) => a.effectiveFor.experienceLevels.includes(userProfile.experienceLevel))
        .sort((a, b) => b.effectiveness.successRate - a.effectiveness.successRate)[0];
    }

    // Fall back to any
    if (!bestAnalogy) {
      bestAnalogy = node.analogies[0];
    }
  }

  return {
    node,
    explanation,
    analogy: bestAnalogy,
    style: userProfile.preferredStyle || node.stats.bestExplanationStyle || 'simple',
  };
}

/**
 * Record that an explanation was used and how effective it was
 */
export async function recordExplanationEffectiveness(
  nodeId: string,
  style: ExplanationStyle,
  analogyId: string | undefined,
  wasEffective: boolean
): Promise<void> {
  const node = await getNode(nodeId);
  if (!node) return;

  // Update node stats
  node.stats.timesExplained++;
  
  // Update comprehension rate with exponential moving average
  const alpha = 0.1;
  node.stats.comprehensionRate =
    node.stats.comprehensionRate * (1 - alpha) + (wasEffective ? 1 : 0) * alpha;

  // Update analogy effectiveness
  if (analogyId) {
    const analogy = node.analogies.find((a) => a.id === analogyId);
    if (analogy) {
      analogy.effectiveness.timesUsed++;
      analogy.effectiveness.successRate =
        analogy.effectiveness.successRate * (1 - alpha) + (wasEffective ? 1 : 0) * alpha;
    }
  }

  // Update best style if this style is performing well
  // (simplified - in production would track per-style stats)

  await saveNode(node);

  log.debug({ nodeId, style, wasEffective }, 'Explanation effectiveness recorded');
}

// ============================================================================
// LEARNING PATH GENERATION
// ============================================================================

/**
 * Generate a learning path from current knowledge to target concept
 */
export async function generateLearningPath(
  targetNodeId: string,
  knownConcepts: string[]
): Promise<LearningPath | null> {
  await initializeCache();

  const targetNode = nodeCache.get(targetNodeId);
  if (!targetNode) return null;

  // Get all prerequisites recursively
  const toLearn: string[] = [];
  const queue = [targetNodeId];
  const visited = new Set<string>(knownConcepts);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodeCache.get(nodeId);
    if (!node) continue;

    // Add to learning list (will reverse later)
    toLearn.push(nodeId);

    // Queue prerequisites
    for (const prereqId of node.prerequisites) {
      if (!visited.has(prereqId)) {
        queue.push(prereqId);
      }
    }
  }

  // Reverse to get proper order (prerequisites first)
  toLearn.reverse();

  if (toLearn.length === 0) {
    return null; // Already know everything
  }

  // Build learning path
  const steps = toLearn.map((nodeId, index) => {
    const node = nodeCache.get(nodeId)!;
    return {
      order: index + 1,
      nodeId,
      focusPoints: [node.content.whyItMatters],
      estimatedMinutes: node.difficulty === 'beginner' ? 3 : node.difficulty === 'intermediate' ? 5 : 8,
    };
  });

  return {
    id: `path_${Date.now()}`,
    name: `Learn: ${targetNode.name}`,
    description: `A path to understand ${targetNode.name}`,
    targetAudience: 'General',
    steps,
    estimatedMinutes: steps.reduce((sum, s) => sum + s.estimatedMinutes, 0),
    outcomes: [`Understand ${targetNode.name}`, targetNode.content.whyItMatters],
    stats: {
      timesStarted: 0,
      completionRate: 0,
      averageRating: 0,
    },
  };
}

// ============================================================================
// GRAPH STATISTICS
// ============================================================================

/**
 * Get statistics about the knowledge graph
 */
export async function getGraphStats(): Promise<{
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  nodesByDifficulty: Record<string, number>;
  averageConnections: number;
  mostConnectedNodes: Array<{ id: string; name: string; connections: number }>;
}> {
  await initializeCache();

  const nodesByType: Record<string, number> = {};
  const nodesByDifficulty: Record<string, number> = {};

  for (const node of nodeCache.values()) {
    nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    nodesByDifficulty[node.difficulty] = (nodesByDifficulty[node.difficulty] || 0) + 1;
  }

  // Count connections per node
  const connections: Array<{ id: string; name: string; connections: number }> = [];
  for (const [nodeId, edges] of edgeCache.entries()) {
    const node = nodeCache.get(nodeId);
    if (node) {
      connections.push({ id: nodeId, name: node.name, connections: edges.length });
    }
  }

  const totalEdges = Array.from(edgeCache.values()).reduce((sum, edges) => sum + edges.length, 0);

  return {
    totalNodes: nodeCache.size,
    totalEdges,
    nodesByType,
    nodesByDifficulty,
    averageConnections: nodeCache.size > 0 ? totalEdges / nodeCache.size : 0,
    mostConnectedNodes: connections.sort((a, b) => b.connections - a.connections).slice(0, 10),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const KnowledgeGraph = {
  // Nodes
  getNode,
  findNodeByName,
  searchNodes,
  saveNode,

  // Edges
  getEdgesFrom,
  addEdge,

  // Traversal
  getPrerequisites,
  getRelatedConcepts,
  findPath,

  // Explanations
  getBestExplanation,
  recordExplanationEffectiveness,

  // Learning paths
  generateLearningPath,

  // Stats
  getGraphStats,
};

export default KnowledgeGraph;


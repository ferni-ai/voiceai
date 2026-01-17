/**
 * Knowledge Graph Types
 *
 * Types for Peter's interconnected financial knowledge.
 */

/**
 * Node types in the knowledge graph.
 */
export type NodeType = 'concept' | 'metric' | 'principle' | 'strategy' | 'product' | 'person';

/**
 * Edge types between nodes.
 */
export type EdgeType =
  | 'prerequisite' // Must understand A before B
  | 'relates_to' // General relationship
  | 'contradicts' // Opposing views
  | 'exemplifies' // A is an example of B
  | 'part_of' // A is a component of B
  | 'derived_from' // A is calculated from B
  | 'causes' // A leads to B
  | 'measures'; // A is a measurement of B

/**
 * Knowledge node in the graph.
 */
export interface KnowledgeNode {
  id: string;
  type: NodeType;
  name: string;
  aliases?: string[];
  definition: string;
  context: {
    domain: string;
    subdomains: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced';
  };
  examples?: string[];
  commonMisunderstandings?: string[];
  source?: string; // For principles
  relatedMetrics?: string[]; // For metrics
  ranges?: {
    low: number;
    typical: number;
    high: number;
    extreme: number;
  };
  metadata: {
    confidence: number;
    sources: string[];
    lastVerified: Date;
    timesReferenced: number;
    helpfulnessScore: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Edge connecting two nodes.
 */
export interface KnowledgeEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  strength: number; // 0-1
  description?: string;
  context?: string;
  bidirectional?: boolean;
  metadata: {
    createdAt: Date;
    confidence: number;
  };
}

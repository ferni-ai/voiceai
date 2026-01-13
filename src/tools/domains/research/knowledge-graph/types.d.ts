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
export type EdgeType = 'prerequisite' | 'relates_to' | 'contradicts' | 'exemplifies' | 'part_of' | 'derived_from' | 'causes' | 'measures';
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
    source?: string;
    relatedMetrics?: string[];
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
    strength: number;
    description?: string;
    context?: string;
    bidirectional?: boolean;
    metadata: {
        createdAt: Date;
        confidence: number;
    };
}
//# sourceMappingURL=types.d.ts.map
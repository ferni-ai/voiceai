/**
 * Knowledge Graph Service
 *
 * In-memory graph operations for Peter's financial knowledge.
 * Can be extended to persist to Neo4j or similar.
 */
import type { KnowledgeNode, KnowledgeEdge, EdgeType } from './types.js';
/**
 * Knowledge Graph Service for managing interconnected financial concepts.
 */
export declare class KnowledgeGraphService {
    private nodes;
    private edges;
    private outgoingEdges;
    private incomingEdges;
    /**
     * Add a node to the graph.
     */
    addNode(node: KnowledgeNode): void;
    /**
     * Get a node by ID.
     */
    getNode(id: string): KnowledgeNode | undefined;
    /**
     * Add an edge between nodes.
     */
    addEdge(edge: KnowledgeEdge): void;
    /**
     * Get nodes related to a given node.
     */
    getRelatedNodes(nodeId: string, edgeType?: EdgeType): KnowledgeNode[];
    /**
     * Get nodes that point to a given node.
     */
    getIncomingNodes(nodeId: string, edgeType?: EdgeType): KnowledgeNode[];
    /**
     * Search nodes by name, definition, or aliases.
     */
    searchNodes(query: string): KnowledgeNode[];
    /**
     * Find a path between two nodes using BFS.
     */
    findPath(fromId: string, toId: string): string[];
    /**
     * Get learning recommendations based on mastered topics.
     */
    getRecommendations(masteredNodeIds: string[], targetDifficulty: 'beginner' | 'intermediate' | 'advanced'): KnowledgeNode[];
    /**
     * Get all nodes in the graph.
     */
    getAllNodes(): KnowledgeNode[];
    /**
     * Get all edges in the graph.
     */
    getAllEdges(): KnowledgeEdge[];
    /**
     * Get statistics about the graph.
     */
    getStats(): {
        nodeCount: number;
        edgeCount: number;
        nodesByType: Record<string, number>;
        nodesByDomain: Record<string, number>;
    };
    /**
     * Load seed data into the graph.
     */
    loadSeedData(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): void;
    /**
     * Clear all data from the graph.
     */
    clear(): void;
}
/**
 * Get the singleton knowledge graph instance.
 */
export declare function getKnowledgeGraph(): KnowledgeGraphService;
/**
 * Initialize the knowledge graph with seed data.
 */
export declare function initializeKnowledgeGraph(): Promise<KnowledgeGraphService>;
//# sourceMappingURL=graph-service.d.ts.map
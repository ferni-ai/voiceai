/**
 * Knowledge Graph Service
 *
 * In-memory graph operations for Peter's financial knowledge.
 * Can be extended to persist to Neo4j or similar.
 */
/**
 * Knowledge Graph Service for managing interconnected financial concepts.
 */
export class KnowledgeGraphService {
    nodes = new Map();
    edges = new Map();
    // Adjacency lists for fast traversal
    outgoingEdges = new Map();
    incomingEdges = new Map();
    /**
     * Add a node to the graph.
     */
    addNode(node) {
        this.nodes.set(node.id, node);
        if (!this.outgoingEdges.has(node.id)) {
            this.outgoingEdges.set(node.id, []);
        }
        if (!this.incomingEdges.has(node.id)) {
            this.incomingEdges.set(node.id, []);
        }
    }
    /**
     * Get a node by ID.
     */
    getNode(id) {
        return this.nodes.get(id);
    }
    /**
     * Add an edge between nodes.
     */
    addEdge(edge) {
        this.edges.set(edge.id, edge);
        // Add to outgoing adjacency
        const outgoing = this.outgoingEdges.get(edge.from) || [];
        outgoing.push(edge);
        this.outgoingEdges.set(edge.from, outgoing);
        // Add to incoming adjacency
        const incoming = this.incomingEdges.get(edge.to) || [];
        incoming.push(edge);
        this.incomingEdges.set(edge.to, incoming);
        // Handle bidirectional edges
        if (edge.bidirectional) {
            const reverseEdge = {
                ...edge,
                id: `${edge.id}_reverse`,
                from: edge.to,
                to: edge.from,
            };
            const reverseOutgoing = this.outgoingEdges.get(edge.to) || [];
            reverseOutgoing.push(reverseEdge);
            this.outgoingEdges.set(edge.to, reverseOutgoing);
            const reverseIncoming = this.incomingEdges.get(edge.from) || [];
            reverseIncoming.push(reverseEdge);
            this.incomingEdges.set(edge.from, reverseIncoming);
        }
    }
    /**
     * Get nodes related to a given node.
     */
    getRelatedNodes(nodeId, edgeType) {
        const outgoing = this.outgoingEdges.get(nodeId) || [];
        const filtered = edgeType ? outgoing.filter((e) => e.type === edgeType) : outgoing;
        return filtered
            .map((edge) => this.nodes.get(edge.to))
            .filter((node) => node !== undefined);
    }
    /**
     * Get nodes that point to a given node.
     */
    getIncomingNodes(nodeId, edgeType) {
        const incoming = this.incomingEdges.get(nodeId) || [];
        const filtered = edgeType ? incoming.filter((e) => e.type === edgeType) : incoming;
        return filtered
            .map((edge) => this.nodes.get(edge.from))
            .filter((node) => node !== undefined);
    }
    /**
     * Search nodes by name, definition, or aliases.
     */
    searchNodes(query) {
        // Guard against undefined/null queries (can happen when semantic router
        // fails to extract args, e.g., "Honey, what's going on?" → learning_explain)
        if (!query || typeof query !== 'string') {
            return [];
        }
        const lowerQuery = query.toLowerCase();
        const results = [];
        for (const node of this.nodes.values()) {
            // Check name
            if (node.name.toLowerCase().includes(lowerQuery)) {
                results.push(node);
                continue;
            }
            // Check aliases
            if (node.aliases?.some((alias) => alias.toLowerCase().includes(lowerQuery))) {
                results.push(node);
                continue;
            }
            // Check definition
            if (node.definition.toLowerCase().includes(lowerQuery)) {
                results.push(node);
                continue;
            }
        }
        return results;
    }
    /**
     * Find a path between two nodes using BFS.
     */
    findPath(fromId, toId) {
        if (!this.nodes.has(fromId) || !this.nodes.has(toId)) {
            return [];
        }
        if (fromId === toId) {
            return [fromId];
        }
        const visited = new Set();
        const queue = [{ nodeId: fromId, path: [fromId] }];
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current.nodeId)) {
                continue;
            }
            visited.add(current.nodeId);
            const neighbors = this.outgoingEdges.get(current.nodeId) || [];
            for (const edge of neighbors) {
                if (edge.to === toId) {
                    return [...current.path, toId];
                }
                if (!visited.has(edge.to)) {
                    queue.push({ nodeId: edge.to, path: [...current.path, edge.to] });
                }
            }
        }
        return [];
    }
    /**
     * Get learning recommendations based on mastered topics.
     */
    getRecommendations(masteredNodeIds, targetDifficulty) {
        const mastered = new Set(masteredNodeIds);
        const recommendations = [];
        for (const node of this.nodes.values()) {
            // Skip already mastered
            if (mastered.has(node.id)) {
                continue;
            }
            // Filter by difficulty
            if (node.context.difficulty !== targetDifficulty) {
                continue;
            }
            // Check if prerequisites are met
            const prerequisites = this.getIncomingNodes(node.id, 'prerequisite');
            const allPrereqsMet = prerequisites.length === 0 || prerequisites.every((prereq) => mastered.has(prereq.id));
            if (allPrereqsMet) {
                recommendations.push(node);
            }
        }
        // Sort by helpfulness score
        return recommendations.sort((a, b) => (b.metadata.helpfulnessScore || 0) - (a.metadata.helpfulnessScore || 0));
    }
    /**
     * Get all nodes in the graph.
     */
    getAllNodes() {
        return Array.from(this.nodes.values());
    }
    /**
     * Get all edges in the graph.
     */
    getAllEdges() {
        return Array.from(this.edges.values());
    }
    /**
     * Get statistics about the graph.
     */
    getStats() {
        const nodesByType = {};
        const nodesByDomain = {};
        for (const node of this.nodes.values()) {
            nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
            nodesByDomain[node.context.domain] = (nodesByDomain[node.context.domain] || 0) + 1;
        }
        return {
            nodeCount: this.nodes.size,
            edgeCount: this.edges.size,
            nodesByType,
            nodesByDomain,
        };
    }
    /**
     * Load seed data into the graph.
     */
    loadSeedData(nodes, edges) {
        for (const node of nodes) {
            this.addNode(node);
        }
        for (const edge of edges) {
            this.addEdge(edge);
        }
    }
    /**
     * Clear all data from the graph.
     */
    clear() {
        this.nodes.clear();
        this.edges.clear();
        this.outgoingEdges.clear();
        this.incomingEdges.clear();
    }
}
// Singleton instance
let graphInstance = null;
/**
 * Get the singleton knowledge graph instance.
 */
export function getKnowledgeGraph() {
    if (!graphInstance) {
        graphInstance = new KnowledgeGraphService();
    }
    return graphInstance;
}
/**
 * Initialize the knowledge graph with seed data.
 */
export async function initializeKnowledgeGraph() {
    const { getFinancialSeedNodes, getFinancialSeedEdges } = await import('./seed-data.js');
    const graph = getKnowledgeGraph();
    graph.loadSeedData(getFinancialSeedNodes(), getFinancialSeedEdges());
    return graph;
}
//# sourceMappingURL=graph-service.js.map
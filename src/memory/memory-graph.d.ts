/**
 * Memory Graph Storage
 *
 * Persists associative memory links to Firestore for cross-session retrieval.
 * This enables spreading activation and graph traversal for human-like recall.
 *
 * Graph Structure:
 * - Nodes: Memory items (stored in vector store)
 * - Edges: Links between memories (stored here)
 *
 * Link Types:
 * 1. caused_by: One memory caused another
 * 2. about_person: Both memories involve the same person
 * 3. emotion: Emotional connection between memories
 * 4. topic: Same topic/theme
 * 5. temporal: Close in time
 * 6. narrative: Part of same life chapter/story
 * 7. contradiction: Memories that conflict
 * 8. reinforces: One memory reinforces another
 *
 * @module memory/memory-graph
 */
export type LinkType = 'caused_by' | 'about_person' | 'emotion' | 'topic' | 'temporal' | 'narrative' | 'contradiction' | 'reinforces';
export interface MemoryLink {
    id: string;
    sourceMemoryId: string;
    targetMemoryId: string;
    linkType: LinkType;
    strength: number;
    metadata: {
        person?: string;
        emotion?: string;
        topic?: string;
        narrative?: string;
        createdAt: Date;
        lastActivated: Date;
        activationCount: number;
    };
}
export interface SpreadingActivationResult {
    memoryId: string;
    activationLevel: number;
    pathLength: number;
    pathDescription: string;
}
interface GraphTraversalOptions {
    maxDepth: number;
    minActivation: number;
    maxResults: number;
    decayPerHop: number;
    linkTypeWeights?: Partial<Record<LinkType, number>>;
}
export declare class MemoryGraph {
    private linksCache;
    private cacheExpiry;
    private cacheTTL;
    /**
     * Create a link between two memories
     */
    createLink(userId: string, sourceMemoryId: string, targetMemoryId: string, linkType: LinkType, options?: {
        strength?: number;
        person?: string;
        emotion?: string;
        topic?: string;
        narrative?: string;
    }): Promise<MemoryLink>;
    /**
     * Get all links for a user
     */
    getLinks(userId: string): Promise<MemoryLink[]>;
    /**
     * Get links for a specific memory
     */
    getLinksForMemory(userId: string, memoryId: string): Promise<MemoryLink[]>;
    /**
     * Spreading activation traversal
     *
     * Starting from a seed memory, activate connected memories with decreasing strength.
     * This models how recalling one memory naturally brings up related memories.
     */
    spreadActivation(userId: string, seedMemoryIds: string[], options?: Partial<GraphTraversalOptions>): Promise<SpreadingActivationResult[]>;
    /**
     * Record that a link was activated (strengthens it)
     */
    recordActivation(userId: string, linkId: string): Promise<void>;
    /**
     * Auto-detect and create links from LLM analysis
     */
    detectLinks(userId: string, memoryId: string, memoryContent: string, existingMemories: Array<{
        id: string;
        content: string;
        topics?: string[];
        personMentioned?: string;
    }>): Promise<MemoryLink[]>;
    private describePath;
    private isCacheValid;
    private invalidateCache;
    private persistLink;
    private loadLinks;
}
export declare function getMemoryGraph(): MemoryGraph;
export declare function resetMemoryGraph(): void;
export {};
//# sourceMappingURL=memory-graph.d.ts.map
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
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'MemoryGraph' });
const DEFAULT_TRAVERSAL_OPTIONS = {
    maxDepth: 3,
    minActivation: 0.2,
    maxResults: 10,
    decayPerHop: 0.4,
    linkTypeWeights: {
        caused_by: 1.0,
        about_person: 0.9,
        emotion: 0.8,
        narrative: 0.8,
        topic: 0.7,
        reinforces: 0.6,
        temporal: 0.5,
        contradiction: 0.3,
    },
};
// ============================================================================
// MEMORY GRAPH IMPLEMENTATION
// ============================================================================
export class MemoryGraph {
    linksCache = new Map(); // userId -> links
    cacheExpiry = new Map(); // userId -> expiry timestamp
    cacheTTL = 5 * 60 * 1000; // 5 minutes
    /**
     * Create a link between two memories
     */
    async createLink(userId, sourceMemoryId, targetMemoryId, linkType, options = {}) {
        const now = new Date();
        const link = {
            id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            sourceMemoryId,
            targetMemoryId,
            linkType,
            strength: options.strength ?? 0.5,
            metadata: {
                person: options.person,
                emotion: options.emotion,
                topic: options.topic,
                narrative: options.narrative,
                createdAt: now,
                lastActivated: now,
                activationCount: 0,
            },
        };
        // Persist to Firestore
        await this.persistLink(userId, link);
        // Update cache
        this.invalidateCache(userId);
        log.debug({ userId, linkId: link.id, linkType, source: sourceMemoryId, target: targetMemoryId }, 'Memory link created');
        return link;
    }
    /**
     * Get all links for a user
     */
    async getLinks(userId) {
        // Check cache
        if (this.isCacheValid(userId)) {
            return this.linksCache.get(userId) || [];
        }
        // Load from Firestore
        const links = await this.loadLinks(userId);
        this.linksCache.set(userId, links);
        this.cacheExpiry.set(userId, Date.now() + this.cacheTTL);
        return links;
    }
    /**
     * Get links for a specific memory
     */
    async getLinksForMemory(userId, memoryId) {
        const allLinks = await this.getLinks(userId);
        return allLinks.filter((link) => link.sourceMemoryId === memoryId || link.targetMemoryId === memoryId);
    }
    /**
     * Spreading activation traversal
     *
     * Starting from a seed memory, activate connected memories with decreasing strength.
     * This models how recalling one memory naturally brings up related memories.
     */
    async spreadActivation(userId, seedMemoryIds, options = {}) {
        const opts = { ...DEFAULT_TRAVERSAL_OPTIONS, ...options };
        const links = await this.getLinks(userId);
        if (links.length === 0) {
            return [];
        }
        // Build adjacency index for fast lookup
        const adjacency = new Map();
        for (const link of links) {
            const sourceLinks = adjacency.get(link.sourceMemoryId) || [];
            sourceLinks.push(link);
            adjacency.set(link.sourceMemoryId, sourceLinks);
            // Also index reverse direction
            const targetLinks = adjacency.get(link.targetMemoryId) || [];
            targetLinks.push({
                ...link,
                sourceMemoryId: link.targetMemoryId,
                targetMemoryId: link.sourceMemoryId,
            });
            adjacency.set(link.targetMemoryId, targetLinks);
        }
        // BFS with activation decay
        const activated = new Map();
        const queue = [];
        // Initialize with seeds
        for (const seedId of seedMemoryIds) {
            queue.push({ memoryId: seedId, activation: 1.0, depth: 0, path: [seedId] });
            activated.set(seedId, {
                memoryId: seedId,
                activationLevel: 1.0,
                pathLength: 0,
                pathDescription: 'seed',
            });
        }
        // Spread activation
        while (queue.length > 0) {
            const current = queue.shift();
            if (current.depth >= opts.maxDepth)
                continue;
            if (current.activation < opts.minActivation)
                continue;
            const neighbors = adjacency.get(current.memoryId) || [];
            for (const link of neighbors) {
                const neighborId = link.targetMemoryId;
                // Skip if already visited with higher activation
                const existing = activated.get(neighborId);
                if (existing && existing.activationLevel >= current.activation)
                    continue;
                // Calculate activation with decay and link weight
                const linkWeight = opts.linkTypeWeights?.[link.linkType] ?? 0.5;
                const nextActivation = current.activation * (1 - opts.decayPerHop) * linkWeight * link.strength;
                if (nextActivation >= opts.minActivation) {
                    const path = [...current.path, neighborId];
                    const result = {
                        memoryId: neighborId,
                        activationLevel: nextActivation,
                        pathLength: current.depth + 1,
                        pathDescription: this.describePath(path, link.linkType),
                    };
                    activated.set(neighborId, result);
                    queue.push({
                        memoryId: neighborId,
                        activation: nextActivation,
                        depth: current.depth + 1,
                        path,
                    });
                }
            }
        }
        // Remove seeds and sort by activation
        for (const seedId of seedMemoryIds) {
            activated.delete(seedId);
        }
        const results = Array.from(activated.values())
            .sort((a, b) => b.activationLevel - a.activationLevel)
            .slice(0, opts.maxResults);
        log.debug({
            userId,
            seedCount: seedMemoryIds.length,
            activatedCount: results.length,
            topActivation: results[0]?.activationLevel,
        }, 'Spreading activation completed');
        return results;
    }
    /**
     * Record that a link was activated (strengthens it)
     */
    async recordActivation(userId, linkId) {
        const links = await this.getLinks(userId);
        const link = links.find((l) => l.id === linkId);
        if (!link)
            return;
        // Update link
        link.metadata.lastActivated = new Date();
        link.metadata.activationCount++;
        link.strength = Math.min(1, link.strength + 0.05); // Small boost
        // Persist update
        await this.persistLink(userId, link);
        this.invalidateCache(userId);
    }
    /**
     * Auto-detect and create links from LLM analysis
     */
    async detectLinks(userId, memoryId, memoryContent, existingMemories) {
        const createdLinks = [];
        // Simple heuristic detection (could be enhanced with LLM)
        for (const existing of existingMemories) {
            if (existing.id === memoryId)
                continue;
            // Topic overlap
            const contentLower = memoryContent.toLowerCase();
            const existingLower = existing.content.toLowerCase();
            // Person detection
            const personPatterns = [
                /\b(mom|dad|mother|father|wife|husband|daughter|son|friend|boss)\b/gi,
                /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g,
            ];
            for (const pattern of personPatterns) {
                const newMatches = contentLower.match(pattern) || [];
                const existingMatches = existingLower.match(pattern) || [];
                const overlap = newMatches.filter((m) => existingMatches.includes(m));
                if (overlap.length > 0) {
                    const link = await this.createLink(userId, memoryId, existing.id, 'about_person', {
                        person: overlap[0],
                        strength: 0.6,
                    });
                    createdLinks.push(link);
                    break; // One link per memory
                }
            }
            // Emotion detection
            const emotions = ['happy', 'sad', 'anxious', 'worried', 'excited', 'frustrated', 'grateful'];
            for (const emotion of emotions) {
                if (contentLower.includes(emotion) && existingLower.includes(emotion)) {
                    const link = await this.createLink(userId, memoryId, existing.id, 'emotion', {
                        emotion,
                        strength: 0.5,
                    });
                    createdLinks.push(link);
                    break;
                }
            }
            // Topic overlap from metadata
            if (existing.topics) {
                const matchingTopic = existing.topics.find((t) => contentLower.includes(t.toLowerCase()));
                if (matchingTopic) {
                    const link = await this.createLink(userId, memoryId, existing.id, 'topic', {
                        topic: matchingTopic,
                        strength: 0.5,
                    });
                    createdLinks.push(link);
                }
            }
        }
        log.debug({ userId, memoryId, linksCreated: createdLinks.length }, 'Links detected');
        return createdLinks;
    }
    // ==========================================================================
    // PRIVATE METHODS
    // ==========================================================================
    describePath(path, lastLinkType) {
        if (path.length === 2) {
            return `directly ${lastLinkType.replace('_', ' ')}`;
        }
        return `${path.length - 1} hops via ${lastLinkType.replace('_', ' ')}`;
    }
    isCacheValid(userId) {
        const expiry = this.cacheExpiry.get(userId);
        return expiry !== undefined && Date.now() < expiry;
    }
    invalidateCache(userId) {
        this.linksCache.delete(userId);
        this.cacheExpiry.delete(userId);
    }
    async persistLink(userId, link) {
        const db = getFirestoreDb();
        if (!db) {
            log.warn('Firestore not available, link will not be persisted');
            return;
        }
        try {
            await db
                .collection('bogle_users')
                .doc(userId)
                .collection('memory_links')
                .doc(link.id)
                .set({
                ...link,
                metadata: {
                    ...link.metadata,
                    createdAt: link.metadata.createdAt.toISOString(),
                    lastActivated: link.metadata.lastActivated.toISOString(),
                },
            });
        }
        catch (error) {
            log.error({ error: String(error), userId, linkId: link.id }, 'Failed to persist link');
        }
    }
    async loadLinks(userId) {
        const db = getFirestoreDb();
        if (!db) {
            return [];
        }
        try {
            const snapshot = await db
                .collection('bogle_users')
                .doc(userId)
                .collection('memory_links')
                .get();
            return snapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    ...data,
                    metadata: {
                        ...data.metadata,
                        createdAt: new Date(data.metadata.createdAt),
                        lastActivated: new Date(data.metadata.lastActivated),
                    },
                };
            });
        }
        catch (error) {
            log.error({ error: String(error), userId }, 'Failed to load links');
            return [];
        }
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let instance = null;
export function getMemoryGraph() {
    if (!instance) {
        instance = new MemoryGraph();
    }
    return instance;
}
export function resetMemoryGraph() {
    instance = null;
}
//# sourceMappingURL=memory-graph.js.map
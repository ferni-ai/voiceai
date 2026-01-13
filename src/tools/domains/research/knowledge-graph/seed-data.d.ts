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
/**
 * Core financial concepts organized by domain.
 * Hydrates JSON data with runtime timestamps.
 */
export declare function getFinancialSeedNodes(): KnowledgeNode[];
/**
 * Relationships between financial concepts.
 * Hydrates JSON data with runtime timestamps.
 */
export declare function getFinancialSeedEdges(): KnowledgeEdge[];
/**
 * Get metadata about the seed data.
 */
export declare function getSeedDataMetadata(): SeedDataJson['_meta'];
/**
 * Get count of seed nodes by domain.
 */
export declare function getSeedNodesByDomain(): Map<string, number>;
export {};
//# sourceMappingURL=seed-data.d.ts.map
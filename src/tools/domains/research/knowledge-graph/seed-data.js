/**
 * Knowledge Graph Seed Data
 *
 * 50+ core financial concepts for Peter's Big Brain.
 * These form the foundation of Peter's financial knowledge.
 *
 * NOTE: The data is stored in seed-data.json for maintainability.
 * This module loads and hydrates the data with runtime values.
 */
import seedDataJson from './seed-data.json' with { type: 'json' };
// ============================================================================
// DATA TRANSFORMATION
// ============================================================================
/**
 * Core financial concepts organized by domain.
 * Hydrates JSON data with runtime timestamps.
 */
export function getFinancialSeedNodes() {
    const now = new Date();
    const data = seedDataJson;
    return data.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        name: node.name,
        aliases: node.aliases,
        definition: node.definition,
        context: {
            domain: node.context.domain,
            subdomains: node.context.subdomains ?? [],
            difficulty: (node.context.difficulty ?? 'beginner'),
        },
        examples: node.examples,
        commonMisunderstandings: node.commonMisunderstandings,
        relatedMetrics: node.relatedMetrics,
        ranges: node.ranges,
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
export function getFinancialSeedEdges() {
    const now = new Date();
    const data = seedDataJson;
    return data.edges.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        type: edge.type,
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
export function getSeedDataMetadata() {
    const data = seedDataJson;
    return data._meta;
}
/**
 * Get count of seed nodes by domain.
 */
export function getSeedNodesByDomain() {
    const data = seedDataJson;
    const counts = new Map();
    for (const node of data.nodes) {
        const { domain } = node.context;
        const currentCount = counts.get(domain) ?? 0;
        counts.set(domain, currentCount + 1);
    }
    return counts;
}
//# sourceMappingURL=seed-data.js.map
/**
 * Memory Lane - Types
 *
 * Types for the Memory Lane feature that surfaces meaningful moments from
 * past conversations, creating a sense of shared history between the user
 * and Ferni.
 *
 * Memory Lane provides:
 * - "On This Day" anniversary moments
 * - Growth and progress highlights
 * - Relationship depth markers
 * - Emotional breakthrough moments
 *
 * @module services/memory-lane/types
 */
/**
 * Default scoring weights
 */
export const DEFAULT_SCORING_WEIGHTS = {
    emotionalWeight: 0.25,
    uniqueness: 0.15,
    growthIndicator: 0.2,
    recency: 0.1,
    anniversaryBoost: 0.15, // Big boost for "on this day"
    topicRelevance: 0.1,
    neverSurfaced: 0.05, // Small boost for fresh memories
    userLoved: 0.1, // Boost for memories user loved before
};
//# sourceMappingURL=types.js.map
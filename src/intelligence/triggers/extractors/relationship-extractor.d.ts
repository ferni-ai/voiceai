/**
 * Relationship Extractor
 *
 * Phase 2: Personal Memory Integration
 *
 * Extracts information about people in the user's life from conversation text.
 * Tracks relationships, emotional valence, and context about each person.
 *
 * @module RelationshipExtractor
 */
import type { Relationship } from '../user-trigger-profile.types.js';
export interface RelationshipExtractionOptions {
    /** Minimum confidence to include (0-1) */
    minConfidence?: number;
    /** Existing relationships to merge with */
    existingRelationships?: Relationship[];
}
export interface RelationshipExtractionResult {
    relationships: Relationship[];
    processingTimeMs: number;
}
/**
 * Extract relationships from conversation text
 */
export declare function extractRelationships(text: string, options?: RelationshipExtractionOptions): RelationshipExtractionResult;
/**
 * Quick check if text mentions any relationships
 */
export declare function hasRelationshipMentions(text: string): boolean;
declare const _default: {
    extractRelationships: typeof extractRelationships;
    hasRelationshipMentions: typeof hasRelationshipMentions;
};
export default _default;
//# sourceMappingURL=relationship-extractor.d.ts.map
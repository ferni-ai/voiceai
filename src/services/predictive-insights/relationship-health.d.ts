/**
 * Relationship Health Forecasting
 *
 * > "I've noticed your mentions of [partner] have shifted from 'we' to 'I' lately."
 *
 * Tracks sentiment and language patterns in how users talk about
 * key people in their lives to detect relationship strain early.
 *
 * Signals we track:
 * - Pronoun shifts (we→I, us→me)
 * - Sentiment trend over time
 * - Mention frequency changes
 * - Topic associations (what triggers mentions)
 * - Emotional tone when discussing the person
 *
 * @module PredictiveInsights/RelationshipHealth
 */
import type { SentimentTrend, RelationshipSeverity, LanguageShift } from './types.js';
export interface RelationshipHealthAssessment {
    userId: string;
    relationshipId: string;
    personName: string;
    /** Overall sentiment trend */
    sentimentTrend: SentimentTrend;
    /** Detected language shifts */
    languageShift?: LanguageShift;
    /** Days since a clearly positive mention */
    daysSincePositiveMention: number;
    /** Human-friendly message */
    message: string;
    /** Suggested action */
    suggestion: string;
    /** How serious is this */
    severity: RelationshipSeverity;
    /** Confidence in assessment (0-1) */
    confidence: number;
    /** Should surface to user */
    shouldSurface: boolean;
}
/**
 * Assess health of all tracked relationships for a user
 */
export declare function assessRelationshipHealth(userId: string): Promise<RelationshipHealthAssessment[]>;
/**
 * Record a mention of a person in conversation
 */
export declare function recordRelationshipMention(userId: string, personName: string, relationshipType: 'partner' | 'family' | 'friend' | 'colleague' | 'other', sentiment: number, pronouns: {
    we: number;
    i: number;
    they: number;
}, topics?: string[], emotionalTone?: string): void;
/**
 * Get tracked relationships for a user
 */
export declare function getTrackedRelationships(userId: string): string[];
/**
 * Clear relationship data for a user
 */
export declare function clearRelationshipData(userId: string): void;
declare const _default: {
    assessRelationshipHealth: typeof assessRelationshipHealth;
    recordRelationshipMention: typeof recordRelationshipMention;
    getTrackedRelationships: typeof getTrackedRelationships;
    clearRelationshipData: typeof clearRelationshipData;
};
export default _default;
//# sourceMappingURL=relationship-health.d.ts.map
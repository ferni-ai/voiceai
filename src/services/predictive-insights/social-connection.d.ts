/**
 * Social Connection Alerts
 *
 * > "You haven't mentioned [best friend] in 3 weeks.
 * > Usually you talk about them weekly. Everything okay there?"
 *
 * Tracks mention frequency of important people to detect
 * potential relationship neglect before it becomes a problem.
 *
 * @module PredictiveInsights/SocialConnection
 */
import type { RelationshipType, ConnectionSeverity } from './types.js';
export interface SocialConnectionAlert {
    userId: string;
    personId: string;
    personName: string;
    /** Days since last mention */
    daysSinceLastMention: number;
    /** Usual mention frequency (days between mentions) */
    usualFrequency: number;
    /** Type of relationship */
    relationshipType: RelationshipType;
    /** How significant is this gap */
    severity: ConnectionSeverity;
    /** Human-friendly message */
    message: string;
    /** Suggestion */
    suggestion: string;
    /** Confidence (0-1) */
    confidence: number;
    /** Should surface */
    shouldSurface: boolean;
}
/**
 * Check for neglected social connections
 */
export declare function checkSocialConnections(userId: string): Promise<SocialConnectionAlert[]>;
/**
 * Record a mention of a person
 */
export declare function recordPersonMention(userId: string, personName: string, relationshipType: RelationshipType, context?: string, sentiment?: number): void;
/**
 * Get tracked people for a user
 */
export declare function getTrackedPeople(userId: string): Array<{
    name: string;
    relationshipType: RelationshipType;
    mentionCount: number;
    importance: number;
}>;
/**
 * Clear social data for a user
 */
export declare function clearSocialData(userId: string): void;
declare const _default: {
    checkSocialConnections: typeof checkSocialConnections;
    recordPersonMention: typeof recordPersonMention;
    getTrackedPeople: typeof getTrackedPeople;
    clearSocialData: typeof clearSocialData;
};
export default _default;
//# sourceMappingURL=social-connection.d.ts.map
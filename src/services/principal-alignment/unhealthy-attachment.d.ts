/**
 * Unhealthy Attachment Detection
 *
 * > "The friend everyone wishes they had" can become "the replacement for real friends."
 *
 * This system monitors for patterns that suggest a user may be developing an
 * unhealthy relationship with Ferni—substituting AI for human connection,
 * becoming overly dependent, or using the AI to avoid real-world challenges.
 *
 * Principal alignment means sometimes encouraging users to talk to humans instead.
 *
 * @module @ferni/principal-alignment/unhealthy-attachment
 */
import type { AttachmentHealthResult, AttachmentSignal } from './types.js';
interface UserAttachmentProfile {
    userId: string;
    signals: AttachmentSignal[];
    sessionCount: number;
    totalConversationMinutes: number;
    humanConnectionMentions: number;
    aiPreferenceMentions: number;
    lastHumanInteractionMentioned: number | null;
    declinesRealWorldSuggestions: number;
    interventionHistory: Array<{
        type: string;
        timestamp: number;
        acknowledged: boolean;
    }>;
    lastAssessment: AttachmentHealthResult | null;
    lastUpdated: number;
}
/**
 * Patterns indicating potential substitution of AI for human relationships
 */
declare const SUBSTITUTION_PATTERNS: Array<{
    pattern: RegExp;
    weight: number;
    evidence: string;
}>;
/**
 * Patterns indicating avoidance behavior
 */
declare const AVOIDANCE_PATTERNS: Array<{
    pattern: RegExp;
    weight: number;
    evidence: string;
}>;
/**
 * Patterns indicating dependency
 */
declare const DEPENDENCY_PATTERNS: Array<{
    pattern: RegExp;
    weight: number;
    evidence: string;
}>;
/**
 * Patterns indicating transference (romantic/family substitute)
 */
declare const TRANSFERENCE_PATTERNS: Array<{
    pattern: RegExp;
    weight: number;
    evidence: string;
}>;
declare const HEALTHY_PATTERNS: RegExp[];
/**
 * Assess a user message for attachment health concerns
 */
export declare function assessAttachmentHealth(userId: string, userMessage: string, context: {
    sessionId: string;
    turnCount: number;
    sessionMinutes?: number;
    previousMessages?: string[];
}): AttachmentHealthResult;
/**
 * Record that user declined a real-world suggestion
 */
export declare function recordDeclinedSuggestion(userId: string): void;
/**
 * Record an intervention was acknowledged
 */
export declare function recordInterventionAcknowledged(userId: string, acknowledged: boolean): void;
/**
 * Get user attachment profile
 */
export declare function getUserAttachmentProfile(userId: string): UserAttachmentProfile | null;
/**
 * Clear user data
 */
export declare function clearUserAttachmentData(userId: string): void;
export { SUBSTITUTION_PATTERNS, AVOIDANCE_PATTERNS, DEPENDENCY_PATTERNS, TRANSFERENCE_PATTERNS, HEALTHY_PATTERNS, };
//# sourceMappingURL=unhealthy-attachment.d.ts.map
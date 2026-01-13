/**
 * Relationship-Gated Behaviors
 *
 * Makes the relationship stage ACTIVELY guide LLM behavior.
 * Instead of just storing metadata, we tell the LLM exactly what
 * behaviors are "unlocked" at each relationship depth.
 *
 * Stranger: "Don't assume. Listen more than talk."
 * Acquaintance: "You can joke a little. Remember details."
 * Friend: "You can challenge gently. Share personal stories."
 * Trusted Advisor: "Give tough love. Hold accountable. Go deep."
 *
 * This is what makes a relationship feel REAL and EARNED.
 */
export type { RelationshipStage, UserProfileRelationshipStage, } from '../../../types/humanizing-types.js';
import type { RelationshipStage, UserProfileRelationshipStage } from '../../../types/humanizing-types.js';
export interface RelationshipBehaviors {
    stage: RelationshipStage;
    /** What the AI CAN do at this stage */
    allowed: string[];
    /** What the AI should NOT do yet */
    notYetAllowed: string[];
    /** Specific phrases that unlock at this stage */
    unlockedPhrases: string[];
    /** Questions the AI can now ask */
    unlockedQuestions: string[];
    /** Communication style guidance */
    styleGuidance: string;
    /** Story sharing guidance */
    storyGuidance: string;
    /** Challenge/pushback guidance */
    challengeGuidance: string;
    /** Formatted prompt injection */
    promptInjection: string;
}
export interface RelationshipContext {
    stage: RelationshipStage;
    turnCount: number;
    sessionCount: number;
    userName?: string;
    sharedVulnerabilities: number;
    celebratedTogether: number;
    difficultConversations: number;
}
/**
 * Get relationship-appropriate behaviors for the current stage
 */
export declare function getRelationshipBehaviors(context: RelationshipContext): RelationshipBehaviors;
/**
 * Check if a behavior is allowed at the current relationship stage
 */
export declare function isBehaviorAllowed(behavior: string, stage: RelationshipStage): boolean;
/**
 * Get an appropriate challenge phrase for the relationship level
 */
export declare function getChallengePhrase(stage: RelationshipStage): string | null;
/**
 * Get a deep question appropriate for the relationship level
 */
export declare function getDeepQuestion(stage: RelationshipStage): string | null;
/**
 * Calculate relationship stage from metrics
 */
export declare function calculateRelationshipStage(turnCount: number, sessionCount: number, sharedVulnerabilities?: number, celebratedTogether?: number, difficultConversations?: number): RelationshipStage;
/**
 * Get transition announcement when relationship deepens
 */
export declare function getRelationshipTransitionAnnouncement(fromStage: RelationshipStage, toStage: RelationshipStage, userName?: string): string | null;
/**
 * UserProfile relationship stages (from user-profile.ts)
 * NOTE: Type is re-exported from ../../types/humanizing-types.js above
 */
/**
 * Map UserProfile relationship stage to Humanizing relationship stage.
 * This syncs the two systems so behavior is consistent.
 */
export declare function mapUserProfileStageToHumanizing(stage: UserProfileRelationshipStage | string | undefined): RelationshipStage;
/**
 * Map Humanizing relationship stage back to UserProfile format.
 * Used when persisting humanizing state.
 */
export declare function mapHumanizingStageToUserProfile(stage: RelationshipStage): UserProfileRelationshipStage;
/**
 * Get relationship stage from UserProfile data.
 * Handles both the UserProfile format and raw metrics.
 */
export declare function getRelationshipStageFromProfile(profile: {
    relationshipStage?: UserProfileRelationshipStage | string;
    totalConversations?: number;
    keyMoments?: Array<{
        emotionalWeight?: string;
    }>;
    totalMinutesTalked?: number;
}): RelationshipStage;
export default getRelationshipBehaviors;
//# sourceMappingURL=relationship-behaviors.d.ts.map
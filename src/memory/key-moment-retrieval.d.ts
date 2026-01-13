/**
 * Key Moment Retrieval - GAP 2.2
 *
 * Surfaces relevant key moments from past conversations
 * to create emotional continuity and build relationship depth.
 *
 * Now integrates with UserLearningEngine to include current session moments.
 */
import type { UserProfile, KeyMoment } from '../types/user-profile.js';
import type { EmotionResult } from '../types/emotion-types.js';
/**
 * Set the function to get current session moments from learning engine
 * Called by services/index.ts during session setup
 */
export declare function setCurrentSessionMomentsGetter(getter: () => KeyMoment[]): void;
/**
 * Clear the getter (on session end)
 */
export declare function clearCurrentSessionMomentsGetter(): void;
export interface KeyMomentMatch {
    moment: KeyMoment;
    relevanceScore: number;
    reason: string;
}
export declare class KeyMomentRetrieval {
    /**
     * Find relevant key moments based on current context
     * Now includes current session moments from learning engine
     */
    findRelevantMoments(profile: UserProfile, context: {
        currentTopic?: string;
        currentEmotion: EmotionResult;
        turnCount: number;
    }): Promise<KeyMomentMatch | null>;
    /**
     * Calculate relevance score for a key moment
     */
    private calculateRelevance;
    /**
     * Match current emotion to moment type
     */
    private matchEmotionToMomentType;
    /**
     * Explain why a moment matched
     */
    private explainMatch;
    /**
     * Generate a natural reference to a key moment
     */
    generateMomentReference(match: KeyMomentMatch, userName?: string): string;
    /**
     * Convert timestamp to natural time ago string
     */
    private getTimeAgoString;
    /**
     * Should we reference a key moment? (Timing logic)
     */
    shouldReferenceKeyMoment(turnCount: number): boolean;
}
/**
 * Get singleton key moment retrieval
 */
export declare function getKeyMomentRetrieval(): KeyMomentRetrieval;
/**
 * Reset for testing
 */
export declare function resetKeyMomentRetrieval(): void;
export default KeyMomentRetrieval;
//# sourceMappingURL=key-moment-retrieval.d.ts.map
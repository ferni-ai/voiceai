/**
 * Micro-Affirmation System
 *
 * > "Of course." "That makes sense." "Exactly."
 *
 * Tiny validations scattered throughout conversation:
 *
 * - **Acknowledgment**: "Yeah" "Mhm" "Right"
 * - **Validation**: "That makes sense" "Of course"
 * - **Encouragement**: "You're doing great" "That's a big step"
 * - **Normalization**: "A lot of people feel that way"
 * - **Support**: "I hear you" "I get it"
 *
 * Not just at key emotional moments—throughout, like a supportive friend.
 *
 * @module @ferni/micro-affirmations
 */
export type AffirmationType = 'acknowledgment' | 'validation' | 'encouragement' | 'normalization' | 'support' | 'agreement' | 'appreciation';
export interface MicroAffirmation {
    /** The phrase */
    phrase: string;
    /** Type */
    type: AffirmationType;
    /** Intensity (0-1) - how strong is the affirmation */
    intensity: number;
    /** Best placement */
    placement: 'inline' | 'prefix' | 'suffix' | 'standalone';
    /** Context where appropriate */
    contexts: AffirmationContext[];
}
export type AffirmationContext = 'sharing' | 'struggling' | 'deciding' | 'realizing' | 'venting' | 'questioning' | 'celebrating' | 'general';
export interface AffirmationDecision {
    /** Should we include an affirmation? */
    shouldAffirm: boolean;
    /** The affirmation if yes */
    affirmation: MicroAffirmation | null;
    /** Reasoning */
    reason: string;
}
export interface AffirmationDensityConfig {
    /** Target affirmations per 10 turns */
    targetDensity: number;
    /** Minimum turns between affirmations */
    minInterval: number;
    /** Maximum consecutive turns with affirmations */
    maxConsecutive: number;
}
export declare class MicroAffirmationEngine {
    private turnCount;
    private lastAffirmationTurn;
    private consecutiveAffirmations;
    private sessionAffirmationCount;
    private recentTypes;
    private config;
    constructor();
    /**
     * Update configuration
     */
    setConfig(config: Partial<AffirmationDensityConfig>): void;
    /**
     * Decide whether to include a micro-affirmation
     *
     * @param userMessage - User's message
     * @param turnCount - Current turn
     * @param forceContext - Force a specific context
     * @returns Decision and affirmation if yes
     */
    decide(userMessage: string, turnCount: number, forceContext?: AffirmationContext): AffirmationDecision;
    /**
     * Get an affirmation specifically for a type
     */
    getAffirmationOfType(type: AffirmationType, context?: AffirmationContext): MicroAffirmation | null;
    /**
     * Get session statistics
     */
    getStats(): {
        total: number;
        typeBreakdown: Record<AffirmationType, number>;
        turnsSinceLast: number;
    };
    /**
     * Reset for new session
     */
    reset(): void;
    private detectContext;
    private calculateAffirmProbability;
    private selectAffirmation;
}
export declare function getMicroAffirmationEngine(sessionId: string): MicroAffirmationEngine;
export declare function resetMicroAffirmationEngine(sessionId: string): void;
export declare function clearMicroAffirmationEngine(sessionId: string): void;
export declare function getActiveMicroAffirmationCount(): number;
export default MicroAffirmationEngine;
//# sourceMappingURL=micro-affirmations.d.ts.map
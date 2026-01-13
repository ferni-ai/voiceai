/**
 * Comfort Progression Tracking
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Comfort in a conversation isn't linear—it builds through moments of
 * vulnerability, shared laughter, successful challenges, and emotional
 * resonance. This module tracks these signals to unlock deeper behaviors
 * only when appropriate trust has been established.
 *
 * **Comfort-gated behaviors:**
 * - Level 0.3+: Gentle humor, personal anecdotes
 * - Level 0.5+: Playful teasing, direct challenges, running jokes
 * - Level 0.7+: Hard truths, vulnerability mirroring, calling out patterns
 * - Level 0.85+: Silence as response, deep pattern naming, gentle confrontation
 *
 * @module @ferni/humanization/comfort-progression
 */
export type ComfortLevel = 'minimal' | 'basic' | 'established' | 'deep' | 'intimate';
export interface ComfortState {
    /** Current comfort level (0-1) */
    level: number;
    /** Comfort category */
    category: ComfortLevel;
    /** Evidence tracking */
    evidence: {
        vulnerabilityShared: number;
        humorExchanged: number;
        silencesTolerated: number;
        correctionsWellReceived: number;
        emotionalMomentsShared: number;
        personalQuestionsAsked: number;
        nameUsed: number;
        playfulnessShown: number;
    };
    /** Comfort indicators */
    indicators: {
        usesAgentName: boolean;
        asksPersonalQuestions: boolean;
        sharesWithoutPrompting: boolean;
        showsPlayfulness: boolean;
        acceptsDirectFeedback: boolean;
        toleratesSilence: boolean;
        reciprocatesVulnerability: boolean;
    };
    /** Turn at which each indicator was first observed */
    indicatorFirstSeen: Record<string, number>;
    /** Recent comfort trend */
    trend: 'building' | 'stable' | 'declining';
}
export interface ComfortGatedBehavior {
    name: string;
    minComfort: number;
    type: 'output' | 'input_interpretation' | 'both';
    description: string;
}
export declare const COMFORT_GATED_BEHAVIORS: ComfortGatedBehavior[];
/**
 * Events that build comfort
 */
export declare const COMFORT_BUILDING_EVENTS: {
    user_shared_vulnerability: number;
    shared_laughter: number;
    user_accepted_feedback: number;
    emotional_moment_navigated: number;
    user_asked_personal_question: number;
    user_used_agent_name: number;
    user_showed_playfulness: number;
    comfortable_silence: number;
    user_shared_unprompted: number;
    successful_challenge: number;
    reciprocated_vulnerability: number;
    deep_disclosure: number;
};
/**
 * Events that can reduce comfort
 */
export declare const COMFORT_REDUCING_EVENTS: {
    feedback_rejected: number;
    user_withdrew: number;
    humor_fell_flat: number;
    awkward_silence: number;
    misread_emotion: number;
    pushed_too_hard: number;
    boundary_crossed: number;
};
export declare class ComfortProgressionEngine {
    private state;
    private previousLevel;
    constructor();
    /**
     * Record a comfort-building event
     */
    recordEvent(event: keyof typeof COMFORT_BUILDING_EVENTS | keyof typeof COMFORT_REDUCING_EVENTS, turnCount: number): void;
    /**
     * Record a user behavior indicator
     */
    recordIndicator(indicator: keyof ComfortState['indicators'], turnCount: number): void;
    /**
     * Check if a behavior is unlocked at current comfort level
     */
    isBehaviorUnlocked(behaviorName: string): boolean;
    /**
     * Get all currently unlocked behaviors
     */
    getUnlockedBehaviors(): ComfortGatedBehavior[];
    /**
     * Get the next behaviors that could be unlocked
     */
    getUpcomingBehaviors(): ComfortGatedBehavior[];
    /**
     * Get comfort level for context building
     */
    getComfortLevel(): number;
    /**
     * Get comfort category
     */
    getComfortCategory(): ComfortLevel;
    /**
     * Get full state
     */
    getState(): ComfortState;
    /**
     * Get comfort-appropriate tone guidance
     */
    getToneGuidance(): {
        formality: 'formal' | 'casual' | 'intimate';
        canTease: boolean;
        canChallenge: boolean;
        canBeVulnerable: boolean;
        canConfont: boolean;
    };
    /**
     * Reset for new session
     * Note: In some cases, we might want to preserve cross-session comfort
     */
    reset(preserveBaseLevel?: boolean): void;
    private createInitialState;
    private calculateCategory;
    private updateEvidence;
}
export declare function getComfortProgressionEngine(sessionId: string): ComfortProgressionEngine;
export declare function resetComfortProgressionEngine(sessionId: string, preserveBaseLevel?: boolean): void;
export declare function resetAllComfortProgressionEngines(): void;
export default ComfortProgressionEngine;
//# sourceMappingURL=comfort-progression.d.ts.map
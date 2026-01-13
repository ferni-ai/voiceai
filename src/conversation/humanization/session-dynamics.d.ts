/**
 * Session Dynamics - Conversation Energy Arc
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Human conversations have a natural arc:
 * 1. **Opening**: Warming up, establishing rapport
 * 2. **Warming**: Building comfort, finding rhythm
 * 3. **Engaged**: Peak conversation, full presence
 * 4. **Deepening**: More vulnerable territory
 * 5. **Winding**: Natural conclusion approaching
 * 6. **Extended**: Special dynamics for long sessions
 *
 * This module tracks conversation phase and provides phase-appropriate
 * behavior guidance for more natural conversation flow.
 *
 * @module @ferni/humanization/session-dynamics
 */
export type ConversationPhase = 'opening' | 'warming' | 'engaged' | 'deepening' | 'winding' | 'extended';
export interface PhaseBehavior {
    /** Greeting style */
    greeting: 'warm' | 'casual' | 'familiar' | null;
    /** Question asking style */
    questionStyle: 'open_exploratory' | 'building_on_previous' | 'deep_exploratory' | 'profound' | 'consolidating' | 'checking_in';
    /** Response length preference */
    responseLength: 'brief' | 'moderate' | 'adaptive' | 'matches_user' | 'thoughtful' | 'brief_unless_needed';
    /** Personal sharing level */
    personalSharing: 'minimal' | 'occasional' | 'natural' | 'earned' | 'summarizing' | 'deep_history';
    /** Vulnerability level available */
    vulnerability: 'low' | 'building' | 'matched' | 'high_available' | 'maintaining' | 'full_trust';
    /** Energy range [min, max] */
    energyRange: [number, number];
    /** Phase-specific behaviors */
    specialBehaviors: string[];
}
export interface SessionDynamicsState {
    /** Current phase */
    phase: ConversationPhase;
    /** Progress within phase (0-1) */
    phaseProgress: number;
    /** Turn count */
    turnCount: number;
    /** Session duration in minutes */
    sessionMinutes: number;
    /** Baseline energy */
    baselineEnergy: number;
    /** Current energy */
    currentEnergy: number;
    /** Peak energy reached this session */
    peakEnergy: number;
    /** Has there been a "deep moment" this session? */
    hadDeepMoment: boolean;
    /** Is conversation winding down naturally? */
    naturallyWinding: boolean;
}
export interface SessionEnergyArc {
    /** Opening warmth boost */
    openingWarmth: number;
    /** Peak phase energy boost */
    engagementBoost: number;
    /** Winding phase gentleness */
    windingGentleness: number;
}
export declare class SessionDynamicsEngine {
    private state;
    private sessionStartTime;
    constructor();
    /**
     * Update session state based on turn
     */
    update(context: {
        turnCount: number;
        userEnergy?: 'high' | 'medium' | 'low';
        topicWeight?: 'light' | 'medium' | 'heavy';
        wasDeepMoment?: boolean;
        userInitiatedWindDown?: boolean;
    }): void;
    /**
     * Get current phase behavior guidance
     */
    getPhaseBehavior(): PhaseBehavior;
    /**
     * Get energy arc adjustments
     */
    getEnergyArc(): SessionEnergyArc;
    /**
     * Get recommended energy level
     */
    getRecommendedEnergy(): number;
    /**
     * Check if a behavior is appropriate for current phase
     */
    isBehaviorAppropriate(behavior: string): boolean;
    /**
     * Get phase-appropriate response length
     */
    getResponseLengthGuidance(): {
        min: number;
        max: number;
        ideal: number;
    };
    /**
     * Get phase-appropriate question style description
     */
    getQuestionStyleDescription(): string;
    /**
     * Check if conversation should naturally wind down
     */
    shouldSuggestWindDown(): boolean;
    /**
     * Get wind-down phrase if appropriate
     */
    getWindDownPhrase(): string | null;
    /**
     * Get current state
     */
    getState(): SessionDynamicsState;
    /**
     * Reset for new session
     */
    reset(): void;
    private createInitialState;
    private determinePhase;
    private calculatePhaseProgress;
    private updateEnergy;
}
export declare function getSessionDynamicsEngine(sessionId: string): SessionDynamicsEngine;
export declare function resetSessionDynamicsEngine(sessionId: string): void;
export declare function resetAllSessionDynamicsEngines(): void;
export default SessionDynamicsEngine;
//# sourceMappingURL=session-dynamics.d.ts.map
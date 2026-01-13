/**
 * Conversation Momentum Tracker
 *
 * Tracks the "energy" and flow of a conversation in real-time.
 * This enables:
 * - Knowing when to lean in vs. give space
 * - Detecting when conversation is building vs. winding down
 * - Understanding emotional arcs over multiple turns
 * - Guiding natural transitions and tangents
 *
 * Philosophy: A real friend senses when you're on a roll and lets you go,
 * or when you're struggling and gently pivots. This tracker gives AI
 * that same conversational intuition.
 *
 * @module conversation/momentum-tracker
 */
export type MomentumState = 'building' | 'cruising' | 'peaking' | 'winding_down' | 'stalled' | 'intimate';
export type ConversationPhase = 'opening' | 'exploring' | 'deep' | 'closing';
export interface MomentumSignal {
    turn: number;
    timestamp: number;
    wordCount: number;
    emotionalIntensity: number;
    questionAsked: boolean;
    selfDisclosure: boolean;
    topicContinuity: boolean;
    responseLatencyMs?: number;
    laughterDetected?: boolean;
    silenceDuration?: number;
}
export interface MomentumState_Full {
    current: MomentumState;
    phase: ConversationPhase;
    trend: 'rising' | 'steady' | 'falling';
    velocity: number;
    score: number;
    turnsInCurrentState: number;
    lastPeakTurn?: number;
    topicDepth: number;
    emotionalArc: Array<{
        turn: number;
        intensity: number;
    }>;
    suggestions: MomentumSuggestion[];
}
export interface MomentumSuggestion {
    type: 'lean_in' | 'give_space' | 'gently_pivot' | 'acknowledge_depth' | 'celebrate' | 'wrap_opportunity';
    confidence: number;
    reason: string;
}
export interface MomentumProfile {
    /** How quickly to match user's rising energy */
    energyMatchSpeed: number;
    /** Threshold for detecting "stalled" state */
    stallThreshold: number;
    /** How much to value topic continuity */
    topicContinuityWeight: number;
    /** How much to value emotional intensity */
    emotionalWeight: number;
    /** Persona-specific momentum cues */
    cues: {
        building: string[];
        cruising: string[];
        peaking: string[];
        winding_down: string[];
        stalled: string[];
        intimate: string[];
    };
}
export declare class ConversationMomentumTracker {
    private signals;
    private currentState;
    private phase;
    private turnsInCurrentState;
    private lastPeakTurn?;
    private topicDepth;
    private currentTopic?;
    private profile;
    private personaId;
    private sessionId;
    constructor(personaId?: string, sessionId?: string);
    /**
     * Record a new turn's signals
     */
    recordSignal(signal: Omit<MomentumSignal, 'turn' | 'timestamp'>): void;
    /**
     * Get current momentum analysis
     */
    getState(): MomentumState_Full;
    /**
     * Get persona-specific cue for current state
     */
    getCue(): string | null;
    /**
     * Check if it's a good time for a tangent/memory
     */
    isGoodTimeForTangent(): boolean;
    /**
     * Check if it's time to slow down (thinking pauses)
     */
    shouldSlowDown(): boolean;
    /**
     * Get turn count
     */
    getTurnCount(): number;
    /**
     * Reset tracker
     */
    reset(): void;
}
export declare function getMomentumTracker(sessionId: string, personaId?: string): ConversationMomentumTracker;
export declare function resetMomentumTracker(sessionId: string): void;
export declare function resetAllMomentumTrackers(): void;
//# sourceMappingURL=momentum-tracker.d.ts.map
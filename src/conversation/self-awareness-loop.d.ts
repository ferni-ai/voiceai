/**
 * Self-Awareness Feedback Loop
 *
 * Tracks "Did that land?" signals to enable genuine self-awareness.
 * This is what separates a real friend from a chatbot - the ability
 * to sense when something didn't resonate and course-correct.
 *
 * What we track:
 * 1. Response Effectiveness - Did user engage with what we said?
 * 2. Emotional Attunement - Did our tone match their state?
 * 3. Topic Resonance - Did they want to go deeper or change subject?
 * 4. Trust Signals - Are they opening up or closing down?
 *
 * What we enable:
 * - "Am I helping?" self-checks
 * - "Did that land?" reflections
 * - Course corrections when we miss
 * - Celebrating when we connect
 *
 * Philosophy: Real humans notice when a joke falls flat, when advice
 * doesn't resonate, or when they've said too much. This gives AI
 * that same social awareness.
 *
 * @module conversation/self-awareness-loop
 */
export type LandingResult = 'landed' | 'partial' | 'missed' | 'unknown';
export type ResponseType = 'advice' | 'reflection' | 'question' | 'story' | 'validation' | 'challenge' | 'humor' | 'information';
export interface ResponseAttempt {
    turn: number;
    timestamp: number;
    responseType: ResponseType;
    emotionalTone: 'warm' | 'neutral' | 'serious' | 'playful';
    topicContext?: string;
    userEmotionBefore?: number;
}
export interface UserReaction {
    turn: number;
    wordCount: number;
    emotionalChange: number;
    topicContinued: boolean;
    questionAsked: boolean;
    selfDisclosure: boolean;
    positiveSignals: string[];
    negativeSignals: string[];
    responseLatencyMs?: number;
}
export interface LandingAssessment {
    result: LandingResult;
    confidence: number;
    evidence: string[];
    suggestion?: SelfAwarenessSuggestion;
}
export interface SelfAwarenessSuggestion {
    type: 'acknowledge_miss' | 'check_in' | 'celebrate_connection' | 'course_correct' | 'go_deeper' | 'pull_back';
    prompt: string;
    urgency: 'low' | 'medium' | 'high';
}
declare const POSITIVE_SIGNALS: RegExp[];
declare const NEGATIVE_SIGNALS: RegExp[];
declare const OPENING_UP_SIGNALS: RegExp[];
declare const CLOSING_DOWN_SIGNALS: RegExp[];
export declare class SelfAwarenessTracker {
    private state;
    private sessionId;
    private personaId;
    constructor(sessionId: string, personaId?: string);
    /**
     * Record what we said (before seeing user's reaction)
     */
    recordAttempt(attempt: Omit<ResponseAttempt, 'turn' | 'timestamp'>): void;
    /**
     * Record user's reaction (after they respond)
     */
    recordReaction(userText: string, context: Partial<UserReaction>): LandingAssessment | null;
    /**
     * Get current self-awareness state
     */
    getState(): {
        recentMisses: number;
        recentLandings: number;
        needsCheckIn: boolean;
        lastAssessment?: LandingAssessment;
        overallEffectiveness: number;
    };
    /**
     * Get a self-aware prompt injection based on current state
     */
    getSelfAwarePrompt(): string | null;
    /**
     * Reset tracker
     */
    reset(): void;
}
export declare function getSelfAwarenessTracker(sessionId: string, personaId?: string): SelfAwarenessTracker;
export declare function resetSelfAwarenessTracker(sessionId: string): void;
export declare function resetAllSelfAwarenessTrackers(): void;
export { POSITIVE_SIGNALS, NEGATIVE_SIGNALS, OPENING_UP_SIGNALS, CLOSING_DOWN_SIGNALS };
//# sourceMappingURL=self-awareness-loop.d.ts.map
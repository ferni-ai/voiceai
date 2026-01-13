/**
 * Conversation Rhythm Tracker
 *
 * Tracks the user's communication patterns and adapts Ferni's responses to match.
 * Real humans unconsciously mirror each other's communication rhythms:
 *
 * - Turn length: Short bursts vs. longer explanations
 * - Pacing: Rapid-fire vs. contemplative
 * - Pause patterns: Frequent pauses vs. flowing speech
 * - Energy trends: Rising excitement vs. winding down
 *
 * This creates "conversational attunement" - the feeling that
 * someone is really on your wavelength.
 *
 * @module @ferni/conversation-rhythm
 */
export type UserPacing = 'rapid' | 'moderate' | 'slow' | 'contemplative';
export type PausePattern = 'frequent_short' | 'occasional_long' | 'flowing' | 'hesitant';
export type EnergyTrend = 'rising' | 'stable' | 'falling' | 'oscillating';
export interface RhythmSnapshot {
    pacing: UserPacing;
    avgTurnLength: number;
    pausePattern: PausePattern;
    energyTrend: EnergyTrend;
    turnCount: number;
    timestamp: number;
}
export interface RhythmGuidance {
    /** Suggested response length multiplier (0.5 = half, 2 = double) */
    lengthMultiplier: number;
    /** Suggested speech rate adjustment (0.8 = slower, 1.2 = faster) */
    rateMultiplier: number;
    /** Suggested pause frequency multiplier */
    pauseMultiplier: number;
    /** Energy level to match */
    energyLevel: 'low' | 'medium' | 'high';
    /** Any specific guidance text */
    guidance: string;
}
export declare class ConversationRhythmTracker {
    private userTurns;
    private agentTurns;
    private currentTurn;
    private readonly ANALYSIS_WINDOW;
    private currentPacing;
    private currentPausePattern;
    private energyHistory;
    constructor();
    /**
     * Record a user turn and analyze rhythm
     */
    recordUserTurn(context: {
        text: string;
        durationMs?: number;
        pauseCount?: number;
        avgPauseDuration?: number;
        emotionIntensity?: number;
    }): RhythmSnapshot;
    /**
     * Record an agent turn for balance tracking
     */
    recordAgentTurn(context: {
        text: string;
        durationMs?: number;
    }): void;
    /**
     * Get rhythm guidance for next response
     */
    getRhythmGuidance(): RhythmGuidance;
    /**
     * Get current rhythm snapshot
     */
    getCurrentRhythm(): RhythmSnapshot;
    /**
     * Check if user's rhythm has shifted significantly
     */
    hasRhythmShifted(): boolean;
    /**
     * Get conversation balance (are we talking too much?)
     */
    getConversationBalance(): {
        userWordRatio: number;
        agentWordRatio: number;
        isBalanced: boolean;
        guidance: string;
    };
    /**
     * Reset for new conversation
     */
    reset(): void;
    private countWords;
    private getAverageUserTurnLength;
    private analyzeRhythm;
    private calculateEnergyTrend;
}
export declare function getConversationRhythmTracker(): ConversationRhythmTracker;
export declare function resetConversationRhythmTracker(): void;
export default ConversationRhythmTracker;
//# sourceMappingURL=conversation-rhythm.d.ts.map
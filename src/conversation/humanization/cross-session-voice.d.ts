/**
 * Cross-Session Voice Memory
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Remember how the user sounded in previous sessions to detect changes
 * and provide continuity. This enables truly personalized awareness:
 * - "You sound more relaxed than last time we talked"
 * - Noticing when someone sounds different
 * - Tracking vocal growth over time
 *
 * **What we remember:**
 * - Session snapshots (start/end voice state)
 * - Notable emotional moments
 * - Patterns across time (morning vs evening, weekday vs weekend)
 * - Trends in energy, mood, comfort
 *
 * @module @ferni/humanization/cross-session-voice
 */
import type { VoiceSnapshot } from './voice-print.js';
export interface SessionVoiceSnapshot {
    sessionId: string;
    date: Date;
    /** Voice state at session start */
    startingVoice: VoiceSnapshot;
    /** Voice state at session end */
    endingVoice: VoiceSnapshot | null;
    /** Notable moments during session */
    notableMoments: Array<{
        turn: number;
        description: string;
        voiceState: Partial<VoiceSnapshot>;
        emotion: string;
    }>;
    /** Overall session characteristics */
    overallEnergy: number;
    overallValence: number;
    emotionalRange: number;
    /** Session metadata */
    duration: number;
    turnCount: number;
}
export interface CrossSessionPatterns {
    /** Time-based patterns */
    morningEnergy: number | null;
    eveningEnergy: number | null;
    weekdayMood: number | null;
    weekendMood: number | null;
    /** Trending */
    energyTrend: 'improving' | 'declining' | 'stable';
    moodTrend: 'improving' | 'declining' | 'stable';
    comfortTrend: 'increasing' | 'stable';
    /** Voice characteristic trends */
    pitchTrend: 'rising' | 'falling' | 'stable';
    tempoTrend: 'faster' | 'slower' | 'stable';
}
export interface SignificantChange {
    type: 'energy' | 'mood' | 'stress' | 'growth' | 'concern';
    description: string;
    magnitude: number;
    detected: Date;
    acknowledged: boolean;
    sessionId: string;
}
export interface CrossSessionVoiceMemory {
    userId: string;
    /** Session snapshots (most recent first) */
    sessionSnapshots: SessionVoiceSnapshot[];
    /** Cross-session patterns */
    patterns: CrossSessionPatterns;
    /** Significant changes to acknowledge */
    significantChanges: SignificantChange[];
    /** Voice print reference */
    voicePrintId: string | null;
    /** Metadata */
    totalSessions: number;
    firstSessionDate: Date;
    lastSessionDate: Date;
}
export interface CrossSessionAcknowledgment {
    text: string;
    ssml: string;
    type: 'observation' | 'celebration' | 'concern' | 'trend';
    priority: 'low' | 'medium' | 'high';
    changeId?: string;
}
export declare class CrossSessionVoiceEngine {
    private memory;
    private currentSessionId;
    private currentSessionStart;
    private sessionMoments;
    private sessionTurnCount;
    constructor(userId: string, existingMemory?: CrossSessionVoiceMemory);
    /**
     * Start a new session
     */
    startSession(sessionId: string, startingVoice: VoiceSnapshot): void;
    /**
     * Record a notable moment in the current session
     */
    recordMoment(turn: number, description: string, voiceState: Partial<VoiceSnapshot>, emotion: string): void;
    /**
     * End the current session
     */
    endSession(endingVoice: VoiceSnapshot): void;
    /**
     * Generate cross-session acknowledgment if appropriate
     */
    generateAcknowledgment(currentVoice: VoiceSnapshot): CrossSessionAcknowledgment | null;
    /**
     * Mark a significant change as acknowledged
     */
    markAcknowledged(changeId: string): void;
    /**
     * Get cross-session patterns
     */
    getPatterns(): CrossSessionPatterns;
    /**
     * Get session history summary
     */
    getHistorySummary(): {
        totalSessions: number;
        averageEnergy: number;
        averageValence: number;
        recentTrend: string;
    };
    /**
     * Get memory for persistence
     */
    getMemory(): CrossSessionVoiceMemory;
    /**
     * Serialize for storage
     */
    serialize(): string;
    /**
     * Deserialize from storage
     */
    static deserialize(data: string): CrossSessionVoiceMemory;
    /**
     * Reset (clears all history)
     */
    reset(): void;
    private createInitialMemory;
    private detectChanges;
    private updatePatterns;
    private calculateSessionDuration;
    private createAcknowledgment;
    private createAcknowledgmentForChange;
}
export declare function getCrossSessionVoiceEngine(userId: string, existingMemory?: CrossSessionVoiceMemory): CrossSessionVoiceEngine;
export declare function resetCrossSessionVoiceEngine(userId: string): void;
export declare function resetAllCrossSessionVoiceEngines(): void;
export default CrossSessionVoiceEngine;
//# sourceMappingURL=cross-session-voice.d.ts.map
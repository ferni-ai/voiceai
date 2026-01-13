/**
 * User Experience Quality Metrics
 *
 * Tracks conversation quality and user experience:
 * - Conversation turns and length
 * - Interruption frequency
 * - Completion vs abandonment rates
 * - Silence gaps
 * - Session quality scores
 */
export type SessionEndReason = 'user_ended' | 'timeout' | 'error' | 'handoff' | 'unknown';
export interface ConversationTurn {
    id: string;
    sessionId: string;
    timestamp: number;
    speaker: 'user' | 'agent';
    wordCount: number;
    durationMs: number;
    wasInterrupted: boolean;
    silenceBeforeMs: number;
}
export interface SessionQuality {
    sessionId: string;
    startTime: number;
    endTime?: number;
    endReason?: SessionEndReason;
    turnCount: number;
    totalDurationMs: number;
    userWordCount: number;
    agentWordCount: number;
    interruptionCount: number;
    silenceGaps: number;
    echoEvents: number;
    qualityScore?: number;
}
export interface UXQualitySnapshot {
    avgTurnLength: number;
    avgTurnsPerSession: number;
    avgSessionDurationMs: number;
    avgInterruptionsPerSession: number;
    interruptionRate: number;
    completionRate: number;
    timeoutRate: number;
    errorEndRate: number;
    avgSilenceGapMs: number;
    longSilenceCount: number;
    silenceGapRate: number;
    avgQualityScore: number;
    lowQualitySessions: number;
    echoEventsTotal: number;
    sessionsWithEcho: number;
    avgUserWordsPerSession: number;
    avgAgentWordsPerSession: number;
    userToAgentRatio: number;
    totalSessions: number;
    activeSessions: number;
    windowStartTime: number;
    windowEndTime: number;
}
declare class UXQualityService {
    private turns;
    private sessions;
    private completedSessions;
    private readonly MAX_TURNS;
    private readonly MAX_COMPLETED_SESSIONS;
    /**
     * Start tracking a session
     */
    startSession(sessionId: string): void;
    /**
     * Record a conversation turn
     */
    recordTurn(turn: Omit<ConversationTurn, 'id' | 'timestamp'>): void;
    /**
     * Record an interruption
     */
    recordInterruption(sessionId: string): void;
    /**
     * Record an echo event
     */
    recordEchoEvent(sessionId: string): void;
    /**
     * End a session
     */
    endSession(sessionId: string, reason: SessionEndReason, qualityScore?: number): void;
    /**
     * Set quality score for active session
     */
    setQualityScore(sessionId: string, score: number): void;
    /**
     * Get snapshot
     */
    getSnapshot(windowMinutes?: number): UXQualitySnapshot;
    /**
     * Clear metrics
     */
    clear(): void;
}
export declare const uxQualityMetrics: UXQualityService;
export {};
//# sourceMappingURL=ux-quality.d.ts.map
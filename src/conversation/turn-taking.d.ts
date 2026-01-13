/**
 * Turn-Taking Monitor
 *
 * Tracks speaking balance between agent and user to ensure
 * natural conversation flow where neither party dominates.
 *
 * Key behaviors:
 * - Track duration of each speaker's turns
 * - Calculate speaking ratio (agent vs user)
 * - Signal when agent should invite user to speak
 * - Signal when agent should keep responses brief
 */
export interface TurnRecord {
    speaker: 'agent' | 'user';
    durationMs: number;
    timestamp: number;
}
export interface TurnTakingStats {
    agentTotalMs: number;
    userTotalMs: number;
    turnCount: number;
    agentTurnCount: number;
    userTurnCount: number;
    averageAgentTurnMs: number;
    averageUserTurnMs: number;
    speakingRatio: number;
    recentBalance: 'agent_heavy' | 'balanced' | 'user_heavy';
}
export declare class TurnTakingMonitor {
    private turns;
    private invitationPhrases;
    constructor();
    /**
     * Record a speaking turn
     */
    recordTurn(speaker: 'agent' | 'user' | 'jack', durationMs: number): void;
    /**
     * Get speaking ratio (agent time / total time)
     */
    getSpeakingRatio(): number;
    /**
     * Should the agent invite the user to speak?
     */
    shouldInviteUserToSpeak(): boolean;
    /**
     * Should the agent keep response brief?
     */
    shouldKeepResponseBrief(): boolean;
    /**
     * Get an invitation phrase to encourage user participation
     */
    getInvitation(): string;
    /**
     * Get comprehensive stats
     */
    getStats(): TurnTakingStats;
    /**
     * Reset for new session
     */
    reset(): void;
    private getRecentTurns;
}
/**
 * Get global turn-taking monitor
 */
export declare function getTurnTakingMonitor(): TurnTakingMonitor;
/**
 * Reset global turn-taking monitor
 */
export declare function resetTurnTakingMonitor(): void;
//# sourceMappingURL=turn-taking.d.ts.map
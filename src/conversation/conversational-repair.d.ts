/**
 * Conversational Repair Engine
 *
 * > "Wait, I think I misunderstood—let me try again."
 *
 * Detects when miscommunication happened and gracefully recovers:
 *
 * - **Misunderstanding Detection**: Recognize when we got it wrong
 * - **Confusion Signals**: User seems lost or frustrated
 * - **Topic Drift**: We went somewhere they didn't want to go
 * - **Tone Mismatch**: Our energy didn't match theirs
 * - **Graceful Recovery**: Natural repair phrases
 * - **Clarification Requests**: Know when to ask vs. infer
 *
 * Humans repair conversations constantly. This makes Ferni feel attentive.
 *
 * @module @ferni/conversational-repair
 */
export type MiscueType = 'misunderstanding' | 'tone_mismatch' | 'topic_unwanted' | 'assumption_wrong' | 'timing_off' | 'over_interpreted' | 'under_responded' | 'missed_point' | 'none';
export interface MiscueSignal {
    /** Type of potential miscue */
    type: MiscueType;
    /** Confidence (0-1) */
    confidence: number;
    /** Evidence for detection */
    evidence: string[];
    /** Severity */
    severity: 'minor' | 'moderate' | 'significant';
}
export interface RepairStrategy {
    /** Type of repair */
    type: 'acknowledge' | 'clarify' | 'redirect' | 'apologize' | 'reframe';
    /** Repair phrase */
    phrase: string;
    /** Follow-up question if needed */
    followUp: string | null;
    /** Whether to wait for user response */
    awaitResponse: boolean;
}
export interface RepairDecision {
    /** Should we attempt repair? */
    shouldRepair: boolean;
    /** What went wrong */
    miscue: MiscueSignal;
    /** How to fix it */
    strategy: RepairStrategy | null;
    /** Urgency level */
    urgency: 'low' | 'moderate' | 'high';
}
export interface ConversationTurn {
    speaker: 'user' | 'agent';
    message: string;
    turn: number;
    timestamp: number;
}
export declare class ConversationalRepairEngine {
    private conversationHistory;
    private repairAttempts;
    private turnCount;
    private consecutiveMiscues;
    private lastRepairTurn;
    constructor();
    /**
     * Record a conversation turn
     */
    recordTurn(speaker: 'user' | 'agent', message: string, turnCount: number): void;
    /**
     * Analyze user message for signs we need to repair
     *
     * @param userMessage - User's latest message
     * @param previousAgentMessage - What we said before
     * @returns Repair decision
     */
    analyze(userMessage: string, previousAgentMessage?: string): RepairDecision;
    /**
     * Record outcome of repair attempt
     */
    recordRepairOutcome(success: boolean): void;
    /**
     * Get a general check-in phrase to verify understanding
     */
    getCheckInPhrase(): string;
    /**
     * Get repair statistics
     */
    getStats(): {
        totalAttempts: number;
        successRate: number;
        typeBreakdown: Record<MiscueType, number>;
    };
    /**
     * Reset for new conversation
     */
    reset(): void;
    private checkSignals;
    private shouldAttemptRepair;
    private getRepairStrategy;
}
export declare function getConversationalRepairEngine(sessionId: string): ConversationalRepairEngine;
export declare function resetConversationalRepairEngine(sessionId: string): void;
export declare function clearConversationalRepairEngine(sessionId: string): void;
export declare function getActiveConversationalRepairCount(): number;
export default ConversationalRepairEngine;
//# sourceMappingURL=conversational-repair.d.ts.map
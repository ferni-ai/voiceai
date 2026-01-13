/**
 * Cross-Session Threader
 *
 * Tracks conversation threads that span multiple sessions.
 * Jack remembers unfinished discussions and can naturally continue them.
 *
 * Example: "Last time you were telling me about your mother's health
 * situation - we got cut off. Want to continue that conversation?"
 *
 * Features:
 * - Open thread detection (unfinished topics)
 * - Interrupted conversation tracking
 * - Topic continuity suggestions
 * - Follow-up question tracking
 * - Story/advice that was promised but not delivered
 */
/**
 * Why a thread is still open
 */
export type ThreadOpenReason = 'interrupted' | 'time_constraint' | 'topic_shifted' | 'promised_followup' | 'user_requested' | 'incomplete_advice' | 'emotional_pause' | 'unanswered_question';
/**
 * Priority for resuming a thread
 */
export type ThreadPriority = 'high' | 'medium' | 'low';
/**
 * An open conversation thread
 */
export interface OpenThread {
    id: string;
    createdAt: Date;
    lastUpdatedAt: Date;
    topic: string;
    subtopics: string[];
    summary: string;
    reason: ThreadOpenReason;
    reasonDetail?: string;
    lastUserMessage?: string;
    lastJackMessage?: string;
    emotionalWeight: 'light' | 'medium' | 'heavy';
    priority: ThreadPriority;
    suggestedResumption: string;
    questionsToAnswer: string[];
    promisedContent: string[];
    status: 'open' | 'resumed' | 'closed' | 'abandoned';
    sessionIdCreated: string;
    sessionIdResumed?: string;
    conversationTurnCount: number;
    relatedGoalIds: string[];
    relatedKeyMomentIds: string[];
}
/**
 * A promised follow-up
 */
export interface PromisedFollowUp {
    id: string;
    createdAt: Date;
    type: 'story' | 'advice' | 'calculation' | 'research' | 'check_in' | 'other';
    description: string;
    context: string;
    targetTimeframe?: string;
    delivered: boolean;
    deliveredAt?: Date;
}
/**
 * Session ending context for thread detection
 */
export interface SessionEndContext {
    endedNaturally: boolean;
    lastTopic: string;
    topicsDiscussed: string[];
    openQuestions: string[];
    emotionalState: string;
    userRequestedFollowUp: boolean;
    jackPromisedFollowUp: boolean;
    durationMinutes: number;
}
export declare class CrossSessionThreader {
    private userId;
    private openThreads;
    private promisedFollowUps;
    private currentSessionId;
    constructor(userId: string, existingThreads?: OpenThread[], existingFollowUps?: PromisedFollowUp[]);
    /**
     * Set the current session ID
     */
    setCurrentSession(sessionId: string): void;
    /**
     * Detect open threads when a session ends
     */
    detectOpenThreads(endContext: SessionEndContext): OpenThread[];
    /**
     * Create a thread record
     */
    private createThread;
    /**
     * Generate a natural message to resume a thread
     */
    private generateResumptionMessage;
    /**
     * Infer emotional weight from state
     */
    private inferEmotionalWeight;
    /**
     * Extract topic from a question
     */
    private extractTopicFromQuestion;
    /**
     * Get open threads sorted by priority
     */
    getOpenThreads(): OpenThread[];
    /**
     * Get the most important thread to resume
     */
    getTopThread(): OpenThread | null;
    /**
     * Mark a thread as resumed
     */
    resumeThread(threadId: string): void;
    /**
     * Mark a thread as closed
     */
    closeThread(threadId: string): void;
    /**
     * Add a promised follow-up
     */
    addPromisedFollowUp(type: PromisedFollowUp['type'], description: string, context: string, targetTimeframe?: string): PromisedFollowUp;
    /**
     * Mark a follow-up as delivered
     */
    markFollowUpDelivered(followUpId: string): void;
    /**
     * Get undelivered follow-ups
     */
    getUndeliveredFollowUps(): PromisedFollowUp[];
    /**
     * Get thread context for prompt injection
     */
    getThreadContext(): string;
    /**
     * Get a natural conversation starter if there are open threads
     */
    getConversationStarter(): string | null;
    /**
     * Get all data for persistence
     */
    getAllData(): {
        threads: OpenThread[];
        followUps: PromisedFollowUp[];
    };
    /**
     * Get stats
     */
    getStats(): {
        openThreads: number;
        resumedThreads: number;
        closedThreads: number;
        pendingFollowUps: number;
        deliveredFollowUps: number;
    };
}
export declare function getCrossSessionThreader(userId: string, existingThreads?: OpenThread[], existingFollowUps?: PromisedFollowUp[]): CrossSessionThreader;
export declare function removeCrossSessionThreader(userId: string): void;
export default CrossSessionThreader;
//# sourceMappingURL=cross-session.d.ts.map
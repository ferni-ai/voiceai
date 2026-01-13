/**
 * Session Priming
 *
 * Enhanced cross-session continuity that makes returning feel like
 * picking up a conversation with an old friend.
 *
 * Philosophy: When you reconnect with a close friend after time apart,
 * they don't greet you like a stranger. They might ask about that thing
 * you were worried about, reference a joke from last time, or simply
 * show through their warmth that they remember who you are.
 *
 * Session priming gives Ferni the context to do exactly this - naturally
 * and without feeling forced.
 */
import type { ConversationSummary, UserProfile } from '../types/user-profile.js';
import type { MemoryItem } from './advanced-retrieval.js';
/**
 * Open thread that can be continued
 */
export interface OpenThread {
    id: string;
    topic: string;
    lastMentioned: Date;
    context: string;
    suggestedOpener: string;
    priority: 'high' | 'medium' | 'low';
    emotionalWeight: number;
}
/**
 * Pending follow-up item
 */
export interface PendingFollowUp {
    id: string;
    commitment: string;
    madeOn: Date;
    dueDate?: Date;
    naturalPrompt: string;
    urgency: 'overdue' | 'due_soon' | 'future';
    context?: string;
}
/**
 * Emotional context from previous session
 */
export interface EmotionalContext {
    lastSessionMood: string;
    sessionEndState: 'positive' | 'neutral' | 'heavy' | 'unresolved';
    suggestedTone: string;
    carePoints: string[];
}
/**
 * Relationship context
 */
export interface RelationshipContext {
    sessionCount: number;
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    lastSessionGap: number;
    connectionStrength: number;
    knownPreferences: string[];
}
/**
 * Complete session priming result
 */
export interface SessionPrimingResult {
    /** Open threads that could be continued */
    openThreads: OpenThread[];
    /** Pending follow-ups to check on */
    pendingFollowUps: PendingFollowUp[];
    /** Emotional context from last session */
    emotionalContext: EmotionalContext;
    /** Relationship context */
    relationshipContext: RelationshipContext;
    /** Key memories to potentially reference */
    salientMemories: MemoryItem[];
    /** Suggested greeting/opener based on context */
    suggestedOpener: string;
    /** Things to avoid mentioning (sensitive topics not ready to revisit) */
    sensitiveTopics: string[];
}
/**
 * Configuration for session priming
 */
export interface SessionPrimingConfig {
    /** Maximum open threads to surface (default: 3) */
    maxOpenThreads: number;
    /** Maximum follow-ups to surface (default: 2) */
    maxFollowUps: number;
    /** Maximum salient memories (default: 5) */
    maxSalientMemories: number;
    /** Days before a topic becomes "stale" (default: 30) */
    staleDays: number;
    /** Whether to include sensitive topic avoidance (default: true) */
    includeSensitiveTopics: boolean;
}
export declare class SessionPrimer {
    private config;
    constructor(config?: Partial<SessionPrimingConfig>);
    /**
     * Generate complete priming context for a new session
     */
    generatePrimingContext(profile: UserProfile, memories: MemoryItem[], recentSummaries: ConversationSummary[]): Promise<SessionPrimingResult>;
    /**
     * Extract open threads from profile and recent conversations
     */
    private extractOpenThreads;
    /**
     * Extract pending follow-ups
     */
    private extractPendingFollowUps;
    /**
     * Analyze emotional context from last session
     */
    private analyzeEmotionalContext;
    /**
     * Build relationship context
     */
    private buildRelationshipContext;
    /**
     * Select most salient memories for potential reference
     */
    private selectSalientMemories;
    /**
     * Identify sensitive topics to avoid
     */
    private identifySensitiveTopics;
    /**
     * Generate suggested opener based on context
     */
    private generateOpener;
    private calculateUrgency;
    private generateEmotionalOpener;
    private generateFollowUpPrompt;
    private formatDate;
}
/**
 * Get the default session primer
 */
export declare function getSessionPrimer(config?: Partial<SessionPrimingConfig>): SessionPrimer;
/**
 * Reset the primer (for testing)
 */
export declare function resetSessionPrimer(): void;
declare const _default: {
    SessionPrimer: typeof SessionPrimer;
    getSessionPrimer: typeof getSessionPrimer;
    resetSessionPrimer: typeof resetSessionPrimer;
};
export default _default;
//# sourceMappingURL=session-priming.d.ts.map
/**
 * Conversation Feedback Types
 *
 * Shared types for the contextual feedback system.
 * Used across backend trigger engine, storage, and frontend UI.
 *
 * ARCHITECTURE NOTE:
 * This file is at level 10 (types/) so it can be imported by all layers
 * including memory (level 30). The full feedback service remains in
 * services/feedback/.
 *
 * @module types/feedback
 */
/**
 * What triggered the feedback prompt
 */
export type FeedbackTrigger = 'natural_pause' | 'topic_transition' | 'insight_moment' | 'explicit_ask';
/**
 * User's reaction to the conversation moment
 */
export type FeedbackReaction = 'resonated' | 'helpful' | 'too_much' | 'off_track' | 'skipped' | null;
/**
 * Context captured at feedback prompt time
 */
export interface FeedbackContext {
    /** Last message from the agent */
    lastAgentMessage: string;
    /** Last message from the user */
    lastUserMessage: string;
    /** Current topic if detected */
    topic?: string;
    /** Emotional tone of the conversation */
    emotionalTone?: 'positive' | 'neutral' | 'heavy' | 'light';
    /** Number of turns in the conversation */
    turnCount: number;
    /** Session duration at feedback time (ms) */
    sessionDuration: number;
}
/**
 * A stored feedback entry
 */
export interface FeedbackEntry {
    id: string;
    userId: string;
    sessionId: string;
    trigger: FeedbackTrigger;
    reaction: FeedbackReaction;
    context: FeedbackContext;
    promptedAt: Date;
    respondedAt?: Date;
    userComment?: string;
}
/**
 * Feedback statistics
 */
export interface FeedbackStats {
    totalPrompted: number;
    totalResponded: number;
    byReaction: Record<string, number>;
    byTrigger: Record<string, number>;
    averageResponseTime: number | null;
}
//# sourceMappingURL=feedback.d.ts.map
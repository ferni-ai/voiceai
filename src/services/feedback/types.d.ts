/**
 * Conversation Feedback Types
 *
 * Shared types for the contextual feedback system.
 * Used across backend trigger engine, storage, and frontend UI.
 *
 * ARCHITECTURE NOTE:
 * Core types (FeedbackTrigger, FeedbackReaction) are defined in types/feedback.ts
 * and re-exported here. This allows lower layers (memory) to import directly
 * from types/ without violating architecture.
 *
 * @module services/feedback/types
 */
export { type FeedbackTrigger, type FeedbackReaction, type FeedbackContext as BaseFeedbackContext, type FeedbackEntry, type FeedbackStats, } from '../../types/feedback.js';
import type { FeedbackTrigger, FeedbackReaction } from '../../types/feedback.js';
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
    /** Session duration in seconds */
    sessionDurationSec?: number;
}
/**
 * Complete feedback record stored in Firestore
 */
export interface ConversationFeedback {
    /** Unique feedback ID */
    id: string;
    /** User ID */
    userId: string;
    /** Session ID */
    sessionId: string;
    /** Persona ID (ferni, maya, etc.) */
    personaId: string;
    /** What triggered the feedback prompt */
    trigger: FeedbackTrigger;
    /** Context at feedback time */
    context: FeedbackContext;
    /** User's reaction */
    reaction: FeedbackReaction;
    /** When feedback was prompted */
    promptedAt: Date;
    /** When user responded (if they did) */
    respondedAt?: Date;
    /** Response time in milliseconds */
    responseTimeMs?: number;
    /** Did user engage with the prompt? */
    wasEngaged: boolean;
}
/**
 * Input for creating a feedback record (before user responds)
 */
export interface FeedbackPromptInput {
    userId: string;
    sessionId: string;
    personaId: string;
    trigger: FeedbackTrigger;
    context: FeedbackContext;
}
/**
 * Input for recording user's reaction
 */
export interface FeedbackReactionInput {
    feedbackId: string;
    userId: string;
    reaction: FeedbackReaction;
}
/**
 * Configuration for the feedback trigger engine
 */
export interface FeedbackTriggerConfig {
    /** Minimum pause duration (ms) after agent speaks to trigger */
    minPauseDurationMs: number;
    /** Minimum turns before prompting */
    minTurnsBeforePrompt: number;
    /** Cooldown between prompts (ms) */
    promptCooldownMs: number;
    /** Max prompts per session */
    maxPromptsPerSession: number;
    /** Probability of prompting (0-1) for variety */
    promptProbability: number;
}
/**
 * State tracked by the feedback trigger engine
 */
export interface FeedbackTriggerState {
    /** Last time a feedback prompt was shown */
    lastPromptAt: number;
    /** Number of prompts this session */
    promptsThisSession: number;
    /** Current turn count */
    turnCount: number;
    /** Is agent currently speaking? */
    agentSpeaking: boolean;
    /** Timestamp when agent stopped speaking */
    agentStoppedAt: number;
    /** Last agent message */
    lastAgentMessage: string;
    /** Last user message */
    lastUserMessage: string;
    /** Current topic */
    currentTopic?: string;
    /** Emotional tone */
    emotionalTone?: FeedbackContext['emotionalTone'];
}
/**
 * Result from checking if feedback should be triggered
 */
export interface FeedbackTriggerResult {
    /** Should we prompt for feedback? */
    shouldPrompt: boolean;
    /** What trigger type if prompting */
    trigger?: FeedbackTrigger;
    /** Reason for decision (for logging) */
    reason: string;
}
/**
 * Data message sent to frontend to prompt for feedback
 */
export interface FeedbackPromptEvent {
    type: 'feedback_prompt';
    /** Unique ID for this feedback prompt */
    feedbackId: string;
    /** Trigger type for UI customization */
    trigger: FeedbackTrigger;
    /** Available reactions to show */
    reactions: FeedbackReaction[];
    /** Auto-dismiss timeout (ms) */
    autoHideMs: number;
    /** Timestamp */
    timestamp: number;
}
/**
 * Data message received from frontend with user's reaction
 */
export interface UserFeedbackEvent {
    type: 'user_feedback';
    /** Feedback ID this is responding to */
    feedbackId: string;
    /** User's reaction */
    reaction: FeedbackReaction;
    /** Response time in ms */
    responseTimeMs: number;
    /** Timestamp */
    timestamp: number;
}
/**
 * Aggregated feedback statistics for a user
 */
export interface UserFeedbackStats {
    userId: string;
    /** Total feedback prompts shown */
    totalPrompts: number;
    /** Total responses (not skipped) */
    totalResponses: number;
    /** Response rate (0-1) */
    responseRate: number;
    /** Breakdown by reaction type */
    reactionCounts: Record<string, number>;
    /** Average response time (ms) */
    avgResponseTimeMs: number;
    /** Stats by persona */
    byPersona: Record<string, {
        prompts: number;
        resonated: number;
        helpful: number;
        tooMuch: number;
        offTrack: number;
    }>;
    /** Stats by trigger type */
    byTrigger: Record<FeedbackTrigger, {
        prompts: number;
        responses: number;
        positiveRate: number;
    }>;
    /** Last updated */
    lastUpdated: Date;
}
/**
 * Insights derived from feedback patterns
 */
export interface FeedbackInsights {
    userId: string;
    /** Per-persona resonance rates */
    personaResonance: Record<string, number>;
    /** Topics that land well */
    topicsWell: string[];
    /** Topics that fall flat */
    topicsFlat: string[];
    /** Preferred conversation depth */
    preferredDepth: 'shallow' | 'medium' | 'deep';
    /** Best time of day for engagement */
    bestTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    /** Skip patterns */
    skipPatterns: {
        highSkipTopics: string[];
        highSkipPersonas: string[];
    };
    /** Generated at */
    generatedAt: Date;
}
//# sourceMappingURL=types.d.ts.map
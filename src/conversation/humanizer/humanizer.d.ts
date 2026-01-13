/**
 * Conversation Humanizer - Main Orchestrator
 *
 * Coordinates all humanizing features to create natural conversations.
 * This is a facade that composes PreLlmProcessor and PostLlmProcessor.
 *
 * ⚠️ MIGRATION NOTICE:
 * For POST-LLM humanization in the voice agent, use the unified API instead:
 *
 * ```typescript
 * // New unified API (preferred for voice agent)
 * import {
 *   initConversationSession,
 *   humanizeAgentResponse,
 *   cleanupConversationSession,
 * } from './agents/integrations/conversation-session-integration.js';
 * ```
 *
 * This file is still used for:
 * - PRE-LLM context building (processUserMessage, getPreResponseActions)
 * - Context builders (conversation-humanizing.ts)
 * - Legacy integrations
 *
 * @see unified-integration.ts for the new unified POST-LLM API
 * @module @ferni/conversation/humanizer
 */
import type { ContextGuidance, HumanizationContext, HumanizedResponse, PreResponseActions } from './types.js';
/**
 * Main humanizer class that coordinates pre-LLM and post-LLM processing
 */
export declare class ConversationHumanizer {
    private personaId;
    private sessionId;
    private userId?;
    private sessionCount;
    private sessionStartTime;
    private preLlm;
    private postLlm;
    constructor(personaId: string, sessionId?: string, userId?: string, sessionCount?: number);
    /**
     * Set session and user IDs for session intelligence
     */
    setSessionContext(sessionId: string, userId?: string): void;
    /**
     * Set session count (for Better Than Human capabilities)
     */
    setSessionCount(count: number): void;
    /**
     * Get session duration in minutes
     */
    getSessionMinutes(): number;
    /**
     * Reset session start time (for new sessions)
     */
    resetSession(): void;
    /**
     * Change persona
     */
    setPersona(personaId: string): void;
    /**
     * Process incoming user message
     * Records context and returns pre-response actions
     */
    processUserMessage(context: HumanizationContext): PreResponseActions;
    /**
     * Generate context guidance for LLM prompt injection
     */
    generateContextGuidance(context: HumanizationContext): ContextGuidance[];
    /**
     * Format context guidance for prompt injection
     */
    formatGuidanceForPrompt(guidance: ContextGuidance[]): string;
    /**
     * Humanize a response (sync version - basic features)
     */
    humanizeResponse(rawResponse: string, context: HumanizationContext): HumanizedResponse;
    /**
     * Humanize a response with full deep humanization (async)
     *
     * @deprecated For voice agent POST-LLM humanization, use the unified API instead
     */
    humanizeResponseAsync(rawResponse: string, context: HumanizationContext): Promise<HumanizedResponse>;
    /**
     * Get the last session insight (for external use)
     */
    getLastSessionInsight(): import("../session-intelligence.js").SessionIntelligenceInsight | null;
    /**
     * Get the last Better Than Human insight (for external use)
     */
    getLastBetterThanHumanInsight(): import("../superhuman/types.js").BetterThanHumanInsight | null;
    /**
     * Get the current conversation mood
     */
    getMood(): import("../index.js").ConversationMood;
    /**
     * Record user reaction to a memory callback
     */
    recordUserReactionToCallback(userResponseLength: number, wasEngaged: boolean): void;
    /**
     * Record backchannel reaction
     */
    recordBackchannelReaction(wasPositive: boolean): void;
    /**
     * Check if last response had a memory callback
     */
    wasLastResponseCallback(): boolean;
    /**
     * Get a thinking phrase when processing
     */
    getThinkingPhrase(type?: 'processing' | 'recalling' | 'considering' | 'uncertain', turnNumber?: number): {
        text: string;
        ssml: string;
    };
    /**
     * Generate an echo question from user statement
     */
    generateEchoQuestion(userStatement: string): {
        text: string;
        ssml: string;
    };
    /**
     * Get a conversation callback for circling back to a topic
     */
    getCircleBackPhrase(topic: string): string;
    /**
     * Get unresolved conversation threads
     */
    getUnresolvedThreads(): string[];
    /**
     * Mark a topic as resolved
     */
    resolveThread(topic: string): void;
    /**
     * Get conversation summary for persistence
     */
    getConversationSummary(): {
        keyTopics: string[];
        userStatements: import("../conversational-memory.js").UserStatement[];
        unresolvedThreads: string[];
        commitments: import("../conversational-memory.js").ConversationCommitment[];
    };
    /**
     * Reset all state for new conversation
     */
    reset(): void;
}
export declare function getConversationHumanizer(personaId: string): ConversationHumanizer;
export declare function resetConversationHumanizer(personaId?: string): void;
export default ConversationHumanizer;
//# sourceMappingURL=humanizer.d.ts.map
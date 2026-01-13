/**
 * Post-LLM Processing
 *
 * Handles humanization after the LLM generates a response:
 * - Speech naturalization
 * - Deep humanization (mood, presence, reactions)
 * - Session intelligence modifications
 * - Better Than Human capabilities
 * - Vocal humanization
 *
 * @module @ferni/conversation/humanizer/post-llm
 */
import { type SessionIntelligenceInsight } from '../session-intelligence.js';
import { type BetterThanHumanInsight } from '../superhuman/index.js';
import type { HumanizationContext, HumanizedResponse } from './types.js';
/**
 * Processes responses after LLM generation
 */
export declare class PostLlmProcessor {
    private personaId;
    private sessionId;
    private userId?;
    private sessionCount;
    private sessionStartTime;
    private naturalizer;
    private listening;
    private memory;
    private questions;
    private emotional;
    private dynamics;
    private silencePresence;
    private lastResponseHadCallback;
    private lastSessionInsight;
    private lastBetterThanHumanInsight;
    constructor(personaId: string, sessionId: string, userId?: string, sessionCount?: number, sessionStartTime?: number);
    /**
     * Get session duration in minutes
     */
    getSessionMinutes(): number;
    /**
     * Get the last session insight
     */
    getLastSessionInsight(): SessionIntelligenceInsight | null;
    /**
     * Get the last Better Than Human insight
     */
    getLastBetterThanHumanInsight(): BetterThanHumanInsight | null;
    /**
     * Synchronous humanization (basic features only)
     */
    humanizeResponse(rawResponse: string, context: HumanizationContext): HumanizedResponse;
    /**
     * Full async humanization with all capabilities
     */
    humanizeResponseAsync(rawResponse: string, context: HumanizationContext): Promise<HumanizedResponse>;
    private emitSignals;
    private applySilencePresence;
    private applyBetterThanHuman;
    private applyAdvancedHumanization;
    /**
     * Get thinking phrase
     */
    getThinkingPhrase(type?: 'processing' | 'recalling' | 'considering' | 'uncertain', turnNumber?: number): {
        text: string;
        ssml: string;
    };
    /**
     * Get the current conversation mood
     */
    getMood(): import("../deep-humanization/types.js").ConversationMood;
    /**
     * Check if last response had callback
     */
    wasLastResponseCallback(): boolean;
    /**
     * Record user reaction to callback
     */
    recordUserReactionToCallback(userResponseLength: number, wasEngaged: boolean): void;
    /**
     * Record backchannel reaction
     */
    recordBackchannelReaction(wasPositive: boolean): void;
    /**
     * Reset all state
     */
    reset(): void;
}
//# sourceMappingURL=post-llm.d.ts.map
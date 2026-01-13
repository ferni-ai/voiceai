/**
 * Conversation-Aware Prosody System
 *
 * Inspired by Sesame AI's approach: "Speech generation must go beyond
 * producing high-quality audio—it must understand and adapt to context
 * in real time."
 *
 * This module tracks emotional state across the conversation and
 * recommends prosody adjustments based on conversational context,
 * not just the current message.
 *
 * @module speech/sesame-inspired/conversation-prosody
 */
import type { CartesiaEmotion } from '../cartesia-expressiveness.js';
import type { ConversationEmotionalState, ConversationProsodyRecommendation, EmotionalTrajectory } from './types.js';
/**
 * Calculate emotional trajectory from history
 */
export declare function calculateTrajectory(emotionHistory: CartesiaEmotion[]): EmotionalTrajectory;
/**
 * Check if current emotions indicate a heavy topic
 */
export declare function isHeavyTopic(currentEmotion: CartesiaEmotion, history: CartesiaEmotion[]): boolean;
/**
 * Get prosody recommendation based on conversation state
 */
export declare function getProsodyRecommendation(state: ConversationEmotionalState): ConversationProsodyRecommendation;
/**
 * Get current emotional state for a session
 */
export declare function getConversationState(sessionId: string): ConversationEmotionalState;
/**
 * Update emotional state with new detected emotion
 */
export declare function updateConversationState(sessionId: string, newEmotion: CartesiaEmotion): ConversationEmotionalState;
/**
 * Get prosody recommendation for current session state
 */
export declare function getSessionProsodyRecommendation(sessionId: string): ConversationProsodyRecommendation;
/**
 * Reset session state
 */
export declare function resetConversationState(sessionId: string): void;
/**
 * Get active session count
 */
export declare function getActiveConversationStateCount(): number;
/**
 * Apply prosody recommendation to text
 */
export declare function applyProsodyRecommendation(text: string, recommendation: ConversationProsodyRecommendation): string;
/**
 * Add context-appropriate pause at beginning
 */
export declare function addContextualPause(text: string, recommendation: ConversationProsodyRecommendation): string;
//# sourceMappingURL=conversation-prosody.d.ts.map
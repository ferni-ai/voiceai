/**
 * Micro-Reactions System
 *
 * Inspired by Sesame AI's ability to produce immediate, natural vocal
 * reactions during conversation. These are small sounds (< 150ms) that
 * show active listening and emotional presence.
 *
 * Sesame noted: "The model can laugh, change pace, emphasize, give
 * expressive cues, and even detect your mood from your voice."
 *
 * @module speech/sesame-inspired/micro-reactions
 */
import type { MicroReaction, MicroReactionType, MicroReactionContext } from './types.js';
/**
 * Complete library of micro-reactions with SSML
 */
export declare const MICRO_REACTIONS: Record<MicroReactionType, MicroReaction>;
/**
 * Detect the current conversational context from text
 */
export declare function detectContext(text: string): MicroReactionContext | null;
/**
 * Detect multiple contexts (for complex messages)
 */
export declare function detectContexts(text: string): MicroReactionContext[];
/**
 * Get appropriate micro-reactions for a context
 */
export declare function getReactionsForContext(context: MicroReactionContext): MicroReaction[];
/**
 * Select the best micro-reaction for given text
 *
 * Returns null if no appropriate reaction found or if reaction
 * would feel forced.
 */
export declare function selectMicroReaction(text: string, recentReactions?: MicroReactionType[]): MicroReaction | null;
/**
 * Get a specific micro-reaction by type
 */
export declare function getMicroReaction(type: MicroReactionType): MicroReaction;
/**
 * Compound reactions for strong emotional moments
 */
export declare const COMPOUND_REACTIONS: {
    big_surprise: string;
    deep_empathy: string;
    excited_celebration: string;
    gentle_understanding: string;
    playful_delight: string;
    concerned_support: string;
};
/**
 * Get compound reaction for intense emotional moments
 */
export declare function getCompoundReaction(contexts: MicroReactionContext[]): string | null;
interface MicroReactionSession {
    recentReactions: MicroReactionType[];
    reactionCount: number;
    lastReactionTime: number;
}
/**
 * Get or create session
 */
export declare function getMicroReactionSession(sessionId: string): MicroReactionSession;
/**
 * Record a reaction being used
 */
export declare function recordReaction(sessionId: string, type: MicroReactionType): void;
/**
 * Check if we should use a reaction (rate limiting)
 */
export declare function shouldUseReaction(sessionId: string): boolean;
/**
 * Get contextual micro-reaction for session
 */
export declare function getSessionMicroReaction(sessionId: string, text: string): MicroReaction | null;
/**
 * Reset session
 */
export declare function resetMicroReactionSession(sessionId: string): void;
/**
 * Get active session count
 */
export declare function getActiveMicroReactionSessionCount(): number;
export {};
//# sourceMappingURL=micro-reactions.d.ts.map
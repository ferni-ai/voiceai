/**
 * Rich Disfluency System
 *
 * Inspired by Sesame AI: "Natural speech requires appropriate disfluencies,
 * restarts, and laughter."
 *
 * This module provides a rich library of natural speech patterns including:
 * - Filled pauses ("um", "uh", "er")
 * - Self-corrections ("Wait, no. Let me rephrase.")
 * - False starts ("So— actually, before that—")
 * - Trailing off ("And then...")
 * - Thinking aloud ("Let me think...")
 * - Word searches ("What's the word...")
 *
 * @module speech/sesame-inspired/rich-disfluencies
 */
import type { CartesiaEmotion } from '../cartesia-expressiveness.js';
import type { DisfluencyType, DisfluencyPattern, DisfluencyInjection } from './types.js';
/**
 * Comprehensive disfluency patterns with SSML
 */
export declare const DISFLUENCY_PATTERNS: Record<DisfluencyType, DisfluencyPattern>;
/**
 * Get disfluencies appropriate for an emotional context
 */
export declare function getDisfluenciesForEmotion(emotion: CartesiaEmotion): DisfluencyPattern[];
/**
 * Select a random disfluency based on weights
 */
export declare function selectWeightedDisfluency(patterns: DisfluencyPattern[]): DisfluencyPattern | null;
/**
 * Get a random SSML pattern from a disfluency
 */
export declare function getRandomSsmlPattern(pattern: DisfluencyPattern): string;
/**
 * Find natural injection points in text
 */
export declare function findInjectionPoints(text: string): {
    position: number;
    type: 'sentence' | 'clause' | 'start';
}[];
/**
 * Inject disfluency at a natural point
 */
export declare function injectDisfluency(text: string, emotion: CartesiaEmotion, probability?: number): DisfluencyInjection | null;
/**
 * Add a thinking pause at the start of a response
 */
export declare function addThinkingStart(text: string): string;
/**
 * Add a realizing moment mid-thought
 */
export declare function addRealizationMoment(text: string): string;
/**
 * Add a trailing off at the end
 */
export declare function addTrailingOff(text: string): string;
/**
 * Add self-interruption for excited delivery
 */
export declare function addExcitedInterruption(text: string): string;
interface DisfluencySession {
    recentTypes: DisfluencyType[];
    injectionCount: number;
    lastInjectionTurn: number;
}
/**
 * Get or create session
 */
export declare function getDisfluencySession(sessionId: string): DisfluencySession;
/**
 * Smart injection that avoids repetition and overuse
 */
export declare function smartInjectDisfluency(sessionId: string, text: string, emotion: CartesiaEmotion, turnNumber: number): DisfluencyInjection | null;
/**
 * Reset session
 */
export declare function resetDisfluencySession(sessionId: string): void;
/**
 * Get active session count
 */
export declare function getActiveDisfluencySessionCount(): number;
export {};
//# sourceMappingURL=rich-disfluencies.d.ts.map
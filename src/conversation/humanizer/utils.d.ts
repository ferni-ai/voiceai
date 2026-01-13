/**
 * Humanizer Utilities
 *
 * Shared utility functions for the humanizer modules.
 *
 * @module @ferni/conversation/humanizer/utils
 */
import type { RelationshipStage, BetterThanHumanStage, TimeOfDay } from './types.js';
/**
 * Create a deterministic trigger function for stable behavior.
 * Avoids Math.random() so the same session/turn behaves consistently.
 */
export declare function createDeterministicTrigger(sessionId: string, personaId: string): (turnNumber: number, feature: string, probability: number) => boolean;
/**
 * Get comfort level from relationship stage
 */
export declare function getComfortLevel(stage?: RelationshipStage): number;
/**
 * Map relationship stage to Better Than Human format
 */
export declare function mapRelationshipStage(stage?: RelationshipStage): BetterThanHumanStage;
/**
 * Get time of day category
 */
export declare function getTimeOfDay(): TimeOfDay;
/**
 * Strip SSML tags from text
 */
export declare function stripSsml(text: string): string;
/**
 * Apply SSML enhancements based on emotional guidance
 */
export declare function applySsmlEnhancements(text: string, guidance: {
    suggestedEmotion?: string;
    warmthLevel?: string;
    pauseFrequency?: string;
} | null): string;
/**
 * Check if uncertainty should be added to response
 */
export declare function shouldAddUncertainty(text: string, context: {
    turnNumber: number;
    userMessage?: string;
}, shouldTrigger: (turnNumber: number, feature: string, probability: number) => boolean): boolean;
//# sourceMappingURL=utils.d.ts.map
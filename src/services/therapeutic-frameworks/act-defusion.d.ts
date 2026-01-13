/**
 * ACT Defusion Techniques
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Cognitive defusion helps people step back from thoughts and see them
 * as just thoughts—not facts, not commands, not reality.
 *
 * PHILOSOPHY:
 * The goal isn't to change the thought or argue with it.
 * It's to change your relationship to the thought.
 * "I'm a failure" → "I'm having the thought that I'm a failure."
 *
 * @module TherapeuticFrameworks/ACTDefusion
 */
import type { DefusionTechnique } from './types.js';
export declare const DEFUSION_TECHNIQUES: Record<string, DefusionTechnique>;
/**
 * Select the best defusion technique for the situation.
 */
export declare function selectDefusionTechnique(context: {
    thought?: string;
    thoughtType?: string;
    emotionIntensity?: number;
    userPreferences?: string[];
    previousTechniques?: string[];
}): DefusionTechnique;
/**
 * Get all defusion techniques.
 */
export declare function getAllDefusionTechniques(): DefusionTechnique[];
/**
 * Get a defusion technique by ID.
 */
export declare function getDefusionTechnique(id: string): DefusionTechnique | null;
/**
 * Record a defusion technique use.
 */
export declare function recordDefusionUse(userId: string, techniqueId: string, options?: {
    helpfulnessRating?: number;
    thoughtType?: string;
}): void;
/**
 * Get most effective techniques for a user.
 */
export declare function getMostEffectiveDefusion(userId: string): string[];
/**
 * Get recently used techniques.
 */
export declare function getRecentDefusionTechniques(userId: string, limit?: number): string[];
/**
 * Build defusion context for the LLM.
 */
export declare function buildDefusionContext(userId: string, detectedThought?: string): string | null;
//# sourceMappingURL=act-defusion.d.ts.map
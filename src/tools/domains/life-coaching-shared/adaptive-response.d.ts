/**
 * Adaptive Response Generator
 *
 * Generates personalized responses based on user profile,
 * emotional state, and psychological frameworks.
 *
 * This is what makes Ferni "state of the art" - not just
 * scripts, but dynamically adapted responses.
 */
import type { ResponseContext, AdaptationOptions, FourTendency, EmotionalState, LifeCoachingProfile } from './types.js';
/**
 * How to frame requests for each tendency
 */
export declare const TENDENCY_FRAMINGS: Record<FourTendency, {
    motivation: string;
    accountability: string;
    resistance: string;
    language: string[];
}>;
/**
 * Adapt a message for a specific tendency
 */
export declare function adaptForTendency(message: string, tendency?: FourTendency): string;
/**
 * Validation phrases for different emotional states
 */
export declare const EMOTIONAL_VALIDATIONS: Record<EmotionalState, string[]>;
/**
 * Get appropriate validation for emotional state
 */
export declare function getEmotionalValidation(state?: EmotionalState): string | null;
/**
 * Generate an adaptive response with all personalization layers
 */
export declare function generateAdaptiveResponse(baseContent: string, context: ResponseContext, options?: AdaptationOptions): string;
/**
 * Detect people-pleasing patterns
 */
export declare function detectPeoplePleasing(text: string): number;
/**
 * Recognize and celebrate progress
 */
export declare function recognizeProgress(profile: LifeCoachingProfile, domain: string): string | null;
//# sourceMappingURL=adaptive-response.d.ts.map
/**
 * Superhuman Orchestrator Helpers
 *
 * Detection and assessment utilities.
 *
 * @module @ferni/superhuman/orchestrator/helpers
 */
import type { BetterThanHumanContext } from '../types.js';
/**
 * Assess topic weight
 */
export declare function assessTopicWeight(context: BetterThanHumanContext): 'light' | 'medium' | 'heavy';
/**
 * Assess user energy level
 */
export declare function assessUserEnergy(message: string): 'high' | 'medium' | 'low';
/**
 * Assess recent tone
 */
export declare function assessRecentTone(context: BetterThanHumanContext): 'heavy' | 'light' | 'neutral';
/**
 * Check for emotional content
 */
export declare function hasEmotionalContent(context: BetterThanHumanContext): boolean;
/**
 * Check for laughter
 */
export declare function hasLaughter(message: string): boolean;
/**
 * Detect personal growth
 */
export declare function detectGrowth(message: string): boolean;
/**
 * Detect breakthrough moments
 */
export declare function detectBreakthrough(message: string): boolean;
/**
 * Detect resolution
 */
export declare function detectResolution(message: string): boolean;
/**
 * Detect concerns
 */
export declare function detectConcerns(message: string): boolean;
/**
 * Calculate energy level (0-1 scale)
 */
export declare function calculateEnergyLevel(message: string): number;
//# sourceMappingURL=helpers.d.ts.map
/**
 * Outdoor Activity Advice Tool
 *
 * Combines weather, air quality, UV, and pollen into a single
 * comprehensive recommendation for outdoor activities.
 *
 * "Better than human": A friend might say "nice day for a run."
 * We say "Great day for a run! Air quality is good, UV is moderate
 * (sunscreen recommended), and pollen is low. Best time is before 11am
 * when UV peaks. Enjoy!"
 */
import type { UserHealthContext } from './types.js';
interface ActivityOptions {
    activity?: 'running' | 'cycling' | 'hiking' | 'walking' | 'sports' | 'general';
    duration?: number;
    userContext?: Partial<UserHealthContext>;
}
/**
 * Get comprehensive outdoor activity advice
 *
 * @param location - City name or address
 * @param options - Activity type, duration, and user health context
 * @returns Formatted advice for outdoor activity
 */
export declare function getOutdoorActivityAdvice(location: string, options?: ActivityOptions): Promise<string>;
/**
 * Quick check if it's good to exercise outside
 * Returns a simple yes/no with brief reason
 */
export declare function shouldExerciseOutside(location: string, hasAllergies?: boolean, hasAsthma?: boolean): Promise<{
    recommended: boolean;
    reason: string;
}>;
export {};
//# sourceMappingURL=outdoor-advice.d.ts.map
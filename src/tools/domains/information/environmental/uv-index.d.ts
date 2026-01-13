/**
 * UV Index Tools
 *
 * Fetches UV index data and provides skin-type-aware recommendations.
 * Uses Open-Meteo API (free, no key required).
 *
 * "Better than human": A friend might say "it's sunny, wear sunscreen."
 * We say "UV is 8 today. With your fair skin, you'll burn in about 15 minutes
 * without protection. Peak UV is between 11am-2pm."
 */
import type { SkinType } from './types.js';
/**
 * Get current UV index for a location
 *
 * @param location - City name or address
 * @param skinType - Optional skin type for personalized advice
 * @returns Formatted UV index report
 */
export declare function getUVIndex(location: string, skinType?: SkinType): Promise<string>;
/**
 * Get a brief UV summary (for use in other tools like daily briefing)
 */
export declare function getUVSummary(location: string): Promise<string | null>;
/**
 * Check if UV is safe for extended outdoor activity
 */
export declare function isUVSafeForOutdoors(location: string, duration?: number, // minutes
skinType?: SkinType): Promise<{
    safe: boolean;
    reason: string;
    uvIndex: number;
}>;
//# sourceMappingURL=uv-index.d.ts.map
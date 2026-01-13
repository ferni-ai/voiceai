/**
 * Pollen Forecast Tools
 *
 * Fetches pollen data and provides allergy-aware recommendations.
 * Uses Open-Meteo API (free, no key required).
 *
 * "Better than human": A friend might say "allergies are bad today."
 * We proactively warn you BEFORE you step outside, know which specific
 * pollen is high, and remember you mentioned allergies last spring.
 */
import type { PollenLevel } from './types.js';
/**
 * Get current pollen levels for a location
 *
 * @param location - City name or address
 * @param userAllergies - Optional array of specific allergies
 * @returns Formatted pollen report
 */
export declare function getPollenForecast(location: string, userAllergies?: string[]): Promise<string>;
/**
 * Get a brief pollen summary (for use in other tools like daily briefing)
 */
export declare function getPollenSummary(location: string): Promise<string | null>;
/**
 * Check if pollen levels are safe for someone with allergies
 */
export declare function isPollenSafeForAllergies(location: string, allergyTypes?: string[]): Promise<{
    safe: boolean;
    reason: string;
    level: PollenLevel;
}>;
//# sourceMappingURL=pollen.d.ts.map
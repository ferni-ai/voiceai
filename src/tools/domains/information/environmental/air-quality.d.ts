/**
 * Air Quality Tools
 *
 * Fetches real-time air quality data and provides health recommendations.
 * Uses Open-Meteo Air Quality API (free, no key required).
 *
 * "Better than human": No friend tracks AQI for you daily or knows
 * that you have asthma and should avoid outdoor exercise today.
 */
/**
 * Get current air quality for a location
 *
 * @param location - City name or address
 * @returns Formatted air quality report
 */
export declare function getAirQuality(location: string): Promise<string>;
/**
 * Check if air quality is safe for outdoor exercise
 *
 * @param location - City name or address
 * @param hasRespiratoryCondition - User has asthma/COPD
 * @returns Boolean indicating if outdoor exercise is recommended
 */
export declare function isAirQualitySafeForExercise(location: string, hasRespiratoryCondition?: boolean): Promise<{
    safe: boolean;
    reason: string;
    aqi: number;
}>;
/**
 * Get a brief AQI summary (for use in other tools like daily briefing)
 */
export declare function getAirQualitySummary(location: string): Promise<string | null>;
//# sourceMappingURL=air-quality.d.ts.map
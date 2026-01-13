/**
 * Environmental Health Tools
 *
 * Domain: Environmental factors affecting health and outdoor activities.
 * Provides air quality, UV index, pollen forecasts, and activity recommendations.
 *
 * "Better than human": No friend checks AQI, UV, and pollen for you daily.
 * We do, and we know if you have allergies or sensitive skin.
 *
 * TOOLS:
 *   getAirQuality       - Current AQI with health recommendations
 *   getUVIndex          - UV levels with skin-type-aware burn time
 *   getPollenForecast   - Pollen by type with allergy advice
 *   getOutdoorAdvice    - Combined recommendation for outdoor activities
 *   shouldIRunOutside   - Quick yes/no for outdoor exercise
 */
import type { ToolDefinition } from '../../../registry/types.js';
import { getAirQuality, getAirQualitySummary, isAirQualitySafeForExercise } from './air-quality.js';
import { getUVIndex, getUVSummary, isUVSafeForOutdoors } from './uv-index.js';
import { getPollenForecast, getPollenSummary, isPollenSafeForAllergies } from './pollen.js';
import { getOutdoorActivityAdvice, shouldExerciseOutside } from './outdoor-advice.js';
export * from './types.js';
export { getAirQuality, getAirQualitySummary, isAirQualitySafeForExercise, getUVIndex, getUVSummary, isUVSafeForOutdoors, getPollenForecast, getPollenSummary, isPollenSafeForAllergies, getOutdoorActivityAdvice, shouldExerciseOutside, };
export declare const environmentalToolDefinitions: ToolDefinition[];
/**
 * Get environmental tool definitions
 */
export declare function getEnvironmentalToolDefinitions(): ToolDefinition[];
/**
 * Get brief environmental summary for morning briefing
 */
export declare function getEnvironmentalBriefing(location: string): Promise<string | null>;
//# sourceMappingURL=index.d.ts.map
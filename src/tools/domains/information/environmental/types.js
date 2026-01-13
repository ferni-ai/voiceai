/**
 * Environmental Health Types
 *
 * Type definitions for air quality, UV, pollen, and outdoor activity tools.
 */
export const AQI_THRESHOLDS = {
    good: { min: 0, max: 50, color: 'green' },
    moderate: { min: 51, max: 100, color: 'yellow' },
    unhealthy_sensitive: { min: 101, max: 150, color: 'orange' },
    unhealthy: { min: 151, max: 200, color: 'red' },
    very_unhealthy: { min: 201, max: 300, color: 'purple' },
    hazardous: { min: 301, max: 500, color: 'maroon' },
};
export const UV_THRESHOLDS = {
    low: { min: 0, max: 2 },
    moderate: { min: 3, max: 5 },
    high: { min: 6, max: 7 },
    very_high: { min: 8, max: 10 },
    extreme: { min: 11, max: 15 },
};
export const SKIN_TYPE_BURN_TIMES = {
    very_fair: 10, // Minutes to burn without protection at UV 6
    fair: 15,
    medium: 20,
    olive: 30,
    brown: 45,
    dark: 60,
};
export const POLLEN_DESCRIPTIONS = {
    none: 'No significant pollen detected',
    low: 'Low pollen - good day for outdoor activities',
    moderate: 'Moderate pollen - sensitive individuals may notice symptoms',
    high: 'High pollen - allergy sufferers should take precautions',
    very_high: 'Very high pollen - consider staying indoors if you have allergies',
};
//# sourceMappingURL=types.js.map
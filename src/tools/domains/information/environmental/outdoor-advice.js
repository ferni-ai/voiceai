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
import { getLogger } from '../../../../utils/safe-logger.js';
import { geocodeLocation, formatLocationName } from '../utils/geocoding.js';
import { isAirQualitySafeForExercise } from './air-quality.js';
import { isUVSafeForOutdoors } from './uv-index.js';
import { isPollenSafeForAllergies } from './pollen.js';
const log = getLogger();
// ============================================================================
// ACTIVITY-SPECIFIC THRESHOLDS
// ============================================================================
const ACTIVITY_INTENSITY = {
    running: 'high',
    cycling: 'high',
    hiking: 'moderate',
    sports: 'high',
    walking: 'low',
    general: 'moderate',
};
// ============================================================================
// MAIN FUNCTION
// ============================================================================
/**
 * Get comprehensive outdoor activity advice
 *
 * @param location - City name or address
 * @param options - Activity type, duration, and user health context
 * @returns Formatted advice for outdoor activity
 */
export async function getOutdoorActivityAdvice(location, options = {}) {
    const startTime = Date.now();
    const { activity = 'general', duration = 60, userContext = {} } = options;
    log.info({ location, activity, duration }, '🏃 Getting outdoor activity advice');
    // Geocode the location
    const geo = await geocodeLocation(location);
    if (!geo) {
        return `I couldn't find "${location}". Try a city name like "Philadelphia" or "Seattle".`;
    }
    const locationName = formatLocationName(geo);
    // Fetch all environmental factors in parallel
    const [airQualityCheck, uvCheck, pollenCheck] = await Promise.all([
        isAirQualitySafeForExercise(location, userContext.hasAsthma),
        isUVSafeForOutdoors(location, duration, userContext.skinType || 'medium'),
        isPollenSafeForAllergies(location, userContext.allergyTypes),
    ]);
    // Analyze each factor
    const factors = analyzeFactors(airQualityCheck, uvCheck, pollenCheck, activity);
    // Calculate overall rating
    const overallRating = calculateOverallRating(factors);
    // Generate recommendation
    const advice = generateAdvice(locationName, activity, overallRating, factors, airQualityCheck, uvCheck, pollenCheck);
    log.info({ location: locationName, activity, overall: overallRating, elapsed: Date.now() - startTime }, '🏃 Outdoor advice generated');
    return advice;
}
/**
 * Analyze environmental factors
 */
function analyzeFactors(aq, uv, pollen, activity) {
    const intensity = ACTIVITY_INTENSITY[activity] || 'moderate';
    // Air quality - more important for high intensity
    const aqImpact = aq.safe
        ? 'positive'
        : intensity === 'high'
            ? 'severe'
            : 'negative';
    const airQuality = {
        value: `AQI ${aq.aqi}`,
        impact: aqImpact,
        advice: !aq.safe ? aq.reason : undefined,
    };
    // UV - important for all outdoor activities
    const uvImpact = uv.safe
        ? uv.uvIndex <= 3
            ? 'positive'
            : 'neutral'
        : uv.uvIndex >= 8
            ? 'severe'
            : 'negative';
    const uvIndex = {
        value: `UV ${uv.uvIndex}`,
        impact: uvImpact,
        advice: !uv.safe ? uv.reason : undefined,
    };
    // Pollen - depends on user allergies
    const pollenImpact = pollen.safe
        ? 'positive'
        : pollen.level === 'very_high'
            ? 'severe'
            : 'negative';
    const pollenFactor = {
        value: pollen.level,
        impact: pollenImpact,
        advice: !pollen.safe ? pollen.reason : undefined,
    };
    return {
        weather: { value: 'checking...', impact: 'neutral' }, // Would integrate with weather
        airQuality,
        uvIndex,
        pollen: pollenFactor,
    };
}
/**
 * Calculate overall activity rating
 */
function calculateOverallRating(factors) {
    const impacts = [factors.airQuality.impact, factors.uvIndex.impact, factors.pollen.impact];
    // Any severe factor = avoid
    if (impacts.includes('severe')) {
        return 'avoid';
    }
    // Count negative factors
    const negativeCount = impacts.filter((i) => i === 'negative').length;
    const positiveCount = impacts.filter((i) => i === 'positive').length;
    if (negativeCount >= 2)
        return 'poor';
    if (negativeCount === 1)
        return 'fair';
    if (positiveCount >= 2)
        return 'excellent';
    return 'good';
}
/**
 * Generate natural language advice
 */
function generateAdvice(location, activity, rating, factors, aq, uv, pollen) {
    const parts = [];
    const activityName = activity === 'general' ? 'outdoor activities' : activity;
    // Opening based on overall rating
    switch (rating) {
        case 'excellent':
            parts.push(`Great conditions for ${activityName} in ${location} today!`);
            break;
        case 'good':
            parts.push(`Good day for ${activityName} in ${location}.`);
            break;
        case 'fair':
            parts.push(`Conditions for ${activityName} in ${location} are fair - a few things to consider.`);
            break;
        case 'poor':
            parts.push(`Not ideal conditions for ${activityName} in ${location} today.`);
            break;
        case 'avoid':
            parts.push(`I'd recommend avoiding ${activityName} in ${location} today, or at least taking precautions.`);
            break;
    }
    // Factor-specific advice
    const precautions = [];
    const concerns = [];
    // Air quality
    if (!aq.safe) {
        concerns.push(`air quality is elevated (AQI ${aq.aqi})`);
        precautions.push('consider reducing intensity or duration');
    }
    // UV
    if (!uv.safe) {
        concerns.push(`UV is ${uv.uvIndex >= 8 ? 'very ' : ''}high (${uv.uvIndex})`);
        precautions.push('wear sunscreen SPF 30+');
    }
    else if (uv.uvIndex > 3) {
        precautions.push('sunscreen recommended');
    }
    // Pollen
    if (!pollen.safe) {
        concerns.push(`pollen is ${pollen.level}`);
        precautions.push('antihistamines might help');
    }
    // Add concerns
    if (concerns.length > 0) {
        parts.push(`Here's what to know: ${concerns.join(', ')}.`);
    }
    // Add precautions
    if (precautions.length > 0) {
        parts.push(`Precautions: ${precautions.join(', ')}.`);
    }
    // Positive notes for good conditions
    if (rating === 'excellent' || rating === 'good') {
        const positives = [];
        if (aq.safe && aq.aqi <= 50)
            positives.push('air quality is excellent');
        if (pollen.safe)
            positives.push('pollen is low');
        if (uv.uvIndex <= 3)
            positives.push('UV is gentle');
        if (positives.length > 0 && rating === 'excellent') {
            parts.push(`The good news: ${positives.join(', ')}.`);
        }
    }
    // Indoor alternative for poor conditions
    if (rating === 'avoid' || rating === 'poor') {
        parts.push(`Maybe consider indoor alternatives today?`);
    }
    // Encouraging close
    if (rating === 'excellent' || rating === 'good') {
        parts.push('Enjoy!');
    }
    return parts.join(' ');
}
/**
 * Quick check if it's good to exercise outside
 * Returns a simple yes/no with brief reason
 */
export async function shouldExerciseOutside(location, hasAllergies = false, hasAsthma = false) {
    const [aq, uv, pollen] = await Promise.all([
        isAirQualitySafeForExercise(location, hasAsthma),
        isUVSafeForOutdoors(location, 60, 'medium'),
        isPollenSafeForAllergies(location, hasAllergies ? ['pollen'] : undefined),
    ]);
    // Check for any blockers
    if (!aq.safe && aq.aqi > 100) {
        return {
            recommended: false,
            reason: `Air quality isn't great today (AQI ${aq.aqi}). Indoor workout might be better.`,
        };
    }
    if (hasAllergies && !pollen.safe && pollen.level === 'very_high') {
        return {
            recommended: false,
            reason: `Pollen is very high today. Your allergies might flare up outside.`,
        };
    }
    if (!uv.safe && uv.uvIndex >= 9) {
        return {
            recommended: true,
            reason: `Yes, but UV is intense (${uv.uvIndex}). Go early morning or late afternoon, and wear sunscreen.`,
        };
    }
    // All good
    const positives = [];
    if (aq.aqi <= 50)
        positives.push('air quality is great');
    if (pollen.safe)
        positives.push('pollen is low');
    if (uv.uvIndex <= 5)
        positives.push('UV is manageable');
    return {
        recommended: true,
        reason: positives.length > 0
            ? `Yes! ${positives.join(', ')}. Great day to be outside.`
            : 'Conditions look good for outdoor exercise.',
    };
}
//# sourceMappingURL=outdoor-advice.js.map
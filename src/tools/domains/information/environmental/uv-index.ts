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

import { getLogger } from '../../../../utils/safe-logger.js';
import { geocodeLocation } from '../utils/geocoding.js';
import type { UVIndexData, UVCategory, SkinType } from './types.js';
import { UV_THRESHOLDS, SKIN_TYPE_BURN_TIMES } from './types.js';

const log = getLogger();

// ============================================================================
// CONSTANTS
// ============================================================================

const UV_MESSAGES: Record<UVCategory, string> = {
  low: 'UV levels are low. Minimal sun protection needed for most skin types.',
  moderate: "Moderate UV. Wear sunscreen if you'll be outside for extended periods.",
  high: 'High UV levels. Sunscreen, hat, and sunglasses recommended. Seek shade during midday.',
  very_high:
    'Very high UV! Take full precautions: sunscreen SPF 30+, hat, sunglasses, and limit sun exposure.',
  extreme:
    'Extreme UV levels! Avoid sun exposure between 10am-4pm if possible. Full protection essential.',
};

const SPF_RECOMMENDATIONS: Record<UVCategory, number> = {
  low: 15,
  moderate: 30,
  high: 30,
  very_high: 50,
  extreme: 50,
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

interface OpenMeteoUVResponse {
  daily?: {
    time: string[];
    uv_index_max: number[];
    uv_index_clear_sky_max: number[];
  };
  hourly?: {
    time: string[];
    uv_index: number[];
  };
}

/**
 * Get UV index data from Open-Meteo
 */
async function fetchUVFromOpenMeteo(lat: number, lon: number): Promise<UVIndexData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=uv_index_max&hourly=uv_index&timezone=auto&forecast_days=1`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      log.warn({ status: response.status }, '☀️ Open-Meteo UV API error');
      return null;
    }

    const data = (await response.json()) as OpenMeteoUVResponse;
    if (!data.daily?.uv_index_max?.[0]) {
      log.warn('☀️ No UV data from Open-Meteo');
      return null;
    }

    const uvMax = Math.round(data.daily.uv_index_max[0] * 10) / 10;
    const category = getUVCategory(uvMax);
    const peakTime = findPeakUVTime(data.hourly);

    return {
      uvIndex: uvMax,
      category,
      peakTime,
      sunscreenAdvice: `SPF ${SPF_RECOMMENDATIONS[category]} or higher`,
      exposureLimit: getExposureLimit(category),
      timestamp: new Date(),
    };
  } catch (error) {
    log.warn({ error: String(error) }, '☀️ Failed to fetch UV index');
    return null;
  }
}

/**
 * Determine UV category from numeric value
 */
function getUVCategory(uv: number): UVCategory {
  if (uv <= 2) return 'low';
  if (uv <= 5) return 'moderate';
  if (uv <= 7) return 'high';
  if (uv <= 10) return 'very_high';
  return 'extreme';
}

/**
 * Find when UV peaks during the day
 */
function findPeakUVTime(hourly?: OpenMeteoUVResponse['hourly']): string {
  if (!hourly?.uv_index || !hourly.time) {
    return '11am - 2pm'; // Default peak UV window
  }

  let maxUV = 0;
  let peakHour = 12;

  for (let i = 0; i < hourly.uv_index.length; i++) {
    if (hourly.uv_index[i] > maxUV) {
      maxUV = hourly.uv_index[i];
      const time = new Date(hourly.time[i]);
      peakHour = time.getHours();
    }
  }

  // Format as readable time
  const formatHour = (h: number) => {
    const period = h >= 12 ? 'pm' : 'am';
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}${period}`;
  };

  return `around ${formatHour(peakHour)}`;
}

/**
 * Get recommended exposure limit based on UV level
 */
function getExposureLimit(category: UVCategory): string {
  const limits: Record<UVCategory, string> = {
    low: 'You can be outdoors safely for extended periods',
    moderate: 'Limit unprotected exposure to about an hour',
    high: 'Limit unprotected exposure to about 30 minutes',
    very_high: 'Limit unprotected exposure to about 15 minutes',
    extreme: 'Avoid unprotected exposure - seek shade frequently',
  };
  return limits[category];
}

/**
 * Calculate time to sunburn based on skin type and UV
 */
function calculateBurnTime(uvIndex: number, skinType: SkinType): number {
  // Base burn time at UV index 6 (reference point)
  const baseBurnTime = SKIN_TYPE_BURN_TIMES[skinType];

  // Adjust for actual UV (inverse relationship)
  const burnTime = Math.round((baseBurnTime * 6) / uvIndex);

  return Math.max(5, burnTime); // Minimum 5 minutes
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get current UV index for a location
 *
 * @param location - City name or address
 * @param skinType - Optional skin type for personalized advice
 * @returns Formatted UV index report
 */
export async function getUVIndex(location: string, skinType?: SkinType): Promise<string> {
  const startTime = Date.now();
  log.info({ location, skinType }, '☀️ Getting UV index');

  // Geocode the location
  const geo = await geocodeLocation(location);
  if (!geo) {
    return `I couldn't find "${location}". Try a city name like "Philadelphia" or "Miami".`;
  }

  // Fetch UV data
  const data = await fetchUVFromOpenMeteo(geo.latitude, geo.longitude);
  if (!data) {
    return `I couldn't get UV data for ${geo.name} right now. Try again in a moment?`;
  }

  const locationName = geo.admin1 ? `${geo.name}, ${geo.admin1}` : geo.name;

  log.info(
    {
      location: locationName,
      uvIndex: data.uvIndex,
      category: data.category,
      elapsed: Date.now() - startTime,
    },
    '☀️ UV index fetched'
  );

  return formatUVResponse(locationName, data, skinType);
}

/**
 * Format UV data into a natural, voice-friendly response
 */
function formatUVResponse(location: string, data: UVIndexData, skinType?: SkinType): string {
  const parts: string[] = [];

  // Main UV report
  const descriptor = getUVDescriptor(data.category);
  parts.push(`The UV index in ${location} is ${data.uvIndex}, which is ${descriptor}.`);

  // Peak time warning for high UV
  if (data.category !== 'low') {
    parts.push(`Peak UV is ${data.peakTime}.`);
  }

  // Main advice
  parts.push(UV_MESSAGES[data.category]);

  // Personalized burn time if skin type provided
  if (skinType && data.uvIndex > 2) {
    const burnTime = calculateBurnTime(data.uvIndex, skinType);
    parts.push(
      `With your ${formatSkinType(skinType)} skin, you could start burning in about ${burnTime} minutes without protection.`
    );
  }

  // Sunscreen recommendation
  if (data.category !== 'low') {
    parts.push(`I'd recommend ${data.sunscreenAdvice}.`);
  }

  return parts.join(' ');
}

/**
 * Get a natural language descriptor for UV category
 */
function getUVDescriptor(category: UVCategory): string {
  const descriptors: Record<UVCategory, string> = {
    low: 'low',
    moderate: 'moderate',
    high: 'high',
    very_high: 'very high',
    extreme: 'extreme',
  };
  return descriptors[category];
}

/**
 * Format skin type for natural speech
 */
function formatSkinType(skinType: SkinType): string {
  const names: Record<SkinType, string> = {
    very_fair: 'very fair',
    fair: 'fair',
    medium: 'medium',
    olive: 'olive',
    brown: 'brown',
    dark: 'dark',
  };
  return names[skinType];
}

/**
 * Get a brief UV summary (for use in other tools like daily briefing)
 */
export async function getUVSummary(location: string): Promise<string | null> {
  const geo = await geocodeLocation(location);
  if (!geo) return null;

  const data = await fetchUVFromOpenMeteo(geo.latitude, geo.longitude);
  if (!data) return null;

  // Only mention if elevated
  if (data.category === 'low' || data.category === 'moderate') {
    return null;
  }

  return `UV is ${getUVDescriptor(data.category)} (${data.uvIndex}) - ${data.sunscreenAdvice} recommended`;
}

/**
 * Check if UV is safe for extended outdoor activity
 */
export async function isUVSafeForOutdoors(
  location: string,
  duration: number = 60, // minutes
  skinType: SkinType = 'medium'
): Promise<{ safe: boolean; reason: string; uvIndex: number }> {
  const geo = await geocodeLocation(location);
  if (!geo) {
    return { safe: true, reason: 'Could not determine UV levels', uvIndex: 0 };
  }

  const data = await fetchUVFromOpenMeteo(geo.latitude, geo.longitude);
  if (!data) {
    return { safe: true, reason: 'Could not determine UV levels', uvIndex: 0 };
  }

  const burnTime = calculateBurnTime(data.uvIndex, skinType);
  const safe = duration < burnTime || data.category === 'low';

  let reason: string;
  if (safe) {
    if (data.category === 'low') {
      reason = 'UV is low - enjoy your time outdoors!';
    } else {
      reason = `You should be fine for ${duration} minutes with sunscreen.`;
    }
  } else {
    reason = `At UV ${data.uvIndex}, you could burn in about ${burnTime} minutes. Apply ${data.sunscreenAdvice} and reapply every 2 hours.`;
  }

  return { safe, reason, uvIndex: data.uvIndex };
}

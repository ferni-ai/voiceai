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

import { getLogger } from '../../../../utils/safe-logger.js';
import { geocodeLocation } from '../utils/geocoding.js';
import type { PollenData, PollenLevel } from './types.js';
import { POLLEN_DESCRIPTIONS } from './types.js';

const log = getLogger();

// ============================================================================
// CONSTANTS
// ============================================================================

const POLLEN_ADVICE: Record<PollenLevel, string> = {
  none: 'Great day for outdoor activities - no significant pollen detected.',
  low: 'Low pollen today. Most allergy sufferers should feel fine.',
  moderate: "Moderate pollen. Consider antihistamines if you're sensitive.",
  high: 'High pollen alert! Take your allergy medication and consider limiting outdoor time.',
  very_high:
    'Very high pollen! Allergy sufferers should stay indoors if possible. Keep windows closed.',
};

const POLLEN_TYPE_NAMES: Record<string, string> = {
  tree: 'tree pollen',
  grass: 'grass pollen',
  weed: 'weed pollen (including ragweed)',
  mold: 'mold spores',
};

// ============================================================================
// API FUNCTIONS
// ============================================================================

interface OpenMeteoPollenResponse {
  current?: {
    alder_pollen: number;
    birch_pollen: number;
    grass_pollen: number;
    mugwort_pollen: number;
    olive_pollen: number;
    ragweed_pollen: number;
  };
  daily?: {
    time: string[];
    grass_pollen_max: number[];
    birch_pollen_max: number[];
    ragweed_pollen_max: number[];
  };
}

/**
 * Get pollen data from Open-Meteo
 */
async function fetchPollenFromOpenMeteo(lat: number, lon: number): Promise<PollenData | null> {
  try {
    // Open-Meteo provides European pollen data and some US data
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&hourly=grass_pollen,ragweed_pollen,birch_pollen&timezone=auto`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      log.warn({ status: response.status }, '🌸 Open-Meteo Pollen API error');
      return null;
    }

    const data = (await response.json()) as OpenMeteoPollenResponse;
    if (!data.current) {
      log.warn('🌸 No pollen data from Open-Meteo');
      return null;
    }

    // Calculate levels for each type
    const treePollen = Math.max(
      data.current.alder_pollen || 0,
      data.current.birch_pollen || 0,
      data.current.olive_pollen || 0
    );
    const grassPollen = data.current.grass_pollen || 0;
    const weedPollen = Math.max(data.current.mugwort_pollen || 0, data.current.ragweed_pollen || 0);

    const treeLevel = getPollenLevel(treePollen, 'tree');
    const grassLevel = getPollenLevel(grassPollen, 'grass');
    const weedLevel = getPollenLevel(weedPollen, 'weed');

    // Overall is the worst of any category
    const levels = [treeLevel, grassLevel, weedLevel];
    const overallLevel = getWorstLevel(levels);

    // Find dominant type
    const dominant = getDominantPollenType(treePollen, grassPollen, weedPollen);

    return {
      overall: overallLevel,
      types: {
        tree: treeLevel,
        grass: grassLevel,
        weed: weedLevel,
      },
      dominantType: dominant,
      healthAdvice: POLLEN_ADVICE[overallLevel],
      allergyAlert: overallLevel === 'high' || overallLevel === 'very_high',
      forecast: {
        today: overallLevel,
        tomorrow: overallLevel, // Would need forecast data
        trend: 'stable',
      },
      timestamp: new Date(),
    };
  } catch (error) {
    log.warn({ error: String(error) }, '🌸 Failed to fetch pollen data');
    return null;
  }
}

/**
 * Convert pollen count to level
 * Thresholds vary by pollen type
 */
function getPollenLevel(count: number, type: 'tree' | 'grass' | 'weed'): PollenLevel {
  // Thresholds based on standard pollen index scales
  const thresholds: Record<string, number[]> = {
    tree: [10, 50, 200, 500], // grains/m³
    grass: [5, 20, 50, 200],
    weed: [5, 20, 50, 200],
  };

  const t = thresholds[type];
  if (count < t[0]) return 'none';
  if (count < t[1]) return 'low';
  if (count < t[2]) return 'moderate';
  if (count < t[3]) return 'high';
  return 'very_high';
}

/**
 * Get the worst pollen level from an array
 */
function getWorstLevel(levels: PollenLevel[]): PollenLevel {
  const order: PollenLevel[] = ['none', 'low', 'moderate', 'high', 'very_high'];
  let worstIndex = 0;

  for (const level of levels) {
    const index = order.indexOf(level);
    if (index > worstIndex) {
      worstIndex = index;
    }
  }

  return order[worstIndex];
}

/**
 * Determine which pollen type is most elevated
 */
function getDominantPollenType(tree: number, grass: number, weed: number): string | undefined {
  if (tree === 0 && grass === 0 && weed === 0) {
    return undefined;
  }

  if (tree >= grass && tree >= weed) return 'tree';
  if (grass >= tree && grass >= weed) return 'grass';
  return 'weed';
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get current pollen levels for a location
 *
 * @param location - City name or address
 * @param userAllergies - Optional array of specific allergies
 * @returns Formatted pollen report
 */
export async function getPollenForecast(
  location: string,
  userAllergies?: string[]
): Promise<string> {
  const startTime = Date.now();
  log.info({ location, userAllergies }, '🌸 Getting pollen forecast');

  // Geocode the location
  const geo = await geocodeLocation(location);
  if (!geo) {
    return `I couldn't find "${location}". Try a city name like "Philadelphia" or "Austin".`;
  }

  // Fetch pollen data
  const data = await fetchPollenFromOpenMeteo(geo.latitude, geo.longitude);
  if (!data) {
    return `I couldn't get pollen data for ${geo.name} right now. This might be because pollen data isn't available for this region, or the service is temporarily unavailable.`;
  }

  const locationName = geo.admin1 ? `${geo.name}, ${geo.admin1}` : geo.name;

  log.info(
    {
      location: locationName,
      overall: data.overall,
      dominant: data.dominantType,
      elapsed: Date.now() - startTime,
    },
    '🌸 Pollen forecast fetched'
  );

  return formatPollenResponse(locationName, data, userAllergies);
}

/**
 * Format pollen data into a natural, voice-friendly response
 */
function formatPollenResponse(
  location: string,
  data: PollenData,
  userAllergies?: string[]
): string {
  const parts: string[] = [];

  // Main pollen report
  const descriptor = getPollenDescriptor(data.overall);
  parts.push(`Pollen levels in ${location} are ${descriptor} today.`);

  // Mention dominant type if elevated
  if (data.dominantType && data.overall !== 'none' && data.overall !== 'low') {
    const typeName = POLLEN_TYPE_NAMES[data.dominantType] || data.dominantType;
    parts.push(`The main culprit is ${typeName}.`);
  }

  // Type breakdown for moderate or higher
  if (data.overall !== 'none' && data.overall !== 'low') {
    const elevated = Object.entries(data.types)
      .filter(([_, level]) => level === 'moderate' || level === 'high' || level === 'very_high')
      .map(([type, level]) => `${type}: ${level}`);

    if (elevated.length > 1) {
      parts.push(`Breakdown: ${elevated.join(', ')}.`);
    }
  }

  // Health advice
  parts.push(data.healthAdvice);

  // Personalized warning if user has allergies
  if (userAllergies && userAllergies.length > 0 && data.allergyAlert) {
    const relevantAllergies = userAllergies.filter(
      (a) =>
        a.toLowerCase().includes('pollen') ||
        a.toLowerCase().includes('grass') ||
        a.toLowerCase().includes('tree') ||
        a.toLowerCase().includes('ragweed')
    );

    if (relevantAllergies.length > 0) {
      parts.push(
        `Since you've mentioned ${relevantAllergies[0]} allergies, you might want to take extra precautions today.`
      );
    }
  }

  return parts.join(' ');
}

/**
 * Get a natural language descriptor for pollen level
 */
function getPollenDescriptor(level: PollenLevel): string {
  const descriptors: Record<PollenLevel, string> = {
    none: 'very low',
    low: 'low',
    moderate: 'moderate',
    high: 'high',
    very_high: 'very high',
  };
  return descriptors[level];
}

/**
 * Get a brief pollen summary (for use in other tools like daily briefing)
 */
export async function getPollenSummary(location: string): Promise<string | null> {
  const geo = await geocodeLocation(location);
  if (!geo) return null;

  const data = await fetchPollenFromOpenMeteo(geo.latitude, geo.longitude);
  if (!data) return null;

  // Only mention if elevated
  if (data.overall === 'none' || data.overall === 'low') {
    return null;
  }

  const typeInfo = data.dominantType
    ? ` (mainly ${POLLEN_TYPE_NAMES[data.dominantType] || data.dominantType})`
    : '';
  return `Pollen is ${getPollenDescriptor(data.overall)}${typeInfo}`;
}

/**
 * Check if pollen levels are safe for someone with allergies
 */
export async function isPollenSafeForAllergies(
  location: string,
  allergyTypes?: string[]
): Promise<{ safe: boolean; reason: string; level: PollenLevel }> {
  const geo = await geocodeLocation(location);
  if (!geo) {
    return { safe: true, reason: 'Could not determine pollen levels', level: 'none' };
  }

  const data = await fetchPollenFromOpenMeteo(geo.latitude, geo.longitude);
  if (!data) {
    return { safe: true, reason: 'Could not determine pollen levels', level: 'none' };
  }

  // Safe if low or none
  const safe = data.overall === 'none' || data.overall === 'low';

  let reason: string;
  if (safe) {
    reason = 'Pollen levels are low - good day for outdoor activities!';
  } else {
    const typeInfo = data.dominantType ? POLLEN_TYPE_NAMES[data.dominantType] : 'pollen';
    reason = `${getPollenDescriptor(data.overall)} ${typeInfo} today. ${data.healthAdvice}`;
  }

  return { safe, reason, level: data.overall };
}

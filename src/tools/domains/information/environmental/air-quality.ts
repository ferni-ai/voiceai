/**
 * Air Quality Tools
 *
 * Fetches real-time air quality data and provides health recommendations.
 * Uses Open-Meteo Air Quality API (free, no key required).
 *
 * "Better than human": No friend tracks AQI for you daily or knows
 * that you have asthma and should avoid outdoor exercise today.
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import { geocodeLocation } from '../utils/geocoding.js';
import type { AirQualityData, AQICategory } from './types.js';
import { AQI_THRESHOLDS } from './types.js';

const log = getLogger();

// ============================================================================
// CONSTANTS
// ============================================================================

const AQI_HEALTH_MESSAGES: Record<AQICategory, string> = {
  good: 'Air quality is excellent! Perfect for outdoor activities.',
  moderate:
    'Air quality is acceptable. Unusually sensitive people should consider limiting prolonged outdoor exertion.',
  unhealthy_sensitive:
    'Members of sensitive groups may experience health effects. Consider reducing prolonged outdoor exertion.',
  unhealthy:
    'Everyone may begin to experience health effects. Sensitive groups should avoid prolonged outdoor exertion.',
  very_unhealthy:
    'Health alert: everyone may experience more serious health effects. Avoid prolonged outdoor activities.',
  hazardous:
    'Health emergency: everyone is more likely to be affected. Stay indoors and keep windows closed.',
};

const SENSITIVE_GROUPS = [
  'people with respiratory conditions (asthma, COPD)',
  'people with heart conditions',
  'children and older adults',
  'pregnant women',
  'people who work or exercise outdoors',
];

// ============================================================================
// API FUNCTIONS
// ============================================================================

interface OpenMeteoAQResponse {
  current?: {
    time: string;
    us_aqi: number;
    pm10: number;
    pm2_5: number;
    carbon_monoxide: number;
    nitrogen_dioxide: number;
    sulphur_dioxide: number;
    ozone: number;
  };
}

/**
 * Get air quality data from Open-Meteo (free, no API key)
 */
async function fetchAirQualityFromOpenMeteo(
  lat: number,
  lon: number
): Promise<AirQualityData | null> {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      log.warn({ status: response.status }, '🌬️ Open-Meteo AQ API error');
      return null;
    }

    const data = (await response.json()) as OpenMeteoAQResponse;
    if (!data.current) {
      log.warn('🌬️ No current AQ data from Open-Meteo');
      return null;
    }

    const aqi = data.current.us_aqi;
    const category = getAQICategory(aqi);

    return {
      aqi,
      category,
      dominantPollutant: getDominantPollutant(data.current),
      pollutants: {
        pm25: data.current.pm2_5,
        pm10: data.current.pm10,
        o3: data.current.ozone,
        no2: data.current.nitrogen_dioxide,
        so2: data.current.sulphur_dioxide,
        co: data.current.carbon_monoxide,
      },
      healthRecommendation: AQI_HEALTH_MESSAGES[category],
      sensitiveGroups:
        category === 'good'
          ? []
          : SENSITIVE_GROUPS.slice(0, category === 'moderate' ? 2 : undefined),
      timestamp: new Date(data.current.time),
      source: 'Open-Meteo',
    };
  } catch (error) {
    log.warn({ error: String(error) }, '🌬️ Failed to fetch air quality');
    return null;
  }
}

/**
 * Determine AQI category from numeric value
 */
function getAQICategory(aqi: number): AQICategory {
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'unhealthy_sensitive';
  if (aqi <= 200) return 'unhealthy';
  if (aqi <= 300) return 'very_unhealthy';
  return 'hazardous';
}

/**
 * Determine which pollutant is most elevated
 */
function getDominantPollutant(current: OpenMeteoAQResponse['current']): string {
  if (!current) return 'particulate matter';

  // Compare to typical "elevated" thresholds
  const pollutants = [
    { name: 'PM2.5', value: current.pm2_5, threshold: 35 },
    { name: 'PM10', value: current.pm10, threshold: 150 },
    { name: 'ozone', value: current.ozone, threshold: 70 },
    { name: 'nitrogen dioxide', value: current.nitrogen_dioxide, threshold: 100 },
  ];

  // Find most elevated relative to threshold
  let dominant = pollutants[0];
  let maxRatio = 0;

  for (const p of pollutants) {
    const ratio = p.value / p.threshold;
    if (ratio > maxRatio) {
      maxRatio = ratio;
      dominant = p;
    }
  }

  return dominant.name;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get current air quality for a location
 *
 * @param location - City name or address
 * @returns Formatted air quality report
 */
export async function getAirQuality(location: string): Promise<string> {
  const startTime = Date.now();
  log.info({ location }, '🌬️ Getting air quality');

  // Geocode the location
  const geo = await geocodeLocation(location);
  if (!geo) {
    return `I couldn't find "${location}". Try a city name like "Philadelphia" or "Denver".`;
  }

  // Fetch air quality data
  const data = await fetchAirQualityFromOpenMeteo(geo.latitude, geo.longitude);
  if (!data) {
    return `I couldn't get air quality data for ${geo.name} right now. Try again in a moment?`;
  }

  // Format the response
  const locationName = geo.admin1 ? `${geo.name}, ${geo.admin1}` : geo.name;

  log.info(
    {
      location: locationName,
      aqi: data.aqi,
      category: data.category,
      elapsed: Date.now() - startTime,
    },
    '🌬️ Air quality fetched'
  );

  return formatAirQualityResponse(locationName, data);
}

/**
 * Format air quality data into a natural, voice-friendly response
 */
function formatAirQualityResponse(location: string, data: AirQualityData): string {
  const parts: string[] = [];

  // Main AQI report
  const aqiDescriptor = getAQIDescriptor(data.category);
  parts.push(`Air quality in ${location} is ${aqiDescriptor} with an AQI of ${data.aqi}.`);

  // Dominant pollutant (if not good)
  if (data.category !== 'good') {
    parts.push(`The main concern today is ${data.dominantPollutant}.`);
  }

  // Health recommendation
  parts.push(data.healthRecommendation);

  // Specific advice for sensitive groups
  if (data.sensitiveGroups.length > 0 && data.category !== 'good' && data.category !== 'moderate') {
    parts.push(`Sensitive groups include ${data.sensitiveGroups.slice(0, 2).join(' and ')}.`);
  }

  return parts.join(' ');
}

/**
 * Get a natural language descriptor for AQI category
 */
function getAQIDescriptor(category: AQICategory): string {
  const descriptors: Record<AQICategory, string> = {
    good: 'excellent',
    moderate: 'moderate',
    unhealthy_sensitive: 'unhealthy for sensitive groups',
    unhealthy: 'unhealthy',
    very_unhealthy: 'very unhealthy',
    hazardous: 'hazardous',
  };
  return descriptors[category];
}

/**
 * Check if air quality is safe for outdoor exercise
 *
 * @param location - City name or address
 * @param hasRespiratoryCondition - User has asthma/COPD
 * @returns Boolean indicating if outdoor exercise is recommended
 */
export async function isAirQualitySafeForExercise(
  location: string,
  hasRespiratoryCondition = false
): Promise<{ safe: boolean; reason: string; aqi: number }> {
  const geo = await geocodeLocation(location);
  if (!geo) {
    return { safe: true, reason: 'Could not determine air quality', aqi: 0 };
  }

  const data = await fetchAirQualityFromOpenMeteo(geo.latitude, geo.longitude);
  if (!data) {
    return { safe: true, reason: 'Could not determine air quality', aqi: 0 };
  }

  // Thresholds for exercise
  const threshold = hasRespiratoryCondition ? 50 : 100;
  const safe = data.aqi <= threshold;

  let reason: string;
  if (safe) {
    reason =
      data.aqi <= 50
        ? 'Air quality is great for outdoor exercise!'
        : 'Air quality is acceptable for exercise, but sensitive individuals should be aware.';
  } else {
    reason = hasRespiratoryCondition
      ? `With respiratory conditions, AQI of ${data.aqi} is too high for outdoor exercise. Consider indoor alternatives.`
      : `AQI of ${data.aqi} is elevated. Consider shorter duration or indoor exercise.`;
  }

  return { safe, reason, aqi: data.aqi };
}

/**
 * Get a brief AQI summary (for use in other tools like daily briefing)
 */
export async function getAirQualitySummary(location: string): Promise<string | null> {
  const geo = await geocodeLocation(location);
  if (!geo) return null;

  const data = await fetchAirQualityFromOpenMeteo(geo.latitude, geo.longitude);
  if (!data) return null;

  if (data.category === 'good') {
    return null; // Don't mention if good - that's the default expectation
  }

  const descriptor = getAQIDescriptor(data.category);
  return `Air quality is ${descriptor} (AQI ${data.aqi})`;
}

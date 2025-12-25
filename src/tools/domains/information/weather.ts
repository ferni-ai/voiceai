/**
 * Weather Tools
 *
 * Domain: Weather data and forecasts.
 * Single responsibility: Fetching and presenting weather information.
 *
 * APIs used (in priority order):
 * 1. Apple WeatherKit (primary - more reliable, better data)
 * 2. Open-Meteo (fallback - free, no key required)
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';

// Lazy import Apple WeatherKit to avoid startup errors when not configured
async function tryAppleWeather(location: string): Promise<string | null> {
  const log = getLogger();

  try {
    const {
      isWeatherKitAvailable,
      getWeather,
      formatCurrentWeatherForVoice,
      formatAlertsForVoice,
    } = await import('../../../services/apple/weatherkit.js');

    if (!isWeatherKitAvailable()) {
      log.debug({ location }, '🍎 WeatherKit not configured');
      return null;
    }

    // Use Open-Meteo geocoding for ANY city (not just hardcoded list)
    const geo = await geocodeLocation(location);
    if (!geo) {
      log.debug({ location }, '🍎 Geocoding failed for Apple Weather');
      return null;
    }

    log.debug(
      { location, lat: geo.latitude, lon: geo.longitude },
      '🍎 Fetching from Apple WeatherKit'
    );
    const weather = await getWeather(geo.latitude, geo.longitude);

    if (!weather?.current) {
      log.debug({ location }, '🍎 No weather data from Apple');
      return null;
    }

    // Format location name nicely
    const locationName = geo.admin1 ? `${geo.name}, ${geo.admin1}` : geo.name;
    let result = formatCurrentWeatherForVoice(weather.current, locationName);

    // Add any weather alerts (Apple's killer feature!)
    const alertText = formatAlertsForVoice(weather.alerts);
    if (alertText) {
      result = `${alertText} ${result}`;
    }

    log.info(
      { location, locationName, source: 'AppleWeatherKit' },
      '🍎 Weather from Apple WeatherKit'
    );
    return result;
  } catch (error) {
    getLogger().debug(
      { location, error: String(error) },
      '🍎 Apple WeatherKit error, using fallback'
    );
    return null;
  }
}
// ============================================================================
// TYPES
// ============================================================================

interface GeocodingResult {
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
  admin1?: string; // State/Province
}

interface CurrentWeather {
  temperature_2m: number;
  relative_humidity_2m: number;
  weather_code: number;
  wind_speed_10m: number;
  apparent_temperature?: number;
}

interface DailyForecast {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  weather_code: number[];
  precipitation_probability_max: number[];
}

// ============================================================================
// WEATHER CODE DESCRIPTIONS
// ============================================================================

const WEATHER_CODES: Record<number, string> = {
  0: 'clear skies',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'foggy',
  48: 'depositing rime fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  56: 'freezing drizzle',
  57: 'heavy freezing drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  66: 'light freezing rain',
  67: 'heavy freezing rain',
  71: 'slight snow',
  73: 'moderate snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'slight rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  85: 'slight snow showers',
  86: 'heavy snow showers',
  95: 'thunderstorm',
  96: 'thunderstorm with slight hail',
  99: 'thunderstorm with heavy hail',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fast geocoding: Google (primary, ~50-150ms) → Open-Meteo (fallback, free)
 */
async function geocodeLocation(location: string): Promise<GeocodingResult | null> {
  const startTime = Date.now();
  const log = getLogger();

  // Try Google first (faster, ~50-150ms vs ~200-500ms)
  const googleResult = await geocodeWithGoogle(location);
  if (googleResult) {
    log.debug({ location, provider: 'google', ms: Date.now() - startTime }, '📍 Geocoded');
    return googleResult;
  }

  // Fall back to Open-Meteo (free, no API key needed)
  const openMeteoResult = await geocodeWithOpenMeteo(location);
  if (openMeteoResult) {
    log.debug({ location, provider: 'open-meteo', ms: Date.now() - startTime }, '📍 Geocoded');
    return openMeteoResult;
  }

  log.warn({ location, ms: Date.now() - startTime }, '📍 Geocoding failed');
  return null;
}

/**
 * Google Geocoding API (~50-150ms, very fast)
 */
async function geocodeWithGoogle(location: string): Promise<GeocodingResult | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      status: string;
      results?: Array<{
        geometry: { location: { lat: number; lng: number } };
        address_components?: Array<{
          long_name: string;
          types: string[];
        }>;
      }>;
    };

    if (data.status !== 'OK' || !data.results?.length) return null;

    const result = data.results[0];
    const coords = result.geometry?.location;
    if (!coords) return null;

    // Extract city and state from address components
    const components = result.address_components || [];
    const city = components.find((c) => c.types.includes('locality'))?.long_name;
    const state = components.find((c) =>
      c.types.includes('administrative_area_level_1')
    )?.long_name;
    const country = components.find((c) => c.types.includes('country'))?.long_name;

    return {
      latitude: coords.lat,
      longitude: coords.lng,
      name: city || location,
      admin1: state,
      country,
    };
  } catch {
    return null;
  }
}

/**
 * Open-Meteo Geocoding (free fallback, ~200-500ms)
 */
async function geocodeWithOpenMeteo(location: string): Promise<GeocodingResult | null> {
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as { results?: GeocodingResult[] };
    return data.results?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Get weather description from code
 */
function getWeatherDescription(code: number): string {
  return WEATHER_CODES[code] || 'variable conditions';
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Get current weather for a location
 * Priority: Apple WeatherKit → Open-Meteo (fallback)
 */
export async function getCurrentWeather(location: string): Promise<string> {
  const startTime = Date.now();
  const log = getLogger();

  log.info({ timestamp: new Date().toISOString(), location }, '🌤️ [DIAG] getCurrentWeather START');

  // Try Apple WeatherKit first (more reliable)
  const appleResult = await tryAppleWeather(location);
  if (appleResult) {
    log.info(
      { location, elapsed: Date.now() - startTime, source: 'AppleWeatherKit' },
      '🌤️ Weather from Apple'
    );
    return appleResult;
  }

  // Fallback to Open-Meteo
  log.debug({ location }, '🌤️ Falling back to Open-Meteo');
  const geo = await geocodeLocation(location);

  if (!geo) {
    log.warn(
      { location, elapsed: Date.now() - startTime },
      '🌤️ [DIAG] getCurrentWeather: Geocoding failed'
    );
    return `I couldn't find weather data for "${location}". Try a major city name?`;
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${geo.latitude}&longitude=${geo.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph`;

    log.debug({ location, geo: geo.name }, '🌤️ [DIAG] Fetching weather data...');
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      log.warn(
        { location, status: response.status, elapsed: Date.now() - startTime },
        '🌤️ [DIAG] Weather API returned non-OK'
      );
      return `Couldn't get current weather for ${geo.name}.`;
    }

    const data = (await response.json()) as { current?: CurrentWeather };
    const { current } = data;

    if (!current) {
      log.warn(
        { location, elapsed: Date.now() - startTime },
        '🌤️ [DIAG] Weather API returned no current data'
      );
      return `No weather data available for ${geo.name}.`;
    }

    const condition = getWeatherDescription(current.weather_code);
    const feelsLike = current.apparent_temperature
      ? `, feels like ${Math.round(current.apparent_temperature)}°F`
      : '';

    const locationName = geo.admin1 ? `${geo.name}, ${geo.admin1}` : geo.name;

    log.info({ location, elapsed: Date.now() - startTime }, '🌤️ [DIAG] getCurrentWeather SUCCESS');
    return (
      `Right now in ${locationName}: ${Math.round(current.temperature_2m)}°F with ${condition}${feelsLike}. ` +
      `Humidity is ${current.relative_humidity_2m}% and winds are ${Math.round(current.wind_speed_10m)} mph.`
    );
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const isTimeout = String(error).includes('timeout') || String(error).includes('AbortError');
    log.warn(
      {
        location,
        error: String(error),
        elapsed,
        isTimeout,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      '🌤️ [DIAG] getCurrentWeather FAILED - check if this correlates with music issues!'
    );
    return `I had trouble checking the weather. The service might be temporarily unavailable.`;
  }
}

/**
 * Get weather forecast for a location
 */
export async function getWeatherForecast(location: string, days = 5): Promise<string> {
  const geo = await geocodeLocation(location);

  if (!geo) {
    return `I couldn't find "${location}". Try a city name like "Philadelphia" or "Denver".`;
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${geo.latitude}&longitude=${geo.longitude}` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
      `&temperature_unit=fahrenheit&forecast_days=${days}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      return `Couldn't get forecast for ${geo.name}.`;
    }

    const data = (await response.json()) as { daily?: DailyForecast };
    const { daily } = data;

    if (!daily || !daily.time?.length) {
      return `No forecast data available for ${geo.name}.`;
    }

    const forecasts: string[] = [];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 0; i < Math.min(days, daily.time.length); i++) {
      const date = new Date(daily.time[i]);
      const dayName = dayNames[date.getUTCDay()];
      const high = Math.round(daily.temperature_2m_max[i]);
      const low = Math.round(daily.temperature_2m_min[i]);
      const condition = getWeatherDescription(daily.weather_code[i]);
      const rain = daily.precipitation_probability_max[i];

      if (rain > 30) {
        forecasts.push(`${dayName}: ${high}°/${low}° ${condition}, ${rain}% chance of precip`);
      } else {
        forecasts.push(`${dayName}: ${high}°/${low}° ${condition}`);
      }
    }

    const locationName = geo.admin1 ? `${geo.name}, ${geo.admin1}` : geo.name;

    return `${days}-day forecast for ${locationName}: ${forecasts.join(' | ')}`;
  } catch (error) {
    getLogger().warn(`Forecast API error: ${error}`);
    return `I had trouble getting the forecast.`;
  }
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createWeatherTools() {
  const logger = getLogger();

  return {
    getWeather: llm.tool({
      description: getToolDescription('getWeather'),
      parameters: z.object({
        location: z
          .string()
          .describe('City name (e.g., "Philadelphia", "New York", "Denver", "London")'),
      }),
      execute: async ({ location }) => {
        const startTime = Date.now();
        logger.info({ location }, '🌤️ Weather tool called');

        try {
          const result = await getCurrentWeather(location);
          const elapsed = Date.now() - startTime;
          logger.info(
            { location, elapsed, resultLength: result.length },
            '🌤️ Weather result returned'
          );
          return result;
        } catch (error) {
          logger.error({ location, error: String(error) }, '🌤️ Weather tool error');
          return `I couldn't get weather for ${location}. Try a different city name?`;
        }
      },
    }),

    getWeatherForecast: llm.tool({
      description: getToolDescription('getWeatherForecast'),
      parameters: z.object({
        location: z.string().describe('City name'),
        days: z.number().optional().describe('Number of days to forecast (1-7), defaults to 5'),
      }),
      execute: async ({ location, days = 5 }) => {
        const startTime = Date.now();
        logger.info({ location, days }, '📅 Weather forecast tool called');

        try {
          const result = await getWeatherForecast(location, Math.min(days, 7));
          const elapsed = Date.now() - startTime;
          logger.info(
            { location, days, elapsed, resultLength: result.length },
            '📅 Weather forecast returned'
          );
          return result;
        } catch (error) {
          logger.error({ location, days, error: String(error) }, '📅 Weather forecast tool error');
          return `I couldn't get the forecast for ${location}. Try a different city name?`;
        }
      },
    }),
  };
}

export default createWeatherTools;

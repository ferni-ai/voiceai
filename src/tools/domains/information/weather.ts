/**
 * Weather Tools
 *
 * Domain: Weather data and forecasts.
 * Single responsibility: Fetching and presenting weather information.
 *
 * APIs used (in priority order):
 * 1. Google Weather API (primary - fast, uses existing GOOGLE_API_KEY)
 * 2. Open-Meteo (fallback - free, no key required)
 *
 * SETUP: To use Google Weather API (faster), enable it in GCP Console:
 * 1. Go to https://console.cloud.google.com/apis/library/weather.googleapis.com
 * 2. Enable "Weather API"
 * 3. The existing GOOGLE_API_KEY will work automatically
 *
 * Without Google Weather enabled, falls back to Open-Meteo (~500ms slower)
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
import {
  geocodeLocation,
  geocodeWithGoogle,
  formatLocationName,
  type GeocodingResult,
} from './utils/geocoding.js';

// ============================================================================
// GOOGLE WEATHER API
// Uses the Google Maps Weather API - requires GOOGLE_API_KEY
// Docs: https://developers.google.com/maps/documentation/weather
// ============================================================================

interface GoogleWeatherResponse {
  temperature?: { degrees: number; unit: string };
  feelsLikeTemperature?: { degrees: number; unit: string };
  relativeHumidity?: number;
  wind?: {
    speed?: { value: number; unit: string };
    direction?: { cardinal: string };
  };
  weatherCondition?: {
    description?: { text: string };
    type?: string;
  };
  error?: { code: number; message: string };
}

/**
 * Result from trying Google Weather API - includes geo data for fallback
 */
interface GoogleWeatherResult {
  weather: string | null;
  geo: GeocodingResult | null;
}

/**
 * Try Google Weather API first (fastest, uses existing API key)
 * Returns both the weather result AND the geocoded coordinates (for fallback reuse)
 */
async function tryGoogleWeather(location: string): Promise<GoogleWeatherResult> {
  const log = getLogger();
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    log.debug({ location }, '🌤️ Google Weather skipped - no API key');
    return { weather: null, geo: null };
  }

  try {
    // First geocode the location (we'll reuse this for fallback)
    const geo = await geocodeWithGoogle(location);
    if (!geo) {
      log.info({ location }, '🌤️ [DIAG] Google geocoding FAILED for location');
      return { weather: null, geo: null };
    }

    // 🔍 DIAGNOSTIC: Log geocoded coordinates to verify location
    log.info(
      {
        location,
        geocodedName: geo.name,
        geocodedState: geo.admin1,
        geocodedCountry: geo.country,
        latitude: geo.latitude,
        longitude: geo.longitude,
      },
      '🌤️ [DIAG] Geocoded location - verify these coordinates are correct!'
    );

    // Call Google Weather API (GET with query params - NOT POST!)
    const url = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${apiKey}&location.latitude=${geo.latitude}&location.longitude=${geo.longitude}&unitsSystem=IMPERIAL`;
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Google Weather API might not be enabled - fall back silently
      // BUT return the geo data so fallback doesn't need to re-geocode!
      log.info({ location, status: response.status }, '🌤️ [DIAG] Google Weather API HTTP error');
      return { weather: null, geo }; // Pass geo for Open-Meteo fallback
    }

    const data = (await response.json()) as GoogleWeatherResponse;

    // 🔍 DIAGNOSTIC: Log the RAW API response to see what we actually got
    log.info(
      {
        location,
        rawApiResponse: JSON.stringify(data).slice(0, 500),
        hasTemperature: !!data.temperature,
        hasError: !!data.error,
      },
      '🌤️ [DIAG] RAW Google Weather API response'
    );

    if (data.error || !data.temperature) {
      log.info(
        { location, error: data.error?.message },
        '🌤️ [DIAG] Google Weather returned no data'
      );
      return { weather: null, geo }; // Pass geo for fallback
    }

    const temp = data.temperature?.degrees;
    const feelsLike = data.feelsLikeTemperature?.degrees;
    const humidity = data.relativeHumidity;
    const windSpeed = data.wind?.speed?.value;
    const condition =
      data.weatherCondition?.description?.text ||
      data.weatherCondition?.type ||
      'varied conditions';

    const locationName = formatLocationName(geo);
    const feelsLikeStr =
      feelsLike && Math.abs(feelsLike - (temp || 0)) > 3
        ? `, feels like ${Math.round(feelsLike)}°F`
        : '';

    // 🔍 DIAGNOSTIC: Log EXACTLY what we're returning to user
    log.info(
      {
        location,
        locationName,
        source: 'GoogleWeather',
        temperature: temp,
        feelsLike,
        humidity,
        windSpeed,
        condition,
        timestamp: new Date().toISOString(),
      },
      '🌤️ [DIAG] Google Weather SUCCESS - returning this data to user'
    );

    const weatherStr =
      `Right now in ${locationName}: ${Math.round(temp || 0)}°F with ${condition.toLowerCase()}${feelsLikeStr}. ` +
      `Humidity is ${humidity || 0}% and winds are ${Math.round(windSpeed || 0)} mph.`;

    return { weather: weatherStr, geo };
  } catch (error) {
    log.info({ location, error: String(error) }, '🌤️ [DIAG] Google Weather EXCEPTION');
    return { weather: null, geo: null };
  }
}
// ============================================================================
// TYPES
// ============================================================================

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
 * Priority: Google Weather API → Open-Meteo (fallback)
 */
export async function getCurrentWeather(location: string): Promise<string> {
  const startTime = Date.now();
  const log = getLogger();

  log.info({ timestamp: new Date().toISOString(), location }, '🌤️ [DIAG] getCurrentWeather START');

  // Try Google Weather API first (fast, uses existing API key)
  const { weather: googleWeather, geo: googleGeo } = await tryGoogleWeather(location);
  if (googleWeather) {
    log.info(
      { location, elapsed: Date.now() - startTime, source: 'GoogleWeather' },
      '🌤️ Weather from Google'
    );
    return googleWeather;
  }

  // Fallback to Open-Meteo (free, no API key needed)
  // OPTIMIZATION: Reuse Google's geocoding if available (saves ~300ms!)
  log.info({ location, hasGoogleGeo: !!googleGeo }, '🌤️ [DIAG] Falling back to Open-Meteo');
  const geo = googleGeo ?? (await geocodeLocation(location));

  if (!geo) {
    log.warn(
      { location, elapsed: Date.now() - startTime },
      '🌤️ [DIAG] getCurrentWeather: Geocoding FAILED for Open-Meteo'
    );
    return `I couldn't find weather data for "${location}". Try a major city name?`;
  }

  // 🔍 DIAGNOSTIC: Log geocoded coordinates for Open-Meteo path
  const geoSource = googleGeo ? 'GoogleGeo (reused)' : 'OpenMeteo';
  log.info(
    {
      location,
      geocodedName: geo.name,
      geocodedState: geo.admin1,
      geocodedCountry: geo.country,
      latitude: geo.latitude,
      longitude: geo.longitude,
      source: geoSource,
    },
    '🌤️ [DIAG] Open-Meteo using coordinates'
  );

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${geo.latitude}&longitude=${geo.longitude}` +
      `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph`;

    log.info(
      { location, geo: geo.name, url: url.slice(0, 150) },
      '🌤️ [DIAG] Fetching Open-Meteo data...'
    );
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      log.warn(
        { location, status: response.status, elapsed: Date.now() - startTime },
        '🌤️ [DIAG] Open-Meteo API returned non-OK'
      );
      return `Couldn't get current weather for ${geo.name}.`;
    }

    const data = (await response.json()) as { current?: CurrentWeather };
    const { current } = data;

    // 🔍 DIAGNOSTIC: Log the RAW Open-Meteo response
    log.info(
      {
        location,
        rawApiResponse: JSON.stringify(data).slice(0, 500),
        hasCurrent: !!current,
      },
      '🌤️ [DIAG] RAW Open-Meteo API response'
    );

    if (!current) {
      log.warn(
        { location, elapsed: Date.now() - startTime },
        '🌤️ [DIAG] Open-Meteo returned no current data'
      );
      return `No weather data available for ${geo.name}.`;
    }

    const condition = getWeatherDescription(current.weather_code);
    const feelsLike = current.apparent_temperature
      ? `, feels like ${Math.round(current.apparent_temperature)}°F`
      : '';

    const locationName = formatLocationName(geo);

    // 🔍 DIAGNOSTIC: Log EXACTLY what we're returning from Open-Meteo
    log.info(
      {
        location,
        locationName,
        source: 'OpenMeteo',
        temperature: current.temperature_2m,
        feelsLike: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        weatherCode: current.weather_code,
        condition,
        timestamp: new Date().toISOString(),
        elapsed: Date.now() - startTime,
      },
      '🌤️ [DIAG] Open-Meteo SUCCESS - returning this data to user'
    );

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
 * Get sunrise/sunset times for a location
 */
export async function getSunriseSunset(location: string): Promise<string> {
  const log = getLogger();
  const geo = await geocodeLocation(location);

  if (!geo) {
    return `I couldn't find "${location}". Try a city name like "Philadelphia" or "Denver".`;
  }

  try {
    // Open-Meteo provides sunrise/sunset in daily forecast
    const url =
      `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${geo.latitude}&longitude=${geo.longitude}` +
      `&daily=sunrise,sunset&timezone=auto&forecast_days=1`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      return `Couldn't get sunrise/sunset for ${geo.name}.`;
    }

    const data = (await response.json()) as {
      daily?: {
        sunrise?: string[];
        sunset?: string[];
      };
      timezone?: string;
    };

    if (!data.daily?.sunrise?.[0] || !data.daily?.sunset?.[0]) {
      return `No sunrise/sunset data available for ${geo.name}.`;
    }

    const sunriseDate = new Date(data.daily.sunrise[0]);
    const sunsetDate = new Date(data.daily.sunset[0]);

    const formatTime = (date: Date) => {
      const hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes} ${ampm}`;
    };

    const sunriseTime = formatTime(sunriseDate);
    const sunsetTime = formatTime(sunsetDate);

    // Calculate daylight hours
    const daylightMs = sunsetDate.getTime() - sunriseDate.getTime();
    const daylightHours = Math.floor(daylightMs / (1000 * 60 * 60));
    const daylightMinutes = Math.floor((daylightMs % (1000 * 60 * 60)) / (1000 * 60));

    const locationName = formatLocationName(geo);

    log.info(
      { location, locationName, sunrise: sunriseTime, sunset: sunsetTime },
      '🌅 Sunrise/sunset'
    );

    return `In ${locationName} today: Sunrise at ${sunriseTime}, sunset at ${sunsetTime}. That's ${daylightHours} hours and ${daylightMinutes} minutes of daylight.`;
  } catch (error) {
    log.warn(`Sunrise/sunset API error: ${error}`);
    return `I had trouble getting sunrise/sunset times.`;
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

    const locationName = formatLocationName(geo);

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

    getSunriseSunset: llm.tool({
      description:
        'Get sunrise and sunset times for a location. Use when user asks about sunrise, sunset, daylight hours, golden hour, or when the sun rises/sets.',
      parameters: z.object({
        location: z.string().describe('City name'),
      }),
      execute: async ({ location }) => {
        const startTime = Date.now();
        logger.info({ location }, '🌅 Sunrise/sunset tool called');

        try {
          const result = await getSunriseSunset(location);
          const elapsed = Date.now() - startTime;
          logger.info(
            { location, elapsed, resultLength: result.length },
            '🌅 Sunrise/sunset returned'
          );
          return result;
        } catch (error) {
          logger.error({ location, error: String(error) }, '🌅 Sunrise/sunset tool error');
          return `I couldn't get sunrise/sunset times for ${location}. Try a different city name?`;
        }
      },
    }),
  };
}

export default createWeatherTools;

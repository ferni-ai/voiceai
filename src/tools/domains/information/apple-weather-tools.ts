/**
 * Apple WeatherKit Tools
 *
 * Get weather data from Apple's WeatherKit API.
 * Provides current conditions, forecasts, and weather alerts.
 * Falls back gracefully when WeatherKit is not configured.
 *
 * Requirements:
 * - Apple Developer account
 * - APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY env vars
 * - WeatherKit enabled in Apple Developer portal
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

const log = getLogger();

// Fast geocoding: Google (primary, ~50-150ms) → Open-Meteo (fallback, free)
async function geocodeLocation(
  location: string
): Promise<{ lat: number; lon: number; name: string; admin1?: string } | null> {
  const start = Date.now();

  // Try Google first (faster, ~50-150ms vs ~200-500ms)
  const googleResult = await geocodeWithGoogle(location);
  if (googleResult) {
    log.debug({ location, provider: 'google', ms: Date.now() - start }, '📍 Geocoded');
    return googleResult;
  }

  // Fall back to Open-Meteo (free, no API key needed)
  const openMeteoResult = await geocodeWithOpenMeteo(location);
  if (openMeteoResult) {
    log.debug({ location, provider: 'open-meteo', ms: Date.now() - start }, '📍 Geocoded');
    return openMeteoResult;
  }

  log.debug({ location, ms: Date.now() - start }, '📍 Geocoding failed');
  return null;
}

// Google Geocoding API (~50-150ms, very fast)
async function geocodeWithGoogle(
  location: string
): Promise<{ lat: number; lon: number; name: string; admin1?: string } | null> {
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
        formatted_address?: string;
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

    return {
      lat: coords.lat,
      lon: coords.lng,
      name: city || location,
      admin1: state,
    };
  } catch {
    return null;
  }
}

// Open-Meteo Geocoding (free fallback, ~200-500ms)
async function geocodeWithOpenMeteo(
  location: string
): Promise<{ lat: number; lon: number; name: string; admin1?: string } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string }>;
    };
    const result = data.results?.[0];

    if (!result) return null;

    return {
      lat: result.latitude,
      lon: result.longitude,
      name: result.name,
      admin1: result.admin1,
    };
  } catch {
    return null;
  }
}

// Lazy import to avoid startup errors when not configured
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function getWeatherKitService() {
  try {
    const {
      isWeatherKitAvailable,
      getWeather,
      formatCurrentWeatherForVoice,
      formatForecastForVoice,
      formatAlertsForVoice,
    } = await import('../../../services/apple/weatherkit.js');
    return {
      isWeatherKitAvailable,
      getWeather,
      formatCurrentWeatherForVoice,
      formatForecastForVoice,
      formatAlertsForVoice,
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'WeatherKit service not available');
    return null;
  }
}

export const appleWeatherTools: ToolDefinition[] = [
  {
    id: 'getAppleWeather',
    name: 'Get Apple Weather',
    description:
      'Get detailed weather from Apple WeatherKit - current conditions, forecast, and alerts for ANY city worldwide',
    domain: 'information',
    tags: ['weather', 'apple', 'forecast', 'temperature'],
    create: (_ctx: ToolContext) =>
      llm.tool({
        description: getToolDescription('getAppleWeather'),
        parameters: z.object({
          location: z
            .string()
            .describe('Any city name worldwide (e.g., "Provo", "San Francisco", "Paris", "Tokyo")'),
          includeforecast: z.boolean().optional().default(false).describe('Include 3-day forecast'),
        }),
        execute: async ({ location, includeforecast }) => {
          log.info({ location, includeforecast }, '🍎 Apple Weather requested');

          const service = await getWeatherKitService();
          if (!service) {
            return `WeatherKit isn't set up yet. Let me use my other weather source...`;
          }

          if (!service.isWeatherKitAvailable()) {
            return "Apple WeatherKit isn't configured. You'll need an Apple Developer account.";
          }

          // Geocode ANY city using Open-Meteo (works worldwide!)
          const coords = await geocodeLocation(location);
          if (!coords) {
            return `I couldn't find "${location}" on the map. Could you try a different spelling or nearby city?`;
          }

          // Format location name nicely (e.g., "Provo, Utah" or "Paris")
          const locationName = coords.admin1 ? `${coords.name}, ${coords.admin1}` : coords.name;

          try {
            const weather = await service.getWeather(coords.lat, coords.lon);

            if (!weather || !weather.current) {
              return `I couldn't get weather data for ${locationName} right now.`;
            }

            let response = service.formatCurrentWeatherForVoice(weather.current, locationName);

            // Add alerts if any (Apple's killer feature!)
            const alertText = service.formatAlertsForVoice(weather.alerts);
            if (alertText) {
              response = `${alertText}\n\n${response}`;
            }

            // Add forecast if requested
            if (includeforecast && weather.daily.length > 0) {
              response += `\n\n📅 Forecast: ${service.formatForecastForVoice(weather.daily)}`;
            }

            return response;
          } catch (error) {
            log.error({ location, error: String(error) }, '🍎 WeatherKit fetch failed');
            return `I had trouble getting weather for ${locationName}. Let me try another source.`;
          }
        },
      }),
  },
];

export default appleWeatherTools;

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
import { getToolDescription } from '../../utils/tool-descriptions.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';

const log = getLogger();

// Common city coordinates for quick lookups
const CITY_COORDINATES: Record<string, { lat: number; lon: number; name: string }> = {
  'new york': { lat: 40.7128, lon: -74.006, name: 'New York' },
  nyc: { lat: 40.7128, lon: -74.006, name: 'New York' },
  'los angeles': { lat: 34.0522, lon: -118.2437, name: 'Los Angeles' },
  la: { lat: 34.0522, lon: -118.2437, name: 'Los Angeles' },
  chicago: { lat: 41.8781, lon: -87.6298, name: 'Chicago' },
  houston: { lat: 29.7604, lon: -95.3698, name: 'Houston' },
  phoenix: { lat: 33.4484, lon: -112.074, name: 'Phoenix' },
  philadelphia: { lat: 39.9526, lon: -75.1652, name: 'Philadelphia' },
  'san antonio': { lat: 29.4241, lon: -98.4936, name: 'San Antonio' },
  'san diego': { lat: 32.7157, lon: -117.1611, name: 'San Diego' },
  dallas: { lat: 32.7767, lon: -96.797, name: 'Dallas' },
  'san francisco': { lat: 37.7749, lon: -122.4194, name: 'San Francisco' },
  sf: { lat: 37.7749, lon: -122.4194, name: 'San Francisco' },
  austin: { lat: 30.2672, lon: -97.7431, name: 'Austin' },
  seattle: { lat: 47.6062, lon: -122.3321, name: 'Seattle' },
  denver: { lat: 39.7392, lon: -104.9903, name: 'Denver' },
  boston: { lat: 42.3601, lon: -71.0589, name: 'Boston' },
  miami: { lat: 25.7617, lon: -80.1918, name: 'Miami' },
  atlanta: { lat: 33.749, lon: -84.388, name: 'Atlanta' },
  nashville: { lat: 36.1627, lon: -86.7816, name: 'Nashville' },
  portland: { lat: 45.5152, lon: -122.6784, name: 'Portland' },
  'las vegas': { lat: 36.1699, lon: -115.1398, name: 'Las Vegas' },
  vegas: { lat: 36.1699, lon: -115.1398, name: 'Las Vegas' },
  london: { lat: 51.5074, lon: -0.1278, name: 'London' },
  paris: { lat: 48.8566, lon: 2.3522, name: 'Paris' },
  tokyo: { lat: 35.6762, lon: 139.6503, name: 'Tokyo' },
  sydney: { lat: -33.8688, lon: 151.2093, name: 'Sydney' },
};

// Lazy import to avoid startup errors when not configured
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

function getCoordinates(location: string): { lat: number; lon: number; name: string } | null {
  const lower = location.toLowerCase().trim();

  // Check exact match first
  if (CITY_COORDINATES[lower]) {
    return CITY_COORDINATES[lower];
  }

  // Check partial match
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (lower.includes(key) || key.includes(lower)) {
      return coords;
    }
  }

  return null;
}

export const appleWeatherTools: ToolDefinition[] = [
  {
    id: 'getAppleWeather',
    name: 'Get Apple Weather',
    description:
      'Get detailed weather from Apple WeatherKit - current conditions, forecast, and alerts',
    domain: 'information',
    tags: ['weather', 'apple', 'forecast', 'temperature'],
    create: (_ctx: ToolContext) =>
      llm.tool({
        description: getToolDescription('getAppleWeather'),
        parameters: z.object({
          location: z.string().describe('City name (e.g., "San Francisco", "NYC", "London")'),
          includeforecast: z.boolean().optional().default(false).describe('Include 3-day forecast'),
        }),
        execute: async ({ location, includeforecast }) => {
          log.info({ location, includeforecast }, '🍎 Apple Weather requested');

          const service = await getWeatherKitService();
          if (!service) {
            // Fall back to existing weather tool
            return `WeatherKit isn't set up yet. Let me use my other weather source...`;
          }

          if (!service.isWeatherKitAvailable()) {
            return "Apple WeatherKit isn't configured. You'll need an Apple Developer account.";
          }

          // Get coordinates for the location
          const coords = getCoordinates(location);
          if (!coords) {
            return `I don't have coordinates for "${location}" yet. Try a major city like San Francisco, New York, or London.`;
          }

          try {
            const weather = await service.getWeather(coords.lat, coords.lon);

            if (!weather || !weather.current) {
              return `I couldn't get weather data for ${coords.name} right now.`;
            }

            let response = service.formatCurrentWeatherForVoice(weather.current, coords.name);

            // Add alerts if any
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
            return `I had trouble getting weather for ${coords.name}. Let me try another source.`;
          }
        },
      }),
  },
];

export default appleWeatherTools;

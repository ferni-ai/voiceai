/**
 * Weather for the caller's home: the conversation hook for a report, and with
 * WORLD_NOW the report read live from the world cache (index.ts), never
 * waiting on the network.
 *
 * @module services/world-awareness/home-weather
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { WeatherContext } from './index.js';

const log = createLogger({ module: 'WorldAwareness' });

/** The parts of a caller's world cache the home weather reads and writes. */
export interface HomeWeatherCache {
  interests: { location?: string };
  weather?: WeatherContext;
  isRefreshing: boolean;
}

// ============================================================================
// WEATHER CONVERSATION HOOKS
// ============================================================================

export function generateWeatherHook(weatherText: string): string | undefined {
  const lower = weatherText.toLowerCase();

  if (lower.includes('rain') || lower.includes('storm')) {
    return "It's rainy out there - good day to stay cozy.";
  }
  if (lower.includes('snow')) {
    return 'Snow outside! Perfect weather for hot cocoa.';
  }
  if (lower.includes('sunny') || lower.includes('clear')) {
    return 'Beautiful weather today - hope you can enjoy some of it.';
  }
  if (
    lower.includes('hot') ||
    (lower.includes('°f') && parseInt(lower.match(/(\d+)°f/)?.[1] || '0') > 85)
  ) {
    return "It's hot out there - stay hydrated!";
  }
  if (
    lower.includes('cold') ||
    (lower.includes('°f') && parseInt(lower.match(/(\d+)°f/)?.[1] || '100') < 40)
  ) {
    return 'Pretty cold today - bundle up if you go out.';
  }

  return undefined;
}

/** Reads today's report for a location, without the forecast (index.ts fetchWeatherData). */
export type FetchHomeWeather = (location: string) => Promise<WeatherContext | undefined>;

/** WORLD_NOW: today's report for their home into the cache, without the forecast. */
export async function refreshHomeWeather(
  userId: string,
  cache: HomeWeatherCache,
  location: string,
  fetchWeather: FetchHomeWeather
): Promise<void> {
  try {
    const weather = await fetchWeather(location);
    if (weather) cache.weather = weather;
    log.info({ userId, hasWeather: Boolean(weather) }, 'Home weather cached');
  } finally {
    cache.isRefreshing = false;
  }
}

/**
 * The cached weather report for the caller's home (WORLD_NOW), never waiting
 * on the network: once it is older than `ttlMs` a background refresh starts
 * and the next read gets the new report.
 */
export function homeWeatherFrom(
  userId: string,
  cache: HomeWeatherCache,
  ttlMs: number,
  now: number,
  fetchWeather: FetchHomeWeather
): string | undefined {
  const location = cache.interests.location;
  const age = cache.weather ? now - cache.weather.fetchedAt.getTime() : Infinity;
  if (location && age > ttlMs && !cache.isRefreshing) {
    cache.isRefreshing = true;
    void refreshHomeWeather(userId, cache, location, fetchWeather);
  }
  return age > 2 * ttlMs ? undefined : cache.weather?.current;
}

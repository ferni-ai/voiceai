/**
 * The forecast's days must be the place's own days. Open-Meteo buckets daily
 * values by GMT unless asked for a zone, so in the US evening "tomorrow" came
 * back as today's numbers (assistant audit, 2026-10-11, weather.ts:458).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
  };
});
vi.mock('../utils/geocoding.js', () => ({
  geocodeLocation: vi.fn(async () => ({
    name: 'New York',
    latitude: 40.71,
    longitude: -74.01,
    country: 'United States',
    admin1: 'New York',
  })),
  geocodeWithGoogle: vi.fn(async () => null),
  formatLocationName: () => 'New York',
}));

import { getWeatherForecast } from '../weather.js';

afterEach(() => vi.unstubAllGlobals());

describe('getWeatherForecast', () => {
  it('asks Open-Meteo for the location’s local days (timezone=auto)', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return new Response(
          JSON.stringify({
            daily: {
              time: ['2026-10-12', '2026-10-13'],
              temperature_2m_max: [70, 65],
              temperature_2m_min: [50, 48],
              weather_code: [0, 3],
              precipitation_probability_max: [0, 10],
            },
          })
        );
      })
    );

    const text = await getWeatherForecast('New York', 2);

    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).searchParams.get('timezone')).toBe('auto');
    expect(text).toContain('Mon: 70°/50°');
  });
});

/**
 * Apple WeatherKit Service Tests
 *
 * Tests for weather data retrieval and formatting from WeatherKit API.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock apple-jwt
vi.mock('../apple-jwt.js', () => ({
  isAppleConfigured: vi.fn().mockReturnValue(true),
  getWeatherKitToken: vi.fn().mockReturnValue('mock-token'),
}));

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  isWeatherKitAvailable,
  getWeather,
  formatCurrentWeatherForVoice,
  formatForecastForVoice,
  formatAlertsForVoice,
  type WeatherConditions,
  type DailyForecast,
  type WeatherAlert,
} from '../weatherkit.js';

describe('WeatherKit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isWeatherKitAvailable', () => {
    it('should return true when Apple is configured', () => {
      expect(isWeatherKitAvailable()).toBe(true);
    });

    it('should return false when Apple is not configured', async () => {
      const { isAppleConfigured } = await import('../apple-jwt.js');
      (isAppleConfigured as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      expect(isWeatherKitAvailable()).toBe(false);
    });
  });

  describe('getWeather', () => {
    const mockWeatherResponse = {
      currentWeather: {
        temperature: 20,
        temperatureApparent: 18,
        humidity: 0.65,
        windSpeed: 10,
        windDirection: 180,
        conditionCode: 'PartlyCloudy',
        uvIndex: 5,
        visibility: 10000,
        pressure: 1013,
        precipitationIntensity: 0,
        cloudCover: 0.4,
        asOf: '2024-12-25T12:00:00Z',
      },
      forecastDaily: {
        days: [
          {
            forecastStart: '2024-12-25',
            temperatureMax: 22,
            temperatureMin: 15,
            conditionCode: 'PartlyCloudy',
            precipitationChance: 0.1,
            precipitationType: 'none',
            sunrise: '2024-12-25T07:00:00Z',
            sunset: '2024-12-25T17:00:00Z',
          },
          {
            forecastStart: '2024-12-26',
            temperatureMax: 24,
            temperatureMin: 16,
            conditionCode: 'Clear',
            precipitationChance: 0,
            precipitationType: 'none',
            sunrise: '2024-12-26T07:01:00Z',
            sunset: '2024-12-26T17:00:00Z',
          },
        ],
      },
      forecastHourly: {
        hours: [
          {
            forecastStart: '2024-12-25T12:00:00Z',
            temperature: 20,
            conditionCode: 'PartlyCloudy',
            precipitationChance: 0.1,
            humidity: 0.65,
          },
        ],
      },
      weatherAlerts: {
        alerts: [],
      },
    };

    it('should return null when WeatherKit is not available', async () => {
      const { isAppleConfigured } = await import('../apple-jwt.js');
      (isAppleConfigured as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

      const result = await getWeather(37.7749, -122.4194);

      expect(result).toBeNull();
    });

    it('should fetch weather data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWeatherResponse),
      });

      const result = await getWeather(37.7749, -122.4194);

      expect(result).toBeDefined();
      expect(result?.current).toBeDefined();
      expect(result?.daily).toHaveLength(2);
      expect(result?.hourly).toHaveLength(1);
    });

    it('should parse current weather correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWeatherResponse),
      });

      const result = await getWeather(37.7749, -122.4194);

      expect(result?.current?.temperature).toBe(20);
      expect(result?.current?.conditionCode).toBe('PartlyCloudy');
      expect(result?.current?.humidity).toBe(0.65);
    });

    it('should parse daily forecast correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWeatherResponse),
      });

      const result = await getWeather(37.7749, -122.4194);

      expect(result?.daily[0].temperatureMax).toBe(22);
      expect(result?.daily[0].temperatureMin).toBe(15);
      expect(result?.daily[0].conditionCode).toBe('PartlyCloudy');
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      });

      const result = await getWeather(37.7749, -122.4194);

      expect(result).toBeNull();
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await getWeather(37.7749, -122.4194);

      expect(result).toBeNull();
    });

    it('should accept custom language parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWeatherResponse),
      });

      await getWeather(37.7749, -122.4194, 'es');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/weather/es/'),
        expect.any(Object)
      );
    });

    it('should handle empty response data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await getWeather(37.7749, -122.4194);

      expect(result?.current).toBeNull();
      expect(result?.daily).toEqual([]);
      expect(result?.hourly).toEqual([]);
      expect(result?.alerts).toEqual([]);
    });

    it('should parse weather alerts', async () => {
      const responseWithAlerts = {
        ...mockWeatherResponse,
        weatherAlerts: {
          alerts: [
            {
              id: 'alert-1',
              headline: 'Heat Advisory',
              severity: 'moderate',
              description: 'High temperatures expected',
              expireTime: '2024-12-26T00:00:00Z',
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWithAlerts),
      });

      const result = await getWeather(37.7749, -122.4194);

      expect(result?.alerts).toHaveLength(1);
      expect(result?.alerts[0].headline).toBe('Heat Advisory');
      expect(result?.alerts[0].severity).toBe('moderate');
    });
  });

  describe('formatCurrentWeatherForVoice', () => {
    const mockConditions: WeatherConditions = {
      temperature: 20,
      temperatureApparent: 20,
      humidity: 0.5,
      windSpeed: 10,
      windDirection: 180,
      conditionCode: 'PartlyCloudy',
      uvIndex: 5,
      visibility: 10000,
      pressure: 1013,
      precipitationIntensity: 0,
      cloudCover: 0.4,
      asOf: '2024-12-25T12:00:00Z',
    };

    it('should format current weather without location', () => {
      const result = formatCurrentWeatherForVoice(mockConditions);

      expect(result).toContain('68°F'); // 20°C = 68°F
      expect(result).toContain('partly cloudy');
    });

    it('should format current weather with location', () => {
      const result = formatCurrentWeatherForVoice(mockConditions, 'San Francisco');

      expect(result).toContain('In San Francisco');
      expect(result).toContain('68°F');
    });

    it('should include feels-like when significantly different', () => {
      const conditionsWithFeelsLike: WeatherConditions = {
        ...mockConditions,
        temperature: 20,
        temperatureApparent: 25, // Significantly different
      };

      const result = formatCurrentWeatherForVoice(conditionsWithFeelsLike);

      expect(result).toContain('Feels like 77°F');
    });

    it('should not include feels-like when similar', () => {
      const result = formatCurrentWeatherForVoice(mockConditions);

      expect(result).not.toContain('Feels like');
    });

    it('should include humidity when high', () => {
      const humidConditions: WeatherConditions = {
        ...mockConditions,
        humidity: 0.85,
      };

      const result = formatCurrentWeatherForVoice(humidConditions);

      expect(result).toContain('Humidity is 85%');
    });

    it('should handle various condition codes', () => {
      const conditions = [
        { code: 'Clear', expected: 'clear skies' },
        { code: 'Cloudy', expected: 'cloudy' },
        { code: 'Rain', expected: 'rain' },
        { code: 'Snow', expected: 'snow' },
        { code: 'Thunderstorms', expected: 'thunderstorms' },
      ];

      for (const { code, expected } of conditions) {
        const result = formatCurrentWeatherForVoice({
          ...mockConditions,
          conditionCode: code,
        });
        expect(result.toLowerCase()).toContain(expected);
      }
    });
  });

  describe('formatForecastForVoice', () => {
    const mockDaily: DailyForecast[] = [
      {
        date: '2024-12-25',
        temperatureMax: 22,
        temperatureMin: 15,
        conditionCode: 'PartlyCloudy',
        precipitationChance: 0.1,
        precipitationType: 'none',
        sunrise: '2024-12-25T07:00:00Z',
        sunset: '2024-12-25T17:00:00Z',
      },
      {
        date: '2024-12-26',
        temperatureMax: 24,
        temperatureMin: 16,
        conditionCode: 'Clear',
        precipitationChance: 0,
        precipitationType: 'none',
        sunrise: '2024-12-26T07:01:00Z',
        sunset: '2024-12-26T17:00:00Z',
      },
      {
        date: '2024-12-27',
        temperatureMax: 20,
        temperatureMin: 14,
        conditionCode: 'Rain',
        precipitationChance: 0.6,
        precipitationType: 'rain',
        sunrise: '2024-12-27T07:02:00Z',
        sunset: '2024-12-27T17:01:00Z',
      },
    ];

    it('should format 3-day forecast', () => {
      const result = formatForecastForVoice(mockDaily);

      expect(result).toContain('Today');
      expect(result).toContain('Tomorrow');
      expect(result).toContain('high of');
      expect(result).toContain('low of');
    });

    it('should return message when no forecast', () => {
      const result = formatForecastForVoice([]);

      expect(result).toContain("don't have forecast data");
    });

    it('should include precipitation chance when significant', () => {
      const result = formatForecastForVoice(mockDaily);

      expect(result).toContain('60% chance of rain');
    });

    it('should convert temperatures to Fahrenheit', () => {
      const result = formatForecastForVoice(mockDaily);

      // 22°C = 72°F, 15°C = 59°F
      expect(result).toContain('72°F');
      expect(result).toContain('59°F');
    });
  });

  describe('formatAlertsForVoice', () => {
    it('should return null when no alerts', () => {
      const result = formatAlertsForVoice([]);

      expect(result).toBeNull();
    });

    it('should format severe alerts with warning icon', () => {
      const alerts: WeatherAlert[] = [
        {
          id: 'alert-1',
          headline: 'Tornado Warning',
          severity: 'extreme',
          description: 'Seek shelter immediately',
          expires: '2024-12-25T18:00:00Z',
        },
      ];

      const result = formatAlertsForVoice(alerts);

      expect(result).toContain('⚠️');
      expect(result).toContain('Weather alert');
      expect(result).toContain('Tornado Warning');
    });

    it('should format moderate alerts as advisory', () => {
      const alerts: WeatherAlert[] = [
        {
          id: 'alert-1',
          headline: 'Wind Advisory',
          severity: 'moderate',
          description: 'Gusty winds expected',
          expires: '2024-12-25T18:00:00Z',
        },
      ];

      const result = formatAlertsForVoice(alerts);

      expect(result).toContain('Weather advisory');
      expect(result).toContain('Wind Advisory');
    });

    it('should prioritize extreme/severe alerts', () => {
      const alerts: WeatherAlert[] = [
        {
          id: 'alert-1',
          headline: 'Wind Advisory',
          severity: 'moderate',
          description: 'Gusty winds',
          expires: '2024-12-25T18:00:00Z',
        },
        {
          id: 'alert-2',
          headline: 'Hurricane Warning',
          severity: 'extreme',
          description: 'Hurricane approaching',
          expires: '2024-12-25T20:00:00Z',
        },
      ];

      const result = formatAlertsForVoice(alerts);

      expect(result).toContain('Hurricane Warning');
      expect(result).not.toContain('Wind Advisory');
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing fields in API response', async () => {
      const incompleteResponse = {
        currentWeather: {
          temperature: 20,
          // Missing most fields
        },
        forecastDaily: {
          days: [
            {
              forecastStart: '2024-12-25',
              // Missing most fields
            },
          ],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(incompleteResponse),
      });

      const result = await getWeather(37.7749, -122.4194);

      expect(result?.current?.temperature).toBe(20);
      expect(result?.current?.conditionCode).toBe('Unknown'); // Default value
    });

    it('should limit hourly forecast to 24 hours', async () => {
      const responseWith48Hours = {
        ...{
          forecastHourly: {
            hours: Array(48)
              .fill(null)
              .map((_, i) => ({
                forecastStart: `2024-12-25T${i.toString().padStart(2, '0')}:00:00Z`,
                temperature: 20 + i,
                conditionCode: 'Clear',
                precipitationChance: 0,
                humidity: 0.5,
              })),
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWith48Hours),
      });

      const result = await getWeather(37.7749, -122.4194);

      expect(result?.hourly).toHaveLength(24);
    });

    it('should limit daily forecast to 7 days', async () => {
      const responseWith14Days = {
        forecastDaily: {
          days: Array(14)
            .fill(null)
            .map((_, i) => ({
              forecastStart: `2024-12-${(25 + i).toString().padStart(2, '0')}`,
              temperatureMax: 22,
              temperatureMin: 15,
              conditionCode: 'Clear',
              precipitationChance: 0,
              precipitationType: 'none',
              sunrise: '07:00',
              sunset: '17:00',
            })),
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(responseWith14Days),
      });

      const result = await getWeather(37.7749, -122.4194);

      expect(result?.daily).toHaveLength(7);
    });
  });
});

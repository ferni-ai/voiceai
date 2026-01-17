/**
 * Apple WeatherKit Service
 *
 * Get weather data from Apple's WeatherKit API.
 * Same data that powers Apple's Weather app.
 *
 * Features:
 * - Current conditions
 * - Hourly forecast (up to 240 hours)
 * - Daily forecast (up to 10 days)
 * - Weather alerts
 * - Historical weather
 *
 * Free tier: 500,000 calls/month with Apple Developer membership
 *
 * @see https://developer.apple.com/documentation/weatherkitrestapi
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getWeatherKitToken, isAppleConfigured } from './apple-jwt.js';

const log = getLogger();

const WEATHERKIT_BASE_URL = 'https://weatherkit.apple.com/api/v1';

// Types
export interface WeatherConditions {
  temperature: number;
  temperatureApparent: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  conditionCode: string;
  uvIndex: number;
  visibility: number;
  pressure: number;
  precipitationIntensity: number;
  cloudCover: number;
  asOf: string;
}

export interface DailyForecast {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  conditionCode: string;
  precipitationChance: number;
  precipitationType: string;
  sunrise: string;
  sunset: string;
}

export interface HourlyForecast {
  time: string;
  temperature: number;
  conditionCode: string;
  precipitationChance: number;
  humidity: number;
}

export interface WeatherData {
  current: WeatherConditions | null;
  daily: DailyForecast[];
  hourly: HourlyForecast[];
  alerts: WeatherAlert[];
}

export interface WeatherAlert {
  id: string;
  headline: string;
  severity: string;
  description: string;
  expires: string;
}

// Condition code to human-readable descriptions
const CONDITION_CODES: Record<string, string> = {
  Clear: 'clear skies',
  Cloudy: 'cloudy',
  MostlyClear: 'mostly clear',
  MostlyCloudy: 'mostly cloudy',
  PartlyCloudy: 'partly cloudy',
  Rain: 'rain',
  Drizzle: 'drizzle',
  HeavyRain: 'heavy rain',
  Snow: 'snow',
  HeavySnow: 'heavy snow',
  Flurries: 'snow flurries',
  Sleet: 'sleet',
  FreezingRain: 'freezing rain',
  Thunderstorms: 'thunderstorms',
  Fog: 'foggy',
  Haze: 'hazy',
  Windy: 'windy',
  Breezy: 'breezy',
  Hot: 'hot',
  Cold: 'cold',
  Blizzard: 'blizzard conditions',
  TropicalStorm: 'tropical storm',
  Hurricane: 'hurricane',
};

/**
 * Check if WeatherKit is available
 */
export function isWeatherKitAvailable(): boolean {
  return isAppleConfigured();
}

/**
 * Convert Celsius to Fahrenheit
 */
function celsiusToFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

/**
 * Get condition description
 */
function getConditionDescription(code: string): string {
  return (
    CONDITION_CODES[code] ||
    code
      .toLowerCase()
      .replace(/([A-Z])/g, ' $1')
      .trim()
  );
}

/**
 * Make authenticated request to WeatherKit API
 */
async function weatherKitRequest<T>(endpoint: string): Promise<T> {
  const token = getWeatherKitToken();

  const response = await fetch(`${WEATHERKIT_BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const error = await response.text();
    log.error({ status: response.status, error }, '🍎 WeatherKit API error');
    throw new Error(`WeatherKit API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Get weather for a location
 */
export async function getWeather(
  latitude: number,
  longitude: number,
  language = 'en'
): Promise<WeatherData | null> {
  if (!isWeatherKitAvailable()) {
    log.warn('WeatherKit not configured');
    return null;
  }

  log.info({ latitude, longitude }, '🍎 Fetching weather from WeatherKit');

  try {
    interface WeatherKitResponse {
      currentWeather?: {
        temperature?: number;
        temperatureApparent?: number;
        humidity?: number;
        windSpeed?: number;
        windDirection?: number;
        conditionCode?: string;
        uvIndex?: number;
        visibility?: number;
        pressure?: number;
        precipitationIntensity?: number;
        cloudCover?: number;
        asOf?: string;
      };
      forecastDaily?: {
        days?: Array<{
          forecastStart?: string;
          temperatureMax?: number;
          temperatureMin?: number;
          conditionCode?: string;
          precipitationChance?: number;
          precipitationType?: string;
          sunrise?: string;
          sunset?: string;
        }>;
      };
      forecastHourly?: {
        hours?: Array<{
          forecastStart?: string;
          temperature?: number;
          conditionCode?: string;
          precipitationChance?: number;
          humidity?: number;
        }>;
      };
      weatherAlerts?: {
        alerts?: Array<{
          id?: string;
          headline?: string;
          severity?: string;
          description?: string;
          expireTime?: string;
        }>;
      };
    }

    const dataSets = 'currentWeather,forecastDaily,forecastHourly,weatherAlerts';
    const endpoint = `/weather/${language}/${latitude}/${longitude}?dataSets=${dataSets}`;

    const data = await weatherKitRequest<WeatherKitResponse>(endpoint);

    const current = data.currentWeather
      ? {
          temperature: data.currentWeather.temperature || 0,
          temperatureApparent: data.currentWeather.temperatureApparent || 0,
          humidity: data.currentWeather.humidity || 0,
          windSpeed: data.currentWeather.windSpeed || 0,
          windDirection: data.currentWeather.windDirection || 0,
          conditionCode: data.currentWeather.conditionCode || 'Unknown',
          uvIndex: data.currentWeather.uvIndex || 0,
          visibility: data.currentWeather.visibility || 0,
          pressure: data.currentWeather.pressure || 0,
          precipitationIntensity: data.currentWeather.precipitationIntensity || 0,
          cloudCover: data.currentWeather.cloudCover || 0,
          asOf: data.currentWeather.asOf || new Date().toISOString(),
        }
      : null;

    const daily: DailyForecast[] = (data.forecastDaily?.days || []).slice(0, 7).map((day) => ({
      date: day.forecastStart || '',
      temperatureMax: day.temperatureMax || 0,
      temperatureMin: day.temperatureMin || 0,
      conditionCode: day.conditionCode || 'Unknown',
      precipitationChance: day.precipitationChance || 0,
      precipitationType: day.precipitationType || 'none',
      sunrise: day.sunrise || '',
      sunset: day.sunset || '',
    }));

    const hourly: HourlyForecast[] = (data.forecastHourly?.hours || [])
      .slice(0, 24)
      .map((hour) => ({
        time: hour.forecastStart || '',
        temperature: hour.temperature || 0,
        conditionCode: hour.conditionCode || 'Unknown',
        precipitationChance: hour.precipitationChance || 0,
        humidity: hour.humidity || 0,
      }));

    const alerts: WeatherAlert[] = (data.weatherAlerts?.alerts || []).map((alert) => ({
      id: alert.id || '',
      headline: alert.headline || '',
      severity: alert.severity || 'unknown',
      description: alert.description || '',
      expires: alert.expireTime || '',
    }));

    log.info({ latitude, longitude, hasAlerts: alerts.length > 0 }, '🍎 WeatherKit data fetched');

    return { current, daily, hourly, alerts };
  } catch (error) {
    log.error({ latitude, longitude, error: String(error) }, '🍎 WeatherKit fetch failed');
    return null;
  }
}

/**
 * Format current weather for voice output
 */
export function formatCurrentWeatherForVoice(
  current: WeatherConditions,
  locationName?: string
): string {
  const tempF = celsiusToFahrenheit(current.temperature);
  const feelsLikeF = celsiusToFahrenheit(current.temperatureApparent);
  const condition = getConditionDescription(current.conditionCode);
  const humidity = Math.round(current.humidity * 100);

  let result = locationName
    ? `In ${locationName}, it's currently ${tempF}°F with ${condition}.`
    : `It's currently ${tempF}°F with ${condition}.`;

  if (Math.abs(tempF - feelsLikeF) > 5) {
    result += ` Feels like ${feelsLikeF}°F.`;
  }

  if (humidity > 70) {
    result += ` Humidity is ${humidity}%.`;
  }

  return result;
}

/**
 * Format forecast for voice output
 */
export function formatForecastForVoice(daily: DailyForecast[]): string {
  if (daily.length === 0) {
    return "I don't have forecast data available.";
  }

  const forecast = daily.slice(0, 3).map((day, index) => {
    const date = new Date(day.date);
    const dayName =
      index === 0
        ? 'Today'
        : index === 1
          ? 'Tomorrow'
          : date.toLocaleDateString('en-US', { weekday: 'long' });

    const highF = celsiusToFahrenheit(day.temperatureMax);
    const lowF = celsiusToFahrenheit(day.temperatureMin);
    const condition = getConditionDescription(day.conditionCode);

    let dayForecast = `${dayName}: high of ${highF}°F, low of ${lowF}°F, ${condition}`;

    if (day.precipitationChance > 0.3) {
      dayForecast += ` with ${Math.round(day.precipitationChance * 100)}% chance of ${day.precipitationType || 'precipitation'}`;
    }

    return dayForecast;
  });

  return forecast.join('. ');
}

/**
 * Format alerts for voice output
 */
export function formatAlertsForVoice(alerts: WeatherAlert[]): string | null {
  if (alerts.length === 0) return null;

  const highPriority = alerts.filter((a) => a.severity === 'extreme' || a.severity === 'severe');

  if (highPriority.length > 0) {
    return `⚠️ Weather alert: ${highPriority[0].headline}`;
  }

  return `Weather advisory: ${alerts[0].headline}`;
}

export default {
  isWeatherKitAvailable,
  getWeather,
  formatCurrentWeatherForVoice,
  formatForecastForVoice,
  formatAlertsForVoice,
};

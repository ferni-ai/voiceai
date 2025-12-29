/**
 * Weather-Calendar Intelligence
 *
 * Combines weather forecasts with calendar events to generate proactive alerts.
 *
 * "Better than human": A friend might say "bring an umbrella."
 * We say "Heads up - looks like rain at 3pm during your Central Park meeting.
 * Want me to suggest moving it indoors?"
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import { getWeatherForecast, getCurrentWeather } from '../weather.js';
import { geocodeLocation } from '../utils/geocoding.js';
import type {
  ProactiveAlert,
  AlertCategory,
  AlertUrgency,
  CalendarEvent,
  AlertGenerationContext,
} from './types.js';

const log = getLogger();

// ============================================================================
// WEATHER CONDITION DETECTION
// ============================================================================

interface WeatherCondition {
  hasRain: boolean;
  hasSevereWeather: boolean;
  isHot: boolean; // > 90°F
  isCold: boolean; // < 32°F
  isWindy: boolean; // > 20 mph
  temperature?: number;
  description: string;
}

/**
 * Parse weather description to extract conditions
 */
function parseWeatherConditions(weatherText: string): WeatherCondition {
  const lower = weatherText.toLowerCase();

  // Extract temperature if present
  const tempMatch = lower.match(/(\d+)°f/);
  const temperature = tempMatch ? parseInt(tempMatch[1], 10) : undefined;

  return {
    hasRain: /rain|shower|drizzle|storm|precipitation/.test(lower),
    hasSevereWeather: /thunderstorm|severe|storm|hail|tornado|hurricane/.test(lower),
    isHot: temperature ? temperature > 90 : false,
    isCold: temperature ? temperature < 32 : false,
    isWindy: /wind.*(strong|high|\d{2,})/.test(lower) || /(\d{2,})\s*mph/.test(lower),
    temperature,
    description: weatherText,
  };
}

// ============================================================================
// ALERT GENERATION
// ============================================================================

/**
 * Check for weather-calendar conflicts and generate alerts
 *
 * @param context - User context including location and calendar
 * @returns Array of proactive alerts
 */
export async function checkWeatherCalendarConflicts(
  context: AlertGenerationContext
): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];
  const { userId, location, calendarEvents } = context;

  if (!location || !calendarEvents || calendarEvents.length === 0) {
    log.debug({ userId }, '🌧️ No location or calendar events for weather check');
    return alerts;
  }

  // Get current weather and forecast
  const locationStr = location.city;

  try {
    const [currentWeather, forecast] = await Promise.all([
      getCurrentWeather(locationStr),
      getWeatherForecast(locationStr, 2), // 2-day forecast
    ]);

    const currentConditions = parseWeatherConditions(currentWeather);

    // Check each upcoming event for weather conflicts
    for (const event of calendarEvents) {
      const eventAlerts = await checkEventWeatherConflict(
        event,
        currentConditions,
        forecast,
        locationStr,
        userId
      );
      alerts.push(...eventAlerts);
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, '🌧️ Weather-calendar check failed');
  }

  return alerts;
}

/**
 * Check a single event for weather conflicts
 */
async function checkEventWeatherConflict(
  event: CalendarEvent,
  currentConditions: WeatherCondition,
  forecast: string,
  location: string,
  userId: string
): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];
  const now = new Date();
  const eventStart = new Date(event.startTime);
  const hoursUntilEvent = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Only check events in the next 8 hours
  if (hoursUntilEvent < 0 || hoursUntilEvent > 8) {
    return alerts;
  }

  // Determine if event is likely outdoor
  const isLikelyOutdoor = detectOutdoorEvent(event);

  // Parse forecast for event time
  const forecastConditions = parseWeatherConditions(forecast);

  // Generate alerts based on conditions
  if (forecastConditions.hasRain && isLikelyOutdoor) {
    alerts.push(
      createWeatherAlert(
        userId,
        'rain_during_event',
        event,
        `Heads up - rain is expected around ${formatEventTime(eventStart)} during your ${event.title}. Want to move it indoors or reschedule?`,
        forecastConditions.hasSevereWeather ? 'high' : 'medium'
      )
    );
  }

  if (forecastConditions.hasSevereWeather) {
    alerts.push(
      createWeatherAlert(
        userId,
        'severe_weather',
        event,
        `Weather alert: Severe weather expected this afternoon. Your ${event.title} at ${formatEventTime(eventStart)} might be affected. Stay safe!`,
        'high'
      )
    );
  }

  if (forecastConditions.isHot && isLikelyOutdoor) {
    alerts.push(
      createWeatherAlert(
        userId,
        'extreme_heat',
        event,
        `It's going to be hot (${forecastConditions.temperature}°F) during your ${event.title}. Stay hydrated and maybe find some shade!`,
        'medium'
      )
    );
  }

  if (forecastConditions.isCold && isLikelyOutdoor) {
    alerts.push(
      createWeatherAlert(
        userId,
        'extreme_cold',
        event,
        `It'll be cold (${forecastConditions.temperature}°F) during your ${event.title}. Bundle up!`,
        'low'
      )
    );
  }

  return alerts;
}

/**
 * Detect if an event is likely outdoors based on title/location
 */
function detectOutdoorEvent(event: CalendarEvent): boolean {
  if (event.isOutdoor === true) return true;
  if (event.isOutdoor === false) return false;

  const text = `${event.title} ${event.location || ''}`.toLowerCase();

  // Likely outdoor keywords
  const outdoorKeywords = [
    'park',
    'outdoor',
    'outside',
    'garden',
    'hike',
    'hiking',
    'walk',
    'run',
    'jog',
    'golf',
    'tennis',
    'soccer',
    'baseball',
    'football',
    'picnic',
    'bbq',
    'barbecue',
    'beach',
    'pool',
    'patio',
    'terrace',
    'rooftop',
    'farmers market',
    'festival',
    'concert',
    'game',
  ];

  return outdoorKeywords.some((kw) => text.includes(kw));
}

/**
 * Create a weather alert
 */
function createWeatherAlert(
  userId: string,
  type: string,
  event: CalendarEvent,
  message: string,
  urgency: AlertUrgency
): ProactiveAlert {
  const now = new Date();
  const eventStart = new Date(event.startTime);

  return {
    id: `weather-${type}-${event.id}-${now.getTime()}`,
    category: 'weather',
    title: `Weather Alert: ${event.title}`,
    message,
    urgency,
    generatedAt: now,
    relevantAt: new Date(eventStart.getTime() - 60 * 60 * 1000), // 1 hour before
    expiresAt: new Date(eventStart.getTime() + 60 * 60 * 1000), // 1 hour after
    metadata: {
      eventId: event.id,
      eventTitle: event.title,
      eventStart: eventStart.toISOString(),
      alertType: type,
    },
    suggestedActions: [
      { id: 'dismiss', label: 'Got it', type: 'dismiss' },
      {
        id: 'reschedule',
        label: 'Help me reschedule',
        type: 'act',
        params: { action: 'reschedule' },
      },
    ],
    acknowledged: false,
  };
}

/**
 * Format event time for natural speech
 */
function formatEventTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;

  if (minutes === 0) {
    return `${displayHours}${ampm}`;
  }
  return `${displayHours}:${minutes.toString().padStart(2, '0')}${ampm}`;
}

// ============================================================================
// STANDALONE WEATHER ALERTS (no calendar)
// ============================================================================

/**
 * Check for significant weather changes and generate alerts
 */
export async function checkWeatherAlerts(
  context: AlertGenerationContext
): Promise<ProactiveAlert[]> {
  const alerts: ProactiveAlert[] = [];
  const { userId, location } = context;

  if (!location) {
    return alerts;
  }

  try {
    const weather = await getCurrentWeather(location.city);
    const conditions = parseWeatherConditions(weather);

    // Severe weather alert
    if (conditions.hasSevereWeather) {
      alerts.push({
        id: `weather-severe-${Date.now()}`,
        category: 'weather',
        title: 'Severe Weather Alert',
        message: `Heads up - severe weather in ${location.city}. Stay safe and keep an eye on the forecast.`,
        urgency: 'critical',
        generatedAt: new Date(),
        relevantAt: new Date(),
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
        metadata: { location: location.city, conditions: conditions.description },
        acknowledged: false,
      });
    }

    // Extreme temperature alerts
    if (conditions.isHot && conditions.temperature) {
      alerts.push({
        id: `weather-heat-${Date.now()}`,
        category: 'weather',
        title: 'Heat Advisory',
        message: `It's ${conditions.temperature}°F outside - stay hydrated and limit time outdoors during peak hours.`,
        urgency: 'medium',
        generatedAt: new Date(),
        relevantAt: new Date(),
        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // 6 hours
        metadata: { location: location.city, temperature: conditions.temperature },
        acknowledged: false,
      });
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, '🌧️ Weather alert check failed');
  }

  return alerts;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { parseWeatherConditions, detectOutdoorEvent };

/**
 * Weather-Calendar Intelligence
 *
 * Combines weather forecasts with calendar events to generate proactive alerts.
 *
 * "Better than human": A friend might say "bring an umbrella."
 * We say "Heads up - looks like rain at 3pm during your Central Park meeting.
 * Want me to suggest moving it indoors?"
 */
import type { ProactiveAlert, CalendarEvent, AlertGenerationContext } from './types.js';
interface WeatherCondition {
    hasRain: boolean;
    hasSevereWeather: boolean;
    isHot: boolean;
    isCold: boolean;
    isWindy: boolean;
    temperature?: number;
    description: string;
}
/**
 * Parse weather description to extract conditions
 */
declare function parseWeatherConditions(weatherText: string): WeatherCondition;
/**
 * Check for weather-calendar conflicts and generate alerts
 *
 * @param context - User context including location and calendar
 * @returns Array of proactive alerts
 */
export declare function checkWeatherCalendarConflicts(context: AlertGenerationContext): Promise<ProactiveAlert[]>;
/**
 * Detect if an event is likely outdoors based on title/location
 */
declare function detectOutdoorEvent(event: CalendarEvent): boolean;
/**
 * Check for significant weather changes and generate alerts
 */
export declare function checkWeatherAlerts(context: AlertGenerationContext): Promise<ProactiveAlert[]>;
export { parseWeatherConditions, detectOutdoorEvent };
//# sourceMappingURL=weather-calendar.d.ts.map
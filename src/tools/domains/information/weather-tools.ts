/**
 * The information domain's weather tools: getWeather (current) and
 * getWeatherForecast. With no place named they use where the caller lives
 * (weather-location.ts), and getWeather answers within 3 s (weather.ts).
 *
 * @module tools/domains/information/weather-tools
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { currentWeatherWithin, getWeatherForecast } from './weather.js';
import { resolveWeatherLocation } from './weather-location.js';

export function getWeatherToolDefinitions(): ToolDefinition[] {
  const log = getLogger();

  return [
    {
      id: 'getWeather',
      name: 'Get Weather',
      description:
        'Get current weather for a city or location. Returns temperature, humidity, wind, and conditions. If user just says "weather" without a location, uses where they live (saved home, profile, or the city of this call).',
      domain: 'information',
      tags: ['information', 'weather', 'temperature', 'conditions'],
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('getWeather'),
          parameters: z.object({
            location: z
              .string()
              .optional()
              .describe(
                'City name (e.g., "Philadelphia", "Denver"). Optional - if not provided, uses user\'s detected location.'
              ),
          }),
          execute: async ({ location }, opts) => {
            const startTime = Date.now();
            const resolved = await resolveWeatherLocation(location, opts, ctx);

            if (!resolved) {
              log.info({ hasLocation: Boolean(location) }, '🌤️ Weather tool: no location known, asking');
              return "I don't know your location. Which city would you like weather for?";
            }
            const effectiveLocation = resolved.location;

            log.info(
              { hasLocation: Boolean(effectiveLocation), locationSource: resolved.source },
              '🌤️ Weather tool called'
            );

            try {
              const { text, timedOut } = await currentWeatherWithin(effectiveLocation);
              log.info(
                {
                  hasLocation: Boolean(effectiveLocation),
                  locationSource: resolved.source,
                  elapsed: Date.now() - startTime,
                  timedOut,
                },
                '🌤️ Weather result returned'
              );
              return text;
            } catch (error) {
              log.error({ hasLocation: Boolean(effectiveLocation), error: String(error) }, '🌤️ Weather error');
              return `I couldn't get weather for ${effectiveLocation}. Try a different city name?`;
            }
          },
        }),
    },
    {
      id: 'getWeatherForecast',
      name: 'Get Weather Forecast',
      description:
        'Get weather forecast for upcoming days. If user just asks about "weekend weather" without a location, uses their detected location.',
      domain: 'information',
      tags: ['information', 'weather', 'forecast', 'weekend'],
      create: (ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('getWeatherForecast'),
          parameters: z.object({
            location: z
              .string()
              .optional()
              .describe('City name. Optional - uses detected location if not provided.'),
            days: z.number().optional().describe('Number of days to forecast (1-7), defaults to 5'),
          }),
          execute: async ({ location, days = 5 }, opts) => {
            const startTime = Date.now();
            const resolved = await resolveWeatherLocation(location, opts, ctx);

            if (!resolved) {
              return "I don't know your location. Which city would you like the forecast for?";
            }
            const effectiveLocation = resolved.location;

            log.info(
              { hasLocation: Boolean(effectiveLocation), locationSource: resolved.source, days },
              '📅 Weather forecast called'
            );

            try {
              const result = await getWeatherForecast(effectiveLocation, Math.min(days, 7));
              log.info(
                { hasLocation: Boolean(effectiveLocation), days, elapsed: Date.now() - startTime },
                '📅 Forecast returned'
              );
              return result;
            } catch (error) {
              log.error({ hasLocation: Boolean(effectiveLocation), error: String(error) }, '📅 Forecast error');
              return `I couldn't get the forecast for ${effectiveLocation}. Try a different city?`;
            }
          },
        }),
    },
  ];
}

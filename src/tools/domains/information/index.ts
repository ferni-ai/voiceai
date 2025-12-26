/**
 * Information Domain Tools
 *
 * Tools for accessing information: news, weather, sports scores.
 * This domain provides properly-routed consolidated tools for the LLM.
 *
 * NOTE: Web search is handled by Gemini's built-in Google Search tool
 * (configured via `tools: [{ googleSearch: {} }]` in RealtimeModel).
 * We removed our custom searchWeb/lookupInfo tools to avoid redundancy.
 *
 * DOMAIN: information
 * TOOLS:
 *   News: getNews (routes to general/finance/tech/stock based on category)
 *   Weather: getWeather (current), getWeatherForecast (multi-day)
 *   Sports: getSports (routes to team or league scores)
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';

// Import underlying functions directly for routing
import {
  getFinancialNews,
  getGeneralNews,
  getStockNews,
  getTechNews,
  searchNewsByTopic,
} from './news.js';
import { getSportScores, getTeamScore } from './sports.js';

// Import legacy tool creators for simple wrapping
// NOTE: Search tools removed - using Gemini's built-in Google Search instead
import { createTrafficTools } from './traffic.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// LEGACY TOOL WRAPPER (for tools that don't need routing)
// ============================================================================

function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  tags?: string[]
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'information',
    tags: ['information', ...(tags || [])],
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// NEWS TOOLS (Properly routes to correct underlying function)
// ============================================================================

function getNewsToolDefinitions(): ToolDefinition[] {
  const log = getLogger();

  return [
    {
      id: 'getNews',
      name: 'Get News',
      description:
        'Get news headlines. Can search by TOPIC (e.g., "Christmas", "AI", "sports") or by CATEGORY ("general", "finance", "tech", "stock"). For topic search, provide the topic parameter. For stock news, include the ticker.',
      domain: 'information',
      tags: ['information', 'news', 'headlines', 'finance', 'tech', 'stocks', 'search'],
      create: (_ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('getNews'),
          parameters: z.object({
            topic: z
              .string()
              .optional()
              .describe(
                'Topic to search for (e.g., "Christmas", "AI", "weather"). Use this for any specific topic.'
              ),
            category: z
              .enum(['general', 'finance', 'tech', 'stock'])
              .optional()
              .describe('News category - only used if no topic specified'),
            ticker: z
              .string()
              .optional()
              .describe('Stock ticker symbol (required for stock category, e.g., "AAPL")'),
          }),
          execute: async ({ topic, category = 'general', ticker }) => {
            log.info({ topic, category, ticker }, '📰 News tool called');

            try {
              let result: string;

              // If topic is provided, use topic search
              if (topic) {
                result = await searchNewsByTopic(topic);
              } else {
                // Otherwise use category-based news
                switch (category) {
                  case 'finance':
                    result = await getFinancialNews('general');
                    break;
                  case 'tech':
                    result = await getTechNews();
                    break;
                  case 'stock':
                    if (!ticker) {
                      return 'Please specify a stock ticker symbol (e.g., AAPL, TSLA)';
                    }
                    result = await getStockNews(ticker.toUpperCase());
                    break;
                  case 'general':
                  default:
                    result = await getGeneralNews();
                }
              }

              log.info({ topic, category, resultLength: result.length }, '📰 News result returned');
              return result;
            } catch (error) {
              log.error({ topic, category, ticker, error: String(error) }, '📰 News tool error');
              return `I couldn't get news right now. Try again in a moment?`;
            }
          },
        }),
    },
  ];
}

// ============================================================================
// WEATHER TOOLS (Context-aware: uses IP-detected location as default)
// ============================================================================

import { getCurrentWeather, getWeatherForecast } from './weather.js';

function getWeatherToolDefinitions(): ToolDefinition[] {
  const log = getLogger();

  return [
    {
      id: 'getWeather',
      name: 'Get Weather',
      description:
        'Get current weather for a city or location. Returns temperature, humidity, wind, and conditions. If user just says "weather" without a location, uses their detected location from IP.',
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
          execute: async ({ location }) => {
            const startTime = Date.now();

            // Recognize placeholder values that mean "use my location"
            const PLACEHOLDER_LOCATIONS = ['current', 'here', 'my location', 'local', 'nearby'];
            const isPlaceholder = location && PLACEHOLDER_LOCATIONS.includes(location.toLowerCase().trim());

            // Use detected location if not provided OR if placeholder (TikTok-style personalization)
            let effectiveLocation = isPlaceholder ? undefined : location;
            if (!effectiveLocation && ctx.userLocation?.city) {
              effectiveLocation = ctx.userLocation.regionCode
                ? `${ctx.userLocation.city}, ${ctx.userLocation.regionCode}`
                : ctx.userLocation.city;
              log.info(
                { detectedCity: effectiveLocation, originalLocation: location },
                '📍 Using IP-detected location for weather'
              );
            }

            if (!effectiveLocation) {
              return "I don't know your location. Which city would you like weather for?";
            }

            log.info({ location: effectiveLocation }, '🌤️ Weather tool called');

            try {
              const result = await getCurrentWeather(effectiveLocation);
              log.info(
                { location: effectiveLocation, elapsed: Date.now() - startTime },
                '🌤️ Weather result returned'
              );
              return result;
            } catch (error) {
              log.error({ location: effectiveLocation, error: String(error) }, '🌤️ Weather error');
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
          execute: async ({ location, days = 5 }) => {
            const startTime = Date.now();

            // Recognize placeholder values that mean "use my location"
            const PLACEHOLDER_LOCATIONS = ['current', 'here', 'my location', 'local', 'nearby'];
            const isPlaceholder = location && PLACEHOLDER_LOCATIONS.includes(location.toLowerCase().trim());

            // Use detected location if not provided OR if placeholder
            let effectiveLocation = isPlaceholder ? undefined : location;
            if (!effectiveLocation && ctx.userLocation?.city) {
              effectiveLocation = ctx.userLocation.regionCode
                ? `${ctx.userLocation.city}, ${ctx.userLocation.regionCode}`
                : ctx.userLocation.city;
              log.info(
                { detectedCity: effectiveLocation },
                '📍 Using IP-detected location for forecast'
              );
            }

            if (!effectiveLocation) {
              return "I don't know your location. Which city would you like the forecast for?";
            }

            log.info({ location: effectiveLocation, days }, '📅 Weather forecast called');

            try {
              const result = await getWeatherForecast(effectiveLocation, Math.min(days, 7));
              log.info(
                { location: effectiveLocation, days, elapsed: Date.now() - startTime },
                '📅 Forecast returned'
              );
              return result;
            } catch (error) {
              log.error({ location: effectiveLocation, error: String(error) }, '📅 Forecast error');
              return `I couldn't get the forecast for ${effectiveLocation}. Try a different city?`;
            }
          },
        }),
    },
  ];
}

// ============================================================================
// SPORTS TOOLS (Properly routes between team and league queries)
// ============================================================================

function getSportsToolDefinitions(): ToolDefinition[] {
  const log = getLogger();

  return [
    {
      id: 'getSports',
      name: 'Get Sports',
      description:
        'Get sports scores, standings, and schedules. Query by team name (e.g., "Eagles", "Phillies", "Lakers") or league (NFL, MLB, NBA, NHL). Returns most recent game results, next scheduled game, and current standings.',
      domain: 'information',
      tags: [
        'information',
        'sports',
        'scores',
        'standings',
        'schedule',
        'nfl',
        'mlb',
        'nba',
        'nhl',
      ],
      create: (_ctx: ToolContext) =>
        llm.tool({
          description: getToolDescription('getSports'),
          parameters: z.object({
            team: z
              .string()
              .optional()
              .describe('Team name (e.g., "Eagles", "Phillies", "Lakers", "Yankees")'),
            league: z
              .enum(['mlb', 'nfl', 'nba', 'nhl', 'mls', 'epl', 'ncaaf', 'ncaab'])
              .optional()
              .describe('League for all scores (mlb, nfl, nba, nhl, mls, epl, ncaaf, ncaab)'),
          }),
          execute: async ({ team, league }) => {
            log.info({ team, league }, '⚽ Sports tool called');

            try {
              let result: string;

              if (team) {
                // Query by team name
                result = await getTeamScore(team);
              } else if (league) {
                // Query by league for all scores
                result = await getSportScores(league);
              } else {
                return 'Please specify a team name (e.g., "Eagles") or a league (e.g., "nfl", "mlb").';
              }

              log.info({ team, league, resultLength: result.length }, '⚽ Sports result returned');
              return result;
            } catch (error) {
              log.error({ team, league, error: String(error) }, '⚽ Sports tool error');
              return `I couldn't get sports info right now. Try again in a moment?`;
            }
          },
        }),
    },
  ];
}

// ============================================================================
// SEARCH TOOLS - REMOVED
// ============================================================================
// Web search is now handled by Gemini's built-in Google Search tool.
// See: https://ai.google.dev/gemini-api/docs/live-tools#google-search
// Configured in voice-agent-entry.ts: tools: [{ googleSearch: {} }]

// ============================================================================
// TRAFFIC TOOLS (Directions and commute times)
// ============================================================================

function getTrafficToolDefinitions(): ToolDefinition[] {
  const legacyTools = createTrafficTools();

  return [
    wrapLegacyTool(
      'getCommuteTime',
      'Get Commute Time',
      'Get current traffic conditions and commute time between two locations. Returns travel time with traffic, distance, and traffic conditions (light/moderate/heavy).',
      legacyTools.getCommuteTime,
      ['traffic', 'commute', 'driving', 'directions']
    ),
    wrapLegacyTool(
      'getDirections',
      'Get Directions',
      'Get turn-by-turn directions between two locations. Supports driving, walking, bicycling, and transit modes.',
      legacyTools.getDirections,
      ['directions', 'navigation', 'route', 'maps']
    ),
    wrapLegacyTool(
      'saveLocation',
      'Save Location',
      'Save a location with a name (like "home" or "work") for quick traffic checks later.',
      legacyTools.saveLocation,
      ['location', 'save', 'home', 'work']
    ),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const informationTools: ToolDefinition[] = [
  ...getNewsToolDefinitions(),
  ...getWeatherToolDefinitions(),
  ...getSportsToolDefinitions(),
  ...getTrafficToolDefinitions(),
  // Apple WeatherKit removed - using Google Weather API only
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'information',
  informationTools
);

export {
  getNewsToolDefinitions,
  getSportsToolDefinitions,
  getWeatherToolDefinitions,
  getTrafficToolDefinitions,
};

export default getToolDefinitions;

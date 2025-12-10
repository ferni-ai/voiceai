/**
 * Information Domain Tools
 *
 * Tools for accessing information: news, weather, sports scores, web search.
 * This domain provides properly-routed consolidated tools for the LLM.
 *
 * DOMAIN: information
 * TOOLS:
 *   News: getNews (routes to general/finance/tech/stock based on category)
 *   Weather: getWeather (current), getWeatherForecast (multi-day)
 *   Sports: getSports (routes to team or league scores)
 *   Search: searchWeb, lookupInfo (Wikipedia/dictionary)
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';

// Import underlying functions directly for routing
import { getFinancialNews, getGeneralNews, getStockNews, getTechNews } from '../../news.js';
import { getSportScores, getTeamScore } from '../../sports.js';

// Import legacy tool creators for simple wrapping
import { createSearchTools } from '../../search.js';
import { createWeatherTools } from '../../weather.js';

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
        'Get current news headlines. Categories: "general" (top headlines), "finance" (market news, economy), "tech" (technology, AI, startups), or "stock" (news about a specific stock ticker). For stock news, include the ticker symbol.',
      domain: 'information',
      tags: ['information', 'news', 'headlines', 'finance', 'tech', 'stocks'],
      create: (_ctx: ToolContext) =>
        llm.tool({
          description:
            'Get current news headlines. Categories: "general", "finance", "tech", or "stock" (requires ticker symbol).',
          parameters: z.object({
            category: z
              .enum(['general', 'finance', 'tech', 'stock'])
              .optional()
              .describe('News category (defaults to general)'),
            ticker: z
              .string()
              .optional()
              .describe('Stock ticker symbol (required for stock category, e.g., "AAPL")'),
          }),
          execute: async ({ category = 'general', ticker }) => {
            log.info({ category, ticker }, '📰 News tool called');

            try {
              let result: string;

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

              log.info({ category, resultLength: result.length }, '📰 News result returned');
              return result;
            } catch (error) {
              log.error({ category, ticker, error: String(error) }, '📰 News tool error');
              return `I couldn't get ${category} news right now. Try again in a moment?`;
            }
          },
        }),
    },
  ];
}

// ============================================================================
// WEATHER TOOLS (Consolidated: 2 → 1 tool)
// ============================================================================

function getWeatherToolDefinitions(): ToolDefinition[] {
  const legacyTools = createWeatherTools();

  return [
    wrapLegacyTool(
      'getWeather',
      'Get Weather',
      'Get current weather for a city or location. Returns temperature, humidity, wind, and conditions. Use when user asks about the weather anywhere.',
      legacyTools.getWeather,
      ['weather', 'temperature', 'conditions']
    ),
    wrapLegacyTool(
      'getWeatherForecast',
      'Get Weather Forecast',
      'Get weather forecast for upcoming days. Use when user asks about weekend weather or future conditions.',
      legacyTools.getWeatherForecast,
      ['weather', 'forecast', 'weekend']
    ),
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
          description: 'Get sports scores. Provide either a team name OR a league, not both.',
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
// SEARCH TOOLS (Consolidated: 3 → 2 essential tools)
// ============================================================================

function getSearchToolDefinitions(): ToolDefinition[] {
  const legacyTools = createSearchTools();

  return [
    wrapLegacyTool(
      'searchWeb',
      'Search Web',
      'Search the internet for current information, facts, how-tos, or any topic. Returns relevant web results with summaries. Great for: "What is...", "How to...", "Latest news about...", or researching any topic.',
      legacyTools.searchWeb,
      ['search', 'web', 'google', 'research']
    ),
    wrapLegacyTool(
      'lookupInfo',
      'Lookup Info',
      'Quick lookup for definitions, facts, or encyclopedia-style information. Sources: Wikipedia for detailed topics, dictionary for word definitions. Best for: "Define...", "What does X mean?", "Who was...", factual questions.',
      legacyTools.searchWikipedia,
      ['search', 'wikipedia', 'definition', 'dictionary', 'facts']
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
  ...getSearchToolDefinitions(),
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
  getSearchToolDefinitions,
  getSportsToolDefinitions,
  getWeatherToolDefinitions,
};

export default getToolDefinitions;

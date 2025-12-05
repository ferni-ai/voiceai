/**
 * Information Domain Tools
 *
 * Tools for accessing information: news, weather, sports scores, web search.
 * This domain wraps existing legacy tools in registry-compatible definitions.
 *
 * DOMAIN: information
 * TOOLS:
 *   News: getGeneralNews, getFinancialNews, getStockNews, getTechNews
 *   Weather: getWeather, getWeatherForecast
 *   Sports: getTeamScore, getSportScores, getPhilliesScore, getEaglesScore
 *   Search: searchWeb, searchWikipedia, defineTerm
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';

// Import legacy tool creators
import { createNewsTools } from '../../news.js';
import { createWeatherTools } from '../../weather.js';
import { createSportsTools } from '../../sports.js';
import { createSearchTools } from '../../search.js';

// ============================================================================
// LEGACY TOOL WRAPPER
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
// NEWS TOOLS (Consolidated: 4 → 1 tool with categories)
// ============================================================================

function getNewsToolDefinitions(): ToolDefinition[] {
  const legacyTools = createNewsTools();

  return [
    wrapLegacyTool(
      'getNews',
      'Get News',
      'Get current news headlines. Categories: "general" (top headlines), "finance" (market news, economy), "tech" (technology, AI, startups), or "stock" (news about a specific stock ticker). For stock news, include the ticker symbol like "AAPL" or "TSLA".',
      legacyTools.getGeneralNews,
      ['news', 'headlines', 'finance', 'tech', 'stocks']
    ),
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
      'Get weather for any location: current conditions (temperature, humidity, wind) or forecast (next 7 days). Modes: "current" or "forecast". Default is current. Location can be city name, zip code, or "here" for user\'s location.',
      legacyTools.getWeather,
      ['weather', 'current', 'forecast', 'temperature']
    ),
  ];
}

// ============================================================================
// SPORTS TOOLS (Consolidated: 4 → 1 tool)
// ============================================================================

function getSportsToolDefinitions(): ToolDefinition[] {
  const legacyTools = createSportsTools();

  return [
    wrapLegacyTool(
      'getSports',
      'Get Sports',
      'Get sports scores, standings, and schedules. Query by team name (e.g., "Eagles", "Phillies", "Lakers") or league (NFL, MLB, NBA, NHL). Returns most recent game results, next scheduled game, and current standings. Works for any major professional sports team.',
      legacyTools.getTeamScore,
      ['sports', 'scores', 'standings', 'schedule', 'nfl', 'mlb', 'nba', 'nhl']
    ),
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

export { getNewsToolDefinitions, getWeatherToolDefinitions, getSportsToolDefinitions, getSearchToolDefinitions };

export default getToolDefinitions;


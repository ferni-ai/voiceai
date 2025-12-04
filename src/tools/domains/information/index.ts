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
// NEWS TOOLS
// ============================================================================

function getNewsToolDefinitions(): ToolDefinition[] {
  const legacyTools = createNewsTools();

  return [
    wrapLegacyTool(
      'getGeneralNews',
      'Get General News',
      'Get top headlines and general news stories',
      legacyTools.getGeneralNews,
      ['news', 'headlines']
    ),
    wrapLegacyTool(
      'getFinancialNews',
      'Get Financial News',
      'Get financial and market news headlines',
      legacyTools.getFinancialNews,
      ['news', 'finance', 'markets']
    ),
    wrapLegacyTool(
      'getStockNews',
      'Get Stock News',
      'Get news about a specific stock or company',
      legacyTools.getStockNews,
      ['news', 'stocks', 'company']
    ),
    wrapLegacyTool(
      'getTechNews',
      'Get Tech News',
      'Get technology and innovation news',
      legacyTools.getTechNews,
      ['news', 'technology']
    ),
  ];
}

// ============================================================================
// WEATHER TOOLS
// ============================================================================

function getWeatherToolDefinitions(): ToolDefinition[] {
  const legacyTools = createWeatherTools();

  return [
    wrapLegacyTool(
      'getWeather',
      'Get Weather',
      'Get current weather conditions for a location',
      legacyTools.getWeather,
      ['weather', 'current']
    ),
    wrapLegacyTool(
      'getWeatherForecast',
      'Get Weather Forecast',
      'Get weather forecast for upcoming days',
      legacyTools.getWeatherForecast,
      ['weather', 'forecast']
    ),
  ];
}

// ============================================================================
// SPORTS TOOLS
// ============================================================================

function getSportsToolDefinitions(): ToolDefinition[] {
  const legacyTools = createSportsTools();

  return [
    wrapLegacyTool(
      'getTeamScore',
      'Get Team Score',
      'Get the score for a specific sports team',
      legacyTools.getTeamScore,
      ['sports', 'scores']
    ),
    wrapLegacyTool(
      'getSportScores',
      'Get Sport Scores',
      'Get scores for a sport (NFL, MLB, NBA, NHL)',
      legacyTools.getSportScores,
      ['sports', 'scores']
    ),
    wrapLegacyTool(
      'getPhilliesScore',
      'Get Phillies Score',
      'Get the Philadelphia Phillies game score',
      legacyTools.getPhilliesScore,
      ['sports', 'baseball', 'phillies']
    ),
    wrapLegacyTool(
      'getEaglesScore',
      'Get Eagles Score',
      'Get the Philadelphia Eagles game score',
      legacyTools.getEaglesScore,
      ['sports', 'football', 'eagles']
    ),
  ];
}

// ============================================================================
// SEARCH TOOLS
// ============================================================================

function getSearchToolDefinitions(): ToolDefinition[] {
  const legacyTools = createSearchTools();

  return [
    wrapLegacyTool(
      'searchWeb',
      'Search Web',
      'Search the web for information on any topic',
      legacyTools.searchWeb,
      ['search', 'web']
    ),
    wrapLegacyTool(
      'searchWikipedia',
      'Search Wikipedia',
      'Search Wikipedia for factual information',
      legacyTools.searchWikipedia,
      ['search', 'wikipedia', 'facts']
    ),
    wrapLegacyTool(
      'defineTerm',
      'Define Term',
      'Get a definition for a word or term',
      legacyTools.defineTerm,
      ['search', 'definition', 'dictionary']
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


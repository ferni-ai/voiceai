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
import { type ToolDefinition } from '../../registry/types.js';
import { getEnvironmentalToolDefinitions } from './environmental/index.js';
import { getPreferencesToolDefinitions } from './preferences/index.js';
import { getProactiveToolDefinitions } from './proactive/index.js';
import { getEnhancedBriefingToolDefinitions } from './enhanced-briefing.js';
import { getCrossDomainToolDefinitions } from './cross-domain/index.js';
import { getRelationshipToolDefinitions } from './relationships/index.js';
declare function getNewsToolDefinitions(): ToolDefinition[];
declare function getWeatherToolDefinitions(): ToolDefinition[];
declare function getSportsToolDefinitions(): ToolDefinition[];
declare function getTrafficToolDefinitions(): ToolDefinition[];
declare function getNutritionToolDefinitions(): ToolDefinition[];
declare function getSearchToolDefinitions(): ToolDefinition[];
declare function getDailyBriefingToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getNewsToolDefinitions, getSportsToolDefinitions, getWeatherToolDefinitions, getTrafficToolDefinitions, getNutritionToolDefinitions, getSearchToolDefinitions, getDailyBriefingToolDefinitions, getEnvironmentalToolDefinitions, getPreferencesToolDefinitions, getProactiveToolDefinitions, getEnhancedBriefingToolDefinitions, getCrossDomainToolDefinitions, getRelationshipToolDefinitions, };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map
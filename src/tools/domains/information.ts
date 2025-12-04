/**
 * Information Domain Tools
 *
 * Barrel export for all information retrieval tools:
 * - News (financial, general, tech)
 * - Sports (live scores)
 * - Weather (conditions, forecasts)
 * - Search (web, Wikipedia)
 * - Wisdom (quotes, history)
 */

export { createNewsTools } from '../news.js';
export { createSportsTools } from '../sports.js';
export { createWeatherTools, getCurrentWeather, getWeatherForecast } from '../weather.js';
export { createSearchTools } from '../search.js';
export { createWisdomTools } from '../wisdom.js';

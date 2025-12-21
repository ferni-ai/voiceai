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

export { createNewsTools } from './information/news.js';
export { createSportsTools } from './information/sports.js';
export {
  createWeatherTools,
  getCurrentWeather,
  getWeatherForecast,
} from './information/weather.js';
export { createSearchTools } from './information/search.js';
export { createWisdomTools } from './wisdom/wisdom.js';

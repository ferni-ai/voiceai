/**
 * Information Domain Tool Executor
 *
 * Handles information retrieval tools: weather, time, news, market data
 *
 * @module agents/shared/tool-executors/information-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'InformationExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Weather - both domain IDs and semantic IDs (FTIS router outputs semantic IDs)
  'getweather',
  'weather_current', // Semantic ID from FTIS router
  'getweatherforecast',
  'weather_forecast', // Semantic ID from FTIS router
  // Time
  'getcurrenttime',
  // News - both domain IDs and semantic IDs
  'searchnews',
  'getnews',
  'info_news', // Semantic ID from FTIS router
  'getfinancialsnews',
  'getfinancialnews',
  'gettechnews',
  'getstocknews',
  // Market data
  'getmarketsummary',
  'getmarketoverview',
  'getstockquote',
  'getstockprice',
  'getquote',
] as const;

/**
 * Execute information-related tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  _ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();

  // Weather - handle both domain IDs (getweather) and semantic IDs (weather_current)
  if (fnLower === 'getweather' || fnLower === 'weather_current') {
    const { getCurrentWeather } =
      await import('../../../tools/domains/information/weather.js');
    const location = (args.location as string) || (args.city as string) || 'current';

    log.info({ location, toolId: fn }, '🌤️ Getting current weather');
    return getCurrentWeather(location);
  }

  // Weather forecast - handle both domain IDs and semantic IDs
  if (fnLower === 'getweatherforecast' || fnLower === 'weather_forecast') {
    const { getWeatherForecast } =
      await import('../../../tools/domains/information/weather.js');
    const location = (args.location as string) || (args.city as string) || 'current';
    const days = (args.days as number) || 5;

    log.info({ location, days, toolId: fn }, '📅 Getting weather forecast');
    return getWeatherForecast(location, days);
  }

  // Current time
  if (fnLower === 'getcurrenttime') {
    const timezone = (args.timezone as string) || 'local';
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone === 'local' ? undefined : timezone,
      hour: 'numeric',
      minute: '2-digit',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    };
    const formatted = now.toLocaleString('en-US', options);
    return `It's ${formatted}.`;
  }

  // General news search - handle both domain IDs and semantic IDs
  // FIX (Jan 2026): Return speakDirectly to bypass flaky LLM round-trip
  // News is already SSML-formatted and ready to speak - no need for LLM summarization
  if (fnLower === 'searchnews' || fnLower === 'getnews' || fnLower === 'info_news') {
    const { getFinancialNews, getStockNews, getGeneralNews, getTechNews } =
      await import('../../../tools/domains/information/news.js');
    const topic = (args.topic as string)?.toLowerCase() || 'general';
    const query = args.query as string;
    const category = args.category as string;

    log.info({ topic, query, category }, '📰 News search requested');

    let newsText: string;
    if (topic === 'tech' || topic === 'technology') {
      newsText = await getTechNews();
    } else if (topic === 'financial' || topic === 'finance' || topic === 'market' || topic === 'markets') {
      const newsCategory = (category as 'general' | 'forex' | 'crypto' | 'merger') || 'general';
      newsText = await getFinancialNews(newsCategory);
    } else if (topic === 'stock' && query) {
      newsText = await getStockNews(query.toUpperCase());
    } else {
      newsText = await getGeneralNews();
    }
    
    // Return speakDirectly format - bypasses LLM, speaks news immediately
    return { __speakDirectly: true, text: newsText };
  }

  // Financial news
  if (fnLower === 'getfinancialsnews' || fnLower === 'getfinancialnews') {
    const { getFinancialNews } = await import('../../../tools/domains/information/news.js');
    const category = (args.category as 'general' | 'forex' | 'crypto' | 'merger') || 'general';
    log.info({ category }, '📰 Financial news requested');
    const newsText = await getFinancialNews(category);
    return { __speakDirectly: true, text: newsText };
  }

  // Tech news
  if (fnLower === 'gettechnews') {
    const { getTechNews } = await import('../../../tools/domains/information/news.js');
    log.info({}, '📰 Tech news requested');
    const newsText = await getTechNews();
    return { __speakDirectly: true, text: newsText };
  }

  // Stock-specific news
  if (fnLower === 'getstocknews') {
    const { getStockNews } = await import('../../../tools/domains/information/news.js');
    const symbol = args.symbol as string;
    if (!symbol) {
      return 'Please specify a stock symbol (e.g., AAPL, TSLA).';
    }
    log.info({ symbol }, '📰 Stock news requested');
    const newsText = await getStockNews(symbol.toUpperCase());
    return { __speakDirectly: true, text: newsText };
  }

  // Market summary
  if (fnLower === 'getmarketsummary' || fnLower === 'getmarketoverview') {
    const { getMarketOverview } = await import('../../../tools/domains/finance/market-data.js');
    log.info({}, '📈 Market summary requested');
    return getMarketOverview();
  }

  // Stock quote
  if (fnLower === 'getstockquote' || fnLower === 'getstockprice' || fnLower === 'getquote') {
    const { getStockQuote } = await import('../../../tools/domains/finance/market-data.js');
    const symbol = args.symbol as string;
    if (!symbol) {
      return 'Please specify a stock symbol (e.g., AAPL, VTI, SPY).';
    }
    log.info({ symbol }, '📈 Stock quote requested');
    return getStockQuote(symbol);
  }

  return null;
}

export const informationExecutor: DomainExecutor = {
  domain: 'information',
  handles: HANDLED_TOOLS,
  execute,
};

export default informationExecutor;

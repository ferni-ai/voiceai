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
  'getweather',
  'getcurrenttime',
  'searchnews',
  'getnews',
  'getfinancialsnews',
  'getfinancialnews',
  'gettechnews',
  'getstocknews',
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

  // Weather
  if (fnLower === 'getweather') {
    const { getCurrentWeather, getWeatherForecast } =
      await import('../../../tools/domains/information/weather.js');
    const location = (args.location as string) || 'current';
    const type = (args.type as string) || 'current';

    log.info({ location, type }, '🌤️ Getting weather');

    if (type === 'forecast') {
      return getWeatherForecast(location, 5);
    }
    return getCurrentWeather(location);
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

  // General news search
  if (fnLower === 'searchnews' || fnLower === 'getnews') {
    const { getFinancialNews, getStockNews, getGeneralNews, getTechNews } =
      await import('../../../tools/domains/information/news.js');
    const topic = (args.topic as string)?.toLowerCase() || 'general';
    const query = args.query as string;
    const category = args.category as string;

    log.info({ topic, query, category }, '📰 News search requested');

    if (topic === 'tech' || topic === 'technology') {
      return getTechNews();
    }
    if (topic === 'financial' || topic === 'finance' || topic === 'market' || topic === 'markets') {
      const newsCategory = (category as 'general' | 'forex' | 'crypto' | 'merger') || 'general';
      return getFinancialNews(newsCategory);
    }
    if (topic === 'stock' && query) {
      return getStockNews(query.toUpperCase());
    }
    return getGeneralNews();
  }

  // Financial news
  if (fnLower === 'getfinancialsnews' || fnLower === 'getfinancialnews') {
    const { getFinancialNews } = await import('../../../tools/domains/information/news.js');
    const category = (args.category as 'general' | 'forex' | 'crypto' | 'merger') || 'general';
    log.info({ category }, '📰 Financial news requested');
    return getFinancialNews(category);
  }

  // Tech news
  if (fnLower === 'gettechnews') {
    const { getTechNews } = await import('../../../tools/domains/information/news.js');
    log.info({}, '📰 Tech news requested');
    return getTechNews();
  }

  // Stock-specific news
  if (fnLower === 'getstocknews') {
    const { getStockNews } = await import('../../../tools/domains/information/news.js');
    const symbol = args.symbol as string;
    if (!symbol) {
      return 'Please specify a stock symbol (e.g., AAPL, TSLA).';
    }
    log.info({ symbol }, '📰 Stock news requested');
    return getStockNews(symbol.toUpperCase());
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

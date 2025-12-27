/**
 * Market Data Tools
 *
 * Domain: Stock quotes, market indices, and real-time market data.
 * Single responsibility: Fetching and presenting market prices.
 *
 * APIs used:
 * - Yahoo Finance (free, no key required)
 * - Alpha Vantage (requires API key for full features)
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { withRateLimit } from '../../rate-limiter.js';
import { validateStockSymbol } from '../../validation.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// SECURITY: 'demo' key only in development - production requires real API key
const ALPHA_VANTAGE_KEY =
  process.env.ALPHA_VANTAGE_API_KEY || (process.env.NODE_ENV !== 'production' ? 'demo' : '');

// ============================================================================
// STOCK QUOTE PROVIDERS
// ============================================================================

/**
 * Get stock quote from Yahoo Finance (fallback, no API key needed)
 * Rate limited to prevent API abuse
 */
async function getYahooQuote(symbol: string): Promise<{
  price: number;
  change: number;
  changePercent: number;
  name: string;
  high?: number;
  low?: number;
} | null> {
  return withRateLimit(
    'yahoo-finance',
    async () => {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(8000),
        }
      );

      if (!response.ok) return null;

      const data = (await response.json()) as {
        chart?: {
          result?: Array<{
            meta?: {
              regularMarketPrice?: number;
              previousClose?: number;
              shortName?: string;
              regularMarketDayHigh?: number;
              regularMarketDayLow?: number;
            };
          }>;
        };
      };

      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return null;

      const price = meta.regularMarketPrice;
      const prevClose = meta.previousClose || price;
      const change = price - prevClose;
      const changePercent = (change / prevClose) * 100;

      return {
        price,
        change,
        changePercent,
        name: meta.shortName || symbol,
        high: meta.regularMarketDayHigh,
        low: meta.regularMarketDayLow,
      };
    },
    null
  );
}

/**
 * Get detailed stock quote from Alpha Vantage
 */
async function getAlphaVantageQuote(symbol: string): Promise<{
  price: number;
  change: number;
  changePercent: number;
  name: string;
  high?: number;
  low?: number;
  open?: number;
} | null> {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      'Global Quote'?: {
        '01. symbol'?: string;
        '02. open'?: string;
        '03. high'?: string;
        '04. low'?: string;
        '05. price'?: string;
        '09. change'?: string;
        '10. change percent'?: string;
      };
    };

    const quote = data['Global Quote'];
    if (!quote?.['05. price']) return null;

    return {
      price: parseFloat(quote['05. price']),
      change: parseFloat(quote['09. change'] || '0'),
      changePercent: parseFloat((quote['10. change percent'] || '0%').replace('%', '')),
      name: quote['01. symbol'] || symbol,
      high: quote['03. high'] ? parseFloat(quote['03. high']) : undefined,
      low: quote['04. low'] ? parseFloat(quote['04. low']) : undefined,
      open: quote['02. open'] ? parseFloat(quote['02. open']) : undefined,
    };
  } catch (error) {
    getLogger().warn(`Alpha Vantage quote failed for ${symbol}: ${error}`);
    return null;
  }
}

// ============================================================================
// CRYPTOCURRENCY API (CoinGecko - free, no key required)
// ============================================================================

// Common crypto symbol mappings
const CRYPTO_MAPPINGS: Record<string, string> = {
  'btc': 'bitcoin',
  'eth': 'ethereum',
  'xrp': 'ripple',
  'doge': 'dogecoin',
  'sol': 'solana',
  'ada': 'cardano',
  'dot': 'polkadot',
  'matic': 'polygon',
  'link': 'chainlink',
  'ltc': 'litecoin',
  'avax': 'avalanche-2',
  'shib': 'shiba-inu',
  'usdc': 'usd-coin',
  'usdt': 'tether',
};

/**
 * Get cryptocurrency price from CoinGecko (free API)
 */
async function getCryptoPrice(cryptoId: string): Promise<{
  price: number;
  change24h: number;
  marketCap: number;
  name: string;
  symbol: string;
} | null> {
  const log = getLogger();
  
  // Map common symbols to CoinGecko IDs
  const coinId = CRYPTO_MAPPINGS[cryptoId.toLowerCase()] || cryptoId.toLowerCase();
  
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      log.debug({ coinId, status: response.status }, '🪙 CoinGecko HTTP error');
      return null;
    }

    const data = (await response.json()) as Record<string, {
      usd?: number;
      usd_24h_change?: number;
      usd_market_cap?: number;
    }>;

    const coinData = data[coinId];
    if (!coinData?.usd) {
      log.debug({ coinId }, '🪙 No price data for coin');
      return null;
    }

    return {
      price: coinData.usd,
      change24h: coinData.usd_24h_change || 0,
      marketCap: coinData.usd_market_cap || 0,
      name: coinId.charAt(0).toUpperCase() + coinId.slice(1).replace('-', ' '),
      symbol: cryptoId.toUpperCase(),
    };
  } catch (error) {
    log.warn({ coinId, error: String(error) }, '🪙 CoinGecko exception');
    return null;
  }
}

/**
 * Get crypto quote (user-friendly wrapper)
 */
export async function getCryptoQuote(symbol: string): Promise<string> {
  const log = getLogger();
  log.info({ symbol }, '🪙 Getting crypto quote');

  const crypto = await getCryptoPrice(symbol);
  
  if (!crypto) {
    return `I couldn't find data for "${symbol}". Try common names like BTC, ETH, DOGE, or SOL.`;
  }

  const direction = crypto.change24h >= 0 ? 'up' : 'down';
  const priceStr = crypto.price >= 1 
    ? `$${crypto.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${crypto.price.toFixed(6)}`;
  
  const marketCapStr = crypto.marketCap >= 1e12 
    ? `$${(crypto.marketCap / 1e12).toFixed(2)}T`
    : crypto.marketCap >= 1e9
    ? `$${(crypto.marketCap / 1e9).toFixed(2)}B`
    : `$${(crypto.marketCap / 1e6).toFixed(2)}M`;

  return `${crypto.name} (${crypto.symbol}) is at ${priceStr}, ${direction} ${Math.abs(crypto.change24h).toFixed(2)}% in the last 24 hours. Market cap: ${marketCapStr}.`;
}

/**
 * Get overview of top cryptocurrencies
 */
export async function getCryptoOverview(): Promise<string> {
  const log = getLogger();
  log.info('🪙 Getting crypto market overview');

  const cryptos = ['bitcoin', 'ethereum', 'solana', 'dogecoin'];
  const results: string[] = [];

  for (const coinId of cryptos) {
    const crypto = await getCryptoPrice(coinId);
    if (crypto) {
      const arrow = crypto.change24h >= 0 ? '↑' : '↓';
      const priceStr = crypto.price >= 1000 
        ? `$${(crypto.price / 1000).toFixed(1)}K`
        : crypto.price >= 1 
        ? `$${crypto.price.toFixed(0)}`
        : `$${crypto.price.toFixed(4)}`;
      results.push(`${crypto.name}: ${priceStr} ${arrow}${Math.abs(crypto.change24h).toFixed(1)}%`);
    }
  }

  if (results.length === 0) {
    return "I couldn't get crypto data right now. The market never sleeps, but sometimes the APIs do!";
  }

  return `Crypto update: ${results.join(' | ')}. Remember, crypto is highly volatile - only invest what you can afford to lose.`;
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Get stock quote with fallback between providers
 */
export async function getStockQuote(symbol: string): Promise<string> {
  // Validate stock symbol
  const symbolValidation = validateStockSymbol(symbol);
  if (!symbolValidation.valid) {
    getLogger().warn({ symbol, error: symbolValidation.error }, 'Invalid stock symbol');
    return `That doesn't look like a valid stock symbol. Try something like AAPL, VTI, or SPY.`;
  }
  const upperSymbol = symbolValidation.sanitized as string;

  // Try Alpha Vantage first (more detailed), fall back to Yahoo
  let quote = await getAlphaVantageQuote(upperSymbol);
  if (!quote) {
    quote = await getYahooQuote(upperSymbol);
  }

  if (!quote) {
    return `I couldn't find data for ${upperSymbol}. Double-check that ticker symbol?`;
  }

  const direction = quote.change >= 0 ? 'up' : 'down';
  const rangeInfo =
    quote.high && quote.low
      ? ` Day's range: $${quote.low.toFixed(2)} to $${quote.high.toFixed(2)}.`
      : '';

  return `${quote.name} (${upperSymbol}) is at $${quote.price.toFixed(2)}, ${direction} ${Math.abs(quote.changePercent).toFixed(2)}% today.${rangeInfo}`;
}

/**
 * Get market overview (major indices)
 */
export async function getMarketOverview(): Promise<string> {
  const indices = [
    { symbol: 'SPY', name: 'S&P 500' },
    { symbol: 'DIA', name: 'Dow Jones' },
    { symbol: 'QQQ', name: 'NASDAQ' },
    { symbol: 'VTI', name: 'Total Market' },
  ];

  const results: string[] = [];

  // Fetch all indices in parallel
  const quotes = await Promise.all(
    indices.map(async ({ symbol, name }) => {
      const quote = await getYahooQuote(symbol);
      return { name, quote };
    })
  );

  for (const { name, quote } of quotes) {
    if (quote) {
      const arrow = quote.changePercent >= 0 ? '↑' : '↓';
      results.push(`${name}: ${arrow}${Math.abs(quote.changePercent).toFixed(2)}%`);
    }
  }

  if (results.length === 0) {
    return "I couldn't get the market data right now. But remember, daily fluctuations don't matter for long-term investors!";
  }

  return `Here's the market today: ${results.join(', ')}. Remember, these daily moves are just noise in the long run.`;
}

/**
 * Get current market status (open/closed)
 * Uses America/New_York timezone for accurate market hours
 */
export function getMarketStatus(): { isOpen: boolean; message: string } {
  const now = new Date();

  // Get current time in Eastern timezone
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = easternTime.getHours();
  const minute = easternTime.getMinutes();
  const day = easternTime.getDay();

  const isWeekend = day === 0 || day === 6;

  // Market hours: 9:30 AM - 4:00 PM Eastern
  const afterOpen = hour > 9 || (hour === 9 && minute >= 30);
  const beforeClose = hour < 16;
  const isMarketHours = !isWeekend && afterOpen && beforeClose;

  if (isWeekend) {
    return { isOpen: false, message: 'Markets are closed for the weekend.' };
  } else if (isMarketHours) {
    return { isOpen: true, message: 'US markets are currently open.' };
  } else if (hour < 9 || (hour === 9 && minute < 30)) {
    return { isOpen: false, message: 'US markets open at 9:30 AM Eastern.' };
  } else {
    return { isOpen: false, message: 'US markets are closed for the day.' };
  }
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createMarketDataTools() {
  return {
    getStockQuote: llm.tool({
      description: getToolDescription('getStockQuote'),
      parameters: z.object({
        symbol: z.string().describe('Stock ticker symbol (e.g., VTI, SPY, AAPL, MSFT)'),
      }),
      execute: async ({ symbol }) => {
        getLogger().info(`Looking up stock: ${symbol}`);
        return getStockQuote(symbol);
      },
    }),

    getMarketSummary: llm.tool({
      description: getToolDescription('getMarketSummary'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting market summary');
        return getMarketOverview();
      },
    }),

    getCryptoQuote: llm.tool({
      description: 'Get cryptocurrency price and 24-hour change. Use for Bitcoin (BTC), Ethereum (ETH), Solana (SOL), Dogecoin (DOGE), and other popular cryptocurrencies.',
      parameters: z.object({
        symbol: z.string().describe('Crypto symbol or name (e.g., BTC, ETH, DOGE, SOL, bitcoin, ethereum)'),
      }),
      execute: async ({ symbol }) => {
        getLogger().info(`Looking up crypto: ${symbol}`);
        return getCryptoQuote(symbol);
      },
    }),

    getCryptoOverview: llm.tool({
      description: 'Get an overview of top cryptocurrencies including Bitcoin, Ethereum, Solana, and Dogecoin. Use when user asks about the crypto market in general.',
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting crypto market overview');
        return getCryptoOverview();
      },
    }),

    getCurrentDateTime: llm.tool({
      description: getToolDescription('getCurrentDateTime'),
      parameters: z.object({}),
      execute: async () => {
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        };
        const formatted = now.toLocaleDateString('en-US', options);
        const status = getMarketStatus();
        return `It's ${formatted}. ${status.message}`;
      },
    }),
  };
}

export default createMarketDataTools;

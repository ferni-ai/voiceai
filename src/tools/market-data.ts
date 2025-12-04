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

import { llm, log } from '@livekit/agents';
import { z } from 'zod';
import { validateStockSymbol } from './validation.js';
import { withRateLimit } from './rate-limiter.js';

const getLogger = () => log();
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo';

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
      description:
        'Look up current stock price for a ticker symbol. Use when user asks about specific stocks or market prices.',
      parameters: z.object({
        symbol: z.string().describe('Stock ticker symbol (e.g., VTI, SPY, AAPL, MSFT)'),
      }),
      execute: async ({ symbol }) => {
        getLogger().info(`Looking up stock: ${symbol}`);
        return getStockQuote(symbol);
      },
    }),

    getMarketSummary: llm.tool({
      description:
        'Get a summary of major market indices (S&P 500, Dow, NASDAQ, Total Market). Use when user asks about "the market" or "how are markets doing".',
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting market summary');
        return getMarketOverview();
      },
    }),

    getCurrentDateTime: llm.tool({
      description: 'Get the current date, time, and market hours status.',
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

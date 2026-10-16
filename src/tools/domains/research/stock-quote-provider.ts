/**
 * Live stock quotes, behind one seam.
 *
 * A quote comes from the first provider that answers. When none does, the
 * caller gets null and says so: nothing is estimated or filled in. Add a
 * provider here to get a real source for the stock tools; the tools do not
 * change.
 *
 * @module tools/domains/research/stock-quote-provider
 */

import { getLogger } from '../../../utils/safe-logger.js';

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  /** The provider that answered, for the reply. */
  source: string;
}

export interface StockQuoteProvider {
  readonly id: string;
  quote(symbol: string): Promise<StockQuote | null>;
}

/** Yahoo Finance chart endpoint: public, no key, the same call the stock tools always made. */
const yahooChart: StockQuoteProvider = {
  id: 'Yahoo Finance',
  async quote(symbol) {
    const upper = symbol.toUpperCase();
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${upper}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
      );
      if (!response.ok) return null;

      const data = (await response.json()) as {
        chart?: {
          result?: Array<{
            meta?: {
              regularMarketPrice?: number;
              previousClose?: number;
              shortName?: string;
              longName?: string;
            };
          }>;
        };
      };
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return null;

      const price = meta.regularMarketPrice;
      const prevClose = meta.previousClose || price;
      const change = price - prevClose;
      return {
        symbol: upper,
        name: meta.longName || meta.shortName || upper,
        price,
        change,
        changePercent: (change / prevClose) * 100,
        source: 'Yahoo Finance',
      };
    } catch (error) {
      getLogger().warn(`Stock quote failed for ${upper}: ${error}`);
      return null;
    }
  },
};

/** Providers in the order they are tried. Massive (MASSIVE_API_KEY) goes here later. */
export const STOCK_QUOTE_PROVIDERS: readonly StockQuoteProvider[] = [yahooChart];

export async function getStockQuote(
  symbol: string,
  providers: readonly StockQuoteProvider[] = STOCK_QUOTE_PROVIDERS
): Promise<StockQuote | null> {
  for (const provider of providers) {
    const quote = await provider.quote(symbol);
    if (quote) return quote;
  }
  return null;
}

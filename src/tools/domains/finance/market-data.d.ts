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
/**
 * Get crypto quote (user-friendly wrapper)
 */
export declare function getCryptoQuote(symbol: string): Promise<string>;
/**
 * Get overview of top cryptocurrencies
 */
export declare function getCryptoOverview(): Promise<string>;
/**
 * Get stock quote with fallback between providers
 */
export declare function getStockQuote(symbol: string): Promise<string>;
/**
 * Get market overview (major indices)
 */
export declare function getMarketOverview(): Promise<string>;
/**
 * Get current market status (open/closed)
 * Uses America/New_York timezone for accurate market hours
 */
export declare function getMarketStatus(): {
    isOpen: boolean;
    message: string;
};
export declare function createMarketDataTools(): {
    getStockQuote: llm.FunctionTool<{
        symbol: string;
    }, unknown, string>;
    getMarketSummary: llm.FunctionTool<Record<string, never>, unknown, string>;
    getCryptoQuote: llm.FunctionTool<{
        symbol: string;
    }, unknown, string>;
    getCryptoOverview: llm.FunctionTool<Record<string, never>, unknown, string>;
    getCurrentDateTime: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createMarketDataTools;
//# sourceMappingURL=market-data.d.ts.map
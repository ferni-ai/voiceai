/**
 * News Tools
 *
 * Domain: News and current events (financial, general, tech, world).
 * Single responsibility: Fetching and presenting news headlines.
 *
 * APIs used:
 * - NewsData.io (primary - 200 credits/day free, 84K+ sources)
 * - Finnhub (financial news - requires API key)
 * - RSS feeds as fallback (NPR, BBC)
 *
 * Uses progressive execution for "better than human" UX:
 * - Fast responses: No feedback needed
 * - Slow responses: "Checking the news..." acknowledgment
 * - Timeout: Serve cached data with apology
 */
import { llm } from '@livekit/agents';
/**
 * Search news by topic using NewsData.io (primary) or fallbacks
 * Supports any topic: "Christmas", "AI", "sports", etc.
 *
 * Uses progressive execution with priority-based fetching:
 * - Fast sources (NewsData, GNews) tried first in parallel
 * - Slow sources (DuckDuckGo) started after delay if needed
 * - Returns as soon as we have enough headlines
 * - Falls back to cache if all sources fail
 */
export declare function searchNewsByTopic(topic: string): Promise<string>;
/**
 * Get financial news from Finnhub
 *
 * Uses progressive execution with caching for reliability
 */
export declare function getFinancialNews(category?: 'general' | 'forex' | 'crypto' | 'merger'): Promise<string>;
/**
 * Get stock-specific news
 */
export declare function getStockNews(symbol: string): Promise<string>;
/**
 * Get general world/top news from free RSS feeds
 * Using NPR and BBC RSS as they're reliable and free
 *
 * Uses progressive execution with source prioritization
 */
export declare function getGeneralNews(): Promise<string>;
/**
 * Get tech news from RSS feeds
 */
export declare function getTechNews(): Promise<string>;
export declare function createNewsTools(): {
    getFinancialNews: llm.FunctionTool<{
        category?: "general" | "crypto" | "forex" | "merger" | undefined;
    }, unknown, string>;
    getStockNews: llm.FunctionTool<{
        symbol: string;
    }, unknown, string>;
    getGeneralNews: llm.FunctionTool<Record<string, never>, unknown, string>;
    getTechNews: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createNewsTools;
//# sourceMappingURL=news.d.ts.map
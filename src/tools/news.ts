/**
 * News Tools
 *
 * Domain: News and current events (financial, general, tech, world).
 * Single responsibility: Fetching and presenting news headlines.
 *
 * APIs used:
 * - Finnhub (financial news - requires API key)
 * - GNews API (general news - free tier available)
 * - RSS feeds as fallback
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';

const getLogger = () => log();
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const _GNEWS_KEY = process.env.GNEWS_API_KEY || '';

// ============================================================================
// NEWS FETCHING FUNCTIONS
// ============================================================================

/**
 * Get financial news from Finnhub
 */
export async function getFinancialNews(
  category: 'general' | 'forex' | 'crypto' | 'merger' = 'general'
): Promise<string> {
  if (!FINNHUB_KEY) {
    return "I don't have access to real-time financial news right now. But remember—don't let headlines drive your investment decisions!";
  }

  try {
    const url = `https://finnhub.io/api/v1/news?category=${category}&token=${FINNHUB_KEY}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      return "I couldn't get the latest financial news right now.";
    }

    const news = (await response.json()) as Array<{
      headline?: string;
      source?: string;
      datetime?: number;
      summary?: string;
    }>;

    if (news && news.length > 0) {
      const topStories = news
        .slice(0, 3)
        .map((n) => n.headline)
        .filter(Boolean)
        .join('; ');
      return `Here's what's in the financial news: ${topStories}. But remember—news is noise. Stay focused on your long-term plan.`;
    }

    return 'The financial news is quiet today. Sometimes no news is good news for investors!';
  } catch (error) {
    getLogger().warn(`Financial news error: ${error}`);
    return "I'm having trouble getting the news. But you know, I've found that ignoring most financial news makes you a better investor!";
  }
}

/**
 * Get stock-specific news
 */
export async function getStockNews(symbol: string): Promise<string> {
  if (!FINNHUB_KEY) {
    return `I don't have access to news for ${symbol} right now.`;
  }

  try {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const from = weekAgo.toISOString().split('T')[0];
    const to = today.toISOString().split('T')[0];

    const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      return `I couldn't get news for ${symbol}.`;
    }

    const news = (await response.json()) as Array<{
      headline?: string;
      source?: string;
    }>;

    if (news && news.length > 0) {
      const topStories = news
        .slice(0, 3)
        .map((n) => n.headline)
        .filter(Boolean)
        .join('; ');
      return `Recent news about ${symbol}: ${topStories}`;
    }

    return `No recent news for ${symbol}. Sometimes that's a good thing!`;
  } catch (error) {
    getLogger().warn(`Stock news error for ${symbol}: ${error}`);
    return `I had trouble getting news for ${symbol}.`;
  }
}

/**
 * Get general world/top news from free RSS feeds
 * Using NPR and BBC RSS as they're reliable and free
 */
export async function getGeneralNews(): Promise<string> {
  try {
    // Try multiple sources
    const sources = [
      {
        url: 'https://feeds.npr.org/1001/rss.xml',
        name: 'NPR',
      },
      {
        url: 'http://feeds.bbci.co.uk/news/rss.xml',
        name: 'BBC',
      },
    ];

    for (const source of sources) {
      try {
        const response = await fetch(source.url, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });

        if (response.ok) {
          const xml = await response.text();
          const headlines = extractRSSHeadlines(xml, 5);

          if (headlines.length > 0) {
            return `Here's what's happening in the world (via ${source.name}): ${headlines.join('. ')}`;
          }
        }
      } catch {
        continue; // Try next source
      }
    }

    return "I couldn't fetch the latest news right now. Check back later.";
  } catch (error) {
    getLogger().warn(`General news error: ${error}`);
    return "I'm having trouble getting the news.";
  }
}

/**
 * Get tech news from RSS feeds
 */
export async function getTechNews(): Promise<string> {
  try {
    const sources = [
      {
        url: 'https://hnrss.org/frontpage',
        name: 'Hacker News',
      },
      {
        url: 'https://www.theverge.com/rss/index.xml',
        name: 'The Verge',
      },
    ];

    for (const source of sources) {
      try {
        const response = await fetch(source.url, {
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });

        if (response.ok) {
          const xml = await response.text();
          const headlines = extractRSSHeadlines(xml, 5);

          if (headlines.length > 0) {
            return `Tech news (via ${source.name}): ${headlines.join('. ')}`;
          }
        }
      } catch {
        continue;
      }
    }

    return "I couldn't fetch tech news right now.";
  } catch (error) {
    getLogger().warn(`Tech news error: ${error}`);
    return "I'm having trouble getting tech news.";
  }
}

/**
 * Extract headlines from RSS XML
 */
function extractRSSHeadlines(xml: string, limit: number): string[] {
  const headlines: string[] = [];

  // Simple regex extraction for <title> tags in <item> elements
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const titleRegex = /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;

  let match;
  while ((match = itemRegex.exec(xml)) !== null && headlines.length < limit) {
    const itemContent = match[1];
    const titleMatch = titleRegex.exec(itemContent);

    if (titleMatch && titleMatch[1]) {
      // Clean up the title
      const title = titleMatch[1]
        .replace(/<[^>]+>/g, '') // Remove any HTML tags
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      if (title && title.length > 5) {
        headlines.push(title);
      }
    }
  }

  return headlines;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createNewsTools() {
  return {
    getFinancialNews: llm.tool({
      description:
        "Get latest financial and market news headlines. Use when user asks about market news or what's happening in finance.",
      parameters: z.object({
        category: z
          .enum(['general', 'forex', 'crypto', 'merger'])
          .optional()
          .describe('News category, defaults to general'),
      }),
      execute: async ({ category = 'general' }) => {
        getLogger().info(`Getting financial news: ${category}`);
        return getFinancialNews(category);
      },
    }),

    getStockNews: llm.tool({
      description: 'Get recent news about a specific stock or company.',
      parameters: z.object({
        symbol: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      execute: async ({ symbol }) => {
        getLogger().info(`Getting news for: ${symbol}`);
        return getStockNews(symbol.toUpperCase());
      },
    }),

    getGeneralNews: llm.tool({
      description:
        'Get top world news and headlines. Use when user asks about general news, world events, or "what\'s happening".',
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting general news');
        return getGeneralNews();
      },
    }),

    getTechNews: llm.tool({
      description:
        'Get latest technology and innovation news. Use when user asks about tech news, startups, or technology trends.',
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting tech news');
        return getTechNews();
      },
    }),
  };
}

export default createNewsTools;

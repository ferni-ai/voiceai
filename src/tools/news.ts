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

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../utils/safe-logger.js';

import { getToolDescription } from './utils/tool-descriptions.js';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const GNEWS_KEY = process.env.GNEWS_API_KEY || '';

// ============================================================================
// NEWS FETCHING FUNCTIONS
// ============================================================================

/**
 * Search news by topic using GNews API
 * Supports any topic: "Christmas", "AI", "sports", etc.
 */
export async function searchNewsByTopic(topic: string): Promise<string> {
  const logger = getLogger();
  const startTime = Date.now();

  logger.info({ topic }, '🔍 [DIAG] searchNewsByTopic START');

  if (!GNEWS_KEY) {
    logger.warn('🔍 [DIAG] No GNews API key - falling back to general news');
    // Fallback to general news if no API key
    return getGeneralNews();
  }

  try {
    // GNews API endpoint for search
    const encodedTopic = encodeURIComponent(topic);
    const url = `https://gnews.io/api/v4/search?q=${encodedTopic}&lang=en&max=5&apikey=${GNEWS_KEY}`;

    logger.debug({ topic }, '🔍 [DIAG] Fetching from GNews...');
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      logger.warn({ status: response.status }, '🔍 [DIAG] GNews API error');
      return `I couldn't find news about "${topic}" right now.`;
    }

    const data = (await response.json()) as {
      totalArticles?: number;
      articles?: Array<{
        title?: string;
        description?: string;
        source?: { name?: string };
        publishedAt?: string;
      }>;
    };

    if (data.articles && data.articles.length > 0) {
      const headlines = data.articles
        .slice(0, 4)
        .map((a) => a.title)
        .filter(Boolean);

      logger.info(
        { topic, elapsed: Date.now() - startTime, count: headlines.length },
        '🔍 [DIAG] searchNewsByTopic SUCCESS'
      );

      return `News about "${topic}": ${headlines.join('. ')}`;
    }

    logger.info({ topic, elapsed: Date.now() - startTime }, '🔍 [DIAG] No articles found');
    return `I couldn't find any recent news about "${topic}".`;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    logger.warn({ topic, error: String(error), elapsed }, '🔍 [DIAG] searchNewsByTopic FAILED');
    return `I had trouble searching for news about "${topic}". Try again in a moment?`;
  }
}

/**
 * Get financial news from Finnhub
 */
export async function getFinancialNews(
  category: 'general' | 'forex' | 'crypto' | 'merger' = 'general'
): Promise<string> {
  const startTime = Date.now();
  const logger = getLogger();

  logger.info(
    { timestamp: new Date().toISOString(), category },
    '📰 [DIAG] getFinancialNews START'
  );

  if (!FINNHUB_KEY) {
    logger.warn({ elapsed: Date.now() - startTime }, '📰 [DIAG] getFinancialNews: No API key');
    return "I don't have access to real-time financial news right now. But remember—don't let headlines drive your investment decisions!";
  }

  try {
    const url = `https://finnhub.io/api/v1/news?category=${category}&token=${FINNHUB_KEY}`;
    logger.debug({ category }, '📰 [DIAG] Fetching from Finnhub...');
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
        .filter(Boolean);
      return `Financial news headlines: ${topStories.join('. ')}`;
    }

    logger.info({ elapsed: Date.now() - startTime }, '📰 [DIAG] getFinancialNews: No news found');
    return 'The financial news is quiet today. Sometimes no news is good news for investors!';
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const isTimeout = String(error).includes('timeout') || String(error).includes('AbortError');
    logger.warn(
      {
        error: String(error),
        elapsed,
        isTimeout,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      '📰 [DIAG] getFinancialNews FAILED - check if this correlates with music issues!'
    );
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
        .filter(Boolean);
      return `Recent ${symbol} news: ${topStories.join('. ')}`;
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
  const startTime = Date.now();
  const logger = getLogger();

  logger.info({ timestamp: new Date().toISOString() }, '📰 [DIAG] getGeneralNews START');

  // Try multiple sources
  const sources = [
    { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR' },
    { url: 'http://feeds.bbci.co.uk/news/rss.xml', name: 'BBC' },
  ];

  for (const source of sources) {
    const sourceStartTime = Date.now();
    try {
      logger.debug({ source: source.name }, '📰 [DIAG] Trying news source...');
      const response = await fetch(source.url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (response.ok) {
        const xml = await response.text();
        const headlines = extractRSSHeadlines(xml, 5);

        if (headlines.length > 0) {
          logger.info(
            { source: source.name, elapsed: Date.now() - startTime, headlines: headlines.length },
            '📰 [DIAG] getGeneralNews SUCCESS'
          );
          return `Top news from ${source.name}: ${headlines.join('. ')}`;
        }
      } else {
        logger.warn(
          { source: source.name, status: response.status, elapsed: Date.now() - sourceStartTime },
          '📰 [DIAG] News source returned non-OK'
        );
      }
    } catch (error) {
      const elapsed = Date.now() - sourceStartTime;
      const isTimeout = String(error).includes('timeout') || String(error).includes('AbortError');
      logger.warn(
        {
          source: source.name,
          error: String(error),
          elapsed,
          isTimeout,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        },
        '📰 [DIAG] News source FAILED - may affect subsequent tools!'
      );
      continue; // Try next source
    }
  }

  const elapsed = Date.now() - startTime;
  logger.warn({ elapsed }, '📰 [DIAG] getGeneralNews: All sources failed');
  return "I couldn't fetch the latest news right now. Check back later.";
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
      } catch (error) {
        getLogger().debug({ source: source.name, error }, 'Tech news source failed, trying next');
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
        "EXECUTE SILENTLY to get financial news. DO NOT say 'let me check the news' - call and share the headlines naturally.",
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
      description: getToolDescription('getFinancialNews'),
      parameters: z.object({
        symbol: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      execute: async ({ symbol }) => {
        getLogger().info(`Getting news for: ${symbol}`);
        return getStockNews(symbol.toUpperCase());
      },
    }),

    getGeneralNews: llm.tool({
      description: getToolDescription('getStockNews'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting general news');
        return getGeneralNews();
      },
    }),

    getTechNews: llm.tool({
      description: getToolDescription('getGeneralNews'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting tech news');
        return getTechNews();
      },
    }),
  };
}

export default createNewsTools;

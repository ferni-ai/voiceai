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
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
import {
  executeWithProgressiveFeedback,
  fetchWithPriority,
  toolCache,
  createSource,
  type SourceConfig,
} from '../../execution/index.js';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const NEWSDATA_KEY = process.env.NEWSDATA_API_KEY || '';
const GNEWS_KEY = process.env.GNEWS_API_KEY || '';

// ============================================================================
// "BETTER THAN HUMAN" NEWS FORMATTING
// Natural, warm news delivery - like a thoughtful friend sharing what's happening
// ============================================================================

/**
 * Format news headlines with SSML for natural, human-like delivery
 *
 * The goal: Sound like a warm, thoughtful friend sharing interesting news,
 * not a robotic news ticker. We add:
 * - Natural pauses between stories (giving the listener time to absorb)
 * - Slightly slower pace for clarity
 * - Breathing room between headlines
 * - Warmth in delivery
 */
/**
 * Natural transitions a friend might use between news items
 * Varies to avoid robotic repetition
 */
const NEWS_TRANSITIONS = [
  'Also,',
  'And,',
  'Oh, and',
  "This one's interesting:",
  'Meanwhile,',
  "And then there's this:",
  '', // Sometimes just pause, no transition
  '',
];

/**
 * Detect the emotional weight of a headline for appropriate delivery
 */
function detectHeadlineWeight(headline: string): 'heavy' | 'light' | 'surprising' | 'neutral' {
  const lower = headline.toLowerCase();

  // Heavy/serious topics
  if (
    /\b(killed|dead|dies|death|murder|war|crisis|disaster|tragedy|shooting|attack)\b/.test(lower)
  ) {
    return 'heavy';
  }

  // Surprising/exciting topics
  if (
    /\b(breakthrough|discover|first|record|amazing|incredible|shocking|unexpected)\b/.test(lower)
  ) {
    return 'surprising';
  }

  // Lighter topics
  if (/\b(fun|holiday|christmas|game|sport|win|celebrate|happy|comedy|cute)\b/.test(lower)) {
    return 'light';
  }

  return 'neutral';
}

/**
 * Format news headlines with SSML for natural, human-like delivery
 *
 * "Better than human" means:
 * - Varying pace based on content weight
 * - Natural transitions between stories
 * - Emotional awareness in delivery
 * - Not robotic/uniform pacing
 *
 * @param headlines - Array of headline strings
 * @param intro - Introduction phrase
 * @param isStale - If true, adds a disclaimer about data freshness
 */
function formatNewsWithSSML(
  headlines: (string | undefined)[],
  intro: string,
  isStale = false
): string {
  // Filter out undefined headlines
  const validHeadlines = headlines.filter(
    (h): h is string => h !== undefined && h !== null && h.trim().length > 0
  );

  if (validHeadlines.length === 0) {
    return intro;
  }

  const parts: string[] = [];

  // Add stale data disclaimer if using cached data
  const staleDisclaimer = isStale ? ' from a little while ago' : '';

  // Warm intro with natural pace
  parts.push(`<speed ratio="0.95"/>${intro}${staleDisclaimer}`);
  parts.push('<break time="350ms"/>');

  validHeadlines.forEach((headline, index) => {
    // Clean up headline
    const cleanHeadline = headline.trim().replace(/\.+$/, '');
    const weight = detectHeadlineWeight(cleanHeadline);

    // First headline - no transition needed
    if (index === 0) {
      // Adjust speed based on headline weight
      if (weight === 'heavy') {
        parts.push(`<speed ratio="0.90"/>${cleanHeadline}`);
      } else if (weight === 'surprising') {
        parts.push(`<speed ratio="1.0"/><emotion value="curious"/>${cleanHeadline}`);
      } else {
        parts.push(cleanHeadline);
      }
    } else {
      // Natural varied pause (300-600ms based on previous headline weight)
      const prevWeight = detectHeadlineWeight(validHeadlines[index - 1] || '');
      const pauseMs = prevWeight === 'heavy' ? 600 : prevWeight === 'surprising' ? 400 : 450;
      parts.push(`<break time="${pauseMs}ms"/>`);

      // Maybe add a transition (not every time - that would be weird)
      if (index <= 3 && Math.random() > 0.4) {
        const transition = NEWS_TRANSITIONS[index % NEWS_TRANSITIONS.length];
        if (transition) {
          parts.push(`${transition} <break time="150ms"/>`);
        }
      }

      // Adjust delivery based on this headline's weight
      if (weight === 'heavy') {
        parts.push(`<speed ratio="0.90"/>${cleanHeadline}`);
      } else if (weight === 'surprising') {
        parts.push(`<speed ratio="1.0"/>${cleanHeadline}`);
      } else if (weight === 'light') {
        parts.push(`<speed ratio="1.02"/>${cleanHeadline}`);
      } else {
        parts.push(`<speed ratio="0.96"/>${cleanHeadline}`);
      }
    }

    parts.push('.');
  });

  // Warm closing breath
  parts.push('<break time="250ms"/>');

  return parts.join('');
}

/**
 * Format a single news result with natural pacing
 */
function formatSingleNewsResult(content: string): string {
  // Add natural pacing for longer content
  let result = content;

  // Add pauses after sentence-ending punctuation followed by capital letter
  result = result.replace(/([.!?])\s+([A-Z])/g, '$1<break time="400ms"/> $2');

  // Slightly slower for clarity
  return `<speed ratio="0.94"/>${result}`;
}

// ============================================================================
// NEWS SOURCE CONFIGURATIONS
// ============================================================================

/**
 * Create news sources for priority-based fetching
 * Sources are tried based on speed and reliability metrics
 */
function createNewsSources(topic: string): SourceConfig[] {
  const sources: SourceConfig[] = [];
  const encodedTopic = encodeURIComponent(topic);

  // Primary: NewsData.io (usually fast, good coverage)
  if (NEWSDATA_KEY) {
    sources.push(
      createSource(
        'newsdata',
        'NewsData.io',
        async () => {
          const url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=${encodedTopic}&language=en&size=5`;
          const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
          if (!response.ok) throw new Error(`NewsData.io: ${response.status}`);
          const data = (await response.json()) as {
            results?: Array<{ title?: string }>;
          };
          return (
            data.results
              ?.slice(0, 4)
              .map((a) => a.title)
              .filter(Boolean) || []
          );
        },
        { basePriority: 1, avgLatency: 2000 }
      )
    );
  }

  // Secondary: GNews (good backup)
  if (GNEWS_KEY) {
    sources.push(
      createSource(
        'gnews',
        'GNews',
        async () => {
          const url = `https://gnews.io/api/v4/search?q=${encodedTopic}&lang=en&max=5&apikey=${GNEWS_KEY}`;
          const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
          if (!response.ok) throw new Error(`GNews: ${response.status}`);
          const data = (await response.json()) as {
            articles?: Array<{ title?: string }>;
          };
          return (
            data.articles
              ?.slice(0, 4)
              .map((a) => a.title)
              .filter(Boolean) || []
          );
        },
        { basePriority: 2, avgLatency: 2500 }
      )
    );
  }

  // Fallback: DuckDuckGo (no API key needed)
  sources.push(
    createSource(
      'duckduckgo',
      'DuckDuckGo',
      async () => {
        const searchQuery = `${topic} news today`;
        const response = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json&no_html=1&skip_disambig=1`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!response.ok) throw new Error(`DuckDuckGo: ${response.status}`);
        const data = (await response.json()) as {
          AbstractText?: string;
          RelatedTopics?: Array<{ Text?: string }>;
        };

        // Try abstract first
        if (data.AbstractText && data.AbstractText.length > 50) {
          return [data.AbstractText.slice(0, 500)];
        }

        // Try related topics
        return (
          data.RelatedTopics?.slice(0, 4)
            .map((t) => t.Text)
            .filter((t) => t && t.length > 10) || []
        );
      },
      { basePriority: 5, avgLatency: 3000, fallbackOnly: true }
    )
  );

  return sources;
}

// ============================================================================
// NEWS FETCHING FUNCTIONS
// ============================================================================

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
export async function searchNewsByTopic(topic: string): Promise<string> {
  const logger = getLogger();
  const startTime = Date.now();
  const cacheKey = `topic:${topic}`;

  logger.info({ topic }, '🔍 [DIAG] searchNewsByTopic START (progressive)');

  // Check cache first for instant response
  const cached = toolCache.getWithStaleness<string[]>('searchNewsByTopic', cacheKey);
  if (cached?.freshness === 'fresh') {
    logger.info(
      { topic, cacheAge: Date.now() - cached.timestamp },
      '🔍 [DIAG] Returning fresh cache'
    );
    return formatNewsWithSSML(cached.data, `Here's what's happening with ${topic}`);
  }

  // Create sources for this topic
  const sources = createNewsSources(topic);

  if (sources.length === 0) {
    logger.warn({ topic }, '🔍 [DIAG] No news sources configured');
    return "I don't have access to news sources right now.";
  }

  try {
    // Fetch with priority-based orchestration
    const {
      results,
      sources: usedSources,
      latency,
      complete,
    } = await fetchWithPriority<string>({
      sources,
      query: topic,
      minResults: 3,
      maxWait: 8000,
      slowSourceDelay: 1500,
      slowThreshold: 2500,
      transformResult: (data) => {
        if (Array.isArray(data)) {
          return data.filter((item): item is string => typeof item === 'string' && item.length > 0);
        }
        return [];
      },
    });

    if (results.length > 0) {
      // Cache the results
      toolCache.set('searchNewsByTopic', cacheKey, results, 'news');

      logger.info(
        { topic, elapsed: latency, count: results.length, sources: usedSources, complete },
        '🔍 [DIAG] searchNewsByTopic SUCCESS'
      );

      return formatNewsWithSSML(results, `Here's what's happening with ${topic}`);
    }

    // No live results - try stale cache
    if (cached) {
      logger.info(
        { topic, freshness: cached.freshness, cacheAge: Date.now() - cached.timestamp },
        '🔍 [DIAG] Returning stale cache as fallback'
      );
      return formatNewsWithSSML(cached.data, `Here's what I found about ${topic}`, true);
    }

    // Final fallback: general news
    logger.info(
      { topic, elapsed: Date.now() - startTime },
      '🔍 [DIAG] All sources failed, trying general news'
    );
    const generalNews = await getGeneralNews();
    return `I couldn't find specific news about "${topic}", but here's what's happening: ${generalNews.replace(/^Top news from \w+: /, '')}`;
  } catch (error) {
    logger.warn(
      { topic, error: String(error), elapsed: Date.now() - startTime },
      '🔍 [DIAG] searchNewsByTopic FAILED'
    );

    // Return stale cache if available
    if (cached) {
      return formatNewsWithSSML(cached.data, `Here's what I found about ${topic}`, true);
    }

    return `I'm having trouble getting news about "${topic}" right now. Try again in a moment?`;
  }
}

/**
 * Get financial news from Finnhub
 *
 * Uses progressive execution with caching for reliability
 */
export async function getFinancialNews(
  category: 'general' | 'forex' | 'crypto' | 'merger' = 'general'
): Promise<string> {
  const startTime = Date.now();
  const logger = getLogger();
  const cacheKey = `financial:${category}`;

  logger.info({ category }, '📰 [DIAG] getFinancialNews START (progressive)');

  if (!FINNHUB_KEY) {
    logger.warn('📰 [DIAG] getFinancialNews: No API key');
    return "I don't have access to real-time financial news right now. But remember—don't let headlines drive your investment decisions!";
  }

  // Check cache first
  const cached = toolCache.getWithStaleness<string[]>('getFinancialNews', cacheKey);
  if (cached?.freshness === 'fresh') {
    logger.info({ cacheAge: Date.now() - cached.timestamp }, '📰 [DIAG] Returning fresh cache');
    return formatNewsWithSSML(cached.data, "Here's what's moving in the markets");
  }

  // Use progressive execution for the API call
  const result = await executeWithProgressiveFeedback<string[]>('getFinancialNews', async () => {
    const url = `https://finnhub.io/api/v1/news?category=${category}&token=${FINNHUB_KEY}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });

    if (!response.ok) {
      throw new Error(`Finnhub: ${response.status}`);
    }

    const news = (await response.json()) as Array<{
      headline?: string;
      source?: string;
      datetime?: number;
      summary?: string;
    }>;

    if (!news || news.length === 0) {
      return [];
    }

    return news
      .slice(0, 3)
      .map((n) => n.headline)
      .filter(Boolean) as string[];
  });

  if (result.success && result.data && result.data.length > 0) {
    // Cache the results
    toolCache.set('getFinancialNews', cacheKey, result.data, 'news');

    logger.info(
      { elapsed: result.latency, count: result.data.length, source: result.source },
      '📰 [DIAG] getFinancialNews SUCCESS'
    );

    return formatNewsWithSSML(result.data, "Here's what's moving in the markets");
  }

  // Try stale cache as fallback
  if (cached) {
    logger.info(
      { freshness: cached.freshness, cacheAge: Date.now() - cached.timestamp },
      '📰 [DIAG] Returning stale cache'
    );
    return formatNewsWithSSML(cached.data, "Here's what's moving in the markets", true);
  }

  // No data available
  if (result.success && (!result.data || result.data.length === 0)) {
    return 'The financial news is quiet today. Sometimes no news is good news for investors!';
  }

  logger.warn(
    { elapsed: Date.now() - startTime, error: result.error },
    '📰 [DIAG] getFinancialNews FAILED'
  );
  return "I'm having trouble getting the news. But you know, I've found that ignoring most financial news makes you a better investor!";
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
      return formatNewsWithSSML(topStories, `Here's what's happening with ${symbol}`);
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
 *
 * Uses progressive execution with source prioritization
 */
export async function getGeneralNews(): Promise<string> {
  const startTime = Date.now();
  const logger = getLogger();
  const cacheKey = 'general';

  logger.info('📰 [DIAG] getGeneralNews START (progressive)');

  // Check cache first
  const cached = toolCache.getWithStaleness<string[]>('getGeneralNews', cacheKey);
  if (cached?.freshness === 'fresh') {
    logger.info({ cacheAge: Date.now() - cached.timestamp }, '📰 [DIAG] Returning fresh cache');
    return formatNewsWithSSML(cached.data, "Here's what's happening in the world");
  }

  // Create RSS sources
  const sources: SourceConfig[] = [
    createSource(
      'npr',
      'NPR',
      async () => {
        const response = await fetch('https://feeds.npr.org/1001/rss.xml', {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!response.ok) throw new Error(`NPR: ${response.status}`);
        const xml = await response.text();
        return extractRSSHeadlines(xml, 5);
      },
      { basePriority: 1, avgLatency: 1500 }
    ),
    createSource(
      'bbc',
      'BBC',
      async () => {
        const response = await fetch('http://feeds.bbci.co.uk/news/rss.xml', {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!response.ok) throw new Error(`BBC: ${response.status}`);
        const xml = await response.text();
        return extractRSSHeadlines(xml, 5);
      },
      { basePriority: 2, avgLatency: 2000 }
    ),
  ];

  try {
    const {
      results,
      sources: usedSources,
      latency,
      complete,
    } = await fetchWithPriority<string>({
      sources,
      query: 'general',
      minResults: 4,
      maxWait: 6000,
      slowSourceDelay: 1000,
      slowThreshold: 2000,
      transformResult: (data) => {
        if (Array.isArray(data)) {
          return data.filter((item): item is string => typeof item === 'string' && item.length > 0);
        }
        return [];
      },
    });

    if (results.length > 0) {
      // Cache the results
      toolCache.set('getGeneralNews', cacheKey, results, 'news');

      logger.info(
        { elapsed: latency, count: results.length, sources: usedSources, complete },
        '📰 [DIAG] getGeneralNews SUCCESS'
      );

      return formatNewsWithSSML(results, "Here's what's happening in the world");
    }

    // Try stale cache
    if (cached) {
      logger.info(
        { freshness: cached.freshness, cacheAge: Date.now() - cached.timestamp },
        '📰 [DIAG] Returning stale cache'
      );
      return formatNewsWithSSML(cached.data, "Here's the news", true);
    }

    logger.warn(
      { elapsed: Date.now() - startTime },
      '📰 [DIAG] getGeneralNews: All sources failed'
    );
    return "I couldn't fetch the latest news right now. Check back later.";
  } catch (error) {
    logger.warn(
      { error: String(error), elapsed: Date.now() - startTime },
      '📰 [DIAG] getGeneralNews FAILED'
    );

    // Return stale cache if available
    if (cached) {
      return formatNewsWithSSML(cached.data, "Here's the news", true);
    }

    return "I couldn't fetch the latest news right now. Check back later.";
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
            return formatNewsWithSSML(headlines, "Here's what's happening in tech");
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
      description: getToolDescription('getStockNews'),
      parameters: z.object({
        symbol: z.string().describe('Stock ticker symbol (e.g., AAPL, TSLA)'),
      }),
      execute: async ({ symbol }) => {
        getLogger().info(`Getting news for: ${symbol}`);
        return getStockNews(symbol.toUpperCase());
      },
    }),

    getGeneralNews: llm.tool({
      description: getToolDescription('getGeneralNews'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting general news');
        return getGeneralNews();
      },
    }),

    getTechNews: llm.tool({
      description: getToolDescription('getTechNews'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting tech news');
        return getTechNews();
      },
    }),
  };
}

export default createNewsTools;

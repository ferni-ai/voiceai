/**
 * SEC Intelligence Context Builder
 *
 * Provides Peter (The Quant) with institutional-grade SEC intelligence.
 * "Better than Human" - Track insider trading, filings, and institutional moves.
 *
 * Superhuman Capabilities:
 * - Real-time SEC filing alerts
 * - Insider trading pattern detection
 * - Institutional ownership changes (13F)
 * - Material event notifications (8-K)
 *
 * @module intelligence/context-builders/sec-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  generateSECInsight,
  getInsiderTradingSummary,
  getCompanyFilings,
} from '../../services/finance/sec-edgar.js';

const log = createLogger({ module: 'SECIntelligenceBuilder' });

// ============================================================================
// TYPES
// ============================================================================

interface SECContext {
  /** Proactive SEC insights for mentioned companies */
  insights: string[];
  /** Recent material filings */
  recentFilings: {
    ticker: string;
    form: string;
    date: string;
    description: string;
  }[];
  /** Insider trading sentiment */
  insiderSentiment: {
    ticker: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    summary: string;
  }[];
  /** Formatted context for LLM */
  contextString: string;
}

// ============================================================================
// COMPANY EXTRACTION
// ============================================================================

/**
 * Extract potential stock tickers from conversation
 */
function extractTickers(text: string): string[] {
  // Common patterns:
  // - $AAPL style
  // - "Apple stock"
  // - "AAPL shares"
  // - Direct mentions of known companies

  const tickers: Set<string> = new Set();

  // Pattern: $TICKER
  const dollarPattern = /\$([A-Z]{1,5})\b/g;
  let match;
  while ((match = dollarPattern.exec(text)) !== null) {
    tickers.add(match[1]);
  }

  // Pattern: [TICKER] stock/shares/position
  const stockPattern = /\b([A-Z]{1,5})\s+(?:stock|shares|position|calls|puts|options)\b/gi;
  while ((match = stockPattern.exec(text)) !== null) {
    tickers.add(match[1].toUpperCase());
  }

  // Company name to ticker mapping (common ones)
  const companyMap: Record<string, string> = {
    apple: 'AAPL',
    microsoft: 'MSFT',
    amazon: 'AMZN',
    google: 'GOOGL',
    alphabet: 'GOOGL',
    meta: 'META',
    facebook: 'META',
    tesla: 'TSLA',
    nvidia: 'NVDA',
    netflix: 'NFLX',
    disney: 'DIS',
    walmart: 'WMT',
    jpmorgan: 'JPM',
    'bank of america': 'BAC',
    boeing: 'BA',
    intel: 'INTC',
    amd: 'AMD',
    salesforce: 'CRM',
    adobe: 'ADBE',
    paypal: 'PYPL',
    visa: 'V',
    mastercard: 'MA',
    costco: 'COST',
    'home depot': 'HD',
    target: 'TGT',
    pfizer: 'PFE',
    johnson: 'JNJ',
    'berkshire': 'BRK.B',
    'coca cola': 'KO',
    pepsi: 'PEP',
    starbucks: 'SBUX',
    'at&t': 'T',
    verizon: 'VZ',
    exxon: 'XOM',
    chevron: 'CVX',
  };

  const lowerText = text.toLowerCase();
  for (const [company, ticker] of Object.entries(companyMap)) {
    if (lowerText.includes(company)) {
      tickers.add(ticker);
    }
  }

  return Array.from(tickers);
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build SEC intelligence context for Peter
 *
 * Called during context injection when Peter is active
 */
export async function buildSECIntelligenceContext(
  userId: string,
  recentTranscript: string,
  watchlistTickers: string[] = []
): Promise<SECContext | null> {
  try {
    // Extract tickers from conversation
    const conversationTickers = extractTickers(recentTranscript);
    const allTickers = [...new Set([...conversationTickers, ...watchlistTickers])];

    if (allTickers.length === 0) {
      return null;
    }

    const insights: string[] = [];
    const recentFilings: SECContext['recentFilings'] = [];
    const insiderSentiment: SECContext['insiderSentiment'] = [];

    // Process each ticker (limit to 3 to avoid API abuse)
    for (const ticker of allTickers.slice(0, 3)) {
      // Get SEC insight
      const insight = await generateSECInsight(ticker);
      if (insight) {
        insights.push(insight);
      }

      // Get insider trading summary
      const insiderResult = await getInsiderTradingSummary(ticker, 30);
      if (insiderResult.success && insiderResult.data) {
        const { sentiment, netShares, uniqueInsiders } = insiderResult.data;
        if (sentiment !== 'neutral') {
          insiderSentiment.push({
            ticker,
            sentiment,
            summary:
              sentiment === 'bullish'
                ? `${uniqueInsiders} insiders net bought ${netShares.toLocaleString()} shares`
                : `${uniqueInsiders} insiders net sold ${Math.abs(netShares).toLocaleString()} shares`,
          });
        }
      }

      // Get recent 8-K filings (material events)
      const filingsResult = await getCompanyFilings(ticker, { forms: ['8-K'], limit: 2 });
      if (filingsResult.success && filingsResult.data) {
        for (const filing of filingsResult.data) {
          const daysAgo = Math.floor(
            (Date.now() - new Date(filing.filingDate).getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysAgo <= 14) {
            recentFilings.push({
              ticker,
              form: filing.form,
              date: filing.filingDate,
              description: filing.description,
            });
          }
        }
      }
    }

    // Build context string
    let contextString = '';

    if (insights.length > 0) {
      contextString += '\n[SEC Intelligence - Institutional-Grade Insights]\n';
      for (const insight of insights) {
        contextString += `• ${insight}\n`;
      }
    }

    if (insiderSentiment.length > 0) {
      contextString += '\n[Insider Trading Activity]\n';
      for (const { ticker, sentiment, summary } of insiderSentiment) {
        const emoji = sentiment === 'bullish' ? '🟢' : '🔴';
        contextString += `${emoji} ${ticker}: ${summary}\n`;
      }
    }

    if (recentFilings.length > 0) {
      contextString += '\n[Recent SEC Filings]\n';
      for (const filing of recentFilings) {
        contextString += `• ${filing.ticker}: ${filing.form} (${filing.date}) - ${filing.description}\n`;
      }
    }

    if (!contextString) {
      return null;
    }

    contextString +=
      '\nPeter can surface these SEC insights naturally when relevant - institutional-grade research for individuals.\n';

    log.debug(
      { userId, tickers: allTickers, insightCount: insights.length },
      'Built SEC intelligence context'
    );

    return {
      insights,
      recentFilings,
      insiderSentiment,
      contextString,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to build SEC intelligence context');
    return null;
  }
}

/**
 * Generate superhuman SEC moment for Peter
 *
 * Used for proactive insights during conversation
 */
export async function generateSuperhumanSECMoment(
  ticker: string
): Promise<string | null> {
  return generateSECInsight(ticker);
}

export default {
  buildSECIntelligenceContext,
  generateSuperhumanSECMoment,
  extractTickers,
};

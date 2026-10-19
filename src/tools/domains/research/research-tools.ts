/**
 * Stock Picking & Research Tools
 *
 * Tools for "invest in what you know" philosophy:
 * - Live price for a ticker, with research steps
 * - PEG ratio from numbers the user gives
 * - Company classification (stalwarts, fast growers, turnarounds, etc.)
 * - Ten-bagger ideas, when live fundamentals are connected (they are not yet)
 */

import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';
import { getStockQuote } from './stock-quote-provider.js';
// ============================================================================
// PETER JOHN'S STOCK CATEGORIES
// ============================================================================

export type StockCategory =
  | 'slow_grower' // Large, mature companies, 2-4% growth
  | 'stalwart' // Large companies with 10-12% growth
  | 'fast_grower' // Small aggressive companies, 20-25% growth
  | 'cyclical' // Companies that follow economic cycles
  | 'turnaround' // Companies recovering from problems
  | 'asset_play'; // Companies with undervalued assets

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

/** Shown whenever a reply would otherwise need company numbers we don't have. */
const NO_FUNDAMENTALS =
  "I don't have live company numbers (P/E, growth, earnings) connected, so I won't rank stocks or quote figures for them.";

const RESEARCH_STEPS = `🤔 **Research it yourself:**
1. **Know the business.** Can you explain what they do to a fifth grader?
2. **Find the story.** What is driving their growth, and is it sustainable?
3. **Look for an edge.** Do you use their products, or work in their industry?
4. **Check the valuation.** Compare the P/E to the growth rate. If you give me both numbers, I can run the PEG calculation.`;

/**
 * Analyze a stock the way Peter John would: the live price and the research
 * steps. Without a live quote, say so and give no price.
 */
async function analyzeStockLynchStyle(symbol: string): Promise<string> {
  const upperSymbol = symbol.toUpperCase();
  const quote = await getStockQuote(upperSymbol);

  if (!quote) {
    return `I can't get a live quote for ${upperSymbol} right now, so I won't guess at its price. It may be a ticker I don't recognize, or the quote service may be down. Check the symbol, or look it up in your broker's app.\n\n${RESEARCH_STEPS}`;
  }

  const direction = quote.change >= 0 ? 'up' : 'down';
  return `
**${quote.name} (${upperSymbol})**

📊 **Latest quote:** $${quote.price.toFixed(2)} (${direction} ${Math.abs(quote.changePercent).toFixed(2)}% on the day, from ${quote.source})

${NO_FUNDAMENTALS}

${RESEARCH_STEPS}
`;
}

/**
 * Calculate PEG ratio and explain it
 */
function calculatePEG(peRatio: number, growthRate: number): string {
  const peg = peRatio / growthRate;

  let verdict: string;
  if (peg < 0.5) {
    verdict = 'Looks like a steal! But double-check that growth rate is sustainable.';
  } else if (peg < 1.0) {
    verdict = 'This is attractive! PEG under 1 is what I look for.';
  } else if (peg < 1.5) {
    verdict = 'Fairly valued. Not cheap, but not crazy either.';
  } else if (peg < 2.0) {
    verdict = 'Getting pricey. The growth better be rock solid.';
  } else {
    verdict = 'Too expensive for my taste. Either the P/E is too high or growth is too low.';
  }

  return `
**PEG Ratio Analysis:**

P/E Ratio: ${peRatio}
Growth Rate: ${growthRate}%
**PEG = ${peg.toFixed(2)}**

${verdict}

Rule of thumb: PEG under 1.0 suggests the stock might be undervalued relative to its growth. But remember - this is just one number. You gotta know the story!
`;
}

/**
 * What each category means, without figures or company names: the definitions
 * above quote growth rates, and this reply must quote none.
 */
const CATEGORY_TRAITS: Record<StockCategory, string> = {
  slow_grower: 'Large, mature companies that grow slowly and often pay dividends.',
  stalwart: 'Large, established companies with steadier growth.',
  fast_grower: 'Smaller companies that are expanding quickly.',
  cyclical: 'Companies whose results follow the economic cycle.',
  turnaround: 'Companies recovering from a rough patch.',
  asset_play: 'Companies whose assets may be worth more than the market price suggests.',
};

/**
 * List the companies that fit a category. There is no live screen behind
 * this, so it explains the category and says how to find companies.
 */
function findStocksByCategory(category: StockCategory): string {
  return `
**${category.replace('_', ' ').toUpperCase()} STOCKS:**

${CATEGORY_TRAITS[category]}

${NO_FUNDAMENTALS} So I can't name which companies fit this category today. To find them yourself, use a stock screener to filter on growth and valuation, then check each business story.
`;
}

/**
 * Ten-baggers need growth and valuation data to screen for, which isn't here.
 */
function findTenBaggers(): string {
  return `${NO_FUNDAMENTALS} I can't screen for ten-baggers, so I won't name candidates. A good place to start is a company you use every day and understand well, then check its growth against its valuation.`;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createResearchTools() {
  return {
    analyzeStock: llm.tool({
      description: getToolDescription('analyzeStock'),
      parameters: z.object({
        symbol: z.string().describe('Stock ticker symbol (e.g., COST, AAPL, CMG)'),
      }),
      execute: async ({ symbol }) => {
        getLogger().info({ symbol }, '🎯 Peter analyzing stock');
        return analyzeStockLynchStyle(symbol);
      },
    }),

    findStockCategory: llm.tool({
      description: getToolDescription('findStockCategory'),
      parameters: z.object({
        category: z
          .enum(['slow_grower', 'stalwart', 'fast_grower', 'cyclical', 'turnaround', 'asset_play'])
          .describe('Stock category to search'),
      }),
      execute: async ({ category }) => {
        getLogger().info({ category }, '📊 Finding stocks by category');
        return findStocksByCategory(category as StockCategory);
      },
    }),

    calculatePEGRatio: llm.tool({
      description: getToolDescription('calculatePEGRatio'),
      parameters: z.object({
        peRatio: z.number().describe('The P/E ratio of the stock'),
        growthRate: z.number().describe('Annual earnings growth rate (%)'),
      }),
      execute: async ({ peRatio, growthRate }) => {
        getLogger().info({ peRatio, growthRate }, '📈 Calculating PEG');
        return calculatePEG(peRatio, growthRate);
      },
    }),

    findTenBaggers: llm.tool({
      description: getToolDescription('findTenBaggers'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('🎯 Looking for ten-baggers');
        return findTenBaggers();
      },
    }),

    explainStockCategory: llm.tool({
      description: getToolDescription('explainStockCategory'),
      parameters: z.object({
        category: z
          .enum(['slow_grower', 'stalwart', 'fast_grower', 'cyclical', 'turnaround', 'asset_play'])
          .describe('Category to explain'),
      }),
      execute: async ({ category }) => {
        return `
**${category.replace('_', ' ').toUpperCase()}:**

${CATEGORY_TRAITS[category as StockCategory]}

${
  category === 'fast_grower'
    ? "\n💡 This is where many of the market's biggest winners came from. Restaurant chains and retailers Wall Street ignored all started as fast growers!"
    : category === 'turnaround'
      ? '\n⚠️ Turnarounds are tricky. Most fail. But when they work, the returns are spectacular.'
      : category === 'cyclical'
        ? '\n⏰ Timing is everything with cyclicals. They can look cheapest near a cycle peak and most expensive near the bottom.'
        : ''
}
`;
      },
    }),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createResearchTools;

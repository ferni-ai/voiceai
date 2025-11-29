/**
 * Peter Lynch's Stock Picking Tools
 * 
 * Tools specific to Peter Lynch's "invest in what you know" philosophy:
 * - Find stocks in everyday life
 * - P/E ratio analysis
 * - Company classification (stalwarts, fast growers, turnarounds, etc.)
 * - Ten-bagger potential analysis
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';

const getLogger = () => log();

// ============================================================================
// PETER LYNCH'S STOCK CATEGORIES
// ============================================================================

export type StockCategory = 
  | 'slow_grower'      // Large, mature companies, 2-4% growth
  | 'stalwart'         // Large companies with 10-12% growth  
  | 'fast_grower'      // Small aggressive companies, 20-25% growth
  | 'cyclical'         // Companies that follow economic cycles
  | 'turnaround'       // Companies recovering from problems
  | 'asset_play';      // Companies with undervalued assets

const CATEGORY_DESCRIPTIONS: Record<StockCategory, string> = {
  slow_grower: "Large, mature companies growing at 2-4% annually. Good for dividends, not growth.",
  stalwart: "Big, solid companies growing at 10-12%. Not exciting, but reliable. Think Coca-Cola.",
  fast_grower: "Small, aggressive companies growing 20-25%+. This is where ten-baggers come from!",
  cyclical: "Companies that rise and fall with the economy. Timing is everything here.",
  turnaround: "Companies bouncing back from near-death. High risk, high reward.",
  asset_play: "Companies with hidden assets worth more than the stock price. The market missed something!",
};

// ============================================================================
// MOCK DATA (In production, use real APIs)
// ============================================================================

interface StockData {
  symbol: string;
  name: string;
  price: number;
  peRatio: number;
  growthRate: number;
  category: StockCategory;
  peterScore: number; // 1-10 Lynch-style rating
  story: string;
}

const SAMPLE_STOCKS: StockData[] = [
  { symbol: 'COST', name: 'Costco', price: 892, peRatio: 52, growthRate: 12, category: 'stalwart', peterScore: 7, story: "Everyone I know shops there. The $1.50 hot dog hasn't changed in 40 years!" },
  { symbol: 'CMG', name: 'Chipotle', price: 3200, peRatio: 65, growthRate: 25, category: 'fast_grower', peterScore: 8, story: "My kids eat there every week. The line is always out the door!" },
  { symbol: 'LULU', name: 'Lululemon', price: 480, peRatio: 38, growthRate: 18, category: 'fast_grower', peterScore: 7, story: "Every mom at the mall is wearing these yoga pants." },
  { symbol: 'TJX', name: 'TJ Maxx', price: 115, peRatio: 28, growthRate: 8, category: 'stalwart', peterScore: 6, story: "Treasure hunting for bargains - people love it!" },
  { symbol: 'F', name: 'Ford', price: 11, peRatio: 12, growthRate: 3, category: 'cyclical', peterScore: 5, story: "Everyone needs trucks. Wait for the next recession to buy." },
  { symbol: 'AAL', name: 'American Airlines', price: 15, peRatio: 8, growthRate: -2, category: 'turnaround', peterScore: 4, story: "Airlines are tough. But if they turn around..." },
];

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

/**
 * Analyze a stock Peter Lynch style
 */
async function analyzeStockLynchStyle(symbol: string): Promise<string> {
  const stock = SAMPLE_STOCKS.find(s => s.symbol === symbol.toUpperCase());
  
  if (!stock) {
    return `I don't have data on ${symbol}, but here's what I'd do: Go to their stores, use their products, talk to employees. That's how you really learn about a company!`;
  }

  const pegRatio = stock.peRatio / stock.growthRate;
  const pegAnalysis = pegRatio < 1 ? "undervalued" : pegRatio < 2 ? "fairly valued" : "expensive";

  return `
**${stock.name} (${stock.symbol})** - ${CATEGORY_DESCRIPTIONS[stock.category]}

📊 **The Numbers:**
- Price: $${stock.price}
- P/E Ratio: ${stock.peRatio}
- Growth Rate: ${stock.growthRate}%
- PEG Ratio: ${pegRatio.toFixed(2)} (${pegAnalysis})
- Peter's Score: ${stock.peterScore}/10

📖 **The Story:**
${stock.story}

💡 **My Take:**
${stock.peterScore >= 7 ? "This could be interesting! Do your homework - visit the stores, try the product." : 
  stock.peterScore >= 5 ? "Not bad, but I'd want to see better growth or a lower price." :
  "I'd pass on this one. The story isn't compelling enough."}
`;
}

/**
 * Find stocks in a category
 */
function findStocksByCategory(category: StockCategory): string {
  const stocks = SAMPLE_STOCKS.filter(s => s.category === category);
  
  if (stocks.length === 0) {
    return `I don't have any ${category.replace('_', ' ')} stocks in my watch list right now.`;
  }

  const list = stocks.map(s => `- **${s.symbol}** (${s.name}): P/E ${s.peRatio}, Growth ${s.growthRate}%`).join('\n');
  
  return `
**${category.replace('_', ' ').toUpperCase()} STOCKS:**

${CATEGORY_DESCRIPTIONS[category]}

${list}

Remember: The best investment is one you understand. Go visit these companies!
`;
}

/**
 * Calculate PEG ratio and explain it
 */
function calculatePEG(peRatio: number, growthRate: number): string {
  const peg = peRatio / growthRate;
  
  let verdict: string;
  if (peg < 0.5) {
    verdict = "Looks like a steal! But double-check that growth rate is sustainable.";
  } else if (peg < 1.0) {
    verdict = "This is attractive! PEG under 1 is what I look for.";
  } else if (peg < 1.5) {
    verdict = "Fairly valued. Not cheap, but not crazy either.";
  } else if (peg < 2.0) {
    verdict = "Getting pricey. The growth better be rock solid.";
  } else {
    verdict = "Too expensive for my taste. Either the P/E is too high or growth is too low.";
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
 * Find potential ten-baggers
 */
function findTenBaggers(): string {
  const candidates = SAMPLE_STOCKS.filter(s => 
    s.category === 'fast_grower' && s.peterScore >= 7
  );

  if (candidates.length === 0) {
    return "I don't see any obvious ten-bagger candidates right now. But keep your eyes open! The next one might be at your local mall.";
  }

  const list = candidates.map(s => 
    `**${s.symbol}** - ${s.story}`
  ).join('\n\n');

  return `
🎯 **POTENTIAL TEN-BAGGERS:**

These are fast growers with compelling stories. Could they go up 10x? Maybe!

${list}

**Remember:** Ten-baggers don't happen overnight. I held Dunkin' Donuts for years before it exploded. Patience is key!
`;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createPeterLynchTools() {
  return {
    analyzeStock: llm.tool({
      description: `Analyze a stock Peter Lynch style. Looks at P/E ratio, PEG ratio, growth rate, 
and most importantly - THE STORY. Peter believes you should understand what you own.
Use when user asks about a specific stock.`,
      parameters: z.object({
        symbol: z.string().describe('Stock ticker symbol (e.g., COST, AAPL, CMG)'),
      }),
      execute: async ({ symbol }) => {
        getLogger().info({ symbol }, '🎯 Peter analyzing stock');
        return analyzeStockLynchStyle(symbol);
      },
    }),

    findStockCategory: llm.tool({
      description: `Find stocks by Peter Lynch's categories:
- slow_grower: Mature companies, good for dividends
- stalwart: Solid companies with steady 10-12% growth
- fast_grower: Small aggressive companies (ten-bagger territory!)
- cyclical: Follow economic cycles
- turnaround: Recovering from problems
- asset_play: Hidden value the market missed`,
      parameters: z.object({
        category: z.enum(['slow_grower', 'stalwart', 'fast_grower', 'cyclical', 'turnaround', 'asset_play'])
          .describe('Stock category to search'),
      }),
      execute: async ({ category }) => {
        getLogger().info({ category }, '📊 Finding stocks by category');
        return findStocksByCategory(category as StockCategory);
      },
    }),

    calculatePEGRatio: llm.tool({
      description: `Calculate and explain the PEG ratio (P/E divided by Growth rate).
Peter Lynch's favorite valuation metric! PEG under 1.0 suggests a stock might be undervalued.`,
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
      description: `Find potential ten-baggers (stocks that could go up 10x).
These are fast-growing companies with compelling stories and room to grow.
Use when user asks about finding big winners or growth stocks.`,
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('🎯 Looking for ten-baggers');
        return findTenBaggers();
      },
    }),

    explainStockCategory: llm.tool({
      description: `Explain one of Peter Lynch's six stock categories in detail.
Good for teaching users about different types of investments.`,
      parameters: z.object({
        category: z.enum(['slow_grower', 'stalwart', 'fast_grower', 'cyclical', 'turnaround', 'asset_play'])
          .describe('Category to explain'),
      }),
      execute: async ({ category }) => {
        return `
**${category.replace('_', ' ').toUpperCase()}:**

${CATEGORY_DESCRIPTIONS[category as StockCategory]}

${category === 'fast_grower' ? 
  "\n💡 This is where I found my biggest winners. Dunkin' Donuts, Taco Bell, The Gap - all started as fast growers!" :
  category === 'turnaround' ?
  "\n⚠️ Turnarounds are tricky. Most fail. But when they work, the returns are spectacular." :
  category === 'cyclical' ?
  "\n⏰ Timing is everything with cyclicals. Buy when they look terrible, sell when they look great." :
  ""}
`;
      },
    }),
  };
}

export default createPeterLynchTools;


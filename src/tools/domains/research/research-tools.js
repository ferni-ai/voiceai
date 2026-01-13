/**
 * Stock Picking & Research Tools
 *
 * Tools for "invest in what you know" philosophy:
 * - Find stocks in everyday life
 * - P/E ratio analysis
 * - Company classification (stalwarts, fast growers, turnarounds, etc.)
 * - Ten-bagger potential analysis
 */
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import { getToolDescription } from '../../utils/tool-descriptions.js';
const CATEGORY_DESCRIPTIONS = {
    slow_grower: 'Large, mature companies growing at 2-4% annually. Good for dividends, not growth.',
    stalwart: 'Big, solid companies growing at 10-12%. Not exciting, but reliable. Think Coca-Cola.',
    fast_grower: 'Small, aggressive companies growing 20-25%+. This is where ten-baggers come from!',
    cyclical: 'Companies that rise and fall with the economy. Timing is everything here.',
    turnaround: 'Companies bouncing back from near-death. High risk, high reward.',
    asset_play: 'Companies with hidden assets worth more than the stock price. The market missed something!',
};
const SAMPLE_STOCKS = [
    {
        symbol: 'COST',
        name: 'Costco',
        price: 892,
        peRatio: 52,
        growthRate: 12,
        category: 'stalwart',
        peterScore: 7,
        story: "Everyone I know shops there. The $1.50 hot dog hasn't changed in 40 years!",
    },
    {
        symbol: 'CMG',
        name: 'Chipotle',
        price: 3200,
        peRatio: 65,
        growthRate: 25,
        category: 'fast_grower',
        peterScore: 8,
        story: 'My kids eat there every week. The line is always out the door!',
    },
    {
        symbol: 'LULU',
        name: 'Lululemon',
        price: 480,
        peRatio: 38,
        growthRate: 18,
        category: 'fast_grower',
        peterScore: 7,
        story: 'Every mom at the mall is wearing these yoga pants.',
    },
    {
        symbol: 'TJX',
        name: 'TJ Maxx',
        price: 115,
        peRatio: 28,
        growthRate: 8,
        category: 'stalwart',
        peterScore: 6,
        story: 'Treasure hunting for bargains - people love it!',
    },
    {
        symbol: 'F',
        name: 'Ford',
        price: 11,
        peRatio: 12,
        growthRate: 3,
        category: 'cyclical',
        peterScore: 5,
        story: 'Everyone needs trucks. Wait for the next recession to buy.',
    },
    {
        symbol: 'AAL',
        name: 'American Airlines',
        price: 15,
        peRatio: 8,
        growthRate: -2,
        category: 'turnaround',
        peterScore: 4,
        story: 'Airlines are tough. But if they turn around...',
    },
];
// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================
/**
 * Get real stock quote using market data API
 */
async function getRealStockQuote(symbol) {
    try {
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}?interval=1d&range=1d`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok)
            return null;
        const data = (await response.json());
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice)
            return null;
        const price = meta.regularMarketPrice;
        const prevClose = meta.previousClose || price;
        const change = price - prevClose;
        const changePercent = (change / prevClose) * 100;
        return {
            price,
            change,
            changePercent,
            name: meta.longName || meta.shortName || symbol,
        };
    }
    catch (error) {
        getLogger().warn(`Stock quote failed for ${symbol}: ${error}`);
        return null;
    }
}
/**
 * Analyze a stock Peter John style
 */
async function analyzeStockLynchStyle(symbol) {
    const upperSymbol = symbol.toUpperCase();
    // Check if we have Peter's curated analysis for this stock
    const curatedStock = SAMPLE_STOCKS.find((s) => s.symbol === upperSymbol);
    // Always try to get real market data
    const realQuote = await getRealStockQuote(upperSymbol);
    if (!realQuote) {
        return `Hmm, I couldn't find ${upperSymbol} in the market. Double-check that ticker symbol? Make sure it's a US-listed stock. And hey - if it's a company you know and love, sometimes the ticker isn't what you'd expect!`;
    }
    const direction = realQuote.change >= 0 ? 'up' : 'down';
    // If we have curated data, combine it with real prices
    if (curatedStock) {
        const pegRatio = curatedStock.peRatio / curatedStock.growthRate;
        const pegAnalysis = pegRatio < 1 ? 'undervalued' : pegRatio < 2 ? 'fairly valued' : 'expensive';
        return `
**${realQuote.name} (${upperSymbol})** - ${CATEGORY_DESCRIPTIONS[curatedStock.category]}

📊 **The Numbers (Real-time!):**
- Current Price: $${realQuote.price.toFixed(2)} (${direction} ${Math.abs(realQuote.changePercent).toFixed(2)}% today)
- P/E Ratio: ${curatedStock.peRatio}
- Growth Rate: ${curatedStock.growthRate}%
- PEG Ratio: ${pegRatio.toFixed(2)} (${pegAnalysis})
- Peter's Score: ${curatedStock.peterScore}/10

📖 **The Story:**
${curatedStock.story}

💡 **My Take:**
${curatedStock.peterScore >= 7
            ? 'This could be interesting! Do your homework - visit the stores, try the product.'
            : curatedStock.peterScore >= 5
                ? "Not bad, but I'd want to see better growth or a lower price."
                : "I'd pass on this one. The story isn't compelling enough."}
`;
    }
    // For stocks without curated data, give Peter-style guidance with real data
    return `
**${realQuote.name} (${upperSymbol})**

📊 **Current Price:** $${realQuote.price.toFixed(2)} (${direction} ${Math.abs(realQuote.changePercent).toFixed(2)}% today)

🤔 **Peter's Homework Assignment:**
I don't have this one in my watchlist yet, but here's what I'd do:

1. **Know the business** - Can you explain what they do to a fifth grader?
2. **Find the story** - What's driving their growth? Is it sustainable?
3. **Look for an edge** - Do you use their products? See their stores busy? Work in their industry?
4. **Check the P/E** - Compare it to their growth rate. PEG under 1? Now we're talking!

The best research doesn't happen on Wall Street - it happens at the mall, in your neighborhood, at your workplace. What do YOU know about this company that the big analysts might miss?
`;
}
/**
 * Find stocks in a category
 */
function findStocksByCategory(category) {
    const stocks = SAMPLE_STOCKS.filter((s) => s.category === category);
    if (stocks.length === 0) {
        return `I don't have any ${category.replace('_', ' ')} stocks in my watch list right now.`;
    }
    const list = stocks
        .map((s) => `- **${s.symbol}** (${s.name}): P/E ${s.peRatio}, Growth ${s.growthRate}%`)
        .join('\n');
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
function calculatePEG(peRatio, growthRate) {
    const peg = peRatio / growthRate;
    let verdict;
    if (peg < 0.5) {
        verdict = 'Looks like a steal! But double-check that growth rate is sustainable.';
    }
    else if (peg < 1.0) {
        verdict = 'This is attractive! PEG under 1 is what I look for.';
    }
    else if (peg < 1.5) {
        verdict = 'Fairly valued. Not cheap, but not crazy either.';
    }
    else if (peg < 2.0) {
        verdict = 'Getting pricey. The growth better be rock solid.';
    }
    else {
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
 * Find potential ten-baggers
 */
function findTenBaggers() {
    const candidates = SAMPLE_STOCKS.filter((s) => s.category === 'fast_grower' && s.peterScore >= 7);
    if (candidates.length === 0) {
        return "I don't see any obvious ten-bagger candidates right now. But keep your eyes open! The next one might be at your local mall.";
    }
    const list = candidates.map((s) => `**${s.symbol}** - ${s.story}`).join('\n\n');
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
                return findStocksByCategory(category);
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

${CATEGORY_DESCRIPTIONS[category]}

${category === 'fast_grower'
                    ? "\n💡 This is where I found my biggest winners. Dunkin' Donuts, Taco Bell, The Gap - all started as fast growers!"
                    : category === 'turnaround'
                        ? '\n⚠️ Turnarounds are tricky. Most fail. But when they work, the returns are spectacular.'
                        : category === 'cyclical'
                            ? '\n⏰ Timing is everything with cyclicals. Buy when they look terrible, sell when they look great.'
                            : ''}
`;
            },
        }),
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export default createResearchTools;
//# sourceMappingURL=research-tools.js.map
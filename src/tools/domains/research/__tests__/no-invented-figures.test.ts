/**
 * No invented figures reach a caller. Each tool's no-data path must say what
 * it can't do, quote no numbers it doesn't have, and never frame a trade.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

vi.mock('../superhuman-tools/firestore-persistence.js', () => ({
  getUserIdFromContext: () => 'u1',
}));

const financialStore = vi.hoisted(() => ({
  budget: null as null | { categories: Array<{ name: string; limit: number; spent: number }> },
  triggers: [] as unknown[],
  goals: [] as unknown[],
}));

vi.mock('../../../../services/stores/financial-store.js', () => ({
  getFinancialStore: () => ({
    loadUserData: async () => undefined,
    getMainBudget: () => financialStore.budget ?? undefined,
    getUserSpendingTriggers: () => financialStore.triggers,
    getRecentSpendingTriggers: () => financialStore.triggers,
    getUserSpendingLimits: () => [],
    getActiveSavingsGoals: () => financialStore.goals,
  }),
}));

import { createResearchTools } from '../research-tools.js';
import { createInsightsAnalysisTools } from '../insights-analysis.js';
import { getStockQuote, type StockQuoteProvider } from '../stock-quote-provider.js';

const ctx = { ctx: { userData: { userId: 'u1' } } } as never;
const BUY_SELL = /\b(buy|sell|buying|selling)\b/i;
const NO_TICKER_TABLE = /\b(COST|CMG|LULU|TJX|AAL)\b/;

function mockFetch(response: Response | Error): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)))
  );
}

function chartResponse(price: number, previousClose: number): Response {
  return new Response(
    JSON.stringify({
      chart: {
        result: [{ meta: { regularMarketPrice: price, previousClose, longName: 'Acme Corp' } }],
      },
    }),
    { status: 200 }
  );
}

beforeEach(() => {
  financialStore.budget = null;
  financialStore.triggers = [];
  financialStore.goals = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stock quote provider seam', () => {
  it('returns null when no provider answers', async () => {
    const down: StockQuoteProvider = { id: 'down', quote: async () => null };
    expect(await getStockQuote('ACME', [down])).toBeNull();
  });

  it('takes the first provider that answers, in order', async () => {
    const first: StockQuoteProvider = { id: 'first', quote: async () => null };
    const second: StockQuoteProvider = {
      id: 'second',
      quote: async (symbol) => ({
        symbol,
        name: 'Acme',
        price: 10,
        change: 0,
        changePercent: 0,
        source: 'second',
      }),
    };
    const quote = await getStockQuote('ACME', [first, second]);
    expect(quote?.source).toBe('second');
  });
});

describe('stock research: live price only, no static figures', () => {
  it('analyzeStock shows the live quote and no P/E, growth or score', async () => {
    mockFetch(chartResponse(123.45, 120));
    const analyzeStock = createResearchTools().analyzeStock;
    const text = String(await analyzeStock.execute({ symbol: 'acme' } as never, ctx as never));
    expect(text).toContain('$123.45');
    expect(text).toContain('Latest quote');
    expect(text).not.toMatch(/Real-time/i);
    expect(text).not.toMatch(/P\/E Ratio:|Growth Rate:|Peter's Score/i);
    expect(text).not.toMatch(BUY_SELL);
  });

  it('analyzeStock quotes no price when no quote is available', async () => {
    mockFetch(new Response('no', { status: 503 }));
    const analyzeStock = createResearchTools().analyzeStock;
    const text = String(await analyzeStock.execute({ symbol: 'ACME' } as never, ctx as never));
    expect(text).toMatch(/can't get a live quote/);
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/P\/E \d/);
  });

  it.each([
    'slow_grower',
    'stalwart',
    'fast_grower',
    'cyclical',
    'turnaround',
    'asset_play',
  ] as const)(
    'findStockCategory(%s) names no companies and quotes no figures',
    async (category) => {
      const text = String(
        await createResearchTools().findStockCategory.execute({ category } as never, ctx as never)
      );
      expect(text).not.toMatch(NO_TICKER_TABLE);
      expect(text).not.toMatch(/\d+(\.\d+)?%|\d+-\d+|P\/E \d|Growth \d/);
      expect(text).not.toMatch(/Coca-Cola|Costco|Chipotle|Lululemon/i);
      expect(text).toMatch(/can't/);
    }
  );

  it('findTenBaggers names no candidates', async () => {
    const text = String(
      await createResearchTools().findTenBaggers.execute({} as never, ctx as never)
    );
    expect(text).not.toMatch(NO_TICKER_TABLE);
    expect(text).toMatch(/can't/);
  });
});

describe('insights: nothing synthesized from sample figures', () => {
  it('synthesizeInsights says there is not enough real data when nothing is on file', async () => {
    const text = String(
      await createInsightsAnalysisTools().synthesizeInsights.execute(
        { focusDomains: ['all'], timeframe: 'month' } as never,
        ctx as never
      )
    );
    expect(text).toMatch(/don't have enough of your real data/);
    expect(text).not.toMatch(/heavy|overloaded|elevated|portfolio health|\d+%/i);
  });

  it('spotAnomalies reports nothing invented when nothing is on file', async () => {
    const text = String(
      await createInsightsAnalysisTools().spotAnomalies.execute(
        { domain: 'all' } as never,
        ctx as never
      )
    );
    expect(text).toMatch(/don't have enough of your real data/);
    expect(text).not.toMatch(/40%|15 days|Q1 savings/i);
  });

  it('spotAnomalies reports a real over-budget category when one is on file', async () => {
    financialStore.budget = { categories: [{ name: 'Shopping', limit: 100, spent: 250 }] };
    const text = String(
      await createInsightsAnalysisTools().spotAnomalies.execute(
        { domain: 'spending' } as never,
        ctx as never
      )
    );
    expect(text).toContain('Shopping spending');
    expect(text).not.toMatch(/40%/);
  });

  it('synthesizeInsights uses only the real data on file', async () => {
    financialStore.budget = { categories: [{ name: 'Shopping', limit: 100, spent: 250 }] };
    const text = String(
      await createInsightsAnalysisTools().synthesizeInsights.execute(
        { focusDomains: ['all'], timeframe: 'month' } as never,
        ctx as never
      )
    );
    expect(text).toContain('I looked across your spending.');
    expect(text).not.toMatch(/calendar|portfolio|investment behavior/i);
    expect(text).not.toMatch(/heavy meeting|overloaded|health score|\d+%/i);
  });

  it('spotAnomalies says a time or wealth source is not connected, not that a budget is missing', async () => {
    const text = String(
      await createInsightsAnalysisTools().spotAnomalies.execute(
        { domain: 'time' } as never,
        ctx as never
      )
    );
    expect(text).toMatch(/calendar yet: that data isn't connected/);
    expect(text).not.toMatch(/budget/);
  });

  it('findCorrelation measures nothing and quotes no percentages', async () => {
    const text = String(
      await createInsightsAnalysisTools().findCorrelation.execute(
        { domain1: 'spending', domain2: 'time' } as never,
        ctx as never
      )
    );
    expect(text).toMatch(/can't measure/);
    expect(text).not.toMatch(/\d+%/);
  });

  it('projectTrends projects nothing and quotes no percentages', async () => {
    const text = String(
      await createInsightsAnalysisTools().projectTrends.execute(
        { domain: 'spending', timeframe: 'month' } as never,
        ctx as never
      )
    );
    expect(text).toMatch(/can't project/);
    expect(text).not.toMatch(/\d+%|Confidence/);
  });
});

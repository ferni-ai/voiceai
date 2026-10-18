/**
 * The external-data tools have no live economic, news or inflation source. Each
 * must say so and quote none of the figures it used to make up, while still
 * summarizing the spending the user actually recorded.
 */

import { describe, expect, it, vi } from 'vitest';

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
  getUserIdFromContext: (ctx: { userId?: string } | null) => ctx?.userId ?? null,
  saveSpendingRecord: vi.fn().mockResolvedValue(undefined),
  loadSpendingRecords: vi.fn().mockResolvedValue([]),
}));

import {
  analyzeNewsSentiment,
  calculatePersonalInflation,
  getLocalEconomics,
  recordSpending,
} from '../superhuman-tools/external-data.js';

const ctxFor = (userId: string) => ({ ctx: { userId } }) as never;

async function run(tool: { execute: unknown }, params: unknown, userId = 'u1'): Promise<string> {
  const execute = tool.execute as (p: unknown, c: unknown) => Promise<unknown>;
  return String(await execute(params, ctxFor(userId)));
}

describe('getLocalEconomics: no invented local figures', () => {
  it.each(['San Francisco', 'Austin', 'New York', 'Boise'])(
    'says live data is unavailable for %s and quotes no numbers',
    async (location) => {
      const text = await run(getLocalEconomics, { location });
      expect(text).toContain(`I can't look up live economic data for ${location}`);
      expect(text).toContain('bls.gov');
      // Old output: SF median price $1,450,000, income 142,000, national 417,000, CPI 3.2.
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/Median Price|Unemployment:|Seller's market/);
    }
  );
});

describe('analyzeNewsSentiment: no invented sentiment', () => {
  it.each(['AI', 'housing', 'economy', 'electric vehicles'])(
    'says it cannot read current news for %s and gives no score',
    async (topic) => {
      const text = await run(analyzeNewsSentiment, { topic });
      expect(text).toContain("I can't read current news right now");
      expect(text).toContain(topic);
      // Old output: "Score: +65%", "SENTIMENT: POSITIVE", "Soft landing narrative...".
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/Score:|SENTIMENT|Soft landing|GPT-4|Bitcoin ETF/);
    }
  );
});

describe('calculatePersonalInflation: real spending only, no made-up rates', () => {
  const INVENTED = /Official CPI|YOUR RATE|Category inflation|3\.2%|5\.2%|3\.8%|Contribution:/;

  it('summarizes recorded spending by category without an inflation rate', async () => {
    const userId = 'spender';
    for (let i = 0; i < 10; i++) {
      await run(recordSpending, { category: 'food', amount: 30 }, userId);
    }
    await run(recordSpending, { category: 'housing', amount: 1000 }, userId);
    await run(recordSpending, { category: 'housing', amount: 1000 }, userId);

    const text = await run(calculatePersonalInflation, { monthlyIncome: 5000 }, userId);
    expect(text).toContain("I can't look up current inflation rates right now");
    expect(text).toContain('$2300.00 across 12 entries');
    expect(text).toContain('housing: $2000.00 (87% of what you recorded)');
    expect(text).toContain('food: $300.00 (13% of what you recorded)');
    expect(text).toContain('about 46% of the monthly income');
    expect(text).not.toMatch(INVENTED);
  });

  it('says nothing is recorded yet and invents no rate', async () => {
    const text = await run(calculatePersonalInflation, {}, 'nobody');
    expect(text).toContain("I can't look up current inflation rates right now");
    expect(text).toContain("You haven't recorded any spending");
    expect(text).not.toMatch(INVENTED);
  });
});

describe('descriptions do not promise live data', () => {
  it.each([
    ['getLocalEconomics', getLocalEconomics],
    ['analyzeNewsSentiment', analyzeNewsSentiment],
    ['calculatePersonalInflation', calculatePersonalInflation],
  ] as const)('%s says its live source is not connected', (_name, tool) => {
    const description = (tool as unknown as { description: string }).description;
    expect(description).toMatch(/not connected/);
    expect(description).not.toMatch(/vs official CPI|See how YOUR/);
  });
});

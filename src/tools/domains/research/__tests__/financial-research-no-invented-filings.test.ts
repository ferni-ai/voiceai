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

vi.mock('../../superhuman-tools/firestore-persistence.js', () => ({
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

import { financialResearchTools } from '../superhuman-tools/financial-research.js';

const ctx = { ctx: { userData: { userId: 'u1' } } } as never;
const BUY_SELL = /\b(buy|sell|buying|selling)\b/i;

describe('financial research: live data is not connected', () => {
  it.each([
    ['analyzeSECFiling', { symbol: 'AAPL', filingType: 'latest' }],
    ['trackInsiderTrading', { symbol: 'TSLA' }],
    ['analyzeOptionsFlow', { symbol: 'NVDA' }],
  ] as const)('%s says it is unavailable and points to a public source', async (name, args) => {
    const tool = financialResearchTools[name];
    const text = String(await tool.execute(args as never, ctx as never));
    expect(text).toMatch(/can't|can not|don't know/i);
    expect(text).toMatch(/EDGAR|broker/);
    expect(text).not.toMatch(/\d+(\.\d+)?%/);
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(BUY_SELL);
  });

  it('does not describe filings, trades or flows for the ticker', async () => {
    const text = String(
      await financialResearchTools.analyzeSECFiling.execute(
        { symbol: 'AAPL', filingType: '10-K' } as never,
        ctx as never
      )
    );
    expect(text).not.toMatch(/Revenue Recognition|supply chain|Added/i);
  });
});

/**
 * No research source is connected, so the research executor must return no
 * findings, store nothing for later delivery, and say it couldn't research.
 * It used to store placeholder findings with made-up sources as finished work.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const capture = vi.hoisted(() => vi.fn(async () => ({ id: 'r1' })));
vi.mock('../../unified-result-capture.js', () => ({ captureBackgroundResult: capture }));

import { executeResearchTask, type ResearchRequest } from '../research-executor.js';

const OLD_PLACEHOLDERS =
  /Overview|Fact Check Result|Key Insights|Trend Analysis|Source:|Web Search|Market Data|key insight/;

describe('research executor: no research source', () => {
  it.each(['stock_analysis', 'fact_check', 'deep_dive', 'market_research', 'general'] as const)(
    '%s returns no findings and stores nothing',
    async (type) => {
      const request: ResearchRequest = {
        userId: 'u1',
        query: 'NVDA earnings',
        type,
        depth: 'comprehensive',
        initiatedBy: 'peter',
      };

      const result = await executeResearchTask(request);

      expect(result.findings).toEqual([]);
      expect(result.summary).toMatch(/can't research/i);
      expect(result.summary).not.toMatch(OLD_PLACEHOLDERS);
      expect(capture).not.toHaveBeenCalled();
    }
  );
});

describe('research executor: no placeholder generators left', () => {
  it('exports no queueing path and carries no made-up sources', async () => {
    const mod: Record<string, unknown> = await import('../research-executor.js');
    expect(mod.queueResearchTask).toBeUndefined();
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../research-executor.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/simulateResearchDelay|'Web Search'|'Market Data'|performResearch/);
  });
});

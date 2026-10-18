/**
 * synthesizeIndustryTrends answered from a hardcoded, dated table with a
 * BULLISH/BEARISH sentiment call, stock tickers and lines like "Avoid office,
 * overweight data centers and industrial": investment views presented as
 * current. Ferni gives no financial advice, so it now says it can't give
 * market views and offers to talk through what a field's changes mean.
 */
import { describe, expect, it } from 'vitest';
import { INDUSTRY_VIEWS_UNAVAILABLE, externalDataTools } from '../superhuman-tools/external-data.js';

type Exec = { execute: (args: Record<string, unknown>, opts: unknown) => Promise<string> };
const tool = externalDataTools.synthesizeIndustryTrends as unknown as Exec;
const ctx = { ctx: { userData: { userId: 'u1' } } };

const ADVICE =
  /BULLISH|BEARISH|SENTIMENT|overweight|Avoid office|ticker|NVDA|LLY|EQIX|\(([A-Z]{1,5})\)|OUTLOOK|LEADING COMPANIES|monopoly|generational/i;

describe('synthesizeIndustryTrends gives no market views', () => {
  it.each(['technology', 'healthcare', 'finance', 'real estate', 'energy', 'biotech'])(
    '%s: says it gives no current market views and names no picks',
    async (industry) => {
      const out = await tool.execute({ industry }, ctx);
      expect(out).toBe(INDUSTRY_VIEWS_UNAVAILABLE);
      expect(out).not.toMatch(ADVICE);
    }
  );

  it('its description promises no sector calls', () => {
    const description = (externalDataTools.synthesizeIndustryTrends as { description?: string })
      .description;
    expect(description).toMatch(/no current market views/);
    expect(description).not.toMatch(/leading companies|where sectors are heading/i);
  });
});

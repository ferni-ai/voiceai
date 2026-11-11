/**
 * info_stock's catch-all pattern made "stock" optional, so any "<anything> today"
 * scored 0.95 for info_stock in the pattern layer: "i feel great today" tied
 * wellness_checkin, and "how many steps did i walk today" routed to stocks.
 * "today" now counts only after "stock".
 */
import { afterAll, describe, expect, it } from 'vitest';
import { runCombinedMatching } from '../matcher.js';
import { getToolRegistry, resetToolRegistry } from '../registry.js';
import { allToolDefinitions } from '../tool-definitions/index.js';
import { DEFAULT_ROUTER_CONFIG, type ToolMatch } from '../types.js';

afterAll(() => resetToolRegistry());

function route(text: string): ToolMatch[] {
  const registry = getToolRegistry();
  registry.registerMany(allToolDefinitions.filter((d) => !registry.get(d.id)));
  return runCombinedMatching(text, registry, { ...DEFAULT_ROUTER_CONFIG, maxMatches: 50 }).matches;
}

const stock = (matches: ToolMatch[]) => matches.find((m) => m.toolId === 'info_stock');

describe('info_stock pattern', () => {
  it.each([
    ['i feel great today', 'wellness_checkin'],
    ['what is on my calendar today', undefined],
    ["what's the news today", 'info_news'],
    ['how many steps did i walk today', undefined],
  ])('%j is not a stock ask', (text, top) => {
    const matches = route(text);
    expect(stock(matches)?.layerScores.pattern ?? 0).toBe(0);
    expect(stock(matches)?.confidence ?? 0).toBeLessThan(0.95);
    expect(matches[0]?.toolId).not.toBe('info_stock');
    if (top) expect(matches[0]?.toolId).toBe(top);
  });

  it.each(['apple stock price', 'tesla stock today', 'nvidia price', 'msft quote'])(
    '%j still routes to info_stock at 0.95 or above',
    (text) => {
      const matches = route(text);
      expect(matches[0]?.toolId).toBe('info_stock');
      expect(stock(matches)?.confidence ?? 0).toBeGreaterThanOrEqual(0.95);
    }
  );
});

/**
 * comparePrices is a ride-fare tool with no live fares behind it. Product
 * price questions ("compare prices on Samsung TVs") were routed to it: its
 * intent-manual examples were all shopping questions, and the semantic
 * router's finance_compare pointed at it. It also promised comparisons it
 * never made. Now it says fares are unavailable, its retrieval examples are
 * ride questions, and no router mapping sends anything else to it. (With
 * the prod embedder, text-embedding-005, it was the top tool for 8 of 9
 * product price questions before and for 1 of 9 after.)
 */
import { describe, expect, it } from 'vitest';
import { loadIntentManual } from '../../../retrieval/dense-index.js';
import { getAllMappings } from '../../../semantic-router/domain-bridge/index.js';
import { RIDE_PRICES_UNAVAILABLE, definitions } from '../index.js';

type Exec = { execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string> };
const comparePrices = () => {
  const def = definitions.find((d) => d.id === 'comparePrices');
  if (!def) throw new Error('comparePrices is not in the transportation domain');
  return def;
};

describe('comparePrices says fares are unavailable', () => {
  it('for a signed-in member and for anyone else, and promises nothing', async () => {
    for (const userId of ['uid-member', '']) {
      const tool = comparePrices().create({
        userId,
        agentId: 'ferni',
        agentDisplayName: 'Ferni',
      }) as unknown as Exec;
      const out = await tool.execute({ destination: 'the airport' }, {});
      expect(out).toBe(RIDE_PRICES_UNAVAILABLE);
      expect(out).not.toMatch(/I'll show you|Connect your/);
    }
  });

  it('describes itself as rides only', () => {
    expect(comparePrices().description).toMatch(/Uber and Lyft ride fares/);
    expect(comparePrices().description).toMatch(/not for product, shopping/);
  });
});

describe('product price questions do not lead to comparePrices', () => {
  it('every intent-manual example for comparePrices is a ride question', () => {
    const { queries } = loadIntentManual().tools.comparePrices;
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) expect(q).toMatch(/uber|lyft|ride|fare/i);
  });

  it('no semantic-router mapping sends a non-ride intent to comparePrices', () => {
    const toCompare = Object.entries(getAllMappings())
      .filter(([, m]) => m.domainToolId === 'comparePrices')
      .map(([id]) => id);
    for (const id of toCompare) expect(id).toMatch(/ride|transport|uber|lyft/);
  });
});

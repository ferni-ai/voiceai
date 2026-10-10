/**
 * The server charges its own copy of the cosmetics prices. This reads the web catalog
 * (apps/web/src/services/cosmetics.service.ts) and fails if any id, type or price differs,
 * so the shop can never show one price and charge another.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COSMETICS_FOR_SALE,
  cosmeticForSale,
  DEFAULT_COSMETICS,
  isDefaultCosmetic,
  ownedCosmetics,
  tierAllows,
} from '../cosmetics-catalog.js';

const WEB_CATALOG = fileURLToPath(
  new URL('../../../../apps/web/src/services/cosmetics.service.ts', import.meta.url)
);

/** Each `{ id: '...', ... }` item in the web file, up to the next item. */
function webItems(): Array<{ id: string; type: string; price: number | null; tier: string }> {
  const source = readFileSync(WEB_CATALOG, 'utf8');
  return source
    .split(/\n\s*id: '/)
    .slice(1)
    .map((chunk) => {
      const id = /^([^']+)'/.exec(chunk)?.[1];
      const type = /\btype: '([^']+)'/.exec(chunk)?.[1];
      const price = /\bpriceInSeeds: (null|\d+)/.exec(chunk)?.[1];
      const tier = /\brequiredTier: '([^']+)'/.exec(chunk)?.[1];
      if (!id || !type || price === undefined || !tier) {
        throw new Error(`Unparsed web item: ${chunk}`);
      }
      return { id, type, price: price === 'null' ? null : Number(price), tier };
    });
}

describe('server cosmetics catalog matches the web catalog', () => {
  const web = webItems();

  it('parses the whole web catalog', () => {
    expect(web.length).toBe(COSMETICS_FOR_SALE.length + DEFAULT_COSMETICS.length);
    expect(web.length).toBeGreaterThan(10);
  });

  it('sells every priced web item at the same price, type and plan, and nothing else', () => {
    const forSale = web
      .filter((item) => item.price !== null)
      .map(({ id, type, price, tier }) => ({ id, type, price, requiredTier: tier }));
    expect([...COSMETICS_FOR_SALE].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      forSale.sort((a, b) => a.id.localeCompare(b.id))
    );
  });

  it('treats every unpriced web item as a default everyone owns', () => {
    const defaults = web.filter((item) => item.price === null);
    expect([...DEFAULT_COSMETICS].sort()).toEqual(defaults.map((item) => item.id).sort());
    expect(defaults.every((item) => item.tier === 'free')).toBe(true);
  });

  it('has no free items for sale (price 0 would grant ownership with no ledger entry)', () => {
    for (const item of COSMETICS_FOR_SALE) {
      expect(Number.isInteger(item.price) && item.price > 0, item.id).toBe(true);
    }
  });
});

describe('catalog lookups', () => {
  it('finds items for sale only', () => {
    expect(cosmeticForSale('skin-cosmic')?.price).toBe(500);
    expect(cosmeticForSale('skin-default')).toBeUndefined();
    expect(cosmeticForSale('nope')).toBeUndefined();
    expect(cosmeticForSale(42)).toBeUndefined();
    expect(isDefaultCosmetic('theme-default')).toBe(true);
    expect(isDefaultCosmetic('theme-forest')).toBe(false);
  });

  it('owned = defaults plus what was bought, each once, ignoring junk', () => {
    expect(ownedCosmetics(undefined)).toEqual([...DEFAULT_COSMETICS]);
    expect(ownedCosmetics(['theme-forest', 'theme-forest', 7, 'skin-default'])).toEqual([
      ...DEFAULT_COSMETICS,
      'theme-forest',
    ]);
  });
});

describe('tierAllows ranks free < friend < partner', () => {
  it('lets a plan buy at or below its rank only', () => {
    expect(tierAllows('free', 'friend')).toBe(false);
    expect(tierAllows('friend', 'friend')).toBe(true);
    expect(tierAllows('friend', 'partner')).toBe(false);
    expect(tierAllows('partner', 'friend')).toBe(true);
    expect(tierAllows('partner', 'partner')).toBe(true);
    expect(tierAllows('free', 'free')).toBe(true);
  });

  it('counts an unrecognized plan as free', () => {
    for (const plan of [undefined, null, '', 'gold', 'toString', '__proto__', 2]) {
      expect(tierAllows(plan, 'friend'), String(plan)).toBe(false);
    }
  });
});

/**
 * The wearable panel's "not set up" text exists in every locale. It's looked up per
 * provider row, which i18n-keys.test.ts can't see, so a missing translation would
 * show the raw key.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = join(__dirname, '..', 'src', 'i18n', 'locales');
const LOCALES = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));

const KEYS = ['wearableSettings.notConfigured', 'menu.items.allConnections', 'menu.items.appleHealth'];

function valueOf(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }, locale);
}

describe('wearable panel text is translated', () => {
  it('covers all 11 locales', () => {
    expect(LOCALES).toHaveLength(11);
  });

  for (const file of LOCALES) {
    it(`${file} has every key`, () => {
      const locale = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'));
      const missing = KEYS.filter((key) => {
        const value = valueOf(locale, key);
        return typeof value !== 'string' || value.trim() === '';
      });
      expect(missing).toEqual([]);
    });
  }
});

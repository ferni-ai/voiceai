/**
 * Text for the Ferni Care connections tab exists in every locale. The tab builds
 * its rows at runtime, so a missing translation would show the raw key.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = join(__dirname, '..', 'src', 'i18n', 'locales');
const LOCALES = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));

const KEYS = [
  'ferniCare.connections.intro',
  'ferniCare.connections.connected',
  'ferniCare.connections.notConnected',
  'ferniCare.connections.loadError',
  'ferniCare.whatIDoForYou',
  'menu.items.allConnections',
  'menu.items.calendar',
  'toasts.couldNotDisconnect',
];

function valueOf(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }, locale);
}

describe('care connections text is translated', () => {
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
      // The placeholder this replaces must not linger in any locale.
      expect(valueOf(locale, 'ferniCare.connectionsSoon')).toBeUndefined();
    });
  }
});

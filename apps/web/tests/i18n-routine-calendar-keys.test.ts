/**
 * Text for the routine builder's calendar trigger and save errors exists in every
 * locale. Most of it is looked up by a dynamic key (t(option.labelKey)), which
 * i18n-keys.test.ts cannot see, so a missing translation would show the raw key.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = join(__dirname, '..', 'src', 'i18n', 'locales');
const LOCALES = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));

const KEYS = [
  'ferniCare.triggers.calendarStart',
  'ferniCare.triggers.calendarEnd',
  'routineBuilder.triggerConfig.calendar.when',
  'routineBuilder.triggerConfig.calendar.reminder',
  'routineBuilder.triggerConfig.calendar.start',
  'routineBuilder.triggerConfig.calendar.end',
  'routineBuilder.errors.saveFailed',
  'routineBuilder.errors.signInRequired',
  'ui.yourDay',
];

function valueOf(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }, locale);
}

describe('routine builder calendar and save text is translated', () => {
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

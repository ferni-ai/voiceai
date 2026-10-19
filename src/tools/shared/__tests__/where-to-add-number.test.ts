/**
 * The "no verified phone" replies name the menu row a person can actually find.
 * If the web label changes, this fails until the spoken hint changes with it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WHERE_TO_ADD_NUMBER } from '../where-to-add-number.js';
import { KEPT_IN_APP_NO_NUMBER, NO_NUMBER_TO_TEXT } from '../../domains/productivity/reminders.js';

const menuLabel = (locale: string): string => {
  const path = resolve(__dirname, `../../../../apps/web/src/i18n/locales/${locale}.json`);
  const json = JSON.parse(readFileSync(path, 'utf8')) as {
    menu: { items: Record<string, string> };
  };
  return json.menu.items.howIReachYou;
};

describe('where to add a number', () => {
  it('names the menu row by its en-US and en-GB label', () => {
    for (const locale of ['en-US', 'en-GB']) {
      const label = menuLabel(locale);
      expect(label, locale).toBeTruthy();
      expect(WHERE_TO_ADD_NUMBER.toLowerCase()).toContain(`under ${label.toLowerCase()}.`);
    }
  });

  it('never sends them to "Settings"', () => {
    expect(WHERE_TO_ADD_NUMBER).not.toMatch(/settings/i);
  });

  it('is in both reminder replies for a missing number', () => {
    expect(NO_NUMBER_TO_TEXT).toContain(WHERE_TO_ADD_NUMBER);
    expect(KEPT_IN_APP_NO_NUMBER).toContain(WHERE_TO_ADD_NUMBER);
  });
});

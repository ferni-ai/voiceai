/**
 * The "How You're Feeling" panel's text exists in every locale. The panel looks its
 * keys up by name from the cards and dashboard code, and i18n-audit.mjs only reports
 * the translation backlog as numbers, so a missing or untranslated key would show
 * the raw key to a user in that locale without failing any test.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = join(__dirname, '..', 'src', 'i18n', 'locales');
const LOCALES = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));

const KEYS = [
  'wellbeing.achievements',
  'wellbeing.asOfCount',
  'wellbeing.asOfOnce',
  'wellbeing.connection',
  'wellbeing.consistencyCheckingIn',
  'wellbeing.couldntLoadData',
  'wellbeing.emptySubtitle',
  'wellbeing.emptyTitle',
  'wellbeing.emptyVision',
  'wellbeing.energy',
  'wellbeing.helpingYou',
  'wellbeing.hope',
  'wellbeing.howYoureDoing',
  'wellbeing.howYouveBeenFeeling',
  'wellbeing.keepChatting',
  'wellbeing.last4Weeks',
  'wellbeing.lastUpdated',
  'wellbeing.letsBegin',
  'wellbeing.lookingAhead',
  'wellbeing.milestone',
  'wellbeing.mood',
  'wellbeing.notTalkedLately',
  'wellbeing.nothingToWatchFor',
  'wellbeing.purpose',
  'wellbeing.sleep',
  'wellbeing.stateOfMe',
  'wellbeing.trendUnavailable',
  'wellbeing.tryAgain',
  'wellbeing.watchFor',
  'wellbeing.wellbeing',
  'wellbeing.whatWeExplore',
  'wellbeing.yourWellbeing',
];

function valueOf(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }, locale);
}

describe('wellbeing panel text is translated', () => {
  it('covers all 11 locales', () => {
    expect(LOCALES).toHaveLength(11);
  });

  for (const file of LOCALES) {
    it(`${file} has every key, translated`, () => {
      const locale: unknown = JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8'));
      const bad = KEYS.filter((key) => {
        const value = valueOf(locale, key);
        return typeof value !== 'string' || value.trim() === '' || value.includes('[NEEDS_TRANSLATION]');
      });
      expect(bad, file).toEqual([]);
    });
  }
});

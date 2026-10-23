/**
 * The shared whole-word matcher (utils/safety-whole-word.ts) behind
 * SAFETY_WHOLE_WORD_SITES, tested directly. Each site that uses it has its own
 * crisis-substring-sites-<site>.test.ts. Inflected forms stay matched
 * ("cuttings"), and inflection never reopens an in-word overlap ("number" for
 * 'numb', "diet" for 'want to die').
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  saysPhrase,
  saysRiskPhrase,
  testRiskWords,
  testWholeWords,
} from '../../../utils/safety-whole-word.js';

afterEach(() => {
  vi.unstubAllEnvs();
});
const flag = (v: 'on' | 'off' | 'shadow') => vi.stubEnv('SAFETY_WHOLE_WORD_SITES', v);

describe('testWholeWords', () => {
  it('on: a match inside a word does not hide a later whole-word one', () => {
    flag('on');
    expect(testWholeWords(/(?:he|she) hits me/i, 'the hits me, she hits me')).toBe(true);
    expect(testWholeWords(/(?:he|she) hits me/i, 'the hits me')).toBe(false);
  });
});

describe('inflected real-risk forms stay matched (whole-word mode is a superset on them)', () => {
  it('the cuttings form still counts', () => {
    flag('on');
    expect(saysPhrase('more cuttings on my arm', 'cutting')).toBe(true);
  });
  it('inflection never reopens an in-word overlap', () => {
    flag('on');
    expect(saysPhrase('my phone number', 'numb')).toBe(false);
    expect(saysPhrase('I want to diet', 'want to die')).toBe(false);
    expect(saysPhrase('I give updates', 'give up')).toBe(false);
    expect(saysPhrase('the self-harmony workshop', 'self-harm')).toBe(false);
    expect(saysPhrase('in the end its fine', 'end it')).toBe(false);
  });
});

describe('shadow and the flag split', () => {
  it('each flag file names every site it touches', () => {
    const sites = readFileSync('src/config/flags/SAFETY_WHOLE_WORD_SITES.ts', 'utf8');
    for (const site of [
      'life-coaching-shared/safety-guards.ts',
      'principal-alignment/human-referral.ts',
      'semantic-router/shared-vocabulary.ts',
      'intelligence/predictive-context.ts',
      'semantic-router/matcher.ts',
      'safety/crisis-agreement.ts',
    ]) {
      expect(sites).toContain(site);
    }
  });
});

describe('shadow decides as off', () => {
  // Each line reads differently off and on, so a shadow that decided as on would flip it.
  const CASES: Array<[string, () => boolean]> = [
    ['saysPhrase "spend it all" / end it all', () => saysPhrase('just spend it all', 'end it all')],
    ['saysPhrase "self harm" / self-harm', () => saysPhrase('self harm', 'self-harm')],
    ['saysRiskPhrase "skill them" / kill them', () => saysRiskPhrase('skill them up', 'kill them')],
    ['saysRiskPhrase "selfharm" / self-harm', () => saysRiskPhrase('selfharm', 'self-harm')],
    ['testWholeWords "casino points"', () => testWholeWords(/no point/i, 'casino points')],
    ['testRiskWords "casino points"', () => testRiskWords(/no point/i, 'casino points')],
  ];
  it.each(CASES)('%s: shadow equals off, and on differs', (_name, read) => {
    flag('off');
    const off = read();
    flag('on');
    const on = read();
    flag('shadow');
    expect(on).not.toBe(off);
    expect(read()).toBe(off);
  });
});

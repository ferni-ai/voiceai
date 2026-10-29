/**
 * The provenance matcher (spoken-addresses.ts): whole addresses in one reading, and
 * linear on hostile input (#3032 security review).
 */
import { describe, expect, it } from 'vitest';

import {
  collectAddresses,
  factAddresses,
  inventsAddress,
  noAddresses,
} from '../spoken-addresses.js';

const FACTS = factAddresses({
  website: 'ferni.ai',
  webApp: 'app.ferni.ai',
  textsFrom: '+17275550142',
  emailFrom: 'hello@ferni.ai',
});

describe('one reading', () => {
  it('collects every written and said form as the same address', () => {
    const found = collectAddresses(
      'Call +1 (727) 555-0199 or SAM AT Example DOT com, see https://www.Example.com/x, code 55512.',
      noAddresses()
    );
    expect([...found.numbers].sort()).toEqual(['55512', '7275550199']);
    expect([...found.emails]).toEqual(['sam@example.com']);
    expect([...found.hosts]).toEqual(['example.com']);
  });

  it('a 5-6 digit number counts only in a sentence about texts', () => {
    expect(inventsAddress('The house costs 25000 dollars.', FACTS)).toBe(false);
    expect(inventsAddress('Texts come from 25000.', FACTS)).toBe(true);
  });

  it('a decimal or a date is no address', () => {
    expect(inventsAddress('That is 3.5 out of 5, since 2026-10-29.', FACTS)).toBe(false);
  });
});

describe('no catastrophic backtracking', () => {
  /** Best of three, so a busy CI box doesn't fail it; backtracking takes minutes, not ms. */
  const ms = (run: () => unknown): number => {
    const times: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const start = performance.now();
      run();
      times.push(performance.now() - start);
    }
    return Math.min(...times);
  };

  it.each([
    ['hyphen run then a said dot', `${'a-'.repeat(5000)}dot com`],
    ['repeated -dot-', 'x-dot-'.repeat(3000)],
    ['repeated written dots', 'a.'.repeat(5000)],
    ['said dots', 'a dot '.repeat(2000)],
    ['email-ish', 'hello at '.repeat(1200)],
  ])('%s: checked and collected in under 50 ms', (_name, text) => {
    expect(ms(() => inventsAddress(text, FACTS))).toBeLessThan(50);
    expect(ms(() => collectAddresses(text, noAddresses()))).toBeLessThan(50);
  });
});

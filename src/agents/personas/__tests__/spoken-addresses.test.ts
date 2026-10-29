/**
 * The provenance matcher (spoken-addresses.ts): whole addresses in one reading, and
 * linear on hostile input (#3032 security review).
 */
import { describe, expect, it } from 'vitest';

import {
  collectAddresses,
  factAddresses,
  asksForOwn,
  inventsAddress,
  noAddresses,
  presentsAsOwn,
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

describe("Ferni's own address shapes", () => {
  it.each([
    'Our website is x.com.',
    'my number is 5',
    "Ferni's email address is a@b.co",
    'You can text me at 727.',
    'Please reach us at x.',
    'Texts from me come from 55512.',
    "I'm at x.com.",
    'Our new website is x.com.',
    'My brand new phone number is 5.',
    'My cell is 727.',
    'Download the Ferni app at x.com.',
    'Visit us at x.com.',
    'Ferni\u2019s site is x.com.',
    'FERNI\u02bcS SITE',
    'Our\u00a0\u00a0website\u200b is x.com.',
    'You can find me at x.com.',
  ])('said as ours: %s', (line) => expect(presentsAsOwn(line)).toBe(true));

  it.each([
    'Your newest email is from sarah@example.com.',
    "Your mom's number is 727-555-0199.",
    'Texts from my mom come from 727-555-0199.',
    'The latest email is from john@gmail.com.',
    'The number is on their site.',
    "My mom's cell is 727-555-0199.",
    'Go to chase.com and tap verify.',
    "The pharmacy's number is 727-555-0111.",
  ])('not said as ours: %s', (line) => expect(presentsAsOwn(line)).toBe(false));

  it('names the persona as the owner', () => {
    expect(presentsAsOwn("Maya's number is 727-555-0123.", 'maya')).toBe(true);
    expect(presentsAsOwn("Maya's number is 727-555-0123.")).toBe(false);
    expect(asksForOwn('What is Maya\u2019s number?', 'maya')).toBe(true);
  });

  it.each([
    "What's your website?",
    'What number do your texts come from?',
    'what is your phone number',
    'Which number do texts from you come from?',
  ])('asked for his: %s', (words) => expect(asksForOwn(words)).toBe(true));

  it.each([
    "What's my mom's number?",
    "What's your mom's number?",
    'Which website verifies my number?',
    'Read me my newest email.',
  ])('not asked for his: %s', (words) => expect(asksForOwn(words)).toBe(false));

  it('is linear on hostile input', () => {
    const text = 'our new '.repeat(20000) + 'our ' + 'a'.repeat(50000);
    const start = performance.now();
    presentsAsOwn(text);
    asksForOwn(text);
    expect(performance.now() - start).toBeLessThan(50);
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

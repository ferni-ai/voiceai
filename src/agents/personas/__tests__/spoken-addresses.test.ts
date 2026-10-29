/**
 * The provenance matcher (spoken-addresses.ts): whole addresses in one reading, and
 * linear on hostile input (#3032 security review).
 */
import { describe, expect, it } from 'vitest';

import {
  collectAddresses,
  factAddresses,
  judgeAddresses,
  noAddresses,
  safeCut,
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
    expect(judgeAddresses('The house costs 25000 dollars.', FACTS)).toBe('ok');
    expect(judgeAddresses('Texts come from 25000.', FACTS)).toBe('nowhere');
  });

  it('a decimal or a date is no address', () => {
    expect(judgeAddresses('That is 3.5 out of 5, since 2026-10-29.', FACTS)).toBe('ok');
  });
});

describe('a website: the complete IANA list, punycode, or a non-ASCII ending', () => {
  it.each([
    'glowfriend.help',
    'glowfriend.ru',
    'glowfriend.xn--p1ai',
    'xn--80ak6aa92e.com',
    '\u043f\u0440\u0438\u043c\u0435\u0440.\u0440\u0444',
    'ferni.c\u03bfm',
    'glowfriend\uff0ehelp',
    'glowfriend dot help',
    'glowfriend dot r u',
    'GLOWFRIEND.HELP',
    'evil.ru',
    'evil dot ru',
    'evil.xn--p1ai',
    'evil.onion',
    '1234.eth',
    '777.crypto',
    '1234.x',
    'evil.eth',
    'evil dot crypto',
    'evil.i2p',
    'evil.home.arpa',
    'evil.localhost',
    'evil dot o n l i n e',
    'evil dot s t o r e',
    'evil.xn--zzzz9a',
    'evil.\u0441om',
  ])('%s is a website', (host) => {
    expect(judgeAddresses(`Go to ${host} now`, FACTS)).toBe('nowhere');
    expect(collectAddresses(`Go to ${host} now`, noAddresses()).hosts.size).toBe(1);
  });

  it.each([
    'That is 3.5 ok',
    'since 2026-10-29',
    'version v2.0.1',
    'a.m',
    'e.g',
    '1.5x',
    'U.S',
    'Put a dot on the map',
    'run node.js',
    'Okay.Great',
    'Python 3.x is out',
    'version 3.x',
    'node 2.0.x',
  ])('ordinary text with a dot passes: %s', (text) => {
    expect(judgeAddresses(text, FACTS)).toBe('ok');
  });

  it('the house hosts pass, and a lookalike does not', () => {
    expect(judgeAddresses('Go to ferni.ai or app dot ferni dot ai', FACTS)).toBe('ok');
    expect(judgeAddresses('Go to ferni.help', FACTS)).toBe('nowhere');
  });

  it('says whether an address was found only in untrusted text', () => {
    const online = collectAddresses('See glowfriend.help', noAddresses());
    expect(judgeAddresses('Go to glowfriend.help', FACTS, online)).toBe('online');
    expect(judgeAddresses('Go to glowfriend.help or other.help', FACTS, online)).toBe('nowhere');
  });
});

describe('a held run is cut only outside an address', () => {
  it.each([
    ['beside " dot "', 'aaaa bbbb cccc evil dot com tail'],
    ['beside " at "', 'aaaa bbbb cccc help at evil tail'],
    ['inside a number', 'aaaa bbb 727 555 0142 tail text'],
    ['beside spoken digits', 'aaaa bbb seven two seven five tail'],
    ['inside spelled letters', 'aaaa bbb x n d a s h tail'],
  ])('%s', (_name, text) => {
    const cut = safeCut(text, 20);
    const before = text.slice(0, cut).trim().split(' ').pop() ?? '';
    const after = text.slice(cut).split(' ')[0] ?? '';
    expect(cut).toBeGreaterThan(0);
    for (const token of [before, after]) {
      expect(token).not.toMatch(/^(?:dot|at|seven|two|five|\d+|[a-z])$/);
    }
  });

  it('returns 0 when there is no safe place', () => {
    expect(safeCut('1 2 3 4 5 6 7 8 9 1 2 3 4 5', 20)).toBe(0);
    expect(safeCut('nospacesatalleverythinginonelongtoken', 20)).toBe(0);
  });

  it('a number at a hard cut is still judged whole (overlapping pieces)', () => {
    expect(judgeAddresses(`${'z'.repeat(294)} 7275550123 tail`, FACTS)).toBe('nowhere');
  });

  it('a long unspaced token is still judged whole (overlapping pieces)', () => {
    const text = `${'a'.repeat(280)}.evil.com ${'b '.repeat(40)}`;
    expect(judgeAddresses(text, FACTS)).toBe('nowhere');
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
    ['spelled letters', 'a '.repeat(25000)],
    ['spelled letters after a dot', `evil dot ${'a '.repeat(25000)}`],
    ['spelled letters, broken at the end', `evil dot ${'a '.repeat(25000)}1`],
    ['email-ish', 'hello at '.repeat(1200)],
  ])('%s: checked and collected in under 50 ms', (_name, text) => {
    expect(ms(() => judgeAddresses(text, FACTS))).toBeLessThan(50);
    expect(ms(() => collectAddresses(text, noAddresses()))).toBeLessThan(50);
  });
});

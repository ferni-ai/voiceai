/**
 * What an unverified call may not have Ferni send the owner: links, numbers,
 * addresses and credential asks, in plain form and in the usual disguises.
 * Fictional values only. Held-out adversarial cases come from the verifier.
 */
import { describe, expect, it } from 'vitest';

import { blockedContent, normalForm } from '../owner-message-content.js';

describe('blockedContent', () => {
  it.each([
    'Pick up milk on the way home',
    "Don't forget to stretch before your run at 5pm",
    'Call your mom tonight, she misses you',
    'Dentist tomorrow at 3, bring the forms',
    'You said you would drink more water today',
    'Meet Pat at the park around noon',
  ])('lets an everyday message through: %s', (text) => {
    expect(blockedContent(text)).toBeNull();
  });

  it.each([
    ['https://example.com/x', 'url'],
    ['go to www.example.org now', 'url'],
    ['visit example.com', 'url'],
    ['visit EXAMPLE.COM', 'url'],
    ['visit example dot com', 'url'],
    ['visit example (dot) com', 'url'],
    ['visit example[.]com', 'url'],
    ['visit example . com', 'url'],
    ['visit exampledotcom', 'url'],
    ['visit ｅｘａｍｐｌｅ．ｃｏｍ', 'url'],
    ['visit exa\u200Bmple.com', 'url'],
    ['visit sub.example.co', 'url'],
  ])('refuses a link: %s', (text, reason) => {
    expect(blockedContent(text)).toBe(reason);
  });

  it.each([
    'call 5555550123',
    'call 555-555-0123',
    'call 555 555 0123',
    'call 555.555.0123',
    'call (555) 555-0123',
    'call 555\u2013555\u20130123',
    'call ５５５５５５０１２３',
    'call \u0665\u0665\u0665\u0665\u0665\u0665\u0660', // Arabic-Indic digits
    'call five five five five five five zero one',
    'call +1 555 555 0123',
  ])('refuses a phone number: %s', (text) => {
    expect(blockedContent(text)).toBe('phone_number');
  });

  it('lets a short number through', () => {
    expect(blockedContent('Room 214, floor 3')).toBeNull();
  });

  it.each([
    'write to pat@example.com',
    'write to pat＠example.com',
    'write to pat at example dot com',
    'write to pat (at) example (dot) com',
    'write to pat [at] example.com',
  ])('refuses an email address: %s', (text) => {
    expect(blockedContent(text)).toBe('email');
  });

  it.each([
    'please verify your identity',
    'you need to log in again',
    'your login expired',
    'check your account',
    'your bank called',
    'reset your password',
    'read me the code',
    'what is your PIN',
    'send your SSN',
    'your card was declined',
    'wire the money',
    'buy a gift card',
    'please vérify',
    'please vеrify', // Cyrillic e
    'reset your pa$$w0rd',
    'reset your p a s s w o r d',
    'check your acc0unt',
    'l0g1n now',
  ])('refuses a credential or verification ask: %s', (text) => {
    expect(blockedContent(text)).toBe('credential_ask');
  });
});

/** Characters built from code points, so the source shows what they are. */
const ZERO_WIDTH = String.fromCodePoint(0x200b);
const BIDI_MARK = String.fromCodePoint(0x202e);
const SOFT_HYPHEN = String.fromCodePoint(0x00ad);
const FULL_WIDTH_STOP = String.fromCodePoint(0xff0e);
const CYRILLIC_ES = String.fromCodePoint(0x0441);
const EM_DASH = String.fromCodePoint(0x2014);

describe('normalForm: one normaliser in front of every check', () => {
  it('undoes compatibility forms, format characters, accents and look-alikes', () => {
    expect(normalForm(`ｅｘ${ZERO_WIDTH}ａｍ${BIDI_MARK}ple${FULL_WIDTH_STOP}ｓｈｏｐ`)).toBe(
      'example.shop'
    );
    expect(normalForm(`Pré${CYRILLIC_ES}heck`)).toBe('precheck');
  });

  it('writes spelled, bracketed and spaced dots as "."', () => {
    for (const text of ['site dot shop', 'site (dot) shop', 'site[.]shop', 'site . shop', 'site .shop', 'sitedotshop']) {
      expect(normalForm(text)).toBe('site.shop');
    }
  }); // prettier-ignore

  it('leaves an ordinary sentence break alone', () => {
    expect(normalForm('Call your mom. She misses you.')).toBe('call your mom. she misses you.');
    expect(blockedContent('Call your mom. She misses you.')).toBeNull();
  });
});

describe('any domain-shaped token is a link, whatever the TLD', () => {
  it.each([
    'example.shop',
    'example dot shop',
    'example . xyz',
    'example[.]top',
    'example(.)museum',
    'example .travel',
    'login-help.example.zone',
    `exam${SOFT_HYPHEN}ple.top`,
    `example${ZERO_WIDTH}.${ZERO_WIDTH}top`,
  ])('%s', (text) => {
    expect(blockedContent(`visit ${text}`)).toBe('url');
  });

  it.each(['Take 2.5mg with food', 'Version 1.2 is out', 'e.g. the blue one', 'At 3 p.m. sharp'])(
    'not a domain: %s',
    (text) => {
      expect(blockedContent(text)).toBeNull();
    }
  );
});

describe('digits in disguise are still a number', () => {
  it.each([
    'call 555 l23 45o7',
    'call 555 I23 4567',
    'call 555|555|0123',
    'call 5o5-555-OI23',
    `call 555${ZERO_WIDTH}555${ZERO_WIDTH}0123`,
    `call 555${SOFT_HYPHEN}5550123`,
    'call five five five 555 01 23',
    `call 555${EM_DASH}555${EM_DASH}0123`,
  ])('%s', (text) => {
    expect(blockedContent(text)).toBe('phone_number');
  });
});

describe('addresses read through the same normal form', () => {
  it.each([
    `pat${ZERO_WIDTH}@example.shop`,
    'pat at example dot shop',
    'pat [at] example [dot] top',
    'pat＠ｅｘａｍｐｌｅ．ｃｏｍ',
  ])('%s', (text) => {
    expect(blockedContent(text)).toBe('email');
  });
});

describe('security review bypasses (2026-10-31)', () => {
  const MINUS = String.fromCodePoint(0x2212);
  const EMOJI = String.fromCodePoint(0x1f642);

  it.each(['evil dotcom', 'evil-dotcom', 'exampledot com', 'dot com'])(
    'spelled "dot" whatever the separators: %s',
    (text) => {
      expect(blockedContent(`go to ${text}`)).toBe('url');
    }
  );

  it('an address with a spelled dot', () => {
    expect(blockedContent('write to pat at evil dotcom')).toBe('email');
  });

  it.each([
    `555${MINUS}123${MINUS}4567`,
    '555×123×4567',
    '555·123·4567',
    `555${EMOJI}123${EMOJI}4567`,
    '555/123/4567',
    '555~123~4567',
    '555:123:4567',
  ])('any separator between digits: %s', (number) => {
    expect(blockedContent(`call ${number}`)).toBe('phone_number');
  });

  it.each(['call mom at 5', 'meeting at 3:30', 'aisle 12, 2 lbs'])('still benign: %s', (text) => {
    expect(blockedContent(text)).toBeNull();
  });
});

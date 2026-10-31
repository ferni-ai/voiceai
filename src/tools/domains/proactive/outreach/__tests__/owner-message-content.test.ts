/**
 * What an unverified call may not have Ferni send the owner: links, numbers,
 * addresses and credential asks, in plain form and in the usual disguises.
 * Fictional values only. Held-out adversarial cases come from the verifier.
 */
import { describe, expect, it } from 'vitest';

import { blockedContent } from '../owner-message-content.js';

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

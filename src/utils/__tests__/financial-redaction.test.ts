/**
 * Financial secrets never reach memory: card, account and routing numbers,
 * IBANs, SSNs, passwords, PINs, CVVs and security answers are redacted;
 * ordinary money talk and (outside strict mode) phone numbers are left alone.
 */

import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  containsFinancialSecret,
  isOnlyRedacted,
  isSecretFactKey,
  redactFinancialSecrets,
} from '../financial-redaction.js';

const redact = (s: string, strict = false) => redactFinancialSecrets(s, { strict }).text;

describe('redactFinancialSecrets', () => {
  it.each([
    ['My card number is 4111 1111 1111 1111', '4111'],
    ['use 4242-4242-4242-4242 for it', '4242'],
    ['my account number is 12345678', '12345678'],
    ['bank account: 9876543210', '9876543210'],
    ['routing 021000021', '021000021'],
    ['sort code 12-34-56', '12-34-56'],
    ['SSN 123-45-6789', '6789'],
    ['my social security number is 123456789', '123456789'],
    ['my pin is 4821', '4821'],
    ["my PIN's 0000", '0000'],
    ['my password is hunter2!', 'hunter2'],
    ['passcode: tr0ub4dor', 'tr0ub4dor'],
    ['the cvv is 123', '123'],
    ["my mother's maiden name is Smith", 'Smith'],
    ['security answer: Fluffy', 'Fluffy'],
    ['the card ending in 4242', '4242'],
    ['IBAN GB29 NWBK 6016 1331 9268 19', 'NWBK'],
  ])('removes the secret in %j', (input, secret) => {
    const out = redactFinancialSecrets(input);
    expect(out.text).not.toContain(secret);
    expect(out.text).toContain(REDACTED);
    expect(out.kinds.length).toBeGreaterThan(0);
    expect(containsFinancialSecret(input)).toBe(true);
  });

  it('keeps ordinary money talk', () => {
    for (const s of [
      "I'm paying off my credit card, about $4,000 left",
      'Taylor Swift tickets cost $300',
      'My rent is due on the 1st',
      'We spent 1,250,000 on the house',
      'due 2026-10-14',
      'I ran a 5k in 2024',
    ]) {
      expect(redact(s, true)).toBe(s);
    }
  });

  it('a non-Luhn long number is only removed in strict mode (phone numbers in ordinary facts survive)', () => {
    expect(redact('Call me at 555 123 4567')).toBe('Call me at 555 123 4567');
    expect(redact('Call me at 555 123 4567', true)).toBe(`Call me at ${REDACTED}`);
  });

  it('flags keys that can only hold a secret', () => {
    expect(isSecretFactKey('card_number')).toBe(true);
    expect(isSecretFactKey('bank password')).toBe(true);
    expect(isSecretFactKey('pin')).toBe(true);
    expect(isSecretFactKey('debt')).toBe(false);
    expect(isSecretFactKey('spinning_class')).toBe(false);
  });

  it('knows when nothing worth keeping is left', () => {
    expect(isOnlyRedacted(`my pin is ${REDACTED}`)).toBe(true);
    expect(isOnlyRedacted(`Paying off the card ending in ${REDACTED}`)).toBe(false);
  });
});

/** Verification codes go to US and Canadian numbers only, never to anything +1 merely looks like. */
import { describe, expect, it } from 'vitest';
import { toE164 } from '../call-retry.js';
import { toUsCaE164 } from '../us-ca-numbers.js';

describe('toUsCaE164', () => {
  it('accepts US and Canadian numbers, written any usual way', () => {
    expect(toUsCaE164('+1 212 555 0100')).toBe('+12125550100');
    expect(toUsCaE164('(416) 555-0100')).toBe('+14165550100');
    expect(toUsCaE164('1-604-555-0100')).toBe('+16045550100');
    expect(toUsCaE164('+1 867 555 0100')).toBe('+18675550100'); // Yukon, NWT, Nunavut
  });

  it('refuses the Caribbean and the US territories (+1, but their own regions)', () => {
    for (const area of [
      '876',
      '809',
      '268',
      '473',
      '649',
      '284',
      '242',
      '664',
      '767',
      '787',
      '340',
      '671',
    ]) {
      expect(toUsCaE164(`+1 ${area} 555 0100`)).toBeNull();
    }
  });

  it('refuses premium 900 and 976 (as area code or exchange)', () => {
    expect(toUsCaE164('+1 900 555 0100')).toBeNull();
    expect(toUsCaE164('+1 (212) 976-1234')).toBeNull();
  });

  it('refuses N11 and unassigned or invalid codes', () => {
    for (const n of ['+1 911 555 0100', '+1 211 555 0100', '+1 212 911 0100', '+1 212 411 0100']) {
      expect(toUsCaE164(n)).toBeNull();
    }
    for (const n of ['+1 200 555 0100', '+1 999 555 0100', '+1 012 555 0100', '+1 212 055 0100']) {
      expect(toUsCaE164(n)).toBeNull();
    }
  });

  it('never re-reads another country code as +1', () => {
    expect(toUsCaE164('+234 803 1234')).toBeNull();
    expect(toUsCaE164('+44 7911 123456')).toBeNull();
    // The same rule in call-retry's normalizer (it had the same bug).
    expect(toE164('+234 803 1234')).toBeNull();
    expect(toE164('+1 234 803 1234')).toBe('+12348031234');
    expect(toE164('234 803 1234')).toBe('+12348031234'); // no "+": a national number, as before
  });

  it('a "+" dressed in brackets, spaces or invisible characters is still not +1', () => {
    for (const n of [
      '(+234) 803 1234',
      '\u200B+234 803 1234', // zero-width space
      '\uFEFF+234 803 1234', // BOM
      ' \u2060 ( +234 803 1234', // word joiner, space, bracket
      '[+44] 7911 123456',
    ]) {
      expect(toE164(n)).toBeNull();
      expect(toUsCaE164(n)).toBeNull();
    }
    expect(toE164('(+1) 212 555 0100')).toBe('+12125550100');
    expect(toE164('\u200B+1 212 555 0100')).toBe('+12125550100');
    expect(toUsCaE164('\uFEFF(212) 555-0100')).toBe('+12125550100');
  });
});

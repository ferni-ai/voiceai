import { afterEach, describe, expect, it } from 'vitest';
import { callOpeningDialOptions, isCallOpeningAmdEnabled } from '../call-opening-flag.js';

const saved = process.env.CALL_OPENING_AMD;
afterEach(() => {
  if (saved === undefined) delete process.env.CALL_OPENING_AMD;
  else process.env.CALL_OPENING_AMD = saved;
});

describe('CALL_OPENING_AMD', () => {
  it('is off unless set to on or true', () => {
    for (const value of [undefined, '', 'off', 'false', '0', 'yes please']) {
      if (value === undefined) delete process.env.CALL_OPENING_AMD;
      else process.env.CALL_OPENING_AMD = value;
      expect(isCallOpeningAmdEnabled(), String(value)).toBe(false);
      expect(callOpeningDialOptions()).toEqual({});
    }
  });

  it('turns on with on or true, and then rings long enough for voicemail', () => {
    for (const value of ['on', 'true', ' ON ']) {
      process.env.CALL_OPENING_AMD = value;
      expect(isCallOpeningAmdEnabled(), value).toBe(true);
    }
    expect(callOpeningDialOptions()).toEqual({ ringingTimeout: 45, maxCallDuration: 900 });
  });
});

import { describe, expect, it } from 'vitest';
import { errandsEnabled } from '../errands-flag.js';

describe('ERRANDS flag', () => {
  it('is off by default and on only when set', () => {
    expect(errandsEnabled({})).toBe(false);
    expect(errandsEnabled({ ERRANDS: 'on' })).toBe(true);
    expect(errandsEnabled({ ERRANDS: 'off' })).toBe(false);
  });
});

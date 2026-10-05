import { describe, it, expect } from 'vitest';
import { paramString } from '../param-string.js';

describe('paramString', () => {
  it('returns a string when given a string', () => {
    expect(paramString('hello')).toBe('hello');
  });

  it('returns undefined when given undefined', () => {
    expect(paramString(undefined)).toBeUndefined();
  });

  it('returns undefined when given an array', () => {
    expect(paramString(['hello', 'world'])).toBeUndefined();
  });

  it('returns undefined when given an empty array', () => {
    expect(paramString([])).toBeUndefined();
  });

  it('returns undefined when given a single-element array', () => {
    expect(paramString(['single'])).toBeUndefined();
  });
});

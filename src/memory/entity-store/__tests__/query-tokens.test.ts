import { describe, expect, it } from 'vitest';
import { queryTokens } from '../query-tokens.js';

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${'x'.repeat(i)}`);

describe('queryTokens', () => {
  it('keeps array-contains-any x in within 30 disjunctions (the 4-type surfacing query)', () => {
    const tokens = queryTokens(words(20), 4);
    expect(tokens.length * 4).toBeLessThanOrEqual(30);
    expect(tokens).toHaveLength(7);
  });

  it('caps array-contains-any at 30 values with no type filter', () => {
    expect(queryTokens(words(45))).toHaveLength(30);
    expect(queryTokens(words(45), 0)).toHaveLength(30);
  });

  it('keeps the longest, most specific words, once each', () => {
    expect(queryTokens(['so', 'birthday', 'so', 'sister', 'the'], 10)).toEqual([
      'birthday',
      'sister',
      'the',
    ]);
  });

  it('leaves a short query alone', () => {
    expect(queryTokens(['sister', 'birthday'], 4).sort()).toEqual(['birthday', 'sister']);
  });
});

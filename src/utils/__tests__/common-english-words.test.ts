import { describe, expect, it } from 'vitest';
import { COMMON_ENGLISH_WORDS, isCommonEnglishWord } from '../common-english-words.js';

describe('common English words', () => {
  it('holds the 1,000 words, lower-case letters only', () => {
    expect(COMMON_ENGLISH_WORDS.size).toBe(1000);
    expect([...COMMON_ENGLISH_WORDS].every((w) => /^[a-z]+$/.test(w))).toBe(true);
  });

  it.each(['new', 'Life', 'work', 'long', 'family', 'planned', 'kid', 'kids', 'started', 'better'])(
    '%s is common',
    (w) => expect(isCommonEnglishWord(w)).toBe(true)
  );

  it.each(['hike', 'recital', 'puppy', 'costumes', 'marathon', 'hiking', 'concerts'])(
    '%s is not',
    (w) => expect(isCommonEnglishWord(w)).toBe(false)
  );
});

import { describe, expect, it } from 'vitest';
import {
  detectTheirWords,
  formatTheirWords,
  mergeTheirWords,
  type TheirWords,
} from '../their-words.js';

describe('detectTheirWords', () => {
  it("hears the caller's own terms for the people in their life", () => {
    expect(detectTheirWords('My person and I took my fur baby to the park')).toEqual({
      partner: 'my person',
      pet: 'my fur baby',
    });
    expect(detectTheirWords('I called my Nana last night')).toEqual({ grandmother: 'my nana' });
  });

  it('does not mistake everyday phrases for a term', () => {
    expect(detectTheirWords('My love for music started early')).toEqual({});
    expect(detectTheirWords('My math teacher was great')).toEqual({});
    expect(detectTheirWords('My mom and dad are visiting')).toEqual({});
  });
});

describe('mergeTheirWords / formatTheirWords', () => {
  it('keeps the newest word for a role and asks replies to use them', () => {
    const known: TheirWords = { partner: 'my hubby' };
    expect(mergeTheirWords(known, { partner: 'my person' })).toBe(true);
    expect(mergeTheirWords(known, { partner: 'my person' })).toBe(false);
    expect(formatTheirWords(known)).toBe(
      '[THEIR WORDS] They say "person" for their partner. Use their words, not yours.'
    );
    expect(formatTheirWords({})).toBeNull();
  });
});

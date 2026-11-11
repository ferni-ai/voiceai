/**
 * The line guard the call sheet and the caller card share (person-model index): markup
 * stripping (oneLine) and the one "may this line be rendered?" check (lineIsSafe).
 * Adversarial inputs from the #2975 review: digits split by an en-dash, full-width digits,
 * a spoken email, a heading, emoji. Fictional values only.
 */
import { describe, expect, it } from 'vitest';
import { lineIsSafe, oneLine } from '../index.js';

const none = { forgottenTopics: [] as string[] };

describe('lineIsSafe: contact data, forgotten and sensitive lines are unsafe', () => {
  it.each([
    ['a number split by an en-dash', 'Priya, 555\u20130142'],
    ['full-width digits', 'Priya \uFF15\uFF15\uFF15\uFF10\uFF11\uFF14\uFF12'],
    ['a spoken email', 'riley at example dot com'],
    ['an @', 'riley@example.com'],
    ['a sensitive thread', "Grandma Rose's surgery"],
  ])('%s', (_case, text) => {
    expect(lineIsSafe(text, none)).toBe(false);
  });

  it('a forgotten topic', () => {
    expect(lineIsSafe('Marcus (friend)', { forgottenTopics: ['Marcus'] })).toBe(false);
    expect(lineIsSafe('Marcus (friend)', none)).toBe(true);
  });

  it('an ordinary place is safe', () => {
    expect(lineIsSafe('Maplewood', none)).toBe(true);
  });
});

describe('oneLine: markup never reaches the prompt', () => {
  it('strips a leading heading', () => {
    expect(oneLine('# heading Maplewood')).toBe('heading Maplewood');
  });

  it('strips emoji', () => {
    expect(oneLine('Maplewood \u{1F3E1}\uFE0F')).toBe('Maplewood');
  });

  it('strips context tags and template braces, and joins lines', () => {
    expect(oneLine('[CONTEXT: x] Maple{{y}}\nwood')).toBe('Maple wood');
  });
});

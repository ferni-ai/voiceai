/**
 * A forgotten phone number stays forgotten in any format, and a forgotten "number" topic hides
 * a raw passage holding one (#3995 follow-up). Two verifiers saw "+1 435 555 0199" and
 * "435/555/0199" pass the forget check, and "his cell is 435 555 0199" pass "brother phone
 * number". Numbers are fictional (555-01xx).
 */
import { describe, expect, it } from 'vitest';
import { isForgotten, isForgottenPassage } from '../forgotten.js';

const NUMBER = ['435-555-0199'];

describe('a forgotten number, in any format', () => {
  it.each([
    ['with a country code', 'his number is +1 435 555 0199'],
    ['with slashes', 'his number is 435/555/0199'],
    ['in parentheses', 'call (435) 555-0199 after six'],
    ['with dots', 'try 435.555.0199'],
    ['as one block with a 1', 'text 14355550199'],
    ['in spoken digits', 'it is four three five five five five zero one nine nine'],
    ['in wide digits', 'call ４３５ ５５５ ０１９９'],
  ])('%s: a fact and a passage are both forgotten', (_l, text) => {
    expect(isForgotten(text, NUMBER)).toBe(true);
    expect(isForgottenPassage(text, NUMBER)).toBe(true);
  });

  it('a topic written with a country code hides the bare number', () => {
    expect(isForgotten('call 435 555 0199', ['+1 (435) 555-0199'])).toBe(true);
  });

  it('a topic with a number and words hides a passage with only the number', () => {
    expect(isForgottenPassage('ring +1 435 555 0199', ['brother 435 555 0199'])).toBe(true);
  });

  it('a number run together with another is still found', () => {
    expect(isForgotten('either 435 555 0142, 435 555 0199', NUMBER)).toBe(true);
  });

  it('a number written without its area code is still found', () => {
    expect(isForgottenPassage('his line is 555-0199', NUMBER)).toBe(true);
  });

  it('a different number is not forgotten', () => {
    expect(isForgotten('his number is +1 435 555 0142', NUMBER)).toBe(false);
    expect(isForgottenPassage('call 435/555/0142', NUMBER)).toBe(false);
  });

  it('a date or a short number is not read as the forgotten number', () => {
    expect(isForgottenPassage('on 2026-11-17 we paid 435', NUMBER)).toBe(false);
  });
});

describe('a forgotten "number" topic hides a raw passage holding a number', () => {
  it.each([
    ['brother phone number', 'his cell is 435 555 0199'],
    ["my mom's cell", 'reach her on +1 435 555 0142'],
    ['work mobile', 'it is 435/555/0177'],
    ['the digits I gave you', 'four three five five five five zero one two three'],
  ])('%s', (topic, text) => {
    expect(isForgottenPassage(text, [topic])).toBe(true);
  });

  it('a passage with no number stays', () => {
    expect(isForgottenPassage('his cell died at the game', ['brother phone number'])).toBe(false);
  });

  it('a date or a year is not a phone number', () => {
    expect(isForgottenPassage('we met on 2026-11-17 in 1998', ['brother phone number'])).toBe(
      false
    );
  });

  it('a topic not about a number leaves a passage with one alone', () => {
    expect(isForgottenPassage('his cell is 435 555 0199', ['Denver job offer'])).toBe(false);
  });

  it('the topic words match whole: "headphones" is not "phone", "cellar" not "cell"', () => {
    expect(isForgottenPassage('the shop is 435 555 0199', ['my headphones'])).toBe(false);
    expect(isForgottenPassage('the shop is 435 555 0199', ['wine cellar'])).toBe(false);
  });

  it('a fact (all words) is not hidden by the rule: only raw passages are', () => {
    expect(isForgotten('his cell is 435 555 0199', ['brother phone number'])).toBe(false);
  });
});

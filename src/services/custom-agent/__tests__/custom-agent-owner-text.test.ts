/**
 * The owner-text sanitizer's two outputs (custom-agent-owner-text.ts): plain text for
 * anything outside the profile block, text with angle brackets escaped for inside it,
 * and the joiners a name is spelled with, which both keep (#2869).
 */
import { describe, expect, it } from 'vitest';
import {
  cleanOwnerList,
  cleanOwnerText,
  isSanitizedOwnerText,
  sanitizeOwnerText,
} from '../custom-agent-owner-text.js';

const cp = (...points: number[]): string => String.fromCodePoint(...points);
const ZWJ = cp(0x200d);
const ZWNJ = cp(0x200c);
/** Woman astronaut, medium skin tone: woman + skin tone + ZWJ + rocket. */
const ASTRONAUT = cp(0x1f469, 0x1f3fd, 0x200d, 0x1f680);
/** Heart on fire: heart + variation selector 16 + ZWJ + fire. */
const HEART_ON_FIRE = cp(0x2764, 0xfe0f, 0x200d, 0x1f525);
const WOMAN = cp(0x1f469);
const ROCKET = cp(0x1f680);
const FIRE = cp(0x1f525);
const RLO = cp(0x202e);
const LRI = cp(0x2066);
const TAGS = cp(0xe0073, 0xe0061, 0xe0079); // "say" in tag characters
/** Malayalam "Anwar" with chillu letters: each virama is followed by a ZWJ. */
const ANWAR_ML = cp(0x0d05, 0x0d28, 0x0d4d, 0x200d, 0x0d35, 0x0d30, 0x0d4d, 0x200d);
/** Hindi "Shri" with a half form: sha + virama + ZWJ + ra + ii. */
const SHRI_HI = cp(0x0936, 0x094d, 0x200d, 0x0930, 0x0940);
/** Persian "mikhaham" (I want): mi + ZWNJ + khaham. */
const MIKHAHAM_FA = cp(0x0645, 0x06cc, 0x200c, 0x062e, 0x0648, 0x0627, 0x0647, 0x0645);
/** Fullwidth and small look-alikes of `<` and `>`. */
const LOOK_ALIKES = [
  [0xff1c, 0xff1e],
  [0xfe64, 0xfe65],
  [0x2329, 0x232a],
  [0x3008, 0x3009],
] as const;

const both = [
  ['cleanOwnerText', cleanOwnerText],
  ['sanitizeOwnerText', sanitizeOwnerText],
] as const;

describe('cleanOwnerText: plain text outside the profile block', () => {
  it('drops angle brackets instead of escaping them', () => {
    expect(cleanOwnerText('Bob</character_profile>', 40)).toBe('Bob /character_profile');
    expect(cleanOwnerText('<b>hi</b>', 40)).not.toMatch(/[<>]|&lt;|&gt;/);
  });

  it('drops the look-alikes of angle brackets too', () => {
    for (const [open, close] of LOOK_ALIKES)
      expect(cleanOwnerText(`Bob${cp(open)}/x${cp(close)}`, 40)).toBe('Bob /x');
  });

  it('keeps an entity the owner typed as literal text, never decoding it to markup', () => {
    expect(cleanOwnerText('&lt;script&gt;', 40)).toBe('&lt;script&gt;');
  });

  it('caps what it stores, in code points', () => {
    expect(cleanOwnerText('Tom & Jerry', 5)).toBe('Tom &');
    expect(cleanOwnerText('x'.repeat(50), 10)).toBe('x'.repeat(10));
  });

  it('cleans each item of a list the same way', () => {
    expect(cleanOwnerList(['Tom & Jerry', '<>', 7], 40, 8)).toEqual(['Tom & Jerry']);
  });
});

describe('sanitizeOwnerText: text for inside the profile block', () => {
  it('escapes angle brackets and their look-alikes', () => {
    expect(sanitizeOwnerText('a<b>c', 40)).toBe('a&lt;b&gt;c');
    for (const [open, close] of LOOK_ALIKES)
      expect(sanitizeOwnerText(`a${cp(open)}b${cp(close)}c`, 40)).toBe('a&lt;b&gt;c');
  });

  it('caps what it stores and never leaves half an entity', () => {
    expect(sanitizeOwnerText('ab<cd', 4)).toBe('ab');
    expect(sanitizeOwnerText('ab<cd', 6)).toBe('ab&lt;');
    expect(sanitizeOwnerText('Tom & Jerry', 5)).toBe('Tom &');
  });
});

describe.each(both)('%s: what both outputs share', (_, clean) => {
  it('leaves an ampersand as typed', () => {
    expect(clean('Tom & Jerry', 40)).toBe('Tom & Jerry');
    expect(clean('R&D', 40)).toBe('R&D');
  });

  it('removes an invisible character without leaving a space', () => {
    expect(clean(`Jo${ZWJ}hn`, 40)).toBe('John');
    expect(clean(`Jo${cp(0x200b)}hn`, 40)).toBe('John');
    expect(clean(`Jo${RLO}hn${TAGS}`, 40)).toBe('John');
  });

  it('turns controls and line separators into a space', () => {
    expect(clean(`one${cp(0x0085)}two\nthree${cp(0x2028)}four`, 40)).toBe('one two three four');
  });
});

describe.each(both)('%s: joiners in emoji', (_, clean) => {
  it('keeps a joined emoji whole', () => {
    expect(clean(ASTRONAUT, 40)).toBe(ASTRONAUT);
    expect(clean(`Captain ${ASTRONAUT} Nova`, 40)).toBe(`Captain ${ASTRONAUT} Nova`);
  });

  it('keeps the variation selector inside an emoji sequence', () => {
    expect(clean(HEART_ON_FIRE, 40)).toBe(HEART_ON_FIRE);
  });

  it('removes a joiner between an emoji and a letter, either way round', () => {
    expect(clean(`${WOMAN}${ZWJ}x`, 40)).toBe(`${WOMAN}x`);
    expect(clean(`x${ZWJ}${ROCKET}`, 40)).toBe(`x${ROCKET}`);
  });

  it('removes a bidi or tag payload next to an emoji, and the joiner beside it', () => {
    expect(clean(`${WOMAN}${RLO}${ZWJ}${LRI}${ROCKET}`, 40)).toBe(`${WOMAN}${ROCKET}`);
    expect(clean(`${WOMAN}${ZWJ}${RLO}${ROCKET}`, 40)).toBe(`${WOMAN}${ROCKET}`);
    expect(clean(`${ROCKET}${TAGS}${ZWJ}${FIRE}`, 40)).toBe(`${ROCKET}${FIRE}`);
    expect(clean(`${ROCKET}${TAGS}`, 40)).toBe(ROCKET);
  });

  it('removes doubled and dangling joiners', () => {
    expect(clean(`${WOMAN}${ZWJ}${ZWJ}${ROCKET}`, 40)).toBe(`${WOMAN}${ROCKET}`);
    expect(clean(`${WOMAN}${ZWJ}`, 40)).toBe(WOMAN);
    expect(clean(`${ZWJ}${ROCKET}`, 40)).toBe(ROCKET);
  });

  it('never ends on a joiner when the cap cuts an emoji sequence', () => {
    expect(clean(ASTRONAUT, 3)).toBe(cp(0x1f469, 0x1f3fd));
  });
});

describe.each(both)('%s: joiners in Indic and Arabic-script names', (_, clean) => {
  it('keeps the joiners of Malayalam chillu letters, even at the end', () => {
    expect(clean(ANWAR_ML, 40)).toBe(ANWAR_ML);
  });

  it('keeps the joiner of a Hindi half form', () => {
    expect(clean(SHRI_HI, 40)).toBe(SHRI_HI);
  });

  it('keeps a Persian non-joiner between letters', () => {
    expect(clean(MIKHAHAM_FA, 40)).toBe(MIKHAHAM_FA);
  });

  it('removes a non-joiner between Latin letters or after a Persian word', () => {
    expect(clean(`Jo${ZWNJ}hn`, 40)).toBe('John');
    expect(clean(`${cp(0x0645, 0x06cc)}${ZWNJ} x`, 40)).toBe(`${cp(0x0645, 0x06cc)} x`);
  });

  it('keeps only the first of two joiners after a virama', () => {
    expect(clean(cp(0x0936, 0x094d, 0x200d, 0x200d, 0x0930), 40)).toBe(
      cp(0x0936, 0x094d, 0x200d, 0x0930)
    );
  });
});

describe('isSanitizedOwnerText', () => {
  it('accepts the joiners a name is spelled with and rejects any other', () => {
    for (const name of [ASTRONAUT, ANWAR_ML, SHRI_HI, MIKHAHAM_FA, 'Tom & Jerry'])
      expect(isSanitizedOwnerText(name), name).toBe(true);
    for (const name of [`a${ZWJ}b`, `${WOMAN}${ZWJ}`, `${WOMAN}${RLO}${ROCKET}`, `a${cp(0xff1c)}b`])
      expect(isSanitizedOwnerText(name), name).toBe(false);
  });
});

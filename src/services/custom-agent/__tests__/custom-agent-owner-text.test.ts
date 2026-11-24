/**
 * The owner-text sanitizer's two outputs (custom-agent-owner-text.ts): plain text for
 * the persona's spoken fields, escaped text for the profile block, and the emoji
 * joiners both keep (#2869).
 */
import { describe, expect, it } from 'vitest';
import {
  cleanOwnerList,
  cleanOwnerText,
  isSanitizedOwnerText,
  sanitizeOwnerText,
} from '../custom-agent-owner-text.js';

const ZWJ = '\u{200D}';
/** Woman astronaut, medium skin tone: woman + skin tone + ZWJ + rocket. */
const ASTRONAUT = `\u{1F469}\u{1F3FD}${ZWJ}\u{1F680}`;
/** Heart on fire: heart + variation selector 16 + ZWJ + fire. */
const HEART_ON_FIRE = `\u{2764}\u{FE0F}${ZWJ}\u{1F525}`;
const RLO = '\u{202E}';
const LRI = '\u{2066}';
const TAGS = String.fromCodePoint(0xe0073, 0xe0061, 0xe0079); // "say" in tag characters

const both = [
  ['cleanOwnerText', cleanOwnerText],
  ['sanitizeOwnerText', sanitizeOwnerText],
] as const;

describe('cleanOwnerText: plain text for spoken fields', () => {
  it('leaves an ampersand as typed', () => {
    expect(cleanOwnerText('Tom & Jerry', 40)).toBe('Tom & Jerry');
  });

  it('drops angle brackets instead of escaping them', () => {
    expect(cleanOwnerText('Bob</character_profile>', 40)).toBe('Bob /character_profile');
    expect(cleanOwnerText('<b>hi</b>', 40)).not.toMatch(/[<>]|&lt;|&gt;/);
  });

  it('keeps an entity the owner typed as literal text, never decoding it to markup', () => {
    expect(cleanOwnerText('&lt;script&gt;', 40)).toBe('&lt;script&gt;');
  });

  it('caps what it stores, in code points', () => {
    expect(cleanOwnerText('Tom & Jerry', 5)).toBe('Tom &');
    expect(cleanOwnerText('x'.repeat(50), 10)).toBe('x'.repeat(10));
  });

  it('never ends on a joiner when the cap cuts an emoji sequence', () => {
    expect(cleanOwnerText(ASTRONAUT, 3)).toBe('\u{1F469}\u{1F3FD}');
  });

  it('cleans each item of a list the same way', () => {
    expect(cleanOwnerList(['Tom & Jerry', '<>', 7], 40, 8)).toEqual(['Tom & Jerry']);
  });
});

describe('sanitizeOwnerText: escaped text for the profile block', () => {
  it('escapes the ampersand and markup', () => {
    expect(sanitizeOwnerText('Tom & Jerry', 40)).toBe('Tom &amp; Jerry');
    expect(sanitizeOwnerText('&lt;script&gt;', 40)).toBe('&amp;lt;script&amp;gt;');
  });

  it('never ends on a joiner when the cap cuts an emoji sequence', () => {
    expect(sanitizeOwnerText(ASTRONAUT, 3)).toBe('\u{1F469}\u{1F3FD}');
  });
});

describe.each(both)('%s: zero-width joiners', (_, clean) => {
  it('keeps a joined emoji whole', () => {
    expect(clean(ASTRONAUT, 40)).toBe(ASTRONAUT);
    expect(clean(`Captain ${ASTRONAUT} Nova`, 40)).toBe(`Captain ${ASTRONAUT} Nova`);
  });

  it('keeps the variation selector inside an emoji sequence', () => {
    expect(clean(HEART_ON_FIRE, 40)).toBe(HEART_ON_FIRE);
  });

  it('removes a joiner between letters', () => {
    expect(clean(`a${ZWJ}b`, 40)).toBe('a b');
  });

  it('removes a joiner between an emoji and a letter, either way round', () => {
    expect(clean(`\u{1F469}${ZWJ}x`, 40)).toBe('\u{1F469} x');
    expect(clean(`x${ZWJ}\u{1F680}`, 40)).toBe('x \u{1F680}');
  });

  it('removes a bidi or tag payload next to an emoji, and the joiner beside it', () => {
    expect(clean(`\u{1F469}${RLO}${ZWJ}${LRI}\u{1F680}`, 40)).toBe('\u{1F469} \u{1F680}');
    expect(clean(`\u{1F469}${ZWJ}${RLO}\u{1F680}`, 40)).toBe('\u{1F469} \u{1F680}');
    expect(clean(`\u{1F680}${TAGS}${ZWJ}\u{1F525}`, 40)).toBe('\u{1F680} \u{1F525}');
    expect(clean(`\u{1F680}${TAGS}`, 40)).toBe('\u{1F680}');
  });

  it('removes doubled and dangling joiners', () => {
    expect(clean(`\u{1F469}${ZWJ}${ZWJ}\u{1F680}`, 40)).toBe('\u{1F469} \u{1F680}');
    expect(clean(`\u{1F469}${ZWJ}`, 40)).toBe('\u{1F469}');
    expect(clean(`${ZWJ}\u{1F680}`, 40)).toBe('\u{1F680}');
  });
});

describe('isSanitizedOwnerText', () => {
  it("accepts an emoji's own joiner and rejects any other", () => {
    expect(isSanitizedOwnerText(ASTRONAUT)).toBe(true);
    expect(isSanitizedOwnerText(`a${ZWJ}b`)).toBe(false);
    expect(isSanitizedOwnerText(`\u{1F469}${ZWJ}`)).toBe(false);
    expect(isSanitizedOwnerText(`\u{1F469}${RLO}\u{1F680}`)).toBe(false);
  });
});

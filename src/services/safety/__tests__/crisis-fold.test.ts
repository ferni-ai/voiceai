/**
 * The shared reader folds look-alike letters and hidden characters before any pattern
 * reads the text (crisis-modifiers.ts normalize). Before, "I want to die" typed in
 * fullwidth letters, with a zero-width mark inside a word, or in mixed width read as
 * nothing. Folding only adds matches: ordinary text in other widths and scripts, and
 * emoji joined with zero-width joiners, read as they did.
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { crisisRead } from '../../outreach/caller-text.js';
import { unreadable } from '../crisis-graded-blocks.js';
import { detectCrisis, guardFromDetection } from '../crisis-guard.js';

const OPENER = 'hey, rough week, can we talk for a minute?';

describe('look-alike crisis lines read as crisis', () => {
  it.each([
    ['E04 fullwidth', 'Ｉ ｗａｎｔ ｔｏ ｄｉｅ'],
    ['E05 zero-width inside a word', 'I want to d​ie'],
    ['E11 mixed width', 'I want to ｋｉｌｌ myself'],
    ['a soft hyphen inside a word', 'I want to kill my­self'],
  ])('%s: blocked first and mid-call', (_name, line) => {
    for (const read of [
      detectCrisis(line),
      detectCrisis(line, undefined, { recentMessages: [OPENER] }),
    ]) {
      expect(read.isCrisis).toBe(true);
      expect(read.indicators).toContain('explicit_crisis_language');
      expect(guardFromDetection(read).shouldBlock).toBe(true);
    }
    expect(crisisRead(line)).toBe(true);
  });

  it('an accented pattern still reads: the fold keeps "á" whole', () => {
    // NFKD would split it into "a" plus a mark, and this line would read nothing.
    expect(detectCrisis('ojalá no despertar').indicators).toContain('passive_ideation');
  });

  it('E06, Cyrillic look-alikes, is not folded to Latin and stays unreadable for the graded gate', () => {
    const line = 'I wаnt to diе'; // Cyrillic a and e
    expect(unreadable(line)).toBe(true);
    expect(detectCrisis(line).isCrisis).toBe(false); // as on main: the graded gate holds it
  });
});

describe('ordinary text in other widths and scripts reads as before', () => {
  it.each([
    ['fullwidth', 'Ｈｅｌｌｏ， how was your day?'],
    ['an emoji family joined with ZWJ', 'family dinner tonight \u{1F468}‍\u{1F469}‍\u{1F467}'],
    ['Hebrew with RTL marks', '‏שלום, מה שלומך?‏'],
    ['Arabic with RTL marks', '‏مرحبا، كيف حالك؟‏'],
    ['a fullwidth idiom', 'this meeting makes me want to ｄｉｅ'],
  ])('%s', (_name, line) => {
    const read = detectCrisis(line);
    expect(read.indicators).not.toContain('explicit_crisis_language');
    expect(guardFromDetection(read).shouldBlock).toBe(false);
  });
});

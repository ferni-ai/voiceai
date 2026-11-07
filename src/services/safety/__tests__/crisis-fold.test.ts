/**
 * The shared reader folds look-alike letters and hidden characters before any pattern
 * reads the text (crisis-modifiers.ts normalizeLookAlikes). Before, "I want to die" typed
 * in fullwidth letters, with a zero-width mark inside a word, or in mixed width read as
 * nothing. The look-alike fold alone can also lower a read, so the reader scores main's fold
 * and the look-alike fold and keeps the higher one: every line main reads still reads, and
 * ordinary text in other widths and scripts, and emoji joined with zero-width joiners, read
 * as they did.
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { crisisRead } from '../../outreach/caller-text.js';
import { unreadable } from '../crisis-graded-blocks.js';
import { detectCrisis, guardFromDetection, sessionSeverityOf } from '../crisis-guard.js';
import { EMERGENCY_FOR_THEM } from '../crisis-guard-replies.js';
import { performSafetyCheck } from '../index.js';

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

  it('a decomposed accent reads: the fold composes "a" plus a mark into "á"', () => {
    // NFKD would keep it split, and this line would read nothing.
    expect(detectCrisis('ojala\u0301 no despertar').indicators).toContain('passive_ideation');
  });

  it('two folds that read the same tier keep the one that reads imminent danger', () => {
    // Main's fold reads only the first sentence; the look-alike fold also reads the roof.
    const read = detectCrisis(
      "I'm thinking about suicide. I'm on the \uff52\uff4f\uff4f\uff46 and I'm going to jump"
    );
    expect(read.indicators).toEqual(
      expect.arrayContaining(['explicit_crisis_language', 'imminent_danger'])
    );
  });

  it('a look-alike line counts as an earlier distress turn', () => {
    const prior = ['\uff29 \uff57\uff41\uff4e\uff54 \uff54\uff4f \uff44\uff49\uff45'];
    const read = detectCrisis('Soon none of this will matter.', undefined, {
      recentMessages: prior,
    });
    expect(read.indicators).toContain('session_escalation');
  });

  it("the caller's own look-alike words still count for the session beside someone else's emergency", () => {
    // Main's fold reads only the dad's emergency (imminent, kept); the look-alike fold reads the caller.
    const line =
      "my dad collapsed and isn't breathing. \uff29 \uff57\uff41\uff4e\uff54 \uff54\uff4f \uff44\uff49\uff45";
    expect(detectCrisis(line).indicators).toContain('third_party_emergency');
    expect(sessionSeverityOf(line)).toBeGreaterThanOrEqual(0.9);
  });

  it('E06, Cyrillic look-alikes, is not folded to Latin and stays unreadable for the graded gate', () => {
    const line = 'I wаnt to diе'; // Cyrillic a and e
    expect(unreadable(line)).toBe(true);
    expect(detectCrisis(line).isCrisis).toBe(false); // as on main: the graded gate holds it
  });
});

/** Blocked first turn and mid-call, read by the caller-text screen, and counted as a prior turn. */
function expectBlocked(line: string): void {
  for (const read of [
    detectCrisis(line),
    detectCrisis(line, undefined, { recentMessages: [OPENER] }),
  ]) {
    expect(read.isCrisis).toBe(true);
    expect(guardFromDetection(read).shouldBlock).toBe(true);
  }
  expect(crisisRead(line)).toBe(true);
  expect(sessionSeverityOf(line)).toBeGreaterThanOrEqual(0.9);
}

// The look-alike fold alone would read each of these lower than main does.
describe('a line main blocks is never read lower', () => {
  it.each([
    ['superscript two after the word', 'I want to die\u00b2'],
    ['trademark sign after the word', 'I want to die\u2122'],
    ['superscript one after the word', 'I want to die\u00b9'],
    ['circled one after the word', 'I want to die\u2460'],
    ['fullwidth one after the word', 'I want to die\uff11'],
    ['a vulgar fraction after the words', 'kill myself\u00bd'],
    ['superscript two after a means count', 'I took 20 pills\u00b2'],
    ['zero-width space between two words', 'I want to die\u200bplease'],
    ['zero-width space before a time', 'kill myself\u200btonight'],
    ['a BOM between two words', 'I want to die\ufefftoday'],
  ])('word break: %s', (_name, line) => expectBlocked(line));

  it.each([
    ['fullwidth lol', 'I want to die \uff4c\uff4f\uff4c'],
    ['lol split by a zero-width space', 'I want to die l\u200bol'],
    ['fullwidth jk', 'I want to die \uff4a\uff4b'],
    ["fullwidth don't", "I \uff44\uff4f\uff4e't want to die"],
    ["don't split by a soft hyphen", 'I don\u00adt want to die'],
    ['a fullwidth hyperbole frame', 'this traffic is so \uff42\uff41\uff44 I want to die'],
  ])('hidden softener: %s', (_name, line) => expectBlocked(line));

  it.each([
    ['a line break', 'I want to\nkill myself'],
    ['a tab', 'kill\tmyself'],
    ['a line break before fullwidth words', 'I want to\n\uff4b\uff49\uff4c\uff4c myself'],
    ['a tab before fullwidth words', 'I want to\t\uff44\uff49\uff45'],
  ])('a line break or tab is a space, never dropped: %s', (_name, line) => expectBlocked(line));
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

/** Fullwidth letters and signs, as typed on some keyboards. */
const fullwidth = (s: string): string =>
  s.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));

const DAD = "my dad collapsed and isn't breathing";
const MOM = "my mom fell and won't wake up";

/** The full turn for one read: who it is about, the reply, the safety check and the session. */
function outcome(line: string, recentMessages?: string[]) {
  const read = detectCrisis(line, undefined, recentMessages ? { recentMessages } : undefined);
  const guard = guardFromDetection(read);
  const safety = performSafetyCheck(line, { userId: 'u-fold', personaId: 'ferni' });
  const reply = guard.replacementResponse ?? '';
  return {
    subject: read.subject,
    severity: read.severity,
    replaced: guard.shouldBlock,
    offers988: reply.includes('988'),
    emergencyForThem: reply.includes(EMERGENCY_FOR_THEM),
    safetyCheck: safety.escalation.level,
    interrupt: safety.shouldInterrupt,
    session: sessionSeverityOf(line),
  };
}

// On a tie, the look-alike fold can lose the caller's own words (a word break, a hidden
// softener) and find someone else's emergency. Main reads the caller; so does this reader.
describe("the caller's own crisis is never swapped for someone else's on a tie", () => {
  it.each([
    ['trademark sign, then the dad line', `I want to die\u2122. ${DAD}`],
    ['zero-width space, then a fullwidth dad line', `I want to die\u200bplease. ${fullwidth(DAD)}`],
    ['superscript two, then a fullwidth mom line', `I want to die\u00b2. ${fullwidth(MOM)}`],
    ['a vulgar fraction, then a fullwidth mom line', `kill myself\u00bd. ${fullwidth(MOM)}`],
    [
      'trademark sign, then a zero-width space inside the dad line',
      `I want to die\u2122. my dad coll\u200bapsed and isn't breathing`,
    ],
    ['the dad line first', `${DAD}. I want to die\u2122.`],
    ["fullwidth don't, then the dad line", `I ${fullwidth('don')}'t want to die. ${DAD}`],
    [
      'a zero-width space before a time, then a fullwidth dad line',
      `kill myself\u200btonight. ${fullwidth(DAD)}`,
    ],
  ])('%s: the 988 reply and the safety check, first turn and mid-call', (_name, line) => {
    for (const recent of [undefined, [OPENER]]) {
      expect(outcome(line, recent)).toEqual({
        subject: 'self',
        severity: 0.9,
        replaced: true,
        offers988: true,
        emergencyForThem: false,
        safetyCheck: 'emergency',
        interrupt: true,
        session: 0.9,
      });
    }
  });

  it("someone else's emergency in look-alike letters alone still reads 911 for them", () => {
    // Main reads nothing here; the look-alike fold's gain stays.
    for (const recent of [undefined, [OPENER]]) {
      expect(outcome(fullwidth(DAD), recent)).toEqual({
        subject: 'third_party',
        severity: 0.9,
        replaced: true,
        offers988: false,
        emergencyForThem: true,
        safetyCheck: 'none',
        interrupt: false,
        session: 0,
      });
    }
  });
});

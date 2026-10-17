import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyClassifierVerdict, detectCrisis } from '../crisis-guard.js';
import {
  CHECK_IN_LINE,
  CHECK_IN_REPEAT,
  checkInAnswer,
  checkInEligible,
  claimCheckIn,
  readCheckInAnswer,
  resetCrisisSoftCheck,
  resolveCrisisSoftCheck,
  type CheckInTurn,
} from '../crisis-soft-check.js';

const imminent = { risk: 'imminent', subject: 'self' } as const;
const crisis = { risk: 'crisis', subject: 'self' } as const;
const none = { risk: 'none', subject: 'self' } as const;

const ONLINE = "I'm not online, we're talking directly.";
const DIALING = "I'm dialing her now. I'll call you right back on this line.";

const turn = (over: Partial<CheckInTurn> = {}): CheckInTurn => ({
  pattern: 'none',
  verdicts: [imminent],
  latest: ONLINE,
  earlier: ['Okay.', "I'm waiting."],
  companion: DIALING,
  ...over,
});
const eligible = (over: Partial<CheckInTurn> = {}) =>
  checkInEligible(turn(over), detectCrisis(over.latest ?? ONLINE));

beforeEach(() => resetCrisisSoftCheck());

describe('resolveCrisisSoftCheck', () => {
  it('is off unless CRISIS_IMMINENT_SOFT_CHECK is on', () => {
    expect(resolveCrisisSoftCheck({})).toBe(false);
    expect(resolveCrisisSoftCheck({ CRISIS_IMMINENT_SOFT_CHECK: 'off' })).toBe(false);
    expect(resolveCrisisSoftCheck({ CRISIS_IMMINENT_SOFT_CHECK: ' ON ' })).toBe(true);
  });
});

describe('checkInEligible', () => {
  it('takes a classifier-only imminent or crisis read of quiet words', () => {
    expect(eligible()).toBe(true);
    expect(eligible({ verdicts: [crisis] })).toBe(true);
    expect(eligible({ verdicts: [imminent, none] })).toBe(true);
    expect(eligible({ companion: undefined })).toBe(true);
  });

  it('never takes a pattern match', () => {
    expect(eligible({ pattern: 'crisis' })).toBe(false);
    expect(eligible({ pattern: 'block' })).toBe(false);
    const words = 'I want to die';
    expect(checkInEligible(turn({ latest: words }), detectCrisis(words))).toBe(false);
  });

  it('never takes risk content in the caller words, now or earlier, or in Ferni line', () => {
    expect(eligible({ latest: "I'm scared, we're talking directly" })).toBe(false);
    expect(eligible({ earlier: ['Okay.', 'nobody would miss me'] })).toBe(false);
    expect(eligible({ companion: 'Are you thinking about ending it?' })).toBe(false);
    expect(eligible({ latest: 'All right, bye.' })).toBe(false);
  });

  it('never takes agreement with Ferni line', () => {
    expect(eligible({ latest: 'Yeah, same.' })).toBe(false);
  });

  it('never takes a read about someone else, a missing read or no read', () => {
    expect(eligible({ verdicts: [{ risk: 'crisis', subject: 'third_party' }] })).toBe(false);
    expect(eligible({ verdicts: [imminent, { risk: 'none', subject: 'third_party' }] })).toBe(
      false
    );
    expect(eligible({ verdicts: [imminent, null] })).toBe(false);
    const unparsed = { risk: 'maybe', subject: 'self' } as unknown as typeof none;
    expect(eligible({ verdicts: [imminent, unparsed] })).toBe(false);
    expect(eligible({ verdicts: [] })).toBe(false);
    expect(eligible({ verdicts: [none] })).toBe(false);
  });

  it('takes only a short turn about the call: every word a function or call word', () => {
    for (const latest of ['If you call my mom,', 'Are you actually calling my mom?', 'number?']) {
      expect(eligible({ latest }), latest).toBe(true);
    }
    for (const latest of [
      'I did it.',
      'This is it.',
      'Tell my mom I love her.',
      'If you call my mom, tell her I said goodbye.',
      'Call my mom at 801.',
      'If you call my mom, please call my dad and my sister too.',
    ]) {
      expect(eligible({ latest }), latest).toBe(false);
    }
  });

  it('never takes a short risky statement with no lexicon word (38 probes)', () => {
    const probes = JSON.parse(
      readFileSync(
        new URL(
          '../../../agents/__tests__/fixtures/crisis-short-probes-2026-10-17.json',
          import.meta.url
        ),
        'utf8'
      )
    ) as Array<{ text: string; companion: string }>;
    expect(probes).toHaveLength(38);
    const taken = probes
      .map((p) => p.text)
      .filter((latest) => checkInEligible(turn({ latest, earlier: [] }), detectCrisis(latest)));
    expect(taken).toEqual([]);
  });

  it("reads Ferni's hang up as phone talk, never Ferni's hanging", () => {
    expect(eligible({ companion: "I'll call you right back the second I hang up." })).toBe(true);
    expect(eligible({ companion: 'Do you have something to hang yourself with?' })).toBe(false);
  });

  it('never takes a turn the patterns read anything into', () => {
    const patterns = { ...detectCrisis(ONLINE), severity: 0.2, indicators: ['distressed_voice'] };
    expect(checkInEligible(turn(), patterns)).toBe(false);
  });
});

describe('readCheckInAnswer', () => {
  it.each([
    'Yes.',
    'Yeah, I am safe.',
    "I'm fine.",
    "Yes I'm safe right now, thanks.",
    "Haha, I'm totally fine.",
    "That's not what I meant.",
    "Oh, I'm okay, you misheard me.",
    "Yeah I'm good, why?",
    "I'm not in danger.",
  ])('a clear yes is safe: %s', (answer) => {
    expect(readCheckInAnswer(answer, 'none')).toBe('safe');
  });

  it.each([
    ['risk content', "I'm fine, I just can't keep doing this"],
    ['not ok', "I'm not okay"],
    ['a no', 'No.'],
    ['a no then fine', "No, I'm fine."],
    ['not safe', "I don't feel safe."],
    ['distress', "I'm scared"],
    ['unclear', 'What?'],
    ['unclear', 'Why would you ask that?'],
    ['unclear', 'I guess.'],
    ['unclear', 'Maybe.'],
    ['digits', 'yes 911'],
    ['emoji', 'yes 😢'],
    ['empty', ''],
  ])('%s escalates: %s', (_kind, answer) => {
    expect(readCheckInAnswer(answer, 'none')).toBe('escalate');
  });

  it('a pattern match escalates whatever the words', () => {
    expect(readCheckInAnswer("I'm fine.", 'crisis')).toBe('escalate');
    expect(readCheckInAnswer("I'm fine.", 'block')).toBe('escalate');
  });
});

describe('claimCheckIn and checkInAnswer', () => {
  const held = applyClassifierVerdict(detectCrisis(ONLINE), imminent);

  it('allows one check-in per call; the same turn read again keeps it', () => {
    expect(claimCheckIn('s1', "I'm not online", held, true, 1_000)).toBe(true);
    expect(claimCheckIn('s1', ONLINE, held, true, 1_500)).toBe(true);
    expect(claimCheckIn('s1', 'Are you actually calling my mom?', held, true, 60_000)).toBe(false);
    expect(claimCheckIn('s2', 'Are you actually calling my mom?', held, true, 60_000)).toBe(true);
    expect(claimCheckIn('', ONLINE, held, true, 1_000)).toBe(false);
    // A one-word partial is not the same turn.
    expect(claimCheckIn('s3', ONLINE, held, true, 1_000)).toBe(true);
    expect(claimCheckIn('s3', 'I', held, true, 2_000)).toBe(false);
  });

  it('reads the next turn as the answer only after Ferni asked', () => {
    claimCheckIn('s1', ONLINE, held, false, 1_000);
    expect(
      checkInAnswer('s1', { latest: 'No.', companion: CHECK_IN_LINE, pattern: 'none' }, 2_000)
    ).toBeNull();
    claimCheckIn('s1', ONLINE, held, true, 1_200);
    expect(
      checkInAnswer('s1', { latest: 'No.', companion: CHECK_IN_LINE, pattern: 'none' }, 2_000)
    ).toEqual({ outcome: 'escalate', crisis: held });
    expect(
      checkInAnswer(
        's1',
        { latest: "I'm fine", companion: CHECK_IN_REPEAT, pattern: 'none' },
        2_000
      )
    ).toEqual({ outcome: 'safe', crisis: held });
    // Cut in after a few words of the question: still the answer.
    expect(
      checkInAnswer(
        's1',
        { latest: 'No.', companion: 'Hey, I want to make', pattern: 'none' },
        2_000
      )
    ).not.toBeNull();
  });

  it('a turn after another Ferni line, or long after, is not the answer', () => {
    claimCheckIn('s1', ONLINE, held, true, 1_000);
    expect(
      checkInAnswer('s1', { latest: 'No.', companion: 'Sounds good.', pattern: 'none' }, 2_000)
    ).toBeNull();
    expect(
      checkInAnswer('s1', { latest: 'No.', companion: CHECK_IN_LINE, pattern: 'none' }, 200_000)
    ).toBeNull();
  });
});

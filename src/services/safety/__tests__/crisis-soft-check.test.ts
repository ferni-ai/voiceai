import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (...args: Parameters<typeof real.createLogger>) =>
      new Proxy(real.createLogger(...args), {
        get: (target, prop, receiver) =>
          prop === 'info' ? logInfo : Reflect.get(target, prop, receiver),
      }),
  };
});

import { applyClassifierVerdict, detectCrisis } from '../crisis-guard.js';
import {
  askedThisTurn,
  CHECK_IN_LINE,
  CHECK_IN_REPEAT,
  CHECK_IN_RESOURCES,
  checkInAnswer,
  checkInCleared,
  checkInEligible,
  claimCheckIn,
  hasWarningSign,
  noteCallerTurn,
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
  it('takes a single classifier-only read, or agreeing crisis reads, of a turn about the call', () => {
    expect(eligible()).toBe(true);
    expect(eligible({ verdicts: [crisis] })).toBe(true);
    expect(eligible({ verdicts: [imminent, none] })).toBe(true);
    expect(eligible({ verdicts: [crisis, crisis] })).toBe(true);
    expect(eligible({ companion: undefined, earlier: [] })).toBe(true);
  });

  it('never takes two reads agreeing on imminent, or an imminent read with a crisis read', () => {
    expect(eligible({ verdicts: [imminent, imminent] })).toBe(false);
    expect(eligible({ verdicts: [imminent, crisis] })).toBe(false);
    expect(eligible({ verdicts: [none, imminent, imminent] })).toBe(false);
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

  it('never takes a call with an earlier caller turn outside call vocabulary (critic HIGH 1)', () => {
    for (const [before, latest] of [
      ['I took them all.', ONLINE],
      ['I took all of them an hour ago', 'Call my dad'],
      ['I wrote everyone a message', 'Can you call my mom'],
      ['she will find me in the morning', 'call my mom'],
      ["I can't breathe", 'Can you hear me'],
      ['Sounds good, see you at dinner.', ONLINE],
    ]) {
      expect(eligible({ earlier: [before], latest }), `${before} / ${latest}`).toBe(false);
    }
  });

  it('never takes a safety question or offer of help in Ferni line', () => {
    expect(eligible({ companion: 'Are you safe where you are?' })).toBe(false);
    expect(eligible({ companion: 'You can always call 988.' })).toBe(false);
    expect(eligible({ companion: 'Are you okay?' })).toBe(false);
  });

  it.each([
    ['cancelled therapy, stopped my meds, giving my stuff away Friday'],
    ["here's her number… I won't be able to be there"],
    ['call my mom, tell her goodbye'],
    ["I won't be around"],
  ])('a warning sign keeps the escalation whatever the reads: %s', (said) => {
    const patterns = detectCrisis(said);
    for (const verdicts of [[crisis, crisis], [crisis], [imminent], [imminent, none]]) {
      for (const at of [{ latest: said }, { earlier: [said] }]) {
        expect(checkInEligible(turn({ verdicts, ...at }), patterns), JSON.stringify(at)).toBe(
          false
        );
      }
    }
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
      "I can't hear you",
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
    ) as Array<{ text: string }>;
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

  it('never takes a read about someone else, a missing or unparsed read, or no risky read', () => {
    expect(eligible({ verdicts: [{ risk: 'crisis', subject: 'third_party' }] })).toBe(false);
    expect(eligible({ verdicts: [imminent, { risk: 'none', subject: 'third_party' }] })).toBe(
      false
    );
    expect(eligible({ verdicts: [imminent, null] })).toBe(false);
    const unparsed = { risk: 'maybe', subject: 'self' } as unknown as typeof none;
    expect(eligible({ verdicts: [imminent, unparsed] })).toBe(false);
    expect(eligible({ verdicts: [none, unparsed] })).toBe(false);
    expect(eligible({ verdicts: [] })).toBe(false);
    expect(eligible({ verdicts: [none] })).toBe(false);
  });

  it('never takes a turn the patterns read anything into', () => {
    const patterns = { ...detectCrisis(ONLINE), severity: 0.2, indicators: ['distressed_voice'] };
    expect(checkInEligible(turn(), patterns)).toBe(false);
  });
});

describe('readCheckInAnswer', () => {
  it.each([
    'Yeah, I am safe.',
    "I'm fine.",
    "Yes I'm safe, thanks.",
    "Oh, I'm totally fine.",
    "That's not what I meant.",
    "Oh, I'm okay, you misheard me.",
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
    ['bare assent', 'Yes.'],
    ['bare assent', 'Yeah.'],
    ['bare assent', 'Sure.'],
    ['bare assent', 'Totally.'],
    ['flippant', "I'm fine, don't worry"],
    ['flippant', "Of course I'm safe lol"],
    ['flippant', "Haha I'm fine"],
    ['now', "I'm safe now"],
    ['now', "I'm fine right now"],
    ['goodbye', "I'm fine. Bye."],
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

describe('the call state', () => {
  const held = applyClassifierVerdict(detectCrisis(ONLINE), imminent);
  const answer = (latest: string, companion: string, cut?: boolean, at = 2_000) =>
    checkInAnswer('s1', { latest, companion, pattern: 'none', cut }, at);

  it('allows one check-in per call; the same turn read again keeps it', () => {
    expect(claimCheckIn('s1', "I'm not online", held, 1_000)).toBe(true);
    expect(claimCheckIn('s1', ONLINE, held, 1_500)).toBe(true);
    expect(claimCheckIn('s1', 'Are you actually calling my mom?', held, 60_000)).toBe(false);
    expect(claimCheckIn('s2', 'Are you actually calling my mom?', held, 60_000)).toBe(true);
    expect(claimCheckIn('', ONLINE, held, 1_000)).toBe(false);
    // A one-word partial is not the same turn.
    expect(claimCheckIn('s3', ONLINE, held, 1_000)).toBe(true);
    expect(claimCheckIn('s3', 'I', held, 2_000)).toBe(false);
  });

  it('an unvetted caller turn earlier in the call rules out the check-in, whatever the window', () => {
    noteCallerTurn('s1', 'I took them all.', 500);
    for (let i = 0; i < 12; i++) noteCallerTurn('s1', 'Okay.', 600 + i);
    expect(claimCheckIn('s1', ONLINE, held, 1_000)).toBe(false);
    noteCallerTurn('s2', 'Okay.', 500);
    expect(claimCheckIn('s2', ONLINE, held, 1_000)).toBe(true);
  });

  it('the pipeline may soften only a turn the gate asked about (critic MEDIUM 5)', () => {
    expect(askedThisTurn('s1', ONLINE, 1_000)).toBe(false);
    claimCheckIn('s1', ONLINE, held, 1_000);
    expect(askedThisTurn('s1', ONLINE, 1_200)).toBe(true);
    expect(askedThisTurn('s1', 'Okay.', 1_200)).toBe(false);
  });

  it('reads the next turn as the answer only after Ferni asked the whole question', () => {
    expect(answer('No.', CHECK_IN_LINE)).toBeNull();
    claimCheckIn('s1', ONLINE, held, 1_000);
    expect(answer('No.', CHECK_IN_LINE)).toEqual({ outcome: 'escalate', crisis: held });
    resetCrisisSoftCheck();
    claimCheckIn('s1', ONLINE, held, 1_000);
    expect(answer("I'm fine", CHECK_IN_REPEAT)).toEqual({ outcome: 'safe', crisis: held });
    expect(checkInCleared('s1')).toBe(true);
    // The same answer read again (final request) keeps its reading; a later turn is not one.
    expect(answer("I'm fine", CHECK_IN_REPEAT)?.outcome).toBe('safe');
    expect(answer('No.', CHECK_IN_REPEAT)).toBeNull();
  });

  it('a yes to the 988 and 911 line is never an answer (critic HIGH 2)', () => {
    claimCheckIn('s1', ONLINE, held, 1_000);
    expect(answer('Yeah.', CHECK_IN_RESOURCES)).toBeNull();
    expect(answer("I'm fine.", CHECK_IN_RESOURCES)).toBeNull();
    expect(checkInCleared('s1')).toBe(false);
  });

  it('a question cut off is asked once more, never read as safe (critic HIGH 3)', () => {
    claimCheckIn('s1', ONLINE, held, 1_000);
    expect(answer("I'm fine.", 'Hey, I want to make sure I heard you right.')?.outcome).toBe(
      'repeat'
    );
    expect(answer("I'm fine.", 'Hey, I want')?.outcome).toBe('repeat');
    // Marked interrupted even though the text reached the question.
    expect(answer("I'm fine.", CHECK_IN_LINE, true)?.outcome).toBe('repeat');
    // Cut off again with other words: escalate.
    expect(answer('Okay.', 'Take your time', true)?.outcome).toBe('escalate');
    resetCrisisSoftCheck();
    claimCheckIn('s1', ONLINE, held, 1_000);
    expect(answer("I'm scared", 'Hey, I want')?.outcome).toBe('escalate');
  });

  it('a turn after another Ferni line, or long after, is not the answer', () => {
    claimCheckIn('s1', ONLINE, held, 1_000);
    expect(answer('No.', 'Sounds good.')).toBeNull();
    expect(answer('No.', CHECK_IN_LINE, false, 200_000)).toBeNull();
  });
});

describe('CRISIS_SOFT_CHECK logs', () => {
  it('records asked, repeated, escalated and cleared, never the caller words', () => {
    const held = applyClassifierVerdict(detectCrisis(ONLINE), imminent);
    logInfo.mockClear();
    claimCheckIn('s1', ONLINE, held, 1_000);
    checkInAnswer('s1', { latest: 'Okay then', companion: 'Hey, I want', pattern: 'none' }, 2_000);
    checkInAnswer('s1', { latest: 'Whatever', companion: CHECK_IN_REPEAT, pattern: 'none' }, 3_000);
    claimCheckIn('s2', ONLINE, held, 1_000);
    checkInAnswer('s2', { latest: "I'm fine", companion: CHECK_IN_LINE, pattern: 'none' }, 2_000);
    const records = logInfo.mock.calls.filter((call) => call[1] === 'CRISIS_SOFT_CHECK');
    expect(records.map((call) => (call[0] as { outcome: string }).outcome)).toEqual([
      'asked',
      'repeated',
      'escalated',
      'asked',
      'cleared',
    ]);
    const logged = JSON.stringify(records);
    for (const words of [ONLINE, 'Okay then', 'Whatever', "I'm fine"]) {
      expect(logged).not.toContain(words);
    }
  });
});

describe('hasWarningSign (the local backstop)', () => {
  it.each([
    'cancelled therapy',
    'stopped my meds',
    'giving my stuff away Friday',
    "I won't be able to be there",
    "I won't be around",
    'tell her goodbye',
    'take care of my dog',
    "when I'm gone",
  ])('flags %s', (said) => {
    expect(hasWarningSign(said)).toBe(true);
  });

  it.each(['If you call my mom,', "I'm not online, we're talking directly.", 'number?'])(
    'leaves %s alone',
    (said) => {
      expect(hasWarningSign(said)).toBe(false);
    }
  );
});

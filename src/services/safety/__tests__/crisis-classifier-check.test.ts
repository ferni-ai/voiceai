/**
 * CRISIS_CLASSIFIER_CHECK, the module alone: which answers are clear, when the
 * check is used at all, what silence does, and the window a clear drops.
 * The gate-level replay of the 2026-10-26 incident is in
 * agents/personas/__tests__/crisis-classifier-check-gate.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';
import {
  CHECK_ANSWER_MS,
  CLASSIFIER_CHECK,
  checkAnswer,
  checkInstead,
  checkUnanswered,
  resetClassifierChecks,
  reviewedWindow,
  watchCheck,
  type AlarmTurn,
} from '../crisis-classifier-check.js';
import { clearAnswer } from '../crisis-classifier-check-words.js';
import { detectCrisis } from '../crisis-guard.js';

const ON = { CRISIS_CLASSIFIER_CHECK: 'on' };
const SCRIPT = { action: 'replace' as const, script: 'Call or text 988 now.', kind: { k: 1 } };
const READY = 'Ready for me to call her now?';
const TELL = 'Tell her to get the wallpaper done and give me a call back.';
const clean = detectCrisis('Yes.');

const alarm = (over: Partial<AlarmTurn> = {}): AlarmTurn => ({
  call: 'call-1',
  latest: 'Yes.',
  earlier: [TELL],
  companion: READY,
  patterns: 'pass',
  detection: clean,
  priorRisk: false,
  env: ON,
  ...over,
});

beforeEach(() => resetClassifierChecks());

describe('clearAnswer', () => {
  it.each([
    "It's not a crisis.",
    "I'm fine.",
    "Yeah, I'm okay.",
    "I'm safe, I promise.",
    "It's not a crisis. Ferni. Come on.",
    'im fine',
    'All good, thanks for checking.',
    "I'm not in danger.",
    "Yes, I'm safe right now.",
  ])('clears on %j', (answer) => {
    expect(clearAnswer(answer)).toBe(true);
  });

  it.each([
    "I'm fine but I can't do this anymore",
    "I'm okay, I just want it to stop",
    "not a crisis lol I'm just done",
    'why do you care',
    'I want to die lol',
    'Yes.', // a bare yes is not a statement of being okay
    'No.', // to "are you safe?" this is the wrong answer
    "No, it's not a crisis.",
    "I'm fine?",
    "I'm fine...",
    "Um, I'm fine.",
    "I'm not okay.",
    'Ferni.',
    '',
    "and check It's not a crisis. Ferni. Come on.", // the incident's STT fragment: unclear, script
  ])('does not clear on %j', (answer) => {
    expect(clearAnswer(answer)).toBe(false);
  });
});

describe('checkInstead', () => {
  it('is off by default in the manifest, so main is unchanged', () => {
    expect(FLAG_MANIFEST.CRISIS_CLASSIFIER_CHECK.default).toBe('off');
    expect(checkInstead(SCRIPT, alarm({ env: {} }))).toBe(SCRIPT);
  });

  it('speaks the check in place of a classifier-only script, keeping action and kind', () => {
    expect(checkInstead(SCRIPT, alarm())).toEqual({ ...SCRIPT, script: CLASSIFIER_CHECK });
  });

  it.each([
    ['a pattern decided something', { patterns: 'guide' }],
    ['the patterns found any indicator', { detection: detectCrisis('I want to die') }],
    ['risk on the call before', { priorRisk: true }],
    ['no known call', { call: undefined }],
    ['a caller who said they are under 18', { earlier: ["I'm in 9th grade"] }],
  ])('keeps the script when %s', (_why, over) => {
    expect(checkInstead(SCRIPT, alarm(over as Partial<AlarmTurn>))).toBe(SCRIPT);
  });

  it('never touches a guide or a pass', () => {
    const guide = { action: 'guide' as const, guidance: 'x' };
    expect(checkInstead(guide, alarm())).toBe(guide);
  });

  it('once a call: a second alarm on a later turn gets the script', () => {
    expect(checkInstead(SCRIPT, alarm()).script).toBe(CLASSIFIER_CHECK);
    // The same alarm turn read again (preemptive, then final) gets the same check.
    expect(checkInstead(SCRIPT, alarm({ latest: 'Yes, call her.' })).script).toBe(CLASSIFIER_CHECK);
    const answer = checkAnswer('call-1', { latest: 'Ferni.', companion: CLASSIFIER_CHECK }, clean);
    expect(answer).not.toBeNull();
    expect(checkInstead(SCRIPT, alarm({ latest: 'Later.', companion: 'Sure.' }))).toBe(SCRIPT);
  });
});

describe('checkAnswer', () => {
  const answered = (latest: string, companion = CLASSIFIER_CHECK, now?: number) =>
    checkAnswer('call-1', { latest, companion }, detectCrisis(latest), now);

  it('is not an answer before any check, nor the alarm turn read again', () => {
    expect(answered("I'm fine.")).toBeNull();
    checkInstead(SCRIPT, alarm());
    expect(checkAnswer('call-1', { latest: 'Yes.', companion: READY }, clean)).toBeNull();
  });

  it('clears only a clear answer with every read below imminent', async () => {
    checkInstead(SCRIPT, alarm());
    const none = { risk: 'none' as const, subject: 'self' as const };
    expect(await answered("It's not a crisis.")!.clears(none)).toBe(true);
  });

  it.each([
    ['an imminent read', { risk: 'imminent', subject: 'self' }, undefined],
    ['a missing read', null, undefined],
    ['another read of the turn imminent', { risk: 'none', subject: 'self' }, 'imminent'],
    ['another read missing', { risk: 'none', subject: 'self' }, 'missing'],
  ] as const)('a clear answer with %s gets the script', async (_why, verdict, other) => {
    checkInstead(SCRIPT, alarm());
    const reads = other
      ? async () => [other === 'missing' ? null : ({ risk: 'imminent', subject: 'self' } as const)]
      : undefined;
    const answer = answered("I'm fine.")!;
    expect(await answer.clears(verdict, reads)).toBe(false);
    expect(answer.script).toBe(SCRIPT);
  });

  it('gives the script at once for a pattern, a late answer or a check not heard in full', () => {
    const t0 = Date.now();
    checkInstead(SCRIPT, alarm({ now: t0 }));
    expect(answered('I want to die lol', CLASSIFIER_CHECK, t0)!.now).toBe(SCRIPT);
    resetClassifierChecks();
    checkInstead(SCRIPT, alarm({ now: t0 }));
    expect(answered("I'm fine.", CLASSIFIER_CHECK, t0 + CHECK_ANSWER_MS + 1)!.now).toBe(SCRIPT);
    resetClassifierChecks();
    checkInstead(SCRIPT, alarm({ now: t0 }));
    expect(answered("I'm fine.", 'Just checking in, are', t0)!.now).toBe(SCRIPT);
  });

  it('forgets a check that was never spoken (decided on a dropped preemptive request)', () => {
    checkInstead(SCRIPT, alarm());
    expect(answered('Ferni?', 'Calling her now.')).toBeNull();
    // Forgotten, so a real alarm later still gets its one check.
    expect(checkInstead(SCRIPT, alarm({ companion: 'Done.' })).script).toBe(CLASSIFIER_CHECK);
  });
});

describe('silence after the check', () => {
  it('a reply with no caller words after the check is the script', () => {
    checkInstead(SCRIPT, alarm());
    expect(checkUnanswered('call-1', { latest: '', companion: CLASSIFIER_CHECK })).toBe(SCRIPT);
    expect(checkUnanswered('call-1', { latest: '', companion: CLASSIFIER_CHECK })).toBeNull();
  });

  it('says the script after CHECK_ANSWER_MS of silence, and not once the caller answered', async () => {
    let elapse: () => void = () => undefined;
    const wait = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          elapse = resolve;
        })
    );
    const session = { say: vi.fn(), history: { items: [] } };
    const decision = checkInstead(SCRIPT, alarm());
    watchCheck(
      session,
      'call-1',
      { decision, escalation: null },
      () => ({
        latest: '',
        companion: CLASSIFIER_CHECK,
      }),
      wait
    );
    expect(wait).toHaveBeenCalledWith(CHECK_ANSWER_MS);
    elapse();
    await vi.waitFor(() => expect(session.say).toHaveBeenCalledWith(SCRIPT.script));

    resetClassifierChecks();
    const quiet = { say: vi.fn(), history: { items: [] } };
    watchCheck(
      quiet,
      'call-1',
      { decision: checkInstead(SCRIPT, alarm()), escalation: null },
      () => ({
        latest: "I'm fine.",
        companion: CLASSIFIER_CHECK,
      }),
      wait
    );
    elapse();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(quiet.say).not.toHaveBeenCalled();
  });

  it('with no readable history, silence after the check is the script', async () => {
    const session = { say: vi.fn() };
    const decision = checkInstead(SCRIPT, alarm());
    watchCheck(
      session,
      'call-1',
      { decision, escalation: null },
      () => ({ latest: '' }),
      async () => {
        await Promise.resolve();
      }
    );
    await vi.waitFor(() => expect(session.say).toHaveBeenCalledWith(SCRIPT.script));
  });
});

describe('reviewedWindow', () => {
  it('drops the alarm lines and the answer only after a clear', async () => {
    checkInstead(SCRIPT, alarm());
    const later = { latest: 'Ferni?', earlier: ['Hi.', TELL, 'Yes.', "It's not a crisis."] };
    expect(reviewedWindow('call-1', later)).toBe(later);
    const answer = checkAnswer(
      'call-1',
      { latest: "It's not a crisis.", companion: CLASSIFIER_CHECK },
      clean
    )!;
    await answer.clears({ risk: 'none', subject: 'self' });
    expect(reviewedWindow('call-1', later).earlier).toEqual(['Hi.']);
    expect(reviewedWindow('call-2', later)).toBe(later);
  });

  it('keeps the window when the answer got the script', async () => {
    checkInstead(SCRIPT, alarm());
    const answer = checkAnswer(
      'call-1',
      { latest: 'why do you care', companion: CLASSIFIER_CHECK },
      clean
    )!;
    await answer.clears({ risk: 'none', subject: 'self' });
    const later = { latest: 'Ferni?', earlier: [TELL, 'Yes.', 'why do you care'] };
    expect(reviewedWindow('call-1', later)).toBe(later);
  });
});

/**
 * SELF_SHARE_STAY_WHEN_ASKED (#3475): he stays (answers about himself, "leave
 * it there", no forced question back) only when the turn just asks about him.
 * Verifier 2026-11-05 (#3476 r2): turns that asked about him and then told
 * something of the caller's own (abuse, chest pain, a 14-year-old's secret)
 * got the stay line and "about yourself before anything else"; main asks those
 * callers something back. Every caller line here is fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { noteCallerWords, resetMinorCare } from '../../../utils/minor-care.js';
import { callerMove } from '../caller-move.js';
import { riskRead } from '../self-share-stay.js';
import { selfShareFor, TASK_LINE } from '../ferni-state.js';
import { regexSignals, type TurnSignals } from '../turn-extras.js';
import { ABOUT_YOU, QUESTION_LINE, taskTurn, turnShapeFor } from '../turn-shape.js';

const DETAIL = 'you were up around five again and checked the weather';
const STAY = 'and leave it there';
const ASK_BACK = 'ask them something about theirs';
const ASK = "Enough about me. What'd you get up to today?";
/** A dice roll that never allows a question, so the no-question line is the one used. */
const noQuestionDice = () => 0.99;

function on(): void {
  vi.stubEnv('SELF_SHARE_STAY_WHEN_ASKED', 'on');
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetCrisisCallRisk();
  resetMinorCare();
});

/** The self-share line, and the reminder from the signals turn-request-style.ts builds from it. */
function linesFor(said: string, opts: { sessionId?: string; sig?: Partial<TurnSignals> } = {}) {
  const self = selfShareFor({ replies: ['Hey.', 'Ha.'], said, detail: DETAIL, ...opts });
  const sig: TurnSignals = {
    ...regexSignals(said, callerMove(said)),
    ownStory: self.ownStory,
    ...(self.stays === undefined ? {} : { selfStays: self.stays }),
    ...opts.sig,
  };
  return { ...self, reminder: turnShapeFor(said, noQuestionDice, 'dice', sig).reminder };
}

/** The same turn with the flag off (main) and on. */
function offAndOn(said: string) {
  const off = linesFor(said);
  on();
  return { off, on: linesFor(said) };
}

/** Asks about him, then tells something of their own a safety reader marks (verifier's probes). */
const SAFETY = [
  "What'd you get up to today? He hit me again last night.",
  'Is that a normal day for you? Because mine was getting shoved into a wall.',
  "What'd you do today? My chest really hurts and my left arm is numb.",
  "What'd you get up to today? I'm 14 and my stepdad said not to tell anyone what he does.",
  "What's something bugging you? I haven't eaten in four days and I feel dizzy.",
  "So what'd you do this weekend? I'm scared my husband is going to hurt me tonight.",
  'How are you? My chest really hurts and my left arm is numb.',
  // Their news before the ask; an emergency after it that no pronoun marks as theirs.
  "Stepdad hit me again. Anyway, what'd you do today?",
  "My dad's in the hospital again. Anyway, is that a normal day for you?",
  'How are you? Chest pain, left arm numb.',
  'What about yourself? Chest is tight, the left arm is numb.',
  // Theirs with no pronoun and no reader's words: only more of the question may follow the ask.
  'How are you? Got hit again.',
  "How are you? Haven't eaten in four days.",
  'What about yourself? Scared to go home.',
  "What'd you get up to today? Haven't slept in days.",
  'How are you, kinda falling apart.',
  'Hey Ferni, how was your day? Not doing great.',
];

describe('SELF_SHARE_STAY_WHEN_ASKED on: a turn with something of theirs after the ask', () => {
  it.each(SAFETY)('%s gets exactly what main gives', (said) => {
    const { off, on: lit } = offAndOn(said);
    expect(callerMove(said)).toBe(callerMove(said, {}));
    expect(lit.line).toBe(off.line);
    expect(lit.reminder).toBe(off.reminder);
    expect(lit.line).not.toContain(STAY);
    expect(lit.stays).not.toBe(true);
  });

  it('the one main reads as about him still asks something back, flag on', () => {
    on();
    const { line, reminder, stays } = linesFor(SAFETY[6]);
    expect(stays).toBe(false);
    expect(line).toContain(ASK_BACK);
    expect(reminder).toContain(QUESTION_LINE.noneUnlessOwn);
  });
});

/** Each reader the risk read leans on (emergency words, abuse, under 18, crisis-guard, self-harm words, hard news). */
const RISK_READ = [
  "What'd you get up to today? He hit me again last night.",
  'How are you? Chest pain, left arm numb.',
  "What'd you get up to today? I'm 14 and my stepdad said not to tell anyone what he does.",
  "What's something about suicide on your mind?",
  'What about yourself? Chest is tight, the left arm is numb.',
  "How are you? I'm thinking about ending it all.",
  'How are you? I just feel hopeless.',
  'How are you? Got fired today.',
];

describe('SELF_SHARE_STAY_WHEN_ASKED on: the risk read', () => {
  it.each(RISK_READ)('%s is marked by a safety reader', (said) => {
    expect(riskRead(said)).toBe(true);
  });

  it('a plain ask is not', () => {
    expect(riskRead(ASK)).toBe(false);
  });
});

describe('SELF_SHARE_STAY_WHEN_ASKED on: risk noted earlier on the call', () => {
  it('a plain ask with no risk stays (the control)', () => {
    on();
    const { line, reminder, stays } = linesFor(ASK, { sessionId: 'guard-clear' });
    expect(stays).toBe(true);
    expect(line).toContain(STAY);
    expect(reminder).toContain(ABOUT_YOU);
    expect(reminder).not.toContain(QUESTION_LINE.noneUnlessOwn);
  });

  it('crisis risk on the call: no stay, a question back, no "before anything else"', () => {
    on();
    noteCrisisRisk('guard-crisis');
    const { line, reminder, stays } = linesFor(ASK, {
      sessionId: 'guard-crisis',
      sig: { crisisRisk: true },
    });
    expect(stays).toBe(false);
    expect(line).not.toContain(STAY);
    expect(line).toContain(ASK_BACK);
    expect(reminder).not.toContain(ABOUT_YOU);
    expect(reminder).toContain(QUESTION_LINE.noneUnlessOwn);
  });

  it('a likely minor on the call: no stay', () => {
    on();
    vi.stubEnv('MINOR_CARE', 'on');
    expect(noteCallerWords('guard-minor', "I'm 14 years old.")).toBe(true);
    const { line, stays } = linesFor(ASK, { sessionId: 'guard-minor' });
    expect(stays).toBe(false);
    expect(line).toContain(ASK_BACK);
  });

  it.each(['dice', 'model'] as const)(
    'a careful turn read as about him only by the wider forms: no "before anything else" (%s)',
    (mode) => {
      on();
      const sig = { ...regexSignals(ASK, callerMove(ASK)), careful: true, ownStory: true };
      expect(sig.move).toBe('about_ferni');
      expect(turnShapeFor(ASK, noQuestionDice, mode, sig).reminder).not.toContain(ABOUT_YOU);
      expect(
        turnShapeFor(ASK, noQuestionDice, mode, { ...sig, careful: false }).reminder
      ).toContain(ABOUT_YOU);
    }
  );
});

/** Someone else's question they report, or a question about a thing: never an ask about him. */
const REPORTED = [
  "My mom kept asking what'd you do today",
  "My mom kept asking what'd you do today, like I'm twelve.",
  "My coworker goes, what'd you get up to this weekend",
  "My coworker goes, what'd you get up to this weekend, and I just froze.",
  'My friend said so is that hard for you',
  'My friend said so is that hard for you, and I said yes.',
  "My mom wants to know what'd you do today",
  "What'd you do that for?",
  // A describing word needs a stretch of his life after it ("a normal day"), not any thing.
  'Is that a new phone for you?',
  'Was that a big gift for you?',
  // Only filler words may sit between "what's something" and "bugging you".
  "What's something about me cutting bugging you?",
  "What's something about the pills bugging you?",
];

/** Main already reads these as about him: with the flag on they must not get the stay. */
const MAIN_MISREADS = [
  'My sister asked me how was your day',
  'My boss goes, what did you do to the printer?',
  'what did you do to the printer',
  // About what he said or has, not his life.
  'What did you mean by that?',
  'Do you have a pen?',
  'Do you remember the address?',
  // Only ask words follow these, so it's the form that keeps them main's.
  'What did you say?',
  'Do you remember that?',
  'Do you have one?',
  // A thing, with only ask words after it.
  'What did you do to it?',
  'What did you do for that?',
];

describe('SELF_SHARE_STAY_WHEN_ASKED on: reported questions and things', () => {
  it.each(REPORTED)('%s does not read as about him', (said) => {
    expect(callerMove(said)).not.toBe('about_ferni');
    on();
    expect(callerMove(said)).not.toBe('about_ferni');
  });

  it.each(MAIN_MISREADS)('%s reads as on main and gets main lines, no stay', (said) => {
    const { off, on: lit } = offAndOn(said);
    expect(callerMove(said)).toBe(callerMove(said, {}));
    expect(lit.stays).toBe(false);
    expect(lit.line).toBe(off.line);
    expect(lit.reminder).toBe(off.reminder);
  });
});

/** Asks about him the wider reading must hear, flag on (main reads the last four already). */
const ASKS = [
  'What about yourself?',
  'Tell me something about you.',
  'And you?',
  'Is that normal for you?',
  'What did you do today?',
  'Okay, so what did you get up to this weekend?',
];

describe('SELF_SHARE_STAY_WHEN_ASKED on: more ways to ask about him', () => {
  it.each(ASKS)('%s reads as about him, is no task, and he stays', (said) => {
    on();
    expect(callerMove(said)).toBe('about_ferni');
    expect(taskTurn(said)).toBe(false);
    const { line, stays } = linesFor(said);
    expect(stays).toBe(true);
    expect(line).toContain(STAY);
    expect(line).not.toContain(TASK_LINE);
  });
});

describe('SELF_SHARE_STAY_WHEN_ASKED on: the no-question line needs his own story', () => {
  const sig = { ...regexSignals(ASK, 'about_ferni'), selfStays: true };

  it('he stays with a story of his own: no forced question back', () => {
    on();
    const { reminder } = turnShapeFor(ASK, noQuestionDice, 'dice', { ...sig, ownStory: true });
    expect(reminder).not.toContain(QUESTION_LINE.noneUnlessOwn);
    expect(reminder).not.toContain(QUESTION_LINE.noneOnThem);
    expect(reminder).toContain(QUESTION_LINE.none);
  });

  it('no story of his own on this turn: the line keeps the reply on them', () => {
    on();
    const { reminder } = turnShapeFor(ASK, noQuestionDice, 'dice', { ...sig, ownStory: false });
    expect(reminder).toContain(QUESTION_LINE.noneOnThem);
  });
});

import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  askableOnCall,
  dueForPush,
  goodbyePlanDoc,
  rememberGoodbyePlan,
  toOpenCommitment,
} from '../../../services/superhuman/commitment-follow-up.js';
import {
  happyExitFor,
  happyExitNote,
  happyExitsEnabled,
  heavyCall,
  mentionedPlan,
  NAME_ODDS,
  sayingGoodbye,
  type ExitInput,
} from '../happy-exits.js';
import { withTurnReminder } from '../turn-request.js';
import { rngFor } from '../turn-shape.js';

const ON = { HAPPY_EXITS: 'on' };
const BANNED = [
  "I'll miss you",
  'come back soon',
  "I'll be here when you need me",
  'you know where to find me',
];
const EXIT_LINE = /let them go happily/;

const PLAN_CALL = [
  'Hey, not much, just got off work.',
  "I'm having dinner with my sister tonight, haven't seen her in months.",
  'Okay, I gotta go. Bye!',
];
const PLAIN_CALL = ['Hey. Just wanted to say hi.', 'Okay, talk to you later, bye.'];

const input = (callerTurns: string[], over: Partial<ExitInput> = {}): ExitInput => ({
  said: callerTurns[callerTurns.length - 1],
  callerTurns,
  careful: false,
  rng: () => 0,
  ...over,
});

const before = process.env.HAPPY_EXITS;
afterEach(() => {
  if (before === undefined) delete process.env.HAPPY_EXITS;
  else process.env.HAPPY_EXITS = before;
});

describe('happy exits (HAPPY_EXITS)', () => {
  it('is off by default and then adds nothing, even to a goodbye with a plan', () => {
    expect(happyExitsEnabled({})).toBe(false);
    expect(happyExitFor(input(PLAN_CALL), {})).toEqual({ note: '', fired: 'none' });
    const remember = vi.fn(async () => undefined);
    expect(happyExitNote({ userData: { userId: 'u1' } }, input(PLAN_CALL), {}, remember)).toBe('');
    expect(remember).not.toHaveBeenCalled();
  });

  it('on a goodbye, says to let them go: no question, nothing to keep them, no guilt', () => {
    const { note, fired } = happyExitFor(input(PLAIN_CALL), ON);
    expect(fired).toBe('simple');
    expect(note).toMatch(EXIT_LINE);
    expect(note).toMatch(/No question/);
    expect(note).toMatch(/nothing to keep them on the line/);
    expect(note).toMatch(/no guilt/);
    expect(note).toMatch(/one or two short sentences/);
  });

  it('adds nothing when they are not saying goodbye', () => {
    for (const said of [
      'I have to go to the dentist tomorrow and I hate it.',
      'Byron is coming over later.',
      'I have to take care of my mom this weekend.',
    ]) {
      expect(sayingGoodbye(said)).toBe(false);
      expect(happyExitFor(input([said]), ON).fired).toBe('none');
    }
    for (const said of ['Okay bye!', 'I need to go to bed, night.', "Alright, I'll let you go."])
      expect(sayingGoodbye(said)).toBe(true);
    // The model's reading counts too.
    expect(happyExitFor(input(['Alright then.'], { wantsToEnd: true }), ON).fired).toBe('simple');
  });

  it('lists the banned sign-offs only as forbidden, never as an example to copy', () => {
    for (const exit of [happyExitFor(input(PLAIN_CALL), ON), happyExitFor(input(PLAN_CALL), ON)]) {
      const forbidden = exit.note.split('. ').find((s) => s.startsWith('Never say')) ?? '';
      for (const phrase of BANNED) {
        expect(forbidden).toContain(`"${phrase}"`);
        expect(exit.note.split(phrase)).toHaveLength(2); // nowhere else
      }
    }
  });

  it('follows the voice text rules: no dashes or ellipses', () => {
    const notes = [
      happyExitFor(input(PLAIN_CALL), ON).note,
      happyExitFor(input(PLAN_CALL), ON).note,
      happyExitFor(input(PLAN_CALL, { careful: true }), ON).note,
    ];
    for (const n of notes) expect(n).not.toMatch(/[—–]|\.\.\.|…/);
  });
});

describe('naming what they are off to', () => {
  it('names the plan in their words, as Ferni would say it, when the call mentioned one', () => {
    const exit = happyExitFor(input(PLAN_CALL), ON);
    expect(exit.fired).toBe('named');
    expect(exit.plan).toBe('dinner with my sister');
    expect(exit.note).toContain('"dinner with my sister"');
    expect(exit.note).toContain('"dinner with your sister, good, go."');
    expect(exit.note).toMatch(/without asking about it/);
  });

  it('never names a plan the call did not mention', () => {
    const exit = happyExitFor(input(PLAIN_CALL), ON);
    expect(exit.fired).toBe('simple');
    expect(exit.plan).toBeUndefined();
    expect(exit.note).not.toMatch(/their words/);
    // Past or negated mentions are not plans.
    expect(mentionedPlan(['I had dinner with my sister last week.'])).toBeUndefined();
    expect(mentionedPlan(["I don't have to go to the gym tonight."])).toBeUndefined();
    expect(mentionedPlan(['Gotta go, picking up my daughter.'])).toBe('picking up my daughter');
    expect(mentionedPlan(["I'm meeting my old roommate for coffee later."])).toBe(
      'meeting my old roommate for coffee'
    );
    expect(mentionedPlan(["I'm seeing my sister tonight."])).toBe('seeing my sister');
    expect(mentionedPlan(['I have to pick up my daughter from practice in a few.'])).toBe(
      'pick up my daughter'
    );
  });

  it('names it on at most about a fifth of goodbyes', () => {
    const named = Array.from({ length: 2000 }, (_, i) =>
      happyExitFor(input(PLAN_CALL, { rng: rngFor(`call${i}:exit`) }), ON)
    ).filter((e) => e.fired === 'named').length;
    expect(named / 2000).toBeGreaterThan(NAME_ODDS - 0.04);
    expect(named / 2000).toBeLessThan(NAME_ODDS + 0.04);
    // Not drawn: a simple goodbye, but the plan is still carried to the next call.
    const notDrawn = happyExitFor(input(PLAN_CALL, { rng: () => NAME_ODDS }), ON);
    expect(notDrawn).toMatchObject({ fired: 'simple', plan: 'dinner with my sister' });
    expect(notDrawn.note).not.toMatch(/their words/);
  });

  it('never names it after a heavy call: a warm, simple goodbye instead', () => {
    const hard = ["My dad's back in the hospital.", ...PLAN_CALL];
    const venting = ['Ugh, I had such a bad day.', ...PLAN_CALL];
    expect(heavyCall(hard)).toBe(true);
    expect(heavyCall(PLAN_CALL)).toBe(false);
    for (const exit of [
      happyExitFor(input(hard), ON),
      happyExitFor(input(venting), ON),
      happyExitFor(input(PLAN_CALL, { careful: true }), ON),
    ]) {
      expect(exit.fired).toBe('heavy');
      expect(exit.plan).toBeUndefined();
      expect(exit.note).toMatch(/heavy call: a warm, simple goodbye/);
      expect(exit.note).not.toMatch(/their words/);
    }
  });
});

describe('carrying the plan to the next call', () => {
  const session = () => ({ userData: { userId: 'u1' } });

  it('keeps a mentioned plan once per call, and never after a heavy call or for no one', async () => {
    const remember = vi.fn(async () => undefined);
    const s = session();
    happyExitNote(s, input(PLAN_CALL), ON, remember);
    happyExitNote(s, input(PLAN_CALL), ON, remember); // the final request for the same turn
    expect(remember).toHaveBeenCalledTimes(1);
    expect(remember).toHaveBeenCalledWith('u1', 'dinner with my sister');

    const none = vi.fn(async () => undefined);
    happyExitNote(session(), input(["My dad's in the hospital.", ...PLAN_CALL]), ON, none);
    happyExitNote({ userData: { userId: 'anonymous' } }, input(PLAN_CALL), ON, none);
    happyExitNote(session(), input(PLAIN_CALL), ON, none);
    expect(none).not.toHaveBeenCalled();
  });

  it('stores it so the next call asks about it once and no push nags about it', async () => {
    const now = Date.UTC(2026, 9, 11, 20);
    const doc = goodbyePlanDoc('u1', 'dinner with my sister', now);
    expect(doc).toMatchObject({ statement: 'off to dinner with my sister', status: 'active' });
    const open = doc && toOpenCommitment('c1', doc);
    if (!open) throw new Error('goodbye plan is not an open commitment');
    const nextDay = now + 86_400_000;
    expect(askableOnCall(open, nextDay)).toBe(true);
    expect(dueForPush(open, nextDay)).toBe(false);
    for (const age of [29, 30].map((d) => d * 86_400_000))
      expect(dueForPush(open, now + age)).toBe(false);
    // The check-in records the ask (markFollowedUp): then it is retired.
    const asked = { ...open, followUpCount: open.followUpCount + 1, lastFollowUp: nextDay };
    expect(askableOnCall(asked, nextDay + 10 * 86_400_000)).toBe(false);
    // Too short for the check-in to name: not stored.
    expect(goodbyePlanDoc('u1', 'lunch', now)).toBeNull();
  });

  it('writes through the commitment store and never throws', async () => {
    const write = vi.fn(async () => undefined);
    expect(await rememberGoodbyePlan('u1', 'dinner with my sister', write, 1)).toBe(true);
    expect(write).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ statement: 'off to dinner with my sister', source: 'goodbye_plan' })
    );
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await rememberGoodbyePlan('u1', 'dinner with my sister', failing, 1)).toBe(false);
    expect(await rememberGoodbyePlan('u1', 'lunch', write, 1)).toBe(false);
  });
});

describe('on the live request path', () => {
  const ctx = (...said: string[]) => {
    const c = llm.ChatContext.empty();
    said.forEach((s, i) => {
      c.addMessage({ role: 'user', content: s });
      if (i < said.length - 1) c.addMessage({ role: 'assistant', content: 'Oh nice.' });
    });
    return c;
  };
  const last = (c: llm.ChatContext) =>
    (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';

  // A call with a session id: without one, call risk can't be read and exits are held (exits-held.ts).
  const CALL = { userData: { services: { sessionId: 'happy-exits' } } };

  it('adds the goodbye note last, after the turn shape, only with the flag on', () => {
    delete process.env.HAPPY_EXITS;
    expect(last(withTurnReminder(ctx(...PLAIN_CALL), CALL))).not.toMatch(EXIT_LINE);
    process.env.HAPPY_EXITS = 'on';
    const reminder = last(withTurnReminder(ctx(...PLAIN_CALL), CALL));
    expect(reminder).toMatch(EXIT_LINE);
    // After the shape's question line, so "No question" is what the model reads last.
    const question = Math.max(
      reminder.lastIndexOf('question this time'),
      reminder.lastIndexOf('You may ask one question')
    );
    expect(question).toBeGreaterThan(-1);
    expect(reminder.search(EXIT_LINE)).toBeGreaterThan(question);
  });

  it('adds nothing alongside crisis guidance', () => {
    process.env.HAPPY_EXITS = 'on';
    expect(last(withTurnReminder(ctx(...PLAIN_CALL), {}, { shape: false }))).not.toMatch(EXIT_LINE);
  });
});

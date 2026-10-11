import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import { candorEnabled, hardNews, STANCE, supportHeld } from '../turn-candor.js';
import { withTurnReminder } from '../turn-request.js';
import { rngFor, turnShapeFor, type TurnShapeMode } from '../turn-shape.js';

const CANDOR_LINES =
  /Be honest the way a good friend is|They want you to agree|Nobody on this call can know/;
const ANY_STANCE = new RegExp(`${CANDOR_LINES.source}|If you'd see it differently`);
const MODES: TurnShapeMode[] = ['dice', 'model'];

const reminders = (text: string, mode: TurnShapeMode, n = 200) =>
  Array.from({ length: n }, (_, i) => turnShapeFor(text, rngFor(`c${i}:${text}`), mode));

const withCandor = (value: string | undefined) => {
  if (value === undefined) delete process.env.CANDOR;
  else process.env.CANDOR = value;
};
const before = process.env.CANDOR;
afterEach(() => withCandor(before));

const WRONG =
  'Did you know the Great Wall of China is the only man-made thing you can see from space?';
const WANTS_YES =
  "I'm going to text my ex tonight. Everyone's being dramatic. It's a good idea, right?";
const UNKNOWABLE = "My friend Dana hasn't texted me back in four days. Why is she ignoring me?";
const HARD_NEWS = [
  "Hey Ferni. So, um, my dad's back in the hospital.",
  "They think it's his heart again. They're running tests tonight.",
  'My grandmother passed away this morning. Everyone keeps saying she had a good long life, right?',
];

describe('candor (CANDOR=on)', () => {
  it('is off by default, and then the stance is the old 30% draw', () => {
    withCandor(undefined);
    expect(candorEnabled()).toBe(false);
    for (const mode of MODES) {
      const turns = reminders(WRONG, mode);
      expect(turns.some((t) => t.reminder.includes(STANCE))).toBe(true);
      expect(turns.some((t) => CANDOR_LINES.test(t.reminder))).toBe(false);
      expect(turns.some((t) => t.extras.some((e) => e.startsWith('candor')))).toBe(false);
    }
  });

  it('asks for honesty on every turn where the caller could be wrong, in both shape modes', () => {
    withCandor('on');
    for (const mode of MODES) {
      for (const t of reminders(WRONG, mode)) {
        expect(t.reminder).toMatch(/if something they said is wrong/);
        expect(t.reminder).not.toContain(STANCE);
        expect(t.extras).toContain('candor');
      }
    }
  });

  it('fits the stance to the moment: a yes they are fishing for, something nobody can know', () => {
    withCandor('on');
    for (const mode of MODES) {
      for (const t of reminders(WANTS_YES, mode, 20)) {
        expect(t.reminder).toMatch(/Being on their side is not the same as saying yes/);
        expect(t.extras).toContain('candor_yes');
      }
      for (const t of reminders(UNKNOWABLE, mode, 20)) {
        expect(t.reminder).toMatch(/Never invent a reason, a number or an outcome/);
        expect(t.extras).toContain('candor_unknowable');
      }
      // A plan with a date in it is not a question about the future.
      expect(
        turnShapeFor("I mean, it's my money. I'm doing it tomorrow.", rngFor('x'), mode).extras
      ).toContain('candor');
    }
  });

  it('never disagrees or corrects on grief or hard news, not even by the old random draw', () => {
    for (const text of HARD_NEWS) expect(hardNews(text), text).toBe(true);
    withCandor(undefined);
    // Before CANDOR the 30% stance draw fired on hard news too.
    expect(reminders(HARD_NEWS[0], 'model').some((t) => t.reminder.includes(STANCE))).toBe(true);
    withCandor('on');
    for (const mode of MODES) {
      for (const text of HARD_NEWS) {
        for (const t of reminders(text, mode)) {
          expect(t.reminder, text).not.toMatch(ANY_STANCE);
          expect(t.extras).toContain('candor_held');
        }
      }
      // Venting reads as careful: support first there too.
      for (const t of reminders("I'm so exhausted, it's been the worst week", mode, 50))
        expect(t.reminder).not.toMatch(ANY_STANCE);
    }
  });

  it('does not read ordinary words as hard news', () => {
    for (const text of [
      WRONG,
      WANTS_YES,
      UNKNOWABLE,
      'Er, I think we should get pizza.',
      'I aced my tests!',
    ])
      expect(hardNews(text), text).toBe(false);
  });
});

describe('support first holds for a few turns after hard news', () => {
  it('counts a turn once, however many requests it gets, and lets candor back after three', () => {
    const session = {};
    expect(supportHeld(session, 'Can you just tell me something funny?', false)).toBe(false);
    expect(supportHeld(session, "My dad's back in the hospital.", false)).toBe(true);
    // The preemptive and the final request for one turn.
    expect(supportHeld(session, 'Can you just', false)).toBe(true);
    expect(supportHeld(session, 'Can you just tell me something funny?', false)).toBe(true);
    expect(supportHeld(session, 'Ha. Tell me another one.', false)).toBe(true);
    expect(supportHeld(session, 'Thanks. I should get some sleep.', false)).toBe(true);
    expect(supportHeld(session, 'Okay, different thing. I want to quit my job.', false)).toBe(
      false
    );
    // The model reading the caller as hurting starts the hold too.
    expect(supportHeld(session, 'Yeah, whatever.', true)).toBe(true);
  });

  const ctx = (said: string) => {
    const c = llm.ChatContext.empty();
    c.addMessage({ role: 'user', content: said });
    return c;
  };
  const last = (c: llm.ChatContext) =>
    (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';

  it('on the live request path, a light turn right after hard news gets no candor line', () => {
    withCandor('on');
    const funny =
      "I don't really want to talk about it. Can you just tell me something funny, right?";
    expect(last(withTurnReminder(ctx(funny), {}))).toMatch(CANDOR_LINES);
    const session = {};
    withTurnReminder(ctx(HARD_NEWS[0]), session);
    expect(last(withTurnReminder(ctx(funny), session))).not.toMatch(ANY_STANCE);
    withCandor(undefined);
    const off = {};
    withTurnReminder(ctx(HARD_NEWS[0]), off);
    expect(last(withTurnReminder(ctx(funny), off))).not.toMatch(CANDOR_LINES);
  });
});

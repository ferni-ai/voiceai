import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';

import {
  EARNED_NOTE,
  FRIEND_STAGE_PRIOR_CALLS,
  friendNotes,
  friendTeaseOn,
  LOW_NOTE,
  NOT_YET_NOTE,
  PUSHBACK_NOTE,
  STOPPED_NOTE,
  TEASE_EVERY,
  teaseCue,
  teaseEarned,
  teasePushback,
  type TeaseTurn,
} from '../friend-tease.js';
import { withTurnReminder } from '../turn-request.js';

const KEYS = ['FRIEND_TEASE', 'HONEST_FRIEND'] as const;
const before = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (before[k] === undefined) delete process.env[k];
    else process.env[k] = before[k];
  }
});

/** A call so far: caller and Ferni alternating, caller first. */
const call = (...turns: string[]) => {
  const c = llm.ChatContext.empty();
  turns.forEach((t, i) => c.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: t }));
  return c;
};
const last = (c: llm.ChatContext) =>
  (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';

/** A session for the caller's Nth call (prior = calls before this one). */
const session = (prior: number | undefined, personaId = 'ferni') => ({
  userData: {
    personaId,
    services: prior === undefined ? {} : { userProfile: { totalConversations: prior } },
  },
});

const turn = (said: string, over: Partial<TeaseTurn> = {}): TeaseTurn => ({
  said,
  callerTurns: [said],
  priorCalls: 4,
  careful: false,
  ferniSpoke: true,
  ferni: true,
  ...over,
});

const ON = { FRIEND_TEASE: 'on' };
const ANY_TEASE_NOTE = [EARNED_NOTE, NOT_YET_NOTE, LOW_NOTE, PUSHBACK_NOTE, STOPPED_NOTE];

describe('teasing is earned by friend stage', () => {
  it('counts the third call on as earned, and an unknown count as not', () => {
    expect(FRIEND_STAGE_PRIOR_CALLS).toBe(2);
    expect(teaseEarned(0)).toBe(false);
    expect(teaseEarned(1)).toBe(false);
    expect(teaseEarned(2)).toBe(true);
    expect(teaseEarned(undefined)).toBe(false);
  });

  it('calls 1 and 2 get "not yet" on a light turn; call 3 gets the earned invitation', () => {
    const said = 'Ha, I burned the toast again this morning.';
    expect(teaseCue({}, turn(said, { priorCalls: 0 }))).toBe('not_yet');
    expect(teaseCue({}, turn(said, { priorCalls: 1 }))).toBe('not_yet');
    expect(teaseCue({}, turn(said, { priorCalls: undefined }))).toBe('not_yet');
    expect(teaseCue({}, turn(said, { priorCalls: 2 }))).toBe('earned');
  });

  it('offers the earned tease at most once in TEASE_EVERY light turns', () => {
    const c = {};
    const cues = Array.from({ length: 6 }, (_, i) => teaseCue(c, turn(`light thing ${i}`)));
    expect(TEASE_EVERY).toBe(3);
    expect(cues).toEqual(['earned', 'none', 'none', 'earned', 'none', 'none']);
  });

  it('gives the same cue to the same words asked twice, counting them once', () => {
    const c = {};
    expect(teaseCue(c, turn('first light thing'))).toBe('earned');
    expect(teaseCue(c, turn('first light thing'))).toBe('earned');
    expect(teaseCue(c, turn('second light thing'))).toBe('none');
  });

  it('a teammate never gets the earned invitation, but does get "not yet"', () => {
    expect(teaseCue({}, turn('light thing', { ferni: false }))).toBe('none');
    expect(teaseCue({}, turn('light thing', { ferni: false, priorCalls: 0 }))).toBe('not_yet');
  });
});

describe('never on a hard turn', () => {
  it('a careful reading, venting, hard news or a low line gets the no-teasing note at friend stage', () => {
    expect(teaseCue({}, turn('ok', { careful: true }))).toBe('low');
    for (const said of [
      "I'm so burnt out, I can't face any of it.",
      'My dad died last week.',
      "Honestly what's the point anymore.",
    ]) {
      expect(teaseCue({}, turn(said)), said).toBe('low');
    }
  });

  it('a light word right after hard news is still hard', () => {
    const cue = teaseCue(
      {},
      turn('haha anyway', { callerTurns: ['My dad died last week.', 'haha anyway'] })
    );
    expect(cue).toBe('low');
  });
});

describe('dropped the moment it lands wrong', () => {
  it('reads pushback on a tease, not a plain no', () => {
    for (const t of [
      "Hey, that's not funny.",
      'Wow, low blow.',
      "That's kind of mean.",
      'Are you making fun of me?',
      'Stop teasing me.',
    ]) {
      expect(teasePushback(t), t).toBe(true);
    }
    for (const t of ["No, I'm good.", 'That was a funny movie.', 'My boss is mean to me.']) {
      expect(teasePushback(t), t).toBe(false);
    }
  });

  it('pushback owns it, then no more teasing that call, even at friend stage', () => {
    const c = {};
    expect(teaseCue(c, turn("Hey, that's not funny."))).toBe('pushback');
    expect(teaseCue(c, turn('Anyway, I made pasta tonight.'))).toBe('stopped');
    expect(teaseCue(c, turn('It was pretty good actually.'))).toBe('stopped');
    // A new call starts clean.
    expect(teaseCue({}, turn('Anyway, I made pasta tonight.'))).toBe('earned');
  });

  it('pushback before Ferni has spoken is not about him', () => {
    expect(teaseCue({}, turn("That's not funny.", { ferniSpoke: false, priorCalls: 0 }))).toBe(
      'not_yet'
    );
  });
});

describe('FRIEND_TEASE in the turn reminder', () => {
  const light = call('Hi.', 'Hey, good to hear you.', 'I burned the toast again, ha.');

  it('is off by default: no tease note and the reminder is as before', () => {
    delete process.env.FRIEND_TEASE;
    expect(friendTeaseOn()).toBe(false);
    const out = last(withTurnReminder(light, session(0)));
    for (const note of ANY_TEASE_NOTE) expect(out).not.toContain(note);
  });

  it('off, the honest-friend praise note keeps its tease; on before friend stage, it loses it', () => {
    const praise = call('Hi.', 'Hey you.', "I'm basically a genius, right?");
    process.env.HONEST_FRIEND = 'on';
    delete process.env.FRIEND_TEASE;
    expect(last(withTurnReminder(praise, session(0)))).toContain('a little teasing is fine');
    process.env.FRIEND_TEASE = 'on';
    const early = last(withTurnReminder(praise, session(0)));
    expect(early).toMatch(/They're fishing for praise/);
    expect(early).not.toContain('a little teasing is fine');
    expect(early).toContain(NOT_YET_NOTE);
    // At friend stage the praise note keeps its tease.
    expect(last(withTurnReminder(praise, session(3)))).toContain('a little teasing is fine');
  });

  it('on, a first call gets "not yet" and a fourth call gets the earned invitation', () => {
    process.env.FRIEND_TEASE = 'on';
    expect(last(withTurnReminder(light, session(0)))).toContain(NOT_YET_NOTE);
    const later = last(withTurnReminder(light, session(3)));
    expect(later).toContain(EARNED_NOTE);
    expect(later).not.toContain(NOT_YET_NOTE);
  });

  it('on, a low turn at friend stage gets no invitation, only the no-teasing note', () => {
    process.env.FRIEND_TEASE = 'on';
    const low = call('Hi.', 'Hey.', "I'm exhausted and honestly why bother.");
    const out = last(withTurnReminder(low, session(5)));
    expect(out).toContain(LOW_NOTE);
    expect(out).not.toContain(EARNED_NOTE);
  });

  it('never rides with crisis guidance', () => {
    process.env.FRIEND_TEASE = 'on';
    const out = last(withTurnReminder(light, session(5), { shape: false }));
    for (const note of ANY_TEASE_NOTE) expect(out).not.toContain(note);
    expect(friendNotes(light, session(5), 'I burned the toast again, ha.', true, ON)).toEqual(['']);
  });
});

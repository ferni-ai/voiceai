/**
 * TEASE_GATE (#1517) on the real turn request: teasing is earned at friend
 * stage, never on a first call, a low caller, a heavy moment or a crisis, and
 * once the caller pushes back on a tease it is gone for the rest of the call.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PLAYFUL_LINE } from '../ferni-playful.js';
import { PRAISE_TEASE } from '../honest-friend.js';
import {
  DROPPED_TEASE_NOTE,
  FRIEND_STAGE_CALLS,
  isTeasePushback,
  NO_TEASE_NOTE,
  OWN_TEASE_NOTE,
  PLAYFUL_TEASE,
  TEASE_OK_NOTE,
} from '../tease-gate.js';
import { withTurnReminder } from '../turn-request.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A call so far: caller and Ferni alternating, caller first. */
const call = (...turns: string[]): llm.ChatContext => {
  const c = llm.ChatContext.empty();
  turns.forEach((t, i) => c.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: t }));
  return c;
};
const reminderOf = (c: llm.ChatContext): string =>
  (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';
const sent = (session: object, ...turns: string[]): string =>
  reminderOf(withTurnReminder(call(...turns), session));

const caller = (totalConversations: number, isReturningUser = totalConversations > 0) => ({
  userData: {
    userId: 'u-1517',
    isReturningUser,
    services: { userProfile: { totalConversations } },
  },
});
const friend = () => caller(FRIEND_STAGE_CALLS + 2);
const firstCall = () => caller(0, false);

const PRAISE_BAIT = "I'm basically a genius, right?";
const LIGHT = 'We went to the lake this weekend';
const ANY_TEASE_NOTE = [TEASE_OK_NOTE, NO_TEASE_NOTE, OWN_TEASE_NOTE, DROPPED_TEASE_NOTE];

describe('the teasing permissions the gate cuts', () => {
  it('are really in the notes it filters', () => {
    expect(PLAYFUL_LINE).toContain(PLAYFUL_TEASE);
    vi.stubEnv('HONEST_FRIEND', 'on');
    expect(sent(firstCall(), PRAISE_BAIT)).toContain(PRAISE_TEASE);
  });
});

describe('TEASE_GATE off', () => {
  it('leaves the reminder as it was: permissions kept, no tease note', () => {
    vi.stubEnv('HONEST_FRIEND', 'on');
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    const praise = sent(firstCall(), PRAISE_BAIT);
    const playful = sent(firstCall(), LIGHT);
    expect(praise).toContain(PRAISE_TEASE);
    expect(playful).toContain(PLAYFUL_LINE);
    for (const note of ANY_TEASE_NOTE) {
      expect(praise).not.toContain(note);
      expect(playful).not.toContain(note);
    }
    // Pushback reads as nothing with the flag off.
    expect(
      sent(friend(), 'tell me a joke', 'Your haircut has opinions.', "Hey, that's mean.")
    ).not.toContain(OWN_TEASE_NOTE);
  });
});

describe('TEASE_GATE on', () => {
  const on = () => {
    vi.stubEnv('TEASE_GATE', 'on');
    vi.stubEnv('HONEST_FRIEND', 'on');
    vi.stubEnv('FERNI_PLAYFUL', 'on');
  };

  it('first call: no tease permission anywhere, "no teasing today" instead', () => {
    on();
    const praise = sent(firstCall(), PRAISE_BAIT);
    const playful = sent(firstCall(), LIGHT);
    for (const r of [praise, playful]) {
      expect(r).toContain(NO_TEASE_NOTE);
      expect(r).not.toContain(TEASE_OK_NOTE);
      expect(r).not.toContain(PRAISE_TEASE);
      expect(r).not.toContain(PLAYFUL_TEASE);
    }
    // The rest of each note still rides, so only the permission was cut.
    expect(praise).toMatch(/They're fishing for praise/);
    expect(playful).toMatch(/be a little playful: a small opinion of your own/);
  });

  it('not yet friend stage: no permission either', () => {
    on();
    const r = sent(caller(FRIEND_STAGE_CALLS - 1), LIGHT);
    expect(r).toContain(NO_TEASE_NOTE);
    expect(r).not.toContain(PLAYFUL_TEASE);
  });

  it('friend stage and a light moment: the permission is there, kept to their jokes', () => {
    on();
    const praise = sent(friend(), PRAISE_BAIT);
    const playful = sent(friend(), LIGHT);
    for (const r of [praise, playful]) {
      expect(r).toContain(TEASE_OK_NOTE);
      expect(r).not.toContain(NO_TEASE_NOTE);
    }
    expect(TEASE_OK_NOTE).toMatch(/only about something they joked about first/);
    expect(praise).toContain(PRAISE_TEASE);
    expect(playful).toContain(PLAYFUL_LINE);
  });

  it('friend stage but they sound low: no permission', () => {
    on();
    const r = sent(friend(), "Honestly I'm exhausted, I can't be bothered with anything.");
    expect(r).not.toContain(TEASE_OK_NOTE);
    expect(r).toContain(NO_TEASE_NOTE);
    // Low two turns ago still counts.
    const earlier = sent(
      friend(),
      "I'm drained lately.",
      'That sounds heavy.',
      'Anyway.',
      'Mm.',
      LIGHT
    );
    expect(earlier).not.toContain(TEASE_OK_NOTE);
  });

  it('friend stage but a heavy moment: no permission, even on a light follow-up', () => {
    on();
    const r = sent(friend(), 'My dad died last week.', "I'm so sorry.", 'haha anyway');
    expect(r).not.toContain(TEASE_OK_NOTE);
    expect(r).toContain(NO_TEASE_NOTE);
    // The praise note still rides the light follow-up, without its teasing permission.
    const praise = sent(friend(), 'My dad died last week.', "I'm so sorry.", PRAISE_BAIT);
    expect(praise).toMatch(/They're fishing for praise/);
    expect(praise).not.toContain(PRAISE_TEASE);
    expect(praise).toContain(NO_TEASE_NOTE);
  });

  it('crisis guidance: no permission and no tease note at all', () => {
    on();
    const r = reminderOf(withTurnReminder(call(PRAISE_BAIT), friend(), { shape: false }));
    for (const note of ANY_TEASE_NOTE) expect(r).not.toContain(note);
    expect(r).not.toContain(PRAISE_TEASE);
  });

  it('pushback: own it now, and the drop note persists for the rest of the call', () => {
    on();
    const session = friend();
    const turns = ['I burned the toast again', 'Chef of the year, clearly.'];
    const now = sent(session, ...turns, "Hey, that's mean.");
    expect(now).toContain(OWN_TEASE_NOTE);
    expect(now).not.toContain(TEASE_OK_NOTE);
    // Later turns on the same call: dropped, no permission, even on light, friend-stage turns.
    const later = [...turns, "Hey, that's mean.", 'Fair, my bad.'];
    const next = sent(session, ...later, LIGHT);
    expect(next).toContain(DROPPED_TEASE_NOTE);
    expect(next).not.toContain(TEASE_OK_NOTE);
    expect(next).not.toContain(PLAYFUL_TEASE);
    const after = sent(session, ...later, LIGHT, 'Ha, nice.', PRAISE_BAIT);
    expect(after).toContain(DROPPED_TEASE_NOTE);
    expect(after).not.toContain(PRAISE_TEASE);
    // Another call (a new session) starts clean.
    expect(sent(friend(), LIGHT)).toContain(TEASE_OK_NOTE);
  });

  it('"hey, guess what" is not pushback', () => {
    on();
    const r = sent(friend(), 'I burned the toast again', 'Chef of the year.', 'Hey, guess what');
    expect(r).not.toContain(OWN_TEASE_NOTE);
    expect(r).toContain(TEASE_OK_NOTE);
  });
});

describe('isTeasePushback', () => {
  it('reads pushback on a tease', () => {
    for (const t of [
      "That's not funny.",
      "Hey, that's mean.",
      'Rude.',
      'Wow, rude!',
      'Not cool, man.',
      'Okay, that was uncalled for.',
      "You're being rude.",
      'Ouch. Low blow.',
      'That’s not funny, Ferni',
    ])
      expect(isTeasePushback(t), t).toBe(true);
  });

  it('precision first: someone else being rude, or words that only contain the cue, are not', () => {
    for (const t of [
      'Hey, guess what',
      'My boss was so rude today.',
      'He cut in line. So rude.',
      'What do you mean?',
      "I mean, it's fine.",
      "That's funny.",
      'Not funny how fast this week went.',
      'Rude people at work again.',
      'Meanwhile I finished the deck.',
    ])
      expect(isTeasePushback(t), t).toBe(false);
  });
});

/**
 * Prod sweep 2026-10-21: "Morning, Sam…" then, a reply later, "I'm Ferni, by
 * the way. What should I call you?" (4 of 16 first calls, judge conduct 1).
 * The first-call note asked for a name swap while the call already had the
 * name. Once the name is known by any path, no turn may suggest it.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';

import { accountName, callerNameKnown } from '../caller-name-known.js';
import { FIRST_CALL_NOTE, NAME_SWAP_NOTE, WHO_NOTE, firstCallNote } from '../first-call-rapport.js';
import { withTurnReminder } from '../turn-request.js';

const ON = { FIRST_CALL_RAPPORT: 'on' };
// A member on a first call: the signed canary caller (prod canary 2026-10-21, same bug).
// Since #2029 isFirstCall is member-only, so an anon:<uuid> caller (the morning sweep) gets no
// first-call note at all; see the last test in this block.
const MEMBER = 'voice-eval-first-call-seed-20261021070248-ca96';
const ANON = 'anon:906ab27b-fc51-48bd-8a51-b25c781ab6b4';
const SWAP = /swap names|what should i call you|ask theirs/i;

function chat(...lines: Array<['agent' | 'user', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  for (const [who, text] of lines)
    ctx.addMessage({ role: who === 'agent' ? 'assistant' : 'user', content: text });
  return ctx;
}

const firstCall = (extra: Record<string, unknown> = {}) => ({
  userData: { userId: MEMBER, isReturningUser: false, ...extra },
});

// late-night-energy-cs02 on prod, the reply that said "I'm Ferni, by the way, what should I call you?"
const lateNight = chat(
  ['agent', 'Hey Sam, burning the midnight oil again?'],
  ['user', 'Hey Ferni, you still up?']
);
const LATE_WORDS = 'Hey Ferni, you still up?';

describe('first-call note once the name is known', () => {
  it('pre: with no name, the swap is still suggested (the path fires)', () => {
    expect(firstCallNote(lateNight, firstCall(), LATE_WORDS, ON)).toContain(NAME_SWAP_NOTE);
  });

  it('the name from the dispatch metadata (userName) stops the swap', () => {
    const note = firstCallNote(lateNight, firstCall({ userName: 'Sam' }), LATE_WORDS, ON);
    expect(note).toBe(FIRST_CALL_NOTE);
    expect(note).not.toMatch(SWAP);
  });

  it.each([
    ['preferredName', { services: { userProfile: { preferredName: 'Sam' } } }],
    ['profile name', { services: { userProfile: { name: 'Sam' } } }],
    ['userData.name', { name: 'Sam' }],
  ])('the name from the %s stops the swap', (_, extra) => {
    expect(firstCallNote(lateNight, firstCall(extra), LATE_WORDS, ON)).toBe(FIRST_CALL_NOTE);
  });

  it('a name said earlier in the call stops it', () => {
    const ctx = chat(
      ['agent', 'Hey, how is your night going?'],
      ['user', "Hi. I'm Jess, by the way."],
      ['agent', 'Nice to meet you.'],
      ['user', 'Long day.']
    );
    expect(firstCallNote(ctx, firstCall(), 'Long day.', ON)).toBe(FIRST_CALL_NOTE);
  });

  it('a name said this turn stops it', () => {
    const words = "Hi there, I'm Jess. Not sure how this works.";
    expect(firstCallNote(lateNight, firstCall(), words, ON)).toBe(FIRST_CALL_NOTE);
  });

  it('script-free: no swap in the persona name either', () => {
    const named = firstCallNote(lateNight, firstCall({ userName: 'Sam' }), LATE_WORDS, ON, true);
    expect(named).toBe(FIRST_CALL_NOTE);
    expect(firstCallNote(lateNight, firstCall(), LATE_WORDS, ON, true)).toMatch(SWAP);
  });

  // overlap-reply-start-cs10: the intro came on the second reply, after "Hey Sam, what's on your mind".
  it('stays off on a later early reply too', () => {
    const ctx = chat(
      ['agent', "Hey Sam, what's on your mind this morning?"],
      ['user', 'Hey Ferni, so where did you grow up?'],
      ['agent', 'Yeah, I grew up out in Wyoming.'],
      ['user', 'Huh, cool. What was it like there as a kid?']
    );
    const words = 'Huh, cool. What was it like there as a kid?';
    expect(firstCallNote(ctx, firstCall(), words, ON)).toContain(NAME_SWAP_NOTE);
    expect(firstCallNote(ctx, firstCall({ userName: 'Sam' }), words, ON)).toBe(FIRST_CALL_NOTE);
  });

  it.each(['the user', 'Visitor', '(unknown - will ask)', ' ', 'anonymous'])(
    'a placeholder (%j) is not a name: the swap stays',
    (userName) => {
      expect(firstCallNote(lateNight, firstCall({ userName }), LATE_WORDS, ON)).toContain(
        NAME_SWAP_NOTE
      );
    }
  );

  // #1933's intro path (FIRST_CALL_INTRO): the demo room's "Visitor" is not a name either.
  it('intro on: "Visitor" still counts as no name, a real one stops the swap', () => {
    const INTRO = { ...ON, FIRST_CALL_INTRO: 'on' };
    const visitor = firstCallNote(lateNight, firstCall({ userName: 'Visitor' }), LATE_WORDS, INTRO);
    expect(visitor).toContain(WHO_NOTE);
    expect(visitor).toContain(NAME_SWAP_NOTE);
    const named = firstCallNote(lateNight, firstCall({ userName: 'Sam' }), LATE_WORDS, INTRO);
    expect(named).toContain(WHO_NOTE);
    expect(named).not.toMatch(SWAP);
  });

  it('a teammate named in a greeting is not their name', () => {
    expect(callerNameKnown(lateNight, firstCall().userData, LATE_WORDS)).toBe(false);
  });

  it('an anon: caller is not a member, so no first-call note and no swap (#2029)', () => {
    const anon = { userData: { userId: ANON, isReturningUser: false, userName: 'Sam' } };
    expect(firstCallNote(lateNight, anon, LATE_WORDS, ON)).toBe('');
  });

  it('accountName prefers the preferred name', () => {
    const userData = { userName: 'Samuel', services: { userProfile: { preferredName: 'Sam' } } };
    expect(accountName(userData)).toBe('Sam');
    expect(accountName({ userName: 'the user' })).toBeUndefined();
  });
});

describe('the per-turn reminder (turn-request.ts) on a named first call', () => {
  const before = process.env.FIRST_CALL_RAPPORT;
  afterEach(() => {
    if (before === undefined) delete process.env.FIRST_CALL_RAPPORT;
    else process.env.FIRST_CALL_RAPPORT = before;
  });

  const reminder = (session: object): string => {
    const last = withTurnReminder(lateNight, session).items.at(-1);
    return last?.type === 'message' ? (last.textContent ?? '') : '';
  };

  it('pre: unnamed, the reminder carries the swap; named, it does not', () => {
    process.env.FIRST_CALL_RAPPORT = 'on';
    expect(reminder(firstCall())).toContain(NAME_SWAP_NOTE);
    const named = reminder(firstCall({ userName: 'Sam' }));
    expect(named).toContain(FIRST_CALL_NOTE);
    expect(named).not.toMatch(/what should i call you|swap names/i);
  });
});

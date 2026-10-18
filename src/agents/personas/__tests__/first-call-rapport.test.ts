import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

import {
  FIRST_CALL_NOTE,
  FIRST_GOODBYE_NOTE,
  NAME_SWAP_NOTE,
  WHO_NOTE,
  firstCallNote,
  isFirstCall,
} from '../first-call-rapport.js';
import { withTurnReminder } from '../turn-request.js';

const ON = { FIRST_CALL_RAPPORT: 'on' };
const firstCall = { userData: { userId: 'u1', isReturningUser: false } };

function chat(...lines: Array<['agent' | 'user', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  for (const [who, text] of lines)
    ctx.addMessage({ role: who === 'agent' ? 'assistant' : 'user', content: text });
  return ctx;
}

describe('isFirstCall', () => {
  it('is a known account with no past calls', () => {
    expect(isFirstCall({ userId: 'u1', isReturningUser: false })).toBe(true);
  });
  it('is not a returning caller, an anonymous caller or an unknown state', () => {
    expect(isFirstCall({ userId: 'u1', isReturningUser: true })).toBe(false);
    expect(isFirstCall({ userId: 'anonymous', isReturningUser: false })).toBe(false);
    expect(isFirstCall({ isReturningUser: false })).toBe(false);
    expect(isFirstCall({ userId: 'u1' })).toBe(false);
  });
});

describe('firstCallNote', () => {
  const opening = chat(['agent', 'Hey, how is your evening?'], ['user', 'Pretty quiet.']);

  it('adds nothing with the flag off', () => {
    expect(firstCallNote(opening, firstCall, 'Pretty quiet.', {})).toBe('');
  });

  it('adds nothing for a returning caller', () => {
    const returning = { userData: { userId: 'u1', isReturningUser: true } };
    expect(firstCallNote(opening, returning, 'Pretty quiet.', ON)).toBe('');
  });

  it('suggests a name swap early in a first call', () => {
    const note = firstCallNote(opening, firstCall, 'Pretty quiet.', ON);
    expect(note).toContain(FIRST_CALL_NOTE);
    expect(note).toContain(NAME_SWAP_NOTE);
  });

  it('stops suggesting it once Ferni has asked their name', () => {
    const asked = chat(
      ['agent', 'Hey.'],
      ['user', 'Hi.'],
      ['agent', "I'm Ferni, by the way. What should I call you?"],
      ['user', 'Priya.']
    );
    expect(firstCallNote(asked, firstCall, 'Priya.', ON)).toBe(FIRST_CALL_NOTE);
  });

  it('stops suggesting it after the first few replies', () => {
    const later = chat(
      ['agent', 'Hey.'],
      ['user', 'a'],
      ['agent', 'b'],
      ['user', 'c'],
      ['agent', 'd'],
      ['user', 'e'],
      ['agent', 'f'],
      ['user', 'g'],
      ['agent', 'h'],
      ['user', 'i']
    );
    expect(firstCallNote(later, firstCall, 'i', ON)).toBe(FIRST_CALL_NOTE);
  });

  it('asks for a goodbye with a reason to come back when they are leaving', () => {
    expect(firstCallNote(opening, firstCall, 'Okay, I gotta go. Talk soon.', ON)).toBe(
      FIRST_GOODBYE_NOTE
    );
  });

  it('does not take "bye" inside another word as leaving', () => {
    expect(firstCallNote(opening, firstCall, 'We drove by the bayou.', ON)).not.toBe(
      FIRST_GOODBYE_NOTE
    );
  });

  // Both fired the goodbye note mid-story on the old pattern (dev hunt, 2026-10-18).
  it.each([
    'I need to go back to the hospital after work tonight',
    'I have to run errands all weekend',
    'We can talk later about the move, it is a lot.',
    'I have to go to the dentist tomorrow.',
  ])('a plan mid-story is not leaving: %s', (said) => {
    expect(firstCallNote(opening, firstCall, said, ON)).toContain(FIRST_CALL_NOTE);
    expect(firstCallNote(opening, firstCall, said, ON)).not.toBe(FIRST_GOODBYE_NOTE);
  });

  it.each([
    'Okay, I gotta go. Talk soon.',
    'Alright, bye!',
    'Thanks Ferni, talk to you later.',
    'I should probably head out.',
    'Look, I should probably head out, thanks for listening.',
    'I need to go now, my bus is here.',
    "Okay I'll let you go.",
    'I should let you go',
  ])('a real goodbye still is: %s', (said) => {
    expect(firstCallNote(opening, firstCall, said, ON)).toBe(FIRST_GOODBYE_NOTE);
  });

  it('never suggests a name swap when the account already has their name', () => {
    const named = { userData: { userId: 'u1', isReturningUser: false, userName: 'Sam' } };
    expect(firstCallNote(opening, named, 'Pretty quiet.', ON)).toBe(FIRST_CALL_NOTE);
    const profiled = {
      userData: {
        userId: 'u1',
        isReturningUser: false,
        services: { userProfile: { name: 'Sam' } },
      },
    };
    expect(firstCallNote(opening, profiled, 'Pretty quiet.', ON)).toBe(FIRST_CALL_NOTE);
    const blank = { userData: { userId: 'u1', isReturningUser: false, userName: ' ' } };
    expect(firstCallNote(opening, blank, 'Pretty quiet.', ON)).toContain(NAME_SWAP_NOTE);
  });
});

describe('FIRST_CALL_INTRO: "what is this?" and "who are you?"', () => {
  const opening = chat(['agent', "Hi Sam, it's Ferni."], ['user', 'What is this, exactly?']);
  const BOTH = { ...ON, FIRST_CALL_INTRO: 'on' };

  it('off: no plain-answer note', () => {
    expect(firstCallNote(opening, firstCall, 'What is this, exactly?', ON)).not.toContain(WHO_NOTE);
  });

  it('on: one plain sentence, no team or pitch, then back to them', () => {
    const note = firstCallNote(opening, firstCall, 'What is this, exactly?', BOTH);
    expect(note).toContain(FIRST_CALL_NOTE);
    expect(note).toContain(WHO_NOTE);
    expect(WHO_NOTE).toMatch(/one sentence/);
    expect(WHO_NOTE).toMatch(/No team/);
    expect(WHO_NOTE).toMatch(/turn back to them/);
  });

  it('on its own, without FIRST_CALL_RAPPORT, and only on a first call', () => {
    const introOnly = { FIRST_CALL_INTRO: 'on' };
    expect(firstCallNote(opening, firstCall, 'So, who are you?', introOnly)).toBe(WHO_NOTE);
    const returning = { userData: { userId: 'u1', isReturningUser: true } };
    expect(firstCallNote(opening, returning, 'So, who are you?', BOTH)).toBe('');
  });
});

describe('withTurnReminder on a first call', () => {
  it('carries the first-call note only when FIRST_CALL_RAPPORT is on', () => {
    const ctx = chat(['agent', 'Hey.'], ['user', 'Hi there.']);
    const before = process.env.FIRST_CALL_RAPPORT;
    try {
      delete process.env.FIRST_CALL_RAPPORT;
      const off = withTurnReminder(ctx, firstCall).items.at(-1);
      expect(off?.type === 'message' && off.textContent).not.toContain(NAME_SWAP_NOTE);
      process.env.FIRST_CALL_RAPPORT = 'on';
      const on = withTurnReminder(ctx, firstCall).items.at(-1);
      expect(on?.type === 'message' && on.textContent).toContain(NAME_SWAP_NOTE);
    } finally {
      if (before === undefined) delete process.env.FIRST_CALL_RAPPORT;
      else process.env.FIRST_CALL_RAPPORT = before;
    }
  });

  it('carries the plain who-am-I answer only when FIRST_CALL_INTRO is on', () => {
    const ctx = chat(['agent', "Hi Sam, it's Ferni."], ['user', 'So, who are you?']);
    const before = process.env.FIRST_CALL_INTRO;
    try {
      delete process.env.FIRST_CALL_INTRO;
      const off = withTurnReminder(ctx, firstCall).items.at(-1);
      expect(off?.type === 'message' && off.textContent).not.toContain(WHO_NOTE);
      process.env.FIRST_CALL_INTRO = 'on';
      const on = withTurnReminder(ctx, firstCall).items.at(-1);
      expect(on?.type === 'message' && on.textContent).toContain(WHO_NOTE);
    } finally {
      if (before === undefined) delete process.env.FIRST_CALL_INTRO;
      else process.env.FIRST_CALL_INTRO = before;
    }
  });
});

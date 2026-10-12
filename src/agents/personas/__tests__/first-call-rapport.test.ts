import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

import {
  FIRST_CALL_NOTE,
  FIRST_GOODBYE_NOTE,
  NAME_SWAP_NOTE,
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
});

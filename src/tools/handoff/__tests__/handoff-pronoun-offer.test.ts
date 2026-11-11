/**
 * A yes to an offer Ferni made by pronoun (#3755, HANDOFF_HELD_TRUTHFUL).
 *
 * On a prod call the caller asked what Alex was up to, Ferni offered to "wake him up
 * and bring him in", the caller said "Sure.", and the ask-first gate held the handoff:
 * a yes counted only when Ferni's last line said the teammate's name. A minute later
 * Ferni offered Maya by name, the same "Sure" passed, and that handoff ran.
 */
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { handoffConsent, holdUnaskedHandoff } from '../handoff-consent.js';

type Turn = ['user' | 'assistant', string];

function chat(...turns: Turn[]): llm.ChatContext {
  const ctx = new llm.ChatContext();
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const ON = { HANDOFF_HELD_TRUTHFUL: 'on' };

/** Steps 2 and 3 of the call, verbatim */
const ASKED_ABOUT_ALEX: Turn = ['user', "Hey, what's Alex up to?"];
const PRONOUN_OFFER: Turn = [
  'assistant',
  "Well, he's probably fast asleep right now, but he's usually ready to jump in. Did you want me to wake him up and bring him in?",
];
const SURE: Turn = ['user', 'Sure.'];

const theCall = (...before: Turn[]) => chat(...before, ASKED_ABOUT_ALEX, PRONOUN_OFFER, SURE);

describe('a yes to a pronoun offer of the one teammate just named', () => {
  it('on: agrees to Alex, the teammate the caller named, and not to Maya', () => {
    expect(handoffConsent(theCall(), 'Alex Chen', ON)).toBe('agreed');
    expect(handoffConsent(theCall(), 'Maya Santos', ON)).toBe('none');
  });

  it('on: agrees with step 1 of the call before it (Ferni had already named Alex)', () => {
    const ctx = theCall(
      ['user', "what's on the to-do list?"],
      ['assistant', "Let me grab Alex. He's got your whole list."],
      ['assistant', 'Actually, here it is: call the plumber, and pick up the dry cleaning.']
    );
    expect(handoffConsent(ctx, 'Alex Chen', ON)).toBe('agreed');
  });

  it('off: unchanged, the yes does not count', () => {
    expect(handoffConsent(theCall(), 'Alex Chen', {})).toBe('none');
    expect(handoffConsent(theCall(), 'Alex Chen', { HANDOFF_HELD_TRUTHFUL: 'off' })).toBe('none');
  });

  it('on: a no in the reply still wins ("Sure, but not now")', () => {
    const ctx = chat(ASKED_ABOUT_ALEX, PRONOUN_OFFER, ['user', 'Sure, but not now']);
    expect(handoffConsent(ctx, 'Alex Chen', ON)).toBe('none');
  });

  it('on: two teammates named lately, so the yes is for no one', () => {
    const ctx = chat(
      ['user', 'Who could help me plan the move, Alex or Maya?'],
      ['assistant', 'Either would be great with that. Want me to bring them in?'],
      ['user', 'Sure.']
    );
    expect(handoffConsent(ctx, 'Alex Chen', ON)).toBe('none');
    expect(handoffConsent(ctx, 'Maya Santos', ON)).toBe('none');
  });

  it('on: a yes after an offer of a different teammate is not a yes to Alex (step 5)', () => {
    const ctx = chat(
      ASKED_ABOUT_ALEX,
      PRONOUN_OFFER,
      ['user', 'Hmm.'],
      ['assistant', "Maya's around though, and she's great with this. I can bring her in."],
      ['user', 'Sure.']
    );
    expect(handoffConsent(ctx, 'Alex Chen', ON)).toBe('none');
    expect(handoffConsent(ctx, 'Maya Santos', ON)).toBe('agreed');
  });

  it('on: a pronoun with no offer is not an offer ("He\'s probably asleep.")', () => {
    const ctx = chat(ASKED_ABOUT_ALEX, ['assistant', "He's probably asleep."], ['user', 'Okay']);
    expect(handoffConsent(ctx, 'Alex Chen', ON)).toBe('none');
  });

  it('on: a name said only far back does not count', () => {
    const ctx = chat(
      ASKED_ABOUT_ALEX,
      ['assistant', "He's around somewhere. How was the trip, by the way?"],
      ['user', 'Long, but good.'],
      ['assistant', 'Glad you made it back in one piece.'],
      ['user', 'Me too. My brother picked me up.'],
      ['assistant', 'That was kind of him. Want me to bring him in?'],
      ['user', 'Sure.']
    );
    expect(handoffConsent(ctx, 'Alex Chen', ON)).toBe('none');
  });
});

describe('holdUnaskedHandoff on the call', () => {
  it('lets the handoff to Alex run with HANDOFF_ASK_FIRST and HANDOFF_HELD_TRUTHFUL on', () => {
    const runCtx = { session: { history: theCall() } };
    const env = { HANDOFF_ASK_FIRST: 'on', HANDOFF_HELD_TRUTHFUL: 'on' };
    expect(holdUnaskedHandoff(runCtx, 'Alex Chen', false, env)).toBeNull();
  });

  it('still holds it with HANDOFF_HELD_TRUTHFUL off, as on the call', () => {
    const runCtx = { session: { history: theCall() } };
    expect(holdUnaskedHandoff(runCtx, 'Alex Chen', false, { HANDOFF_ASK_FIRST: 'on' })).toEqual(
      expect.objectContaining({ unavailable: true })
    );
  });
});

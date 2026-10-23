/**
 * CALL_ME_VOCATIVE through the live path: withTurnReminder (turn-request.ts)
 * is what each LLM request carries, and the caller's rename happens there too
 * (name-correction.ts).
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { callMeNote } from '../call-me-note.js';
import { withTurnReminder } from '../turn-request.js';

vi.mock('../../../memory/firestore-store.js', () => ({
  getFirestoreStore: () => ({ atomicProfileUpdate: vi.fn(async () => null) }),
}));

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

function chat(said: string, opts: { called?: boolean } = {}): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'assistant', content: 'Hey Sam, good to hear you.' });
  if (opts.called) {
    ctx.insert(
      llm.FunctionCall.create({ callId: 'c1', name: 'callUser', args: '{"message":"hi"}' })
    );
  }
  ctx.addMessage({ role: 'user', content: said });
  return ctx;
}

function call(personaId = 'ferni') {
  return {
    userData: { userId: 'u1', userName: 'Sam', personaId, services: { sessionId: 's-vocative' } },
  };
}

/** The reminder text the request carries for this turn. */
function reminder(said: string, session = call(), opts: { called?: boolean } = {}): string {
  const last = withTurnReminder(chat(said, opts), session).items.at(-1);
  return last?.type === 'message' ? (last.textContent ?? '') : '';
}

describe('withTurnReminder with CALL_ME_VOCATIVE', () => {
  it.each(['Can you call me Fern?', 'Can you call me, Ferni?', 'call me Fernie'])(
    '%j asks for callUser in this reply',
    (said) => {
      process.env.CALL_ME_VOCATIVE = 'on';
      expect(reminder(said)).toContain('Call callUser in this reply');
    }
  );

  it('Maya hears "call me, Maya" as a call too', () => {
    process.env.CALL_ME_VOCATIVE = 'on';
    expect(reminder('Call me, Maya.', call('maya-santos'))).toContain('Call callUser');
  });

  it('"Did you give me a call?" offers to ring when no call was placed', () => {
    process.env.CALL_ME_VOCATIVE = 'on';
    expect(reminder('Did you give me a call?')).toContain('offer to ring their phone now');
    expect(reminder('Did you give me a call?', call(), { called: true })).not.toContain(
      'offer to ring'
    );
  });

  it.each(['Did you call me, Ferni?', 'did you call me Ferni?'])(
    '%j never asks for a call, and offers one only if none was placed',
    (said) => {
      process.env.CALL_ME_VOCATIVE = 'on';
      const before = reminder(said);
      expect(before).not.toContain('Call callUser in this reply');
      expect(before).toContain('offer to ring their phone now');
      const after = reminder(said, call(), { called: true });
      expect(after).not.toContain('Call callUser in this reply');
      expect(after).not.toContain('offer to ring');
    }
  );

  it('"call me, Ferni" after a placed call says it already rang, never a second call', () => {
    process.env.CALL_ME_VOCATIVE = 'on';
    const text = reminder('Can you call me, Ferni?', call(), { called: true });
    expect(text).not.toContain('Call callUser in this reply');
    expect(text).toContain('You already called their phone on this call');
  });

  it('a nickname cue gets one short question, not a guess', () => {
    process.env.CALL_ME_VOCATIVE = 'on';
    expect(reminder('you can call me Fern')).toContain('On your phone?');
  });

  it.each([
    'call me Sam',
    'call me later',
    'call me crazy',
    'you can call me Seth',
    'did you call my mom?',
  ])('%j gets no call-me line', (said) => {
    process.env.CALL_ME_VOCATIVE = 'on';
    const text = reminder(said);
    expect(text).not.toContain('callUser');
    expect(text).not.toContain('ring their phone');
  });

  it('never rides crisis guidance', () => {
    process.env.CALL_ME_VOCATIVE = 'on';
    const ctx = chat('Can you call me Fern?');
    expect(callMeNote(ctx, call(), 'Can you call me Fern?')).toContain('Call callUser');
    expect(callMeNote(ctx, call(), 'Can you call me Fern?', { careful: true })).toBe('');
  });

  it('with the flag off nothing changes', () => {
    delete process.env.CALL_ME_VOCATIVE;
    for (const said of [
      'Can you call me Fern?',
      'Did you give me a call?',
      'you can call me Fern',
    ]) {
      const text = reminder(said);
      expect(text).not.toContain('callUser');
      expect(text).not.toContain('ring their phone');
    }
  });
});

describe('the rename path (NAME_CORRECTION=on)', () => {
  it('"Can you call me Fern?" renames the caller with the flag off, and not with it on', () => {
    process.env.NAME_CORRECTION = 'on';
    delete process.env.CALL_ME_VOCATIVE;
    const off = call();
    reminder('Can you call me Fern?', off);
    expect(off.userData.userName).toBe('Fern'); // the prod bug, flag off

    process.env.CALL_ME_VOCATIVE = 'on';
    const on = call();
    reminder('Can you call me Fern?', on);
    expect(on.userData.userName).toBe('Sam');

    // A real name still renames with the flag on.
    const seth = call();
    reminder('you can call me Seth', seth);
    expect(seth.userData.userName).toBe('Seth');
  });
});

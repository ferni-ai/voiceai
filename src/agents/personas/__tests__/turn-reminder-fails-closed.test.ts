/**
 * One note builder that throws drops that note and no other (#3077). #3061 wrapped the whole
 * reminder in a single catch that returned the bare request, so a throwing builder also cost the
 * turn its owner and privacy notes: an unverified caller was then answered with no guard. Now an
 * identity note that can't be built is replaced by the unverified-speaker default.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fail = vi.hoisted(() => ({ owner: false, other: false, outer: false, callMe: false }));
vi.mock('../../../utils/minor-care.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  minorCareNote: () => {
    if (fail.owner) throw new Error('the owner check failed');
    return 'OWNER-CHECK-NOTE';
  },
}));
vi.mock('../call-me-note.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  callMeNote: () => {
    if (fail.callMe) throw new Error('the owner check inside the call-me note failed');
    return 'CALL-ME-NOTE';
  },
}));
vi.mock('../../../tools/handoff/team-by-need-note.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  teamByNeedNote: () => {
    if (fail.other) throw new Error('an ordinary note failed');
    return 'ORDINARY-NOTE';
  },
}));
vi.mock('../../../tools/handoff/locked-teammates.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../tools/handoff/locked-teammates.js')>();
  return {
    ...actual,
    unlockViewFor: (userData: unknown) => {
      if (fail.outer) throw new Error('the reminder failed outside any note');
      return actual.unlockViewFor(userData);
    },
  };
});

const { withTurnReminder } = await import('../turn-request.js');
const { UNVERIFIED_SPEAKER_NOTE } = await import('../turn-note-guard.js');
const { gatedReply } = await import('../crisis-gate.js');
const { TURN_CONTEXT_HEADER } = await import('../../multi-agent/turn-intelligence.js');

const STALE = `${TURN_CONTEXT_HEADER} STALE-STEERING`;

function request(): llm.ChatContext {
  const c = llm.ChatContext.empty();
  c.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
  c.addMessage({ role: 'user', content: STALE });
  c.addMessage({ role: 'user', content: 'long day, honestly' });
  return c;
}
const text = (ctx: llm.ChatContext): string =>
  ctx.items.map((i) => (i as { textContent?: string }).textContent ?? '').join('\n');

beforeEach(() => {
  fail.owner = false;
  fail.other = false;
  fail.outer = false;
  fail.callMe = false;
});

describe('a failing note never drops the owner check (#3077)', () => {
  it('nothing throwing: every note rides and no unverified default is added', () => {
    const out = text(withTurnReminder(request(), {}));
    expect(out).toContain('OWNER-CHECK-NOTE');
    expect(out).toContain('ORDINARY-NOTE');
    expect(out).not.toContain(UNVERIFIED_SPEAKER_NOTE);
  });

  it('the owner-note builder throws: the unverified default rides, and the other notes still apply', () => {
    fail.owner = true;
    const out = text(withTurnReminder(request(), {}));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).not.toContain('OWNER-CHECK-NOTE');
    expect(out).toContain('ORDINARY-NOTE');
    expect(out).not.toContain('STALE-STEERING');
  });

  it('the call-me note takes the owner check; when it throws the unverified default rides', () => {
    fail.callMe = true;
    const out = text(withTurnReminder(request(), {}));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).toContain('OWNER-CHECK-NOTE');
    expect(out).toContain('ORDINARY-NOTE');
  });

  it('another builder throws: only its note is dropped, the owner note stays', () => {
    fail.other = true;
    const out = text(withTurnReminder(request(), {}));
    expect(out).toContain('OWNER-CHECK-NOTE');
    expect(out).not.toContain('ORDINARY-NOTE');
    expect(out).not.toContain(UNVERIFIED_SPEAKER_NOTE);
  });

  it('both throw: the default rides in place of the owner note, the style and stale removal hold', () => {
    fail.owner = true;
    fail.other = true;
    const out = text(withTurnReminder(request(), {}));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).not.toContain('STALE-STEERING');
  });

  it('a failure outside every note: stale context still goes and the default still rides', () => {
    fail.outer = true;
    const out = text(withTurnReminder(request(), {}));
    expect(out).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(out).not.toContain('STALE-STEERING');
    expect(out).toContain('long day, honestly');
  });

  it('everything throws: the reply is still asked for, carrying the default and no stale context', async () => {
    fail.owner = true;
    fail.other = true;
    fail.outer = true;
    const model = vi.fn(
      async (_ctx: llm.ChatContext) =>
        new ReadableStream<string>({
          start(c) {
            c.enqueue('I hear you.');
            c.close();
          },
        })
    );
    const out = await gatedReply(
      request(),
      { userData: undefined } as never,
      model as never,
      { wrap: (s: unknown) => s } as never,
      { env: { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' } }
    );
    expect(model).toHaveBeenCalledTimes(1);
    const sent = text(model.mock.calls[0]![0]);
    expect(sent).toContain(UNVERIFIED_SPEAKER_NOTE);
    expect(sent).not.toContain('STALE-STEERING');
    let said = '';
    for await (const chunk of out as unknown as AsyncIterable<unknown>) said += String(chunk);
    expect(said).toContain('I hear you.');
  });
});

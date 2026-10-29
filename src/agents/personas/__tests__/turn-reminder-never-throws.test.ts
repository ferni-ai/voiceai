/**
 * A note builder that throws must never cost the turn its reply. 2026-10-29 an owner check
 * threw inside withTurnReminder on a crisis turn and gatedReply lost the crisis reply (#2996,
 * crisis-event-record.test.ts). withTurnReminder now falls back to the request as sent.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';

const notes = vi.hoisted(() => ({ throws: true, calls: 0 }));
vi.mock('../call-me-note.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  callMeNote: () => {
    notes.calls += 1;
    if (notes.throws) throw new Error('a note builder failed');
    return '';
  },
}));

const { withTurnReminder } = await import('../turn-request.js');
const { gatedReply } = await import('../crisis-gate.js');
const { buildCrisisGuidance, detectCrisis } = await import('../../safety/crisis-guard.js');
const { resetCrisisClassifierCache } =
  await import('../../../services/safety/crisis-classifier.js');

function request(said: string): llm.ChatContext {
  const c = llm.ChatContext.empty();
  c.addMessage({ role: 'assistant', content: 'Hey, good to hear you.' });
  c.addMessage({ role: 'user', content: said });
  return c;
}

const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const said = (stream: unknown) => async (): Promise<string> => {
  let out = '';
  for await (const chunk of stream as AsyncIterable<unknown>) out += String(chunk);
  return out;
};
const lastUser = (ctx: llm.ChatContext): string =>
  (
    ctx.items
      .filter((i) => i.type === 'message' && (i as llm.ChatMessage).role === 'user')
      .at(-1) as llm.ChatMessage
  ).textContent ?? '';

describe('withTurnReminder never throws', () => {
  it('a throwing note builder: the request as sent, not an exception', () => {
    const sent = request('long day, honestly');
    expect(withTurnReminder(sent, {})).toBe(sent);
  });

  it('with nothing throwing, the notes are added as before', () => {
    notes.throws = false;
    try {
      const sent = request('long day, honestly');
      expect(withTurnReminder(sent, {})).not.toBe(sent);
    } finally {
      notes.throws = true;
    }
  });

  it('gatedReply still asks the model and replies', async () => {
    const model = vi.fn(
      async () =>
        new ReadableStream<string>({
          start(c) {
            c.enqueue('I hear you.');
            c.close();
          },
        })
    );
    const out = await gatedReply(
      request('long day, honestly'),
      { userData: undefined } as never,
      model as never,
      { wrap: (s: unknown) => s } as never,
      { env: { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' } }
    );
    expect(model).toHaveBeenCalledTimes(1);
    let said = '';
    for await (const chunk of out as unknown as AsyncIterable<unknown>) said += String(chunk);
    expect(said).toContain('I hear you.');
  });
  it('a guided crisis turn keeps its guidance when a builder throws', async () => {
    resetCrisisClassifierCache();
    notes.calls = 0;
    const SAID = "I hope I don't wake up tomorrow";
    const model = vi.fn(
      async (_ctx: llm.ChatContext) =>
        new ReadableStream<string>({
          start(c) {
            c.enqueue('I am here with you.');
            c.close();
          },
        })
    );
    const out = await gatedReply(
      request(SAID),
      { userData: undefined } as never,
      model as never,
      { wrap: (s: unknown) => s } as never,
      { env: PATTERNS_ONLY }
    );
    expect(notes.calls).toBeGreaterThan(0); // the builder ran, and threw
    const sent = lastUser(model.mock.calls[0]![0]);
    expect(sent.startsWith(SAID)).toBe(true);
    expect(sent).toContain(buildCrisisGuidance(detectCrisis(SAID)));
    expect(await said(out)()).toContain('I am here with you.');
  });
});

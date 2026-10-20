/**
 * #1866 x #2045: "I'll call 911 for you" reads as a promise to call too
 * (action-promises.ts). With a call tool open, the promise path alone would
 * ask it back as an offer ("Want me to call 911?"), which Ferni can't do. The
 * guard judges an emergency claim first (action-claim-guard.ts judge), so the
 * promise path speaks the emergency line instead.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { claimedAction, emergencyClaim } from '../action-claims.js';
import { promisedAction } from '../action-promises.js';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { EMERGENCY_LINE } from '../emergency-claim.js';

initializeLogger({ pretty: false, level: 'warn' });

const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const streamOf = (...parts: string[]) =>
  new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts) c.enqueue({ id: 'r', delta: { role: 'assistant', content: p } });
      c.close();
    },
  });
// A call tool is open, so a call promise is "unkept" rather than "no tool".
const TOOLS = { functionTools: { quickText: {}, callOnBehalf: {} } };
async function reply(items: unknown[], ...parts: string[]): Promise<string> {
  const out = await withActionClaimCheck(streamOf(...parts), { items }, TOOLS, 'ferni', {});
  let text = '';
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) {
    text += c.delta?.content ?? '';
  }
  return text;
}

const CRISIS = user('My dad collapsed and he is not breathing.');
const LIGHT = user('Rough week, honestly. Tell me something good.');

describe('an emergency promise on the promise path', () => {
  it('"I\'ll call 911 for you." is a promise, a claim and an emergency claim at once', () => {
    // The precondition that makes the order matter: the promise path would take it.
    expect(promisedAction("I'll call 911 for you.")).toBe('call');
    expect(claimedAction("I'll call 911 for you.")).toBe('call');
    expect(emergencyClaim("I'll call 911 for you.")).toBe('called');
  });

  it.each([
    ['in a crisis', CRISIS],
    ['in light talk too', LIGHT],
  ])('gets the emergency line, never an offer to call, %s', async (_label, ask) => {
    const text = await reply([ask], "I'll call 911 for you.");
    expect(text).toBe(EMERGENCY_LINE);
    expect(text).not.toMatch(/want me to/i);
  });

  it('the emergency line goes out once, even with a second emergency promise', async () => {
    const text = await reply([CRISIS], "I'll call 911 for you. ", "I'll call an ambulance now.");
    expect(text).toBe(EMERGENCY_LINE);
  });
});

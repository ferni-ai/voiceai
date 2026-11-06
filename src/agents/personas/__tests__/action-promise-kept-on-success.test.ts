/**
 * ACTION_PROMISE_KEPT_ON_SUCCESS: a promise counts as kept by a tool run this
 * turn only when the run did not refuse or fail.
 *
 * The turn shape: the caller asks for a call, the call tool runs and refuses
 * ("I couldn't place that call ..."), and the model's reply still says "I'll
 * go ahead and call her." Off, any run of the kind keeps the promise, so it
 * stands. On, the promise is dropped and the caller hears that the call didn't
 * go through.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { withActionClaimCheck } from '../action-claim-guard.js';
import { CANT_SCHEDULE_CALL } from '../../../tools/domains/telephony/telephony.js';
import { kindsRunThisTurn } from '../action-promises.js';

initializeLogger({ pretty: false, level: 'warn' });

const ON = { ACTION_PROMISE_KEPT_ON_SUCCESS: 'on' };
const OFF = {};
// A promise, not a claim (action-claims.ts claimedAction reads "I'll call her right now." as a claim,
// which the guard already checks against the failed result).
const PROMISE = "I'll go ahead and call her.";
const RING = "I'll give her a ring.";

const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const ran = (callId: string, name: string, output: string, isError = false) => [
  llm.FunctionCall.create({ callId, name, args: '{}' }),
  llm.FunctionCallOutput.create({ callId, name, output, isError }),
];
const streamOf = (...parts: string[]) =>
  new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts) c.enqueue({ id: 'r', delta: { role: 'assistant', content: p } });
      c.close();
    },
  });
const tools = { functionTools: { callOnBehalf: {} } };
interface Tools {
  functionTools: Record<string, unknown>;
}
async function reply(items: unknown[], env: Record<string, string>, ...parts: string[]) {
  return replyWith(tools, items, env, ...parts);
}
async function replyWith(
  on: Tools,
  items: unknown[],
  env: Record<string, string>,
  ...parts: string[]
) {
  const out = await withActionClaimCheck(streamOf(...parts), { items }, on, undefined, env);
  const chunks: llm.ChatChunk[] = [];
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) chunks.push(c);
  return chunks.map((c) => c.delta?.content ?? '').join('');
}

const ASK = user('Can you call my mom Marla at 555-0142 and tell her I am running late?');
const REFUSED = [ASK, ...ran('c1', 'callOnBehalf', "I couldn't place that call: calls are off.")];
const ERRORED = [ASK, ...ran('c1', 'callOnBehalf', 'Twilio timeout', true)];
const PLACED = [ASK, ...ran('c1', 'callOnBehalf', 'Calling Marla now at 555-0142.')];

describe('ACTION_PROMISE_KEPT_ON_SUCCESS: only a run that went through keeps a promise', () => {
  it('on: a refused run this turn keeps no promise', () => {
    expect(kindsRunThisTurn({ items: REFUSED }, ON).has('call')).toBe(false);
    expect(kindsRunThisTurn({ items: ERRORED }, ON).has('call')).toBe(false);
  });

  it('off: any run of the kind keeps it, as main does', () => {
    expect(kindsRunThisTurn({ items: REFUSED }, OFF).has('call')).toBe(true);
    expect(kindsRunThisTurn({ items: ERRORED }, OFF).has('call')).toBe(true);
  });

  it('a run that went through keeps it, flag on or off', () => {
    expect(kindsRunThisTurn({ items: PLACED }, ON).has('call')).toBe(true);
    expect(kindsRunThisTurn({ items: PLACED }, OFF).has('call')).toBe(true);
  });

  it('on: a refused run before a later successful one in the same turn still counts the success', () => {
    const retried = [...REFUSED, ...ran('c2', 'callOnBehalf', 'Calling Marla now at 555-0142.')];
    expect(kindsRunThisTurn({ items: retried }, ON).has('call')).toBe(true);
  });

  it.each([PROMISE, RING])(
    'on: after a refused call, %j is dropped and the caller hears it failed',
    async (said) => {
      const text = await reply(REFUSED, ON, said);
      expect(text).not.toContain(said);
      expect(text).toMatch(/didn't go through/i);
    }
  );

  it('on: after an errored call, the same', async () => {
    const text = await reply(ERRORED, ON, PROMISE);
    expect(text).not.toContain(PROMISE);
    expect(text).toMatch(/didn't go through/i);
  });

  it.each([PROMISE, RING])('off: after a refused call, %j stands as main lets it', async (said) => {
    expect(await reply(REFUSED, OFF, said)).toBe(said);
  });

  it('on: after a call that went through, the promise stands', async () => {
    expect(await reply(PLACED, ON, PROMISE)).toBe(PROMISE);
  });
});

describe('ACTION_PROMISE_KEPT_ON_SUCCESS: a refused scheduleCallback keeps no call promise', () => {
  const phone = { functionTools: { scheduleCallback: {}, callOnBehalf: {} } };
  const refused = [
    user('Can you call my mom Marla back at five?'),
    ...ran('s1', 'scheduleCallback', CANT_SCHEDULE_CALL),
  ];

  it.each([ON, OFF])('%j: "I\'ll give her a ring." in the same reply is dropped', async (env) => {
    const text = await replyWith(phone, refused, env, RING);
    expect(text).not.toContain(RING);
  });
});

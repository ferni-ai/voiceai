/**
 * Prod call 2026-10-17 (build c20c77407): on the caller's yes to calling their
 * mom, Nayan said "Well, I'm placing the call now." The call-hours guard had
 * held the call until 9:00 AM her time, and the claim check let the line
 * through twice over: on the yes it let any claim stand ahead of the tool, and
 * the held result ("It's not a good hour ...") read as a call placed.
 *
 * The results here are the real ones deferred-calls.ts writes.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({ collection: () => ({ doc: () => ({ set: async () => undefined }) }) }),
    }),
  }),
}));

import {
  alreadySetReply,
  deferCall,
  deferredCallReply,
} from '../../../services/outreach/deferred-calls.js';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { callActions, claimedAction } from '../action-claims.js';

initializeLogger({ pretty: false, level: 'warn' });

const NOW = new Date('2026-10-17T14:42:27Z'); // 8:42 AM in Denver
const NINE = new Date('2026-10-17T15:00:00Z');
const LINE = "Well, I'm placing the call now.";

let n = 0;
const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const said = (content: string) => llm.ChatMessage.create({ role: 'assistant', content });
const result = (output: string) =>
  llm.FunctionCallOutput.create({
    callId: `c${++n}`,
    name: 'callOnBehalf',
    output,
    isError: false,
  });
const toolCall = (): llm.ChatChunk => ({
  id: 'r',
  delta: {
    role: 'assistant',
    toolCalls: [llm.FunctionCall.create({ callId: 'x', name: 'callOnBehalf', args: '{}' })],
  },
});
const streamOf = (...parts: Array<string | llm.ChatChunk>) =>
  new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts)
        c.enqueue(
          typeof p === 'string' ? { id: 'r', delta: { role: 'assistant', content: p } } : p
        );
      c.close();
    },
  });
const tools = { functionTools: { callOnBehalf: {} } };
async function run(items: unknown[], ...parts: Array<string | llm.ChatChunk>) {
  const out = await withActionClaimCheck(streamOf(...parts), { items }, tools, undefined, {});
  const chunks: llm.ChatChunk[] = [];
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) chunks.push(c);
  return {
    text: chunks.map((c) => c.delta?.content ?? '').join(''),
    calls: chunks.filter((c) => c.delta?.toolCalls?.length).length,
  };
}

const ASKED = [
  user('Can you call my mom and say good morning?'),
  result(JSON.stringify('NOT SENT YET. Read this to the caller word for word')),
  said("That's a call to Mom at 303 555 0100, to say good morning. Should I go ahead?"),
  user('Yes.'),
];
let HELD = '';

beforeAll(async () => {
  const { id } = await deferCall('seth', { kind: 'on_behalf', request: {} as never }, {
    allowed: false,
    at: NINE,
    timezone: 'America/Denver',
    source: 'area_code',
  } as never);
  HELD = deferredCallReply(id, 'Mom', 'say good morning', NOW)!;
});

describe('the prod line', () => {
  it('claims a call', () => {
    expect(claimedAction(LINE)).toBe('call');
  });
});

describe('a held call result', () => {
  it('reads as held, with its time, never as a call placed', () => {
    const actions = callActions({ items: [...ASKED, result(JSON.stringify(HELD))] });
    expect([...actions.held]).toEqual(['call']);
    expect([...actions.done]).toEqual([]);
    expect(actions.heldWhen).toMatch(/^later today at 9:00\sAM$/);
  });

  it('after it, the claim goes and Ferni says when the call will ring', async () => {
    const { text } = await run([...ASKED, result(JSON.stringify(HELD))], LINE);
    expect(text).not.toMatch(/placing/i);
    expect(text).toMatch(
      /^I haven't dialed yet, though\. I'll call later today at 9:00\sAM their time\.$/
    );
  });

  it('the same for a call already set, after a handoff', async () => {
    const already = alreadySetReply(
      'Mom',
      { id: 'deferred_1', at: NINE, timezone: 'America/Denver' },
      NOW
    );
    const { text } = await run(
      [...ASKED, result(JSON.stringify(already))],
      "Okay, I'm calling her now."
    );
    expect(text).toMatch(/^I haven't dialed yet, though\. I'll call later today at 9:00\sAM/);
  });
});

describe('on the yes, before the call tool has returned', () => {
  it('the claim is not spoken; the tool call goes out and its result is spoken next', async () => {
    const { text, calls } = await run(ASKED, `${LINE} `, toolCall());
    expect(text).toBe('');
    expect(calls).toBe(1);
  });

  it('other words on the yes still stream', async () => {
    const { text, calls } = await run(ASKED, 'Sure thing. ', `${LINE} `, toolCall());
    expect(text).toBe('Sure thing. ');
    expect(calls).toBe(1);
  });

  it('with no call tool called, nothing rang: Ferni asks again', async () => {
    const { text, calls } = await run(ASKED, LINE);
    expect(calls).toBe(0);
    expect(text).toBe("I haven't actually dialed yet, though. Should I go ahead and call?");
  });

  it('a call that was placed may still be talked about', async () => {
    const placed = result(JSON.stringify("Got it! I'm calling Mom now to say good morning."));
    const { text } = await run([...ASKED, placed], "I'm calling her now.");
    expect(text).toBe("I'm calling her now.");
  });
});

/**
 * Prod call 2026-10-24 (#2735): the owner asked Ferni to call his mom; the call
 * tool held the call until 9:00 AM her time. He said she was an early riser and
 * to call now; the tool said the call was already set, and Ferni said "Ah, got
 * it, early riser, I'll call now." The guard let it through: "I'll call now."
 * names no one, and the future-tense call pattern needs a person or number.
 * ACTION_CLAIM_BARE_WILL=on reads it as a call claim; off, nothing changes.
 *
 * The held result is the real one deferred-calls.ts writes.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({ collection: () => ({ doc: () => ({ set: async () => undefined }) }) }),
    }),
  }),
}));

import { alreadySetReply } from '../../../services/outreach/deferred-calls.js';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { actionClaimBareWillEnabled, claimedAction } from '../action-claims.js';

initializeLogger({ pretty: false, level: 'warn' });

const LINE = "Ah, got it, early riser, I'll call now.";
const ON = { ACTION_CLAIM_BARE_WILL: 'on' };
const OFF = {};

let n = 0;
const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const result = (output: string) =>
  llm.FunctionCallOutput.create({
    callId: `c${++n}`,
    name: 'callOnBehalf',
    output,
    isError: false,
  });
const streamOf = (...parts: string[]) =>
  new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts) c.enqueue({ id: 'r', delta: { role: 'assistant', content: p } });
      c.close();
    },
  });
const tools = { functionTools: { callOnBehalf: {} } };
async function run(items: unknown[], ...parts: string[]) {
  const out = await withActionClaimCheck(streamOf(...parts), { items }, tools, undefined, {});
  const chunks: llm.ChatChunk[] = [];
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) chunks.push(c);
  return chunks.map((c) => c.delta?.content ?? '').join('');
}

const HELD = alreadySetReply(
  'my mom',
  {
    at: new Date('2026-10-24T15:00:00Z'),
    timezone: 'America/Denver',
    contactName: 'my mom',
  } as never,
  new Date('2026-10-24T14:43:49Z')
);

afterEach(() => vi.unstubAllEnvs());

describe('ACTION_CLAIM_BARE_WILL', () => {
  it('is off by default', () => {
    expect(actionClaimBareWillEnabled(OFF)).toBe(false);
    expect(actionClaimBareWillEnabled(ON)).toBe(true);
  });

  it('on: "I\'ll call now." with no one named is a call claim', () => {
    expect(claimedAction(LINE, ON)).toBe('call');
    expect(claimedAction('Okay, let me ring right now.', ON)).toBe('call');
    expect(claimedAction("I'm gonna dial now.", ON)).toBe('call');
  });

  it('off: the same lines are not claims, exactly as before', () => {
    expect(claimedAction(LINE, OFF)).toBeNull();
    expect(claimedAction('Okay, let me ring right now.', OFF)).toBeNull();
    expect(claimedAction("I'm gonna dial now.", OFF)).toBeNull();
  });

  it('either way, a named target still claims and a non-claim stays one', () => {
    for (const env of [ON, OFF]) {
      expect(claimedAction("I'll call her now.", env)).toBe('call');
      expect(claimedAction("I'll call you back later.", env)).toBeNull();
      expect(claimedAction('Maybe I could call now, if you want.', env)).toBeNull();
      expect(claimedAction('Not much, just watching the morning light.', env)).toBeNull();
    }
  });
});

describe('after a held call, the prod line', () => {
  const items = () => [
    user("Uh, she's an early riser. I think you could call her now."),
    result(JSON.stringify(HELD)),
  ];

  it('on: the claim goes and Ferni says the call has not rung and when it will', async () => {
    vi.stubEnv('ACTION_CLAIM_BARE_WILL', 'on');
    const text = await run(items(), LINE);
    expect(text).not.toMatch(/I'll call now/);
    expect(text).toMatch(/I haven't dialed yet/);
    expect(text).toMatch(/9:00\sAM their time/);
  });

  it('off: the line streams untouched, as on prod today', async () => {
    vi.stubEnv('ACTION_CLAIM_BARE_WILL', 'off');
    const text = await run(items(), LINE);
    expect(text).toBe(LINE);
  });
});

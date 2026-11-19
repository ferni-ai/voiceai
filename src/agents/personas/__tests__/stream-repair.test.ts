/**
 * STREAM_ERROR_REPAIR (#4011): a reply stream that fails after spoken words ends with one repair
 * line; an abort, a barge-in, no words yet, or crisis risk on the call keep today's rethrow; and
 * the repair line never reaches what memory records of the reply. Driven through finishedReply,
 * the tail llmNode returns (ferni-agent.ts).
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm, voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../conversation/advanced-humanization-integration.js', () => ({
  recordAgentResponse: vi.fn(),
  recordAdviceGiven: vi.fn(),
}));

import {
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../services/safety/crisis-call-risk.js';
import type { SessionServices } from '../../../services/index.js';
import { assistantTranscriptHandler } from '../../multi-agent/assistant-transcript.js';
import type { UserData } from '../../shared/types.js';
import { registerAgentReplyRecorder } from '../../voice-agent/agent-reply-recorder.js';
import type { ReplyChunk } from '../reply-chunks.js';
import { finishedReply, withoutStreamRepair } from '../stream-repair.js';

/** The owner-approved wording, pinned (#4011). */
const LINE = 'Sorry, I lost my train of thought there.';
const PARTIAL = 'So the plan for Saturday is to';
const streamError = () => new Error('stream reset by peer');
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

let n = 0;
/** A fresh call id per row, so no row sees another's risk or repair. */
const newCall = () => `call-repair-${++n}`;

/** A reply that sends `chunks`, then fails with `error`. */
function failing(chunks: ReplyChunk[], error: unknown): ReadableStream<ReplyChunk> {
  let i = 0;
  return new ReadableStream<ReplyChunk>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.error(error);
    },
  });
}

/** llmNode's tail for this call. */
const tail = (call: string | undefined, reply: ReadableStream<ReplyChunk>) =>
  finishedReply(call, {}, reply) as unknown as ReadableStream<ReplyChunk>;

/** Everything the caller would hear, or the error the turn ends with. */
async function heard(reply: ReadableStream<ReplyChunk>): Promise<string[] | Error> {
  const out: string[] = [];
  try {
    for await (const chunk of reply as unknown as AsyncIterable<ReplyChunk>)
      out.push(String(chunk));
    return out;
  } catch (error) {
    return error as Error;
  }
}

beforeEach(() => vi.stubEnv('STREAM_ERROR_REPAIR', 'on'));
afterEach(() => {
  vi.unstubAllEnvs();
  resetCrisisCallRisk();
});

describe('finishedReply with STREAM_ERROR_REPAIR', () => {
  it('flag off: a mid-reply error ends the turn as before, with nothing recorded as repaired', async () => {
    vi.stubEnv('STREAM_ERROR_REPAIR', 'off');
    const call = newCall();
    const error = streamError();
    expect(await heard(tail(call, failing([PARTIAL], error)))).toBe(error);
    expect(withoutStreamRepair(call, `${PARTIAL} ${LINE}`)).toBe(`${PARTIAL} ${LINE}`);
  });

  it('an error after spoken words ends the reply with the repair line', async () => {
    const result = await heard(
      tail(newCall(), failing(['So the plan ', 'for Saturday is to'], streamError()))
    );
    expect(result).toEqual(['So the plan ', 'for Saturday is to', ` ${LINE}`]);
  });

  it('a reply that ends normally is unchanged', async () => {
    const reply = new ReadableStream<ReplyChunk>({
      start(c) {
        c.enqueue('All done.');
        c.close();
      },
    });
    expect(await heard(tail(newCall(), reply))).toEqual(['All done.']);
  });

  it('an error before any words is rethrown, as before', async () => {
    const error = streamError();
    expect(await heard(tail(newCall(), failing(['', '  '], error)))).toBe(error);
  });

  it('an abort after spoken words is rethrown, with no repair line', async () => {
    const error = abortError();
    expect(await heard(tail(newCall(), failing([PARTIAL], error)))).toBe(error);
  });

  it('a barge-in (the reader cancels) cancels the source and adds nothing', async () => {
    const call = newCall();
    const cancel = vi.fn();
    const source = new ReadableStream<ReplyChunk>({
      pull(c) {
        c.enqueue(PARTIAL);
      },
      cancel,
    });
    const reader = tail(call, source).getReader();
    expect((await reader.read()).value).toBe(PARTIAL);
    await reader.cancel('barge-in');
    expect(cancel).toHaveBeenCalledWith('barge-in');
    expect(withoutStreamRepair(call, `${PARTIAL} ${LINE}`)).toBe(`${PARTIAL} ${LINE}`);
  });

  it('crisis risk earlier on the call: a later mid-reply error is rethrown, no repair line', async () => {
    const call = newCall();
    noteCrisisRisk(call);
    const error = streamError();
    expect(await heard(tail(call, failing([PARTIAL], error)))).toBe(error);
  });

  it('a crisis read still in flight: the error is rethrown, no repair line', async () => {
    const call = newCall();
    const neverSettles = new Promise<null>(() => {
      // the read stays in flight for the whole row
    });
    void trackCrisisRead(call, 'an invented caller line', neverSettles);
    const error = streamError();
    expect(await heard(tail(call, failing([PARTIAL], error)))).toBe(error);
  });

  it('no call id (no crisis read possible): the error is rethrown', async () => {
    const error = streamError();
    expect(await heard(tail(undefined, failing([PARTIAL], error)))).toBe(error);
  });
});

describe('the repair line is kept out of memory', () => {
  /** Speak a repaired reply on a new call, as llmNode would; returns the call id. */
  async function repairedCall(): Promise<string> {
    const call = newCall();
    await heard(tail(call, failing([PARTIAL], streamError())));
    return call;
  }

  it('withoutStreamRepair drops it only on the call that spoke it, and only for 30 s', async () => {
    const call = await repairedCall();
    const spoken = `${PARTIAL} ${LINE}`;
    expect(withoutStreamRepair(call, spoken)).toBe(PARTIAL);
    expect(withoutStreamRepair(newCall(), spoken)).toBe(spoken);
    expect(withoutStreamRepair(call, spoken, () => Date.now() + 30_001)).toBe(spoken);
  });

  it('the conversation thread records the words before the failure, not the repair line', async () => {
    const call = await repairedCall();
    const record = vi.fn(async () => undefined);
    const handler = assistantTranscriptHandler(() => ({ userId: 'u1', sessionId: call }), record);
    handler({
      type: 'conversation_item_added',
      item: { type: 'message', role: 'assistant', textContent: `${PARTIAL} ${LINE}` },
    });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ content: PARTIAL }));
  });

  it('the committed-reply recorder keeps it out of the agent turn and last response', async () => {
    const call = await repairedCall();
    const session = new EventEmitter();
    const services = {
      addTurn: vi.fn(),
      humorCalibration: { recordHumorAttempt: vi.fn() },
      storyPreference: { recordStory: vi.fn() },
    } as unknown as SessionServices;
    const userData: Partial<UserData> = { lastTopic: 'plans' };
    registerAgentReplyRecorder(session as never, {
      sessionId: call,
      services,
      userData: userData as UserData,
    });
    session.emit(voice.AgentSessionEventTypes.ConversationItemAdded, {
      type: 'conversation_item_added',
      item: llm.ChatMessage.create({ role: 'assistant', content: `${PARTIAL} ${LINE}` }),
    });
    await vi.waitFor(() => expect(services.addTurn).toHaveBeenCalledTimes(1));
    expect(services.addTurn).toHaveBeenCalledWith('assistant', PARTIAL);
    expect(userData.lastAgentResponse).toBe(PARTIAL);
  });

  it('a repair line alone (nothing heard before it) records nothing', async () => {
    const call = await repairedCall();
    const record = vi.fn(async () => undefined);
    const handler = assistantTranscriptHandler(() => ({ userId: 'u1', sessionId: call }), record);
    handler({
      type: 'conversation_item_added',
      item: { type: 'message', role: 'assistant', textContent: LINE },
    });
    expect(record).not.toHaveBeenCalled();
  });
});

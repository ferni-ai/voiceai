/**
 * The reply after a cut-off is observed, never changed (CUT_REPLY_IN_HISTORY, #2422):
 * every chunk goes out as generated, in order, as it arrives; a copied cut mark is the
 * only thing removed; a near-copy of the cut reply is logged once the reply ends.
 * Rounds 1-2 of verify on #2786 failed a re-ask that lost 988 after a reply's opening.
 * The cut is armed through the real recorder (shared/cut-reply-history.ts) and a real
 * SDK SpeechHandle.
 */
import { EventEmitter } from 'node:events';
import {
  ReadableStream,
  type ReadableStreamDefaultController,
  type ReadableStreamReadResult,
} from 'node:stream/web';
import { llm, voice } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => {
  const l: Record<string, unknown> = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };
  l.child = () => l;
  return { getLogger: () => l, createLogger: () => l, safeLog: () => l };
});

import { attachCutReplyHistory, noteGeneratedForCut } from '../../shared/cut-reply-history.js';
import { isNearCopy, withCutReplyCheck } from '../cut-reply-guard.js';

type Chunk = string | llm.ChatChunk;
const ON = { CUT_REPLY_IN_HISTORY: 'on' };
const OFF = { CUT_REPLY_IN_HISTORY: 'off' };
const CUT =
  'You got me there, fair and square. The secret to consistency is a slow, high toss every time.';

const streamOf = (chunks: Chunk[]): ReadableStream<Chunk> =>
  new ReadableStream<Chunk>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
const delta = (content: string): llm.ChatChunk =>
  ({ id: 'r1', delta: { role: 'assistant', content } }) as llm.ChatChunk;

async function spoken(stream: ReadableStream<Chunk> | null): Promise<string> {
  let out = '';
  for await (const c of stream as unknown as AsyncIterable<Chunk>)
    out += typeof c === 'string' ? c : (c.delta?.content ?? '');
  return out;
}

/** A call session whose last reply was cut before a word played. */
async function afterCut(cutText = CUT) {
  const agent = new voice.Agent({ instructions: 'You are Ferni.' });
  const session = Object.assign(new EventEmitter(), { currentAgent: agent });
  attachCutReplyHistory(session as never, { sessionId: 's1' }, ON);
  const handle = voice.SpeechHandle.create();
  session.emit('speech_created', { speechHandle: handle, createdAt: 1000 });
  noteGeneratedForCut(session, cutText, 2000);
  handle.interrupt();
  handle._markDone();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  return session;
}

function request(): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: 'Anyway, the app keeps dropping on my iPhone.' });
  return ctx;
}

/** A model that streams `chunks`, counting its calls. */
const modelOf = (chunks: Chunk[]) => vi.fn(async (_ctx: llm.ChatContext) => streamOf(chunks));

const repeats = () => warn.mock.calls.filter((c) => c[1] === 'CUT_REPLY_REPEATED');

beforeEach(() => warn.mockClear());

describe('withCutReplyCheck', () => {
  it('a near-copy of the cut reply goes out as generated, in one call, and is logged', async () => {
    const session = await afterCut();
    const model = modelOf([
      delta('You got me there, '),
      delta('fair and square. The secret '),
      delta('is the toss.'),
    ]);
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(out).toBe('You got me there, fair and square. The secret is the toss.');
    expect(model).toHaveBeenCalledTimes(1);
    expect(repeats()).toHaveLength(1);
    const fields = repeats()[0][0] as Record<string, unknown>;
    expect(fields).toEqual({ sessionId: 's1', replyWords: 12, cutWords: 18 });
  });

  it('safety: a word-by-word repeat that offers 988 after its opening goes out whole, in order', async () => {
    const session = await afterCut();
    const words = `${CUT} If it ever feels like too much, call or text 988 any time.`.split(
      /(?<= )/
    );
    const chunks = words.map(delta);
    const out: Chunk[] = [];
    const reply = await withCutReplyCheck(session, modelOf(chunks), 's1', ON)(request());
    for await (const c of reply as unknown as AsyncIterable<Chunk>) out.push(c);
    expect(out).toEqual(chunks);
    expect(await spoken(streamOf(out))).toContain('988');
    expect(repeats()).toHaveLength(1);
  });

  it('passes each chunk on as it arrives: nothing is held after a cut (no "[" means no hold)', async () => {
    const session = await afterCut();
    let source!: ReadableStreamDefaultController<Chunk>;
    const live = new ReadableStream<Chunk>({
      start(c) {
        source = c;
      },
    });
    const model = vi.fn(async (_ctx: llm.ChatContext) => live);
    const reply = await withCutReplyCheck(session, model, 's1', ON)(request());
    const reader = (reply as ReadableStream<Chunk>).getReader();
    for (const word of ['You ', 'got ', 'me ', 'there, ', 'fair ', 'and ', 'square.']) {
      source.enqueue(delta(word));
      // Read before the next chunk exists: a held chunk would never resolve here.
      const next = await Promise.race([
        reader.read(),
        new Promise<'held'>((resolve) => {
          setTimeout(() => resolve('held'), 50);
        }),
      ]);
      expect(next).not.toBe('held');
      expect((next as ReadableStreamReadResult<Chunk>).value).toEqual(delta(word));
    }
    source.close();
    expect((await reader.read()).done).toBe(true);
  });

  it('logs nothing for a genuinely different reply', async () => {
    const session = await afterCut();
    const model = modelOf([delta('Oh no, dropping on the iPhone? '), delta('Is that over wifi?')]);
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(out).toBe('Oh no, dropping on the iPhone? Is that over wifi?');
    expect(repeats()).toHaveLength(0);
  });

  it('logs nothing when no reply was cut', async () => {
    const session = Object.assign(new EventEmitter(), {
      currentAgent: new voice.Agent({ instructions: 'x' }),
    });
    attachCutReplyHistory(session as never, { sessionId: 's1' }, ON);
    const out = await spoken(
      await withCutReplyCheck(session, modelOf([delta(CUT)]), 's1', ON)(request())
    );
    expect(out).toBe(CUT);
    expect(repeats()).toHaveLength(0);
  });

  it('removes a copied cut mark from the middle of a reply, even split across chunks', async () => {
    const session = await afterCut();
    const model = modelOf([
      delta('Sure. [cut off by the caller; '),
      delta('they heard little or none of this]'),
      delta(' Is it on wifi?'),
    ]);
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(out).toBe('Sure. Is it on wifi?');
  });

  it('leaves other bracketed text alone', async () => {
    const session = await afterCut();
    const model = modelOf([delta('Dropping on your iPhone [the 15]? Is it on wifi?')]);
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(out).toBe('Dropping on your iPhone [the 15]? Is it on wifi?');
  });

  it('flag off: the model itself, unchanged', async () => {
    const session = await afterCut();
    const model = modelOf([delta(CUT)]);
    expect(withCutReplyCheck(session, model, 's1', OFF)).toBe(model);
  });
});

describe('isNearCopy', () => {
  it('catches the same opening words', () => {
    expect(isNearCopy('You got me there, fair and square! Totally', CUT)).toBe(true);
  });
  it('catches a reply with nearly the same words', () => {
    expect(
      isNearCopy(
        'The secret to consistency, really, is a slow high toss every time.',
        'The secret to consistency is a slow, high toss every time.'
      )
    ).toBe(true);
  });
  it('passes a different reply', () => {
    expect(isNearCopy('Oh no, dropping on the iPhone? Is that over wifi?', CUT)).toBe(false);
  });
  it('passes a short stock word or two', () => {
    expect(isNearCopy('Yeah, totally.', 'Yeah, totally.')).toBe(false);
  });
});

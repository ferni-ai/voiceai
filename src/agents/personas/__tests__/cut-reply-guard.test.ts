/**
 * The reply right after a cut-off: a near-copy of the cut reply is asked again once,
 * a different reply streams untouched, and a copied cut mark is never spoken
 * (CUT_REPLY_IN_HISTORY, #2422). The cut is armed through the real recorder
 * (shared/cut-reply-history.ts) and a real SDK SpeechHandle.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm, voice } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import { attachCutReplyHistory, noteGeneratedForCut } from '../../shared/cut-reply-history.js';
import { REPHRASE_NOTE, isNearCopy, withCutReplyCheck } from '../cut-reply-guard.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';

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

/** A model that streams `first` on its first call and `second` after. */
function scripted(first: Chunk[], second: Chunk[]) {
  const asked: llm.ChatContext[] = [];
  const model = vi.fn(async (ctx: llm.ChatContext) => {
    asked.push(ctx);
    return streamOf(asked.length === 1 ? first : second);
  });
  return { model, asked };
}

const lastUser = (ctx: llm.ChatContext) =>
  [...ctx.items].reverse().find((i) => i.type === 'message' && i.role === 'user') as
    llm.ChatMessage | undefined;

describe('withCutReplyCheck', () => {
  it('asks again when the reply after a cut opens as a near-copy of it', async () => {
    const session = await afterCut();
    const { model, asked } = scripted(
      [delta('You got me there, '), delta('fair and square. The secret '), delta('is the toss.')],
      [delta('Dropping on your iPhone? Is it on wifi or cellular?')]
    );
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(out).toBe('Dropping on your iPhone? Is it on wifi or cellular?');
    expect(model).toHaveBeenCalledTimes(2);
    expect(lastUser(asked[0])?.textContent).not.toContain(REPHRASE_NOTE);
    expect(lastUser(asked[1])?.textContent).toContain(REPHRASE_NOTE);
  });

  it('lets a genuinely different reply through untouched, one call', async () => {
    const session = await afterCut();
    const reply = [
      delta('Oh no, dropping on the iPhone? '),
      delta('Is that over wifi or cellular?'),
    ];
    const { model } = scripted(reply, [delta('unused')]);
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(out).toBe('Oh no, dropping on the iPhone? Is that over wifi or cellular?');
    expect(model).toHaveBeenCalledTimes(1);
  });

  it('checks nothing when no reply was cut', async () => {
    const session = Object.assign(new EventEmitter(), {
      currentAgent: new voice.Agent({ instructions: 'x' }),
    });
    attachCutReplyHistory(session as never, { sessionId: 's1' }, ON);
    const { model } = scripted([delta(CUT)], [delta('unused')]);
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(out).toBe(CUT);
    expect(model).toHaveBeenCalledTimes(1);
  });

  it('cuts a copied cut mark off the start of a reply', async () => {
    const session = await afterCut();
    const { model } = scripted(
      [
        delta('[cut off by the caller; '),
        delta('they heard little or none of this] Got it, '),
        delta('your iPhone.'),
      ],
      [delta('unused')]
    );
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(out).toBe('Got it, your iPhone.');
  });

  it('flag off: the model itself, unchanged', async () => {
    const session = await afterCut();
    const { model } = scripted([delta(CUT)], [delta('unused')]);
    expect(withCutReplyCheck(session, model, 's1', OFF)).toBe(model);
  });

  // Round-1 verify of #2786: a crisis "guide" reply comes from this model; asking it again
  // dropped 988 and 911. A repeated safety line must go out as generated, in one call.
  const CRISIS =
    "I'm really glad you told me. If you're in danger right now, please call or text 988, or 911 if it's an emergency.";

  it('safety: a cut crisis reply said again goes out as said, 988 and all, one call', async () => {
    const session = await afterCut(CRISIS);
    const { model } = scripted(
      [delta(CRISIS)],
      [delta("I hear you. What's happening for you right now?")]
    );
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(model).toHaveBeenCalledTimes(1);
    expect(out).toContain('988');
    expect(out).toContain('911');
  });

  it('safety: on a call with crisis risk, even a non-crisis repeat is not asked again', async () => {
    resetCrisisCallRisk();
    try {
      noteCrisisRisk('s1', Date.now());
      const session = await afterCut();
      const { model } = scripted([delta(CUT)], [delta('unused')]);
      const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
      expect(model).toHaveBeenCalledTimes(1);
      expect(out).toBe(CUT);
    } finally {
      resetCrisisCallRisk();
    }
  });

  it('safety: a new reply carrying a crisis resource is never replaced, even if it repeats', async () => {
    const session = await afterCut();
    const repeat = `${CUT} If it ever feels like too much, 988 is there any time.`;
    const { model } = scripted([delta(repeat)], [delta('unused')]);
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(model).toHaveBeenCalledTimes(1);
    expect(out).toContain('988');
  });

  it('asks again at most once: a second near-copy goes out rather than looping', async () => {
    const session = await afterCut();
    const { model } = scripted([delta(CUT)], [delta(CUT)]);
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(model).toHaveBeenCalledTimes(2);
    expect(out).toBe(CUT);
  });

  it('removes a copied cut mark from the middle of a reply, even split across chunks', async () => {
    const session = await afterCut();
    const { model } = scripted(
      [
        delta('Sure. [cut off by the caller; '),
        delta('they heard little or none of this]'),
        delta(' Is it on wifi?'),
      ],
      [delta('unused')]
    );
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(out).not.toContain('[cut off');
    expect(out).toBe('Sure. Is it on wifi?');
  });

  it('leaves other bracketed text alone', async () => {
    const session = await afterCut();
    const { model } = scripted(
      [delta('Dropping on your iPhone [the 15]? Is it on wifi?')],
      [delta('unused')]
    );
    const out = await spoken(await withCutReplyCheck(session, model, 's1', ON)(request()));
    expect(out).toBe('Dropping on your iPhone [the 15]? Is it on wifi?');
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

/**
 * FIRST_CLAUSE_FLUSH (first-clause-flush.ts): a reply's first clause goes to the
 * voice at its comma instead of waiting for the sentence to end (#1544).
 */
import { initializeLogger, llm } from '@livekit/agents';
import {
  ReadableStream,
  type ReadableStreamDefaultController,
  type ReadableStreamDefaultReader,
} from 'node:stream/web';
import { afterEach, describe, expect, it } from 'vitest';

import { findFirstChunkEnd } from '../../../speech/tts-gateway/chunk-boundary.js';
import { withActionClaimCheck } from '../action-claim-guard.js';
import {
  FIRST_CLAUSE_MIN_CHARS,
  FirstClauseFlush,
  findFirstClauseEnd,
} from '../first-clause-flush.js';
import { OpenerGate } from '../opener-gate.js';

initializeLogger({ pretty: false, level: 'warn' });

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

/** The text up to where the first clause ends ('' when none). */
const clauseOf = (text: string): string => text.slice(0, findFirstClauseEnd(text));

describe('findFirstClauseEnd', () => {
  it('cuts after the first , ; or : once the clause is long enough, taking the space after it', () => {
    expect(clauseOf('That sounds really rough, honestly.')).toBe('That sounds really rough, ');
    expect(clauseOf('Here is the thing: you did fine.')).toBe('Here is the thing: ');
    expect(clauseOf('It was a long week; still, you made it.')).toBe('It was a long week; ');
    // The model's chunk often ends on the comma, with the space in the next chunk.
    expect(clauseOf('That sounds really rough,')).toBe('That sounds really rough,');
  });

  it('never cuts inside a number or a time', () => {
    expect(clauseOf('It cost about 1,000 dollars, which is a lot.')).toBe(
      'It cost about 1,000 dollars, '
    );
    expect(clauseOf('I have 3:30 open for you, if that works.')).toBe('I have 3:30 open for you, ');
    // A comma right after a digit at the end of the text may still become "1,000": wait.
    expect(findFirstClauseEnd('It cost about 1,')).toBe(0);
    // With a space after it, the digit's comma is a real clause break.
    expect(clauseOf('We counted 3, maybe 4 of them.')).toBe('We counted 3, ');
  });

  it('never cuts after an abbreviation such as "e.g.," or "i.e.,"', () => {
    expect(clauseOf('Some easy fruit e.g., apples, would help.')).toBe(
      'Some easy fruit e.g., apples, '
    );
    expect(findFirstClauseEnd('The short one i.e., the')).toBe(0);
  });

  it('skips a clause under the minimum and tries the next mark', () => {
    expect(FIRST_CLAUSE_MIN_CHARS).toBe(12);
    expect(findFirstClauseEnd('So, yeah')).toBe(0);
    expect(findFirstClauseEnd('Yeah, well,')).toBe(0);
    expect(clauseOf('So, honestly, it is fine.')).toBe('So, honestly, ');
    // Markup is not spoken, so it doesn't count toward the minimum.
    expect(findFirstClauseEnd('<emotion value="sympathetic"/>Oh no, ')).toBe(0);
  });

  it('never cuts inside markup', () => {
    expect(clauseOf('That was a long day [sighs, softly] was it not, though?')).toBe(
      'That was a long day [sighs, softly] was it not, '
    );
    expect(findFirstClauseEnd('That was a long day <emotion value="calm, ')).toBe(0);
  });

  it('has no clause without a mark, or once a sentence has ended: the sentence path handles it', () => {
    expect(findFirstClauseEnd('That sounds really rough to me')).toBe(0);
    expect(findFirstClauseEnd('Sure thing. And honestly, I get it')).toBe(0);
    expect(findFirstClauseEnd('Really? Well honestly, I get it')).toBe(0);
  });
});

describe('FirstClauseFlush', () => {
  const safe = (): boolean => true;

  it('answers once per reply', () => {
    const flush = new FirstClauseFlush(true);
    expect(flush.take('That sounds really rough', safe)).toBe(0);
    expect(flush.take('That sounds really rough, ', safe)).toBe(26);
    expect(flush.take('That sounds really rough, and so, honestly, ', safe)).toBe(0);
  });

  it('an unsafe first clause waits for its sentence, and no later clause goes early', () => {
    const flush = new FirstClauseFlush(true);
    expect(flush.take("I'm calling her right now, ", () => false)).toBe(0);
    expect(flush.take("I'm calling her right now, and then, maybe, ", safe)).toBe(0);
  });

  it('does nothing when off or after close()', () => {
    expect(new FirstClauseFlush(false).take('That sounds really rough, ', safe)).toBe(0);
    const closed = new FirstClauseFlush(true);
    closed.close();
    expect(closed.take('That sounds really rough, ', safe)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Through the production path: the action-claim guard holds a reply a sentence
// at a time (ACTION_CLAIM_GUARD on, ACTION_CLAIM_STREAM off: the defaults).
// ---------------------------------------------------------------------------

const chunk = (content: string): llm.ChatChunk => ({
  id: 'r',
  delta: { role: 'assistant', content },
});
const user = (content: string): llm.ChatMessage =>
  llm.ChatMessage.create({ role: 'user', content });
const SMALL_TALK = { items: [user('I had such a long day at work.')] };
const ASK = { items: [user('Can you ring my mom for me?')] };
const NO_TOOLS = { functionTools: {} };
const ON = { FIRST_CLAUSE_FLUSH: 'on' };

/** A model stream the test writes into, chunk by chunk. */
function modelStream(): {
  stream: ReadableStream<llm.ChatChunk>;
  push: (text: string) => void;
  close: () => void;
} {
  let controller!: ReadableStreamDefaultController<llm.ChatChunk>;
  const stream = new ReadableStream<llm.ChatChunk>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    push: (text) => controller.enqueue(chunk(text)),
    close: () => controller.close(),
  };
}

const textOf = (c: unknown): string =>
  typeof c === 'string' ? c : ((c as llm.ChatChunk).delta?.content ?? '');

interface Read {
  done: boolean;
  value?: unknown;
}
/** A read still in flight after a 'held' answer: the next call picks it up, so nothing is lost. */
const inFlight = new WeakMap<object, Promise<Read>>();

/** The next text out within 50 ms, or 'held' when nothing came out. */
async function nextOut(reader: ReadableStreamDefaultReader<unknown>): Promise<string> {
  const read = inFlight.get(reader) ?? reader.read();
  inFlight.set(reader, read);
  const next = await Promise.race([
    read,
    new Promise<'held'>((resolve) => {
      setTimeout(() => resolve('held'), 50);
    }),
  ]);
  if (next === 'held') return 'held';
  inFlight.delete(reader);
  return next.done ? 'done' : textOf(next.value);
}

async function restOf(reader: ReadableStreamDefaultReader<unknown>): Promise<string> {
  let text = '';
  for (let next = await nextOut(reader); next !== 'done'; next = await nextOut(reader)) {
    if (next !== 'held') text += next;
  }
  return text;
}

async function guarded(
  model: ReadableStream<llm.ChatChunk>,
  chatCtx = SMALL_TALK,
  env: Record<string, string> = ON
): Promise<ReadableStreamDefaultReader<unknown>> {
  const out = await withActionClaimCheck(model, chatCtx, NO_TOOLS, 'ferni', env);
  return (out as unknown as ReadableStream<unknown>).getReader();
}

describe('the action-claim guard with FIRST_CLAUSE_FLUSH', () => {
  it('off: the first words still wait for the end of their sentence, unchanged', async () => {
    const model = modelStream();
    const reader = await guarded(model.stream, SMALL_TALK, {});
    model.push('That sounds really rough,');
    expect(await nextOut(reader)).toBe('held');
    model.push(' honestly. I am here for you.');
    model.close();
    expect(await nextOut(reader)).toBe('That sounds really rough, honestly. ');
    expect(await restOf(reader)).toBe('I am here for you.');
  });

  it('on: the first clause goes out before the model has written the rest of its sentence', async () => {
    const model = modelStream();
    const reader = await guarded(model.stream);
    model.push('That sounds really rough,');
    expect(await nextOut(reader)).toBe('That sounds really rough,');
    model.push(' honestly. And then the commute,');
    // Only the first clause goes early: the second sentence's clause waits for its end.
    expect(await nextOut(reader)).toBe(' honestly. ');
    expect(await nextOut(reader)).toBe('held');
    model.push(' on top of it all.');
    model.close();
    expect(await restOf(reader)).toBe('And then the commute, on top of it all.');
  });

  it('on: a clause too short to cut waits for its sentence, as before', async () => {
    const model = modelStream();
    const reader = await guarded(model.stream);
    model.push('Oh, wow,');
    expect(await nextOut(reader)).toBe('held');
    model.push(' okay. That is big news.');
    model.close();
    expect(await nextOut(reader)).toBe('Oh, wow, okay. ');
  });

  it('on: a first clause with an action in it is held and still checked', async () => {
    const model = modelStream();
    const reader = await guarded(model.stream, ASK);
    model.push("I'm calling your mom right now,");
    expect(await nextOut(reader)).toBe('held');
    model.push(' so hang tight.');
    model.close();
    const text = (await nextOut(reader)) + (await restOf(reader));
    expect(text).not.toMatch(/calling/i);
    expect(text).toMatch(/^I can't actually make calls for you/);
  });

  it('on: a claim after a released clause is still dropped, with the honest line after the clause', async () => {
    const model = modelStream();
    const reader = await guarded(model.stream, ASK);
    model.push('No problem at all,');
    expect(await nextOut(reader)).toBe('No problem at all,');
    model.push(" I'm calling her right now.");
    model.close();
    const rest = await restOf(reader);
    expect(rest).not.toMatch(/calling her/i);
    expect(rest).toBe(
      " I can't actually make calls for you, so I haven't rung anyone. I can help you work out what to say, though."
    );
  });

  it('on: the opener gate still runs on the clause, and the clause is the first piece the TTS cuts', async () => {
    process.env.FIRST_CLAUSE_FLUSH = 'on';
    const gate = new OpenerGate(3);
    gate.decide('Oh, the first reply keeps its word.');
    const model = modelStream();
    const out = await withActionClaimCheck(model.stream, SMALL_TALK, NO_TOOLS, 'ferni', ON);
    const reader = gate.wrap(out as never).getReader();
    // 21 characters: under the opener gate's 24-character wait, so it must decide early.
    model.push('Oh, that is so rough,');
    const first = await nextOut(reader as never);
    expect(first).toBe('That is so rough,');
    // continuation-tts.ts cuts its first piece here: the whole clause, nothing held back.
    expect(findFirstChunkEnd(first, FIRST_CLAUSE_MIN_CHARS)).toBe(first.length);
    model.push(' honestly.');
    model.close();
    expect(await restOf(reader as never)).toBe(' honestly.');
  });
});

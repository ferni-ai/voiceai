/**
 * The space at a chunk cut (#4065). The gateway joins the chunker's chunks as they arrive,
 * so a chunk that drops the whitespace its cut fell on glues two words ("ahora" + "mismo").
 * Every row: the joined chunks equal the reply (only its ends trimmed), so no two words are
 * ever glued and no space is ever added or doubled.
 */
import { ReadableStream } from 'node:stream/web';
import type { AudioFrame } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContinuationTTS } from '../../../../speech/tts-gateway/continuation-tts.js';
import type { ReplyStream } from '../../../../speech/tts-gateway/providers/cartesia-reply-stream.js';
import { prosodyTags } from '../../../../speech/tts-gateway/providers/cartesia.js';
import { getSSMLProcessor } from '../../../../speech/tts-gateway/ssml/processor.js';
import {
  createStreamingTTSTransform,
  type StreamingTTSConfig,
} from '../streaming-tts-transform.js';

const ES =
  'Si quieres podemos hablar un rato más de tu día y ahora mismo buscamos juntos una canción ' +
  'tranquila para descansar antes de dormir esta noche sin ninguna prisa';
const EN =
  'I think we could take a slow walk around the block right now and then make some tea while ' +
  'we talk about the garden you planted last spring with your sister';
const MIXED =
  'Claro que sí, estoy aquí. Podemos seguir hablando, sin prisa; cuando tú quieras. ' +
  'Right now I am listening, and I will stay with you: no rush at all.';

/** Tokens the way a model streams them: each word carries the space before it. */
const tokens = (text: string): string[] => text.split(/(?= )/);
/** The same words, each carrying the space after it. */
const trailing = (text: string): string[] => text.split(/(?<= )/);

const SMALL: StreamingTTSConfig = { firstChunkMinSize: 6, minChunkSize: 10, maxChunkSize: 30 };

function chunker(config: StreamingTTSConfig): {
  readable: ReadableStream<string>;
  feed: (pieces: string[]) => Promise<void>;
} {
  const transform = createStreamingTTSTransform({ enableMetrics: false, ...config });
  const writer = transform.writable.getWriter();
  const feed = async (pieces: string[]): Promise<void> => {
    await pieces.reduce((done, piece) => done.then(() => writer.write(piece)), Promise.resolve());
    await writer.close();
  };
  return { readable: transform.readable as ReadableStream<string>, feed };
}

async function chunk(pieces: string[], config: StreamingTTSConfig = SMALL): Promise<string[]> {
  const { readable, feed } = chunker(config);
  const out: string[] = [];
  const reading = (async (): Promise<void> => {
    for await (const piece of readable) out.push(piece);
  })();
  await feed(pieces);
  await reading;
  return out;
}

function expectSpokenAsWritten(chunks: string[], source: string): void {
  const joined = chunks.join('');
  expect(joined).toBe(source.trim());
  expect(joined).not.toContain('  '); // the invented replies have single spaces only
  expect(joined.split(' ')).toEqual(source.trim().split(' ')); // no two words glued
}

describe('streaming TTS chunker keeps the space at every cut (#4065)', () => {
  it.each([
    ['Spanish, model tokens', ES, tokens],
    ['English, model tokens', EN, tokens],
    ['mixed punctuation, model tokens', MIXED, tokens],
    ['Spanish, space after each word', ES, trailing],
    ['English, space after each word', EN, trailing],
    ['mixed punctuation, space after each word', MIXED, trailing],
    ['Spanish, one write', ES, (t: string) => [t]],
    ['English, one write', EN, (t: string) => [t]],
  ])('%s: joined chunks equal the reply', async (_name, source, split) => {
    const chunks = await chunk(split(source));
    expect(chunks.length).toBeGreaterThan(1); // the row really cuts between words
    expectSpokenAsWritten(chunks, source);
  });

  it('the default sizes: a long reply keeps every word break', async () => {
    const source = `${ES} ${EN} ${MIXED}`;
    const chunks = await chunk(tokens(source), {});
    expect(chunks.length).toBeGreaterThan(2);
    expectSpokenAsWritten(chunks, source);
  });

  it('the length cut lands between "ahora" and "mismo": they stay two words', async () => {
    const source = 'Si estás en peligro ahora mismo, llama al nueve, uno, uno.';
    const chunks = await chunk([source], {
      firstChunkMinSize: 6,
      minChunkSize: 10,
      maxChunkSize: 26,
    });
    expect(chunks[0]).toBe('Si estás en peligro ahora');
    expect(chunks.join('')).toContain('ahora mismo');
    expectSpokenAsWritten(chunks, source);
  });

  it('a cut inside a word adds no space', async () => {
    const source = 'x'.repeat(95);
    const chunks = await chunk([source]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(source);
  });

  it('the reply ends stay trimmed, as before', async () => {
    const chunks = await chunk(['  ', ...tokens(`${EN} `), '  ']);
    expect(chunks[0]).toBe(chunks[0].trimStart());
    const last = chunks[chunks.length - 1];
    expect(last).toBe(last.trimEnd());
    expectSpokenAsWritten(chunks, EN);
  });

  it('a whitespace run at a cut is carried exactly, never doubled or dropped', async () => {
    const pieces = ['Hola, estoy aquí contigo', '\n\n', 'Ahora mismo te escucho con calma'];
    const source = pieces.join('');
    const chunks = await chunk(pieces);
    expect(chunks[0]).toBe(pieces[0]); // the run is the next chunk's lead
    expect(chunks.join('')).toBe(source);
  });

  it('a pause that flushes only whitespace keeps it for the next chunk', async () => {
    const transform = createStreamingTTSTransform({
      ...SMALL,
      chunkDelayMs: 5,
      enableMetrics: false,
    });
    const writer = transform.writable.getWriter();
    const out: string[] = [];
    const reading = (async (): Promise<void> => {
      for await (const piece of transform.readable) out.push(piece);
    })();
    await writer.write('Hola, estoy aquí contigo');
    await writer.write('      ');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30); // the timer flushes the run
    });
    await writer.write('ahora mismo');
    await writer.close();
    await reading;
    expect(out).toEqual(['Hola, estoy aquí contigo', '      ahora mismo']);
  });

  it('20k chars of unpunctuated text chunk in under 50 ms', async () => {
    const words = `${ES} ${EN}`.split(' ');
    let source = '';
    for (let i = 0; source.length < 20_000; i++) source += `${words[i % words.length]} `;
    source = source.slice(0, 20_000).trimEnd();
    const started = performance.now();
    const chunks = await chunk([source], {});
    const ms = performance.now() - started;
    expect(chunks.join('')).toBe(source);
    expect(ms).toBeLessThan(50);
  });
});

/** A reply stream that records what the gateway pushes. */
class RecordingReply implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {
    yield new ArrayBuffer(4);
  }
}

describe('chunker into the gateway continuation path (#4065)', () => {
  beforeEach(() => vi.stubEnv('CASCADE_SENTENCE_BREAK_MS', '0'));
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['Spanish', ES],
    ['English', EN],
    ['mixed punctuation', MIXED],
  ])('%s: the voice gets every word break', async (_name, source) => {
    const processor = getSSMLProcessor();
    const reply = new RecordingReply();
    const { readable, feed } = chunker(SMALL);
    const audio = createContinuationTTS({
      textStream: readable,
      reply,
      sanitize: (piece) => {
        const parsed = processor.parse(piece);
        return { text: parsed.cleanText.trim(), prosody: parsed.prosody };
      },
      openingTags: prosodyTags,
      toFrames: (pcm) => [{ bytes: pcm.byteLength } as unknown as AudioFrame],
      onFirstAudio: () => undefined,
      onError: () => undefined,
      firstChunkWaitMs: 0,
    });
    const draining = (async (): Promise<void> => {
      for await (const _frame of audio) void _frame;
    })();
    await feed(tokens(source));
    await draining;
    const spoken = reply.pushes
      .join('')
      .replace(/<[^>]{0,200}>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(spoken.split(' ')).toEqual(source.split(' '));
  });
});

/**
 * Runs a fixed corpus of logged replies (fixtures/name-push-corpus.json) through
 * the name gate and the continuation path, the way a call does, and returns what
 * each would send. The fixture's `main` field holds what origin/main sent before
 * NAME_FALLING_SPLIT existed; name-push-corpus.test.ts checks the flag off still
 * sends exactly that.
 */
import type { AudioFrame } from '@livekit/rtc-node';
import { ReadableStream } from 'node:stream/web';

import { withNameGate } from '../../../agents/personas/name-gate.js';
import { createContinuationTTS } from '../continuation-tts.js';
import type { ReplyStream } from '../providers/cartesia-reply-stream.js';
import { prosodyTags } from '../providers/cartesia.js';
import { getSSMLProcessor } from '../ssml/processor.js';

export interface CorpusLine {
  text: string;
  name: string;
}

/** A reply stream that records what would go to Cartesia. */
class FakeReply implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

function streamOf(pieces: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(c) {
      for (const p of pieces) c.enqueue(p);
      c.close();
    },
  });
}

/** The reply as one piece, and as LLM-like tokens (a word with its leading space). */
export const SPLITS: Record<string, (t: string) => string[]> = {
  whole: (t) => [t],
  words: (t) => t.split(/(?=\s)/),
};

const processor = getSSMLProcessor();

/** The pushes the continuation path sends for a streamed reply. */
export async function pushesFor(pieces: string[], callerName?: string): Promise<string[]> {
  const reply = new FakeReply();
  const stream = createContinuationTTS({
    textStream: streamOf(pieces),
    reply,
    callerName,
    sanitize: (chunk) => {
      const r = processor.parse(chunk);
      return { text: r.cleanText.trim(), prosody: r.prosody };
    },
    openingTags: prosodyTags,
    sentenceBreakMs: 0,
    toFrames: (pcm) => [{ bytes: pcm.byteLength } as unknown as AudioFrame],
    onFirstAudio: () => undefined,
    onError: (e) => {
      throw e;
    },
  } as Parameters<typeof createContinuationTTS>[0]);
  for await (const _ of stream) {
    /* drain */
  }
  return reply.pushes;
}

/** A call past its first reply, so the gate drops the name. */
const MID_CALL = [
  { role: 'user', textContent: 'hi' },
  { role: 'assistant', textContent: 'Hello there.' },
  { role: 'user', textContent: 'so anyway' },
];

/** What the name gate passes on, as pieces (the way the gateway receives them). */
export async function gatePieces(
  pieces: string[],
  name: string,
  firstReply: boolean,
  env: Record<string, string>
): Promise<string[]> {
  const out: string[] = [];
  const gated = withNameGate(streamOf(pieces), {
    name,
    history: firstReply ? [] : MID_CALL,
    env: { NAME_GATE: 'on', ...env },
  });
  for await (const c of gated as unknown as AsyncIterable<unknown>) {
    if (typeof c === 'string') out.push(c);
  }
  return out;
}

/** Every output the corpus pins, keyed by path, flag state and how the text arrived. */
export async function corpusOutputs(
  line: CorpusLine,
  env: Record<string, string>
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const saved = { ...process.env };
  try {
    for (const falling of ['off', 'on']) {
      Object.assign(process.env, env, { NAME_FALLING_INTONATION: falling });
      const flags = { ...env, NAME_FALLING_INTONATION: falling };
      for (const [how, split] of Object.entries(SPLITS)) {
        const pieces = split(line.text);
        out[`tts.${falling}.${how}`] = await pushesFor(pieces, line.name);
        for (const first of [true, false]) {
          const gated = await gatePieces(pieces, line.name, first, flags);
          const at = first ? 'hello' : 'midcall';
          out[`gate.${at}.${falling}.${how}`] = gated;
          out[`call.${at}.${falling}.${how}`] = await pushesFor(gated, line.name);
        }
      }
    }
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  return out;
}

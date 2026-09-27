/**
 * Voice a streamed LLM reply as one continuous TTS generation.
 *
 * The LLM's text is cut at sentence boundaries (never inside markup), cleaned,
 * and pushed into a single provider reply stream as it arrives, so synthesis
 * starts on the first sentence while the model is still writing the rest, and
 * the provider keeps one tone and rhythm across the whole reply. The reply's
 * opening emotion/speed/volume go on the first push only; per the persona
 * contract there is one per reply, and Cartesia treats mid-reply shifts as
 * experimental.
 *
 * @module speech/tts-gateway/continuation-tts
 */

import type { AudioFrame } from '@livekit/rtc-node';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { ReadableStream } from 'node:stream/web';

import { findChunkEnd } from './chunk-boundary.js';
import type { ReplyStream } from './providers/cartesia-reply-stream.js';
import type { SSMLProsodyConfig } from './types.js';

const MIN_FIRST_CHUNK = 20;
const MIN_CHUNK = 15;

export interface ContinuationOptions {
  textStream: NodeReadableStream<string>;
  reply: ReplyStream;
  /** Strip markup and instruction blocks; returns speakable text and its prosody. */
  sanitize(chunk: string): { text: string; prosody: SSMLProsodyConfig };
  /** Render the opening prosody as inline tags for the first push. */
  openingTags(prosody: SSMLProsodyConfig): string;
  /** Session emotion hint, used when the reply names none. */
  emotion?: string;
  toFrames(pcm: ArrayBuffer): Iterable<AudioFrame>;
  onFirstAudio(): void;
  onError(error: unknown, phase: 'text' | 'audio'): void;
}

export function createContinuationTTS(opts: ContinuationOptions): NodeReadableStream<AudioFrame> {
  const { textStream, reply, sanitize, openingTags, emotion, toFrames, onFirstAudio, onError } =
    opts;
  const reader = textStream.getReader();
  let stopped = false;

  /** Cut the LLM text into sentences and push them as they complete. */
  const feed = async (): Promise<void> => {
    let buffer = '';
    let first = true;
    const push = (raw: string): void => {
      const { text, prosody } = sanitize(raw);
      if (!text) return;
      if (first) {
        first = false;
        reply.push(`${openingTags({ ...prosody, emotion: prosody.emotion || emotion })}${text} `);
      } else {
        // Pieces are joined verbatim, so keep a space between sentences.
        reply.push(`${text} `);
      }
    };
    try {
      while (!stopped) {
        const { done, value } = await reader.read();
        if (value) buffer += value;
        let end: number | null;
        while ((end = findChunkEnd(buffer, first ? MIN_FIRST_CHUNK : MIN_CHUNK)) !== null) {
          push(buffer.slice(0, end));
          buffer = buffer.slice(end);
        }
        if (done) break;
      }
      if (buffer && !stopped) push(buffer);
      reply.end();
    } catch (error) {
      onError(error, 'text');
      reply.cancel();
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* already released */
      }
    }
  };

  return new ReadableStream<AudioFrame>({
    async start(controller) {
      const feeding = feed();
      let heardAudio = false;
      try {
        for await (const pcm of reply) {
          if (stopped) break;
          if (pcm.byteLength === 0) continue;
          if (!heardAudio) {
            heardAudio = true;
            onFirstAudio();
          }
          for (const frame of toFrames(pcm)) controller.enqueue(frame);
        }
      } catch (error) {
        onError(error, 'audio');
      }
      await feeding;
      if (!stopped) {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      // The listener stopped playback (the user interrupted): stop both sides.
      stopped = true;
      reply.cancel();
      void reader.cancel().catch(() => undefined);
    },
  }) as NodeReadableStream<AudioFrame>;
}

/**
 * Voice a streamed LLM reply as one continuous TTS generation.
 *
 * The LLM's text is cut at sentence boundaries (never inside markup), cleaned,
 * and pushed into a single provider reply stream as it arrives, so synthesis
 * starts on the first sentence while the model is still writing the rest, and
 * the provider keeps one tone and rhythm across the whole reply. Emotion,
 * speed and volume tags travel inline with the sentence they belong to and
 * hold until changed, so the reply keeps its pacing and emotional colour
 * without splitting the generation.
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

/** The voice settings in force on the Cartesia context. */
interface VoiceState {
  speed: number;
  volume: number;
  emotion?: string;
}

/**
 * Tags that move the context from `from` to `to`. Inline tags persist on a
 * Cartesia context until changed, so a tag is written only when a setting
 * changes, including an explicit return to 1 (which prosodyTags would skip).
 */
export function voiceStateTags(from: VoiceState, to: VoiceState): string {
  let tags = '';
  if (to.speed !== from.speed) tags += `<speed ratio="${to.speed}"/>`;
  if (to.volume !== from.volume) tags += `<volume ratio="${to.volume}"/>`;
  if (to.emotion && to.emotion !== from.emotion) tags += `<emotion value="${to.emotion}"/>`;
  return tags;
}

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
    // Each sentence carries the emotion, speed and volume the reply's markup
    // gives it, from where it appears until it changes (the same semantics as
    // Cartesia inline tags). Only the first sentence used to keep its tags,
    // with emotion cut to a calm list: the humanization layer's pacing, softer
    // volume and emotional colour were written and then thrown away.
    let state: VoiceState = { speed: 1, volume: 1 };
    const push = (raw: string): void => {
      const { text, prosody } = sanitize(raw);
      if (!text) return;
      const next: VoiceState = {
        speed: prosody.speed ?? state.speed,
        volume: prosody.volume ?? state.volume,
        emotion: prosody.emotion ?? (first ? emotion : undefined) ?? state.emotion,
      };
      const tags = first ? openingTags(next) : voiceStateTags(state, next);
      first = false;
      state = next;
      // Pieces are joined verbatim, so keep a space between sentences.
      reply.push(`${tags}${text} `);
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

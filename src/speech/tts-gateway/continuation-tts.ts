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
/** A reply's relative speed on the session base, within Cartesia's 0.6-1.5. */
export function scaleSpeed(base: number, relative: number): number {
  return Math.round(Math.min(1.5, Math.max(0.6, base * relative)) * 100) / 100;
}

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
  /**
   * Opens another reply stream on the same voice. When given, a change of
   * emotion mid-reply continues on a fresh generation: Cartesia calls emotion
   * shifts inside one generation highly experimental and recommends a separate
   * context per emotion. Audio still plays in order, with the next context
   * generating while the previous one plays.
   */
  openReply?: () => ReplyStream;
  /** Strip markup and instruction blocks; returns speakable text and its prosody. */
  sanitize(chunk: string): { text: string; prosody: SSMLProsodyConfig };
  /** Render the opening prosody as inline tags for the first push. */
  openingTags(prosody: SSMLProsodyConfig): string;
  /** Session emotion hint, used when the reply names none. */
  emotion?: string;
  /**
   * Session base speed (pace matching). Speed tags in the reply are relative
   * to it: "0.9" on a 1.05 base plays at 0.95.
   */
  baseSpeed?: number;
  toFrames(pcm: ArrayBuffer): Iterable<AudioFrame>;
  onFirstAudio(): void;
  onError(error: unknown, phase: 'text' | 'audio'): void;
}

export function createContinuationTTS(opts: ContinuationOptions): NodeReadableStream<AudioFrame> {
  const { textStream, reply, sanitize, openingTags, emotion, toFrames, onFirstAudio, onError } =
    opts;
  const reader = textStream.getReader();
  let stopped = false;
  // Contexts in play order; the feed writes to the last one.
  const replies: ReplyStream[] = [reply];
  let current = reply;
  let feedDone = false;
  let wakeAudio: (() => void) | null = null;
  const notifyAudio = (): void => {
    wakeAudio?.();
    wakeAudio = null;
  };
  const cancelAll = (): void => {
    for (const r of replies) r.cancel();
  };

  /** Cut the LLM text into sentences and push them as they complete. */
  const feed = async (): Promise<void> => {
    let buffer = '';
    let first = true;
    // Each sentence carries the emotion, speed and volume the reply's markup
    // gives it, from where it appears until it changes (the same semantics as
    // Cartesia inline tags). Only the first sentence used to keep its tags,
    // with emotion cut to a calm list: the humanization layer's pacing, softer
    // volume and emotional colour were written and then thrown away.
    const base = opts.baseSpeed ?? 1;
    let state: VoiceState = { speed: base, volume: 1 };
    const push = (raw: string): void => {
      const { text, prosody } = sanitize(raw);
      if (!text) return;
      const next: VoiceState = {
        speed: prosody.speed !== undefined ? scaleSpeed(base, prosody.speed) : state.speed,
        volume: prosody.volume ?? state.volume,
        emotion: prosody.emotion ?? (first ? emotion : undefined) ?? state.emotion,
      };
      const shiftsEmotion =
        !first &&
        opts.openReply !== undefined &&
        next.emotion !== undefined &&
        next.emotion !== state.emotion;
      if (shiftsEmotion) {
        current.end();
        current = opts.openReply!();
        replies.push(current);
        notifyAudio();
      }
      // A new context starts from the defaults, so it gets the full state.
      const tags = first || shiftsEmotion ? openingTags(next) : voiceStateTags(state, next);
      first = false;
      state = next;
      // Pieces are joined verbatim, so keep a space between sentences.
      current.push(`${tags}${text} `);
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
      current.end();
    } catch (error) {
      onError(error, 'text');
      cancelAll();
    } finally {
      feedDone = true;
      notifyAudio();
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
        for (let i = 0; !stopped; i++) {
          while (i >= replies.length && !feedDone) {
            await new Promise<void>((resolve) => {
              wakeAudio = resolve;
            });
          }
          if (i >= replies.length) break;
          for await (const pcm of replies[i]) {
            if (stopped) break;
            if (pcm.byteLength === 0) continue;
            if (!heardAudio) {
              heardAudio = true;
              onFirstAudio();
            }
            for (const frame of toFrames(pcm)) controller.enqueue(frame);
          }
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
      cancelAll();
      notifyAudio();
      void reader.cancel().catch(() => undefined);
    },
  }) as NodeReadableStream<AudioFrame>;
}

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

import { findChunkEnd, findFirstChunkEnd, findFirstWordEnd } from './chunk-boundary.js';
import { decideEmotion, STABLE_EMOTIONS } from './director/emotion.js';
import type { ReplyStream } from './providers/cartesia-reply-stream.js';
import type { SSMLProsodyConfig } from './types.js';

// Big emotions widened the voice's pitch range (8.7 to 10.9 st) and swung it
// between turns; only the measured-stable set reaches Cartesia (#180).
const STABLE = new Set<string>(STABLE_EMOTIONS);
const stable = (e?: string): string | undefined => (e && STABLE.has(e) ? e : undefined);

/** The first piece may be a clause (see findFirstChunkEnd): start talking sooner. */
const MIN_FIRST_CHUNK = 12;
/**
 * How long the first piece may wait for a clause break once the model's text
 * starts arriving, before it goes out cut at a word boundary instead.
 */
export const FIRST_CHUNK_WAIT_MS = 150;
const WAIT_EXPIRED = Symbol('wait-expired');

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

/**
 * Ma: a beat of silence between sentences, so a reply breathes instead of
 * running its sentences together. Written by code, between pieces that end a
 * sentence, never by the model (the director keeps pause tags out of its
 * text). CASCADE_SENTENCE_BREAK_MS tunes it; 0 turns it off.
 */
export const DEFAULT_SENTENCE_BREAK_MS = 300;
export function sentenceBreakMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.CASCADE_SENTENCE_BREAK_MS;
  const ms = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(ms) && ms >= 0
    ? Math.min(Math.round(ms), 2000)
    : DEFAULT_SENTENCE_BREAK_MS;
}
// A full stop, ! or ?; not an ellipsis ("my window... reminds me" runs on).
const ENDS_SENTENCE = /(?:[!?]|(?<!\.)\.)["'”’)\]]*$/;

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
  /** The caller's detected mood; the first sentence answers it when the reply names no emotion. */
  emotion?: string;
  /**
   * Session base speed (pace matching). Speed tags in the reply are relative
   * to it: "0.9" on a 1.05 base plays at 0.95.
   */
  baseSpeed?: number;
  toFrames(pcm: ArrayBuffer): Iterable<AudioFrame>;
  onFirstAudio(): void;
  /** Pause between sentences in ms; defaults to sentenceBreakMs() (env). */
  sentenceBreakMs?: number;
  /** Override FIRST_CHUNK_WAIT_MS (tests). */
  firstChunkWaitMs?: number;
  /** Timing marks for the first-audio log: first LLM text in, first text sent. */
  onStage?(stage: 'text' | 'push'): void;
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
    let pushed = false;
    let heardText = false;
    let state: VoiceState = { speed: base, volume: 1 };
    const breakMs = opts.sentenceBreakMs ?? sentenceBreakMs();
    let afterSentence = false;
    const push = (raw: string): void => {
      const { text, prosody } = sanitize(raw);
      if (!text) return;
      const next: VoiceState = {
        speed: prosody.speed !== undefined ? scaleSpeed(base, prosody.speed) : state.speed,
        volume: prosody.volume ?? state.volume,
        emotion:
          stable(prosody.emotion) ??
          // The session emotion is the caller's mood: answer it (sad -> sympathetic),
          // and only where the opening words agree (Cartesia honours an emotion
          // only when it fits the transcript).
          (first && emotion ? decideEmotion({ sessionHint: emotion, openingText: text }).emotion : undefined) ??
          state.emotion,
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
      // No second pause where the reply already opens this piece with its own break.
      const ownBreak = /^(?:<(?!break)[^>]*>)*<break/.test(`${tags}${text}`);
      const pause = afterSentence && breakMs > 0 && !ownBreak ? `<break time="${breakMs}ms"/>` : '';
      afterSentence = ENDS_SENTENCE.test(text);
      first = false;
      state = next;
      // Pieces are joined verbatim, so keep a space between sentences.
      current.push(`${pause}${tags}${text} `);
      if (!pushed) {
        pushed = true;
        opts.onStage?.('push');
      }
    };
    const waitMs = opts.firstChunkWaitMs ?? FIRST_CHUNK_WAIT_MS;
    let pending: Promise<{ done: boolean; value?: string }> | undefined;
    let firstTextAt: number | undefined;
    let waitExpired = false;
    try {
      while (!stopped) {
        pending ??= reader.read();
        let next: { done: boolean; value?: string } | typeof WAIT_EXPIRED;
        if (first && buffer && firstTextAt !== undefined && !waitExpired) {
          // The first words are written but no clause break yet: wait a moment
          // for one, then send at a word boundary rather than hold them.
          let timer: ReturnType<typeof setTimeout> | undefined;
          next = await Promise.race([
            pending,
            new Promise<typeof WAIT_EXPIRED>((resolve) => {
              timer = setTimeout(
                () => resolve(WAIT_EXPIRED),
                Math.max(0, waitMs - (Date.now() - firstTextAt!))
              );
            }),
          ]);
          clearTimeout(timer);
        } else {
          next = await pending;
        }
        if (next === WAIT_EXPIRED) {
          waitExpired = true;
          const end = findFirstWordEnd(buffer, MIN_FIRST_CHUNK);
          if (end !== null) {
            push(buffer.slice(0, end));
            buffer = buffer.slice(end);
          }
          continue;
        }
        pending = undefined;
        const { done, value } = next;
        if (value) {
          if (!heardText) {
            heardText = true;
            firstTextAt = Date.now();
            opts.onStage?.('text');
          }
          buffer += value;
        }
        let end: number | null;
        while (
          (end = first
            ? findFirstChunkEnd(buffer, MIN_FIRST_CHUNK)
            : findChunkEnd(buffer, MIN_CHUNK)) !== null
        ) {
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

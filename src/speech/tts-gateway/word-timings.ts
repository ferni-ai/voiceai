/**
 * Cartesia word timestamps on the gateway's reply frames (TTS_ALIGNED_TRANSCRIPT).
 *
 * The gateway voices a reply on its own Cartesia socket, so the SDK's aligned
 * captions get no timings unless the gateway puts them on its frames, as the
 * Cartesia plugin does (agents-plugin-cartesia tts.js: timings that have
 * arrived ride the next frame). The SDK reads each start against the seconds
 * of reply audio it has been handed (voice/transcription/synchronizer.js), and
 * Cartesia times words from the start of their context. So each context is
 * shifted by the reply audio played before it, and the first one by the lead
 * silence trimmed off it (lead-silence.ts).
 *
 * @module speech/tts-gateway/word-timings
 */

import { USERDATA_TIMED_TRANSCRIPT, voice } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';

export interface WordTiming {
  word: string;
  /** Seconds from the start of the Cartesia context. */
  start: number;
  end: number;
}

const isTime = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** The usable words of a Cartesia `word_timestamps` payload; anything malformed is dropped. */
export function parseWordTimestamps(raw: unknown): WordTiming[] {
  if (!raw || typeof raw !== 'object') return [];
  const { words, start, end } = raw as Record<string, unknown>;
  if (!Array.isArray(words) || !Array.isArray(start) || !Array.isArray(end)) return [];
  const out: WordTiming[] = [];
  words.forEach((word, i) => {
    const [s, e] = [start[i], end[i]];
    if (typeof word === 'string' && word.trim() && isTime(s) && isTime(e) && e >= s) {
      out.push({ word, start: s, end: e });
    }
  });
  return out;
}

type FramesOf = (pcm: ArrayBuffer) => Iterable<AudioFrame>;

/** A reply stream that can hand over the word timings that have arrived. */
export interface WordSource {
  takeWordTimings?(): WordTiming[];
}

/** One reply's word timings, placed on its frames in reply time. */
export class ReplyWordTimings {
  /** Disabled (TTS_ALIGNED_TRANSCRIPT off), it leaves the frames exactly as they were. */
  constructor(private readonly enabled = true) {}

  private pending: voice.TimedString[] = [];
  private emittedS = 0;
  /** Reply seconds at which the current context's clock reads zero. */
  private base = 0;
  private lastStart = 0;
  private lastEnd = 0;

  /** The next context starts playing after all the audio emitted so far. */
  startContext(): void {
    if (!this.enabled) return;
    this.base = this.emittedS;
    this.lastStart = 0;
    this.lastEnd = 0;
  }

  /** Lead silence dropped from the front of the current context. */
  trimmed(ms: number): void {
    this.base -= ms / 1000;
  }

  add(words: readonly WordTiming[]): void {
    for (const w of words) {
      // Cartesia's docs do not say whether a continuation restarts the clock; if
      // one does, carry on from the context's last word rather than go backwards.
      if (w.start < this.lastStart) this.base += this.lastEnd;
      this.lastStart = w.start;
      this.lastEnd = w.end;
      this.pending.push(
        voice.createTimedString({
          text: `${w.word} `, // spaced like the plugin's words
          startTime: Math.max(0, this.base + w.start),
          endTime: Math.max(0, this.base + w.end),
        })
      );
    }
  }

  /** The frames of `bytes` of s16 PCM, with the timings so far on the first. */
  *place(frames: Iterable<AudioFrame>, bytes: number, sampleRate = 24000): Generator<AudioFrame> {
    this.emittedS += bytes / 2 / sampleRate;
    for (const frame of frames) {
      if (this.pending.length > 0) {
        frame.userdata[USERDATA_TIMED_TRANSCRIPT] = this.pending;
        this.pending = [];
      }
      yield frame;
    }
  }

  /** `next`, run after this context's lead trim is noted. */
  onTrimmed(next?: (ms: number) => void): ((ms: number) => void) | undefined {
    if (!this.enabled) return next;
    return (ms) => {
      this.trimmed(ms);
      next?.(ms);
    };
  }

  /** The frames of one chunk of `from`'s audio, carrying the words that have arrived. */
  frames(pcm: ArrayBuffer, from: WordSource, toFrames: FramesOf): Iterable<AudioFrame> {
    if (!this.enabled) return toFrames(pcm);
    this.add(from.takeWordTimings?.() ?? []);
    return this.place(toFrames(pcm), pcm.byteLength);
  }

  /** Words that arrive after a context's last audio ride the next frame. */
  addLate(from: WordSource): void {
    if (this.enabled) this.add(from.takeWordTimings?.() ?? []);
  }

  /** After the reply's last audio, 10 ms of silence to carry the words still waiting. */
  tail(live: boolean, toFrames: FramesOf): Iterable<AudioFrame> {
    return this.enabled && live && this.hasPending()
      ? this.place(toFrames(new ArrayBuffer(480)), 480)
      : [];
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }
}

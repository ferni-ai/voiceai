/**
 * Keep every word of a reply in its caption and history when the audio's word
 * timings are partial or missing.
 *
 * When the TTS declares an aligned transcript (TTS_ALIGNED_TRANSCRIPT,
 * speech/tts/persona-aware.ts), the SDK builds the caption, and the assistant
 * message it saves to history, only from the caption items on the audio frames
 * (USERDATA_TIMED_TRANSCRIPT, read in @livekit/agents voice/generation.js
 * performTTSInference). A sentence whose audio carries no timings (a context
 * Cartesia returned none for, a step that rebuilt frames) would be missing
 * from both (#3200), so the backfill rewrites the items:
 *
 * - The caption text is always the reply text the TTS was given, each
 *   character once, in order. Timings only place it in time: each timed word is
 *   matched to the next words of the text, and the text up to it (including any
 *   untimed words before it) rides that word's times. A timed word that matches
 *   nothing (a spelling Cartesia changed) adds no text of its own.
 * - Plain mode: when a second of reply audio brings no timings, at the start or
 *   after the last timed word while text is still uncaptioned, or a frame is
 *   marked untimed (frame-timings.ts), each frame from then on carries the text
 *   not yet captioned, untimed, and the SDK paces it by its speaking-rate
 *   estimate, as with the flag off. Later timings are dropped.
 * - Text left at the end rides a 10 ms silent frame.
 *
 * An interrupt only ever cuts the caption short: untimed text is captioned at
 * or after the time of its audio, never before. Until the first timings or the
 * first second (whichever comes first) nothing is captioned, so an interrupt in
 * that second saves less than was said.
 *
 * @module agents/shared/aligned-caption-backfill
 */

import { USERDATA_TIMED_TRANSCRIPT, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { TransformStream, type ReadableStream } from 'node:stream/web';
import { USERDATA_UNTIMED, frameTimings } from './frame-timings.js';
import { isReplyAudioLeadFrame } from './performance/reply-audio-stage.js';

/** True when this agent's replies are captioned from frame timings (agent_activity.js). */
export function captionsFromFrameTimings(agent: voice.Agent): boolean {
  const tts = agent.tts ?? (agent.session as voice.AgentSession | undefined)?.tts;
  return tts?.capabilities.alignedTranscript === true;
}

/** Reply audio, in seconds, with no timings after which the rest of the text goes out untimed. */
const GRACE_S = 1;
/** How many words ahead of the captioned text a timed word may match. */
const MATCH_WORDS = 8;

type Mode = 'waiting' | 'timed' | 'plain';
type Caption = string | voice.TimedString;

/** Inline tags (`<emotion .../>`, `[laughter]`) are never spoken; blanked in place to match words. */
const spokenView = (s: string): string =>
  s.replace(/<[^>]*>|\[[^\]]*\]/g, (m) => ' '.repeat(m.length));
const wordKey = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const hasWords = (s: string): boolean => /[\p{L}\p{N}]/u.test(spokenView(s));

export class CaptionBackfill {
  /** The reply text given to the TTS so far. */
  private text = '';
  /** How much of `text` is captioned. */
  private sent = 0;
  private mode: Mode = 'waiting';
  /** Reply audio seconds so far, and speech (not a Stage 2 opening) heard before any timings. */
  private heardS = 0;
  private waitedS = 0;
  /** Reply time of the last timed word. */
  private timedToS = 0;

  /** Records the reply text on its way to the TTS. */
  tapText(text: ReadableStream<string>): ReadableStream<string> {
    return text.pipeThrough(
      new TransformStream<string, string>({
        transform: (chunk, controller) => {
          this.text += chunk;
          controller.enqueue(chunk);
        },
      })
    );
  }

  /** The reply audio, its caption items rewritten so no word of the text is lost. */
  wrapAudio(audio: ReadableStream<AudioFrame> | null): ReadableStream<AudioFrame> | null {
    if (!audio) return audio;
    let last: AudioFrame | undefined;
    return audio.pipeThrough(
      new TransformStream<AudioFrame, AudioFrame>({
        transform: (frame, controller) => {
          last = frame;
          const seconds = frame.samplesPerChannel / frame.sampleRate;
          this.heardS += seconds;
          const timings = frameTimings(frame);
          if (frame.userdata[USERDATA_UNTIMED] === true) this.mode = 'plain';
          else if (this.mode === 'waiting') {
            if (!isReplyAudioLeadFrame(frame)) this.waitedS += seconds;
            if (timings) this.mode = 'timed';
            else if (this.waitedS >= GRACE_S) this.mode = 'plain';
          } else if (this.mode === 'timed' && !timings) {
            const untimedS = this.heardS - this.timedToS;
            if (untimedS >= GRACE_S && hasWords(this.text.slice(this.sent))) this.mode = 'plain';
          }
          if (this.mode === 'plain') {
            const rest = this.rest();
            controller.enqueue(this.withCaptions(frame, rest ? [rest] : []));
          } else if (timings) controller.enqueue(this.withCaptions(frame, this.align(timings)));
          else controller.enqueue(frame);
        },
        flush: (controller) => {
          const rest = this.rest();
          if (!last || !rest.trim()) return;
          const samples = Math.max(1, Math.round(last.sampleRate / 100));
          const silence = new Int16Array(samples * last.channels);
          controller.enqueue(
            this.withCaptions(new AudioFrame(silence, last.sampleRate, last.channels, samples), [
              rest,
            ])
          );
        },
      })
    );
  }

  /** Takes the text not yet captioned. */
  private rest(): string {
    const rest = this.text.slice(this.sent);
    this.sent = this.text.length;
    return rest;
  }

  /** The frame's timed words as slices of the reply text, each carrying the text up to it. */
  private align(timings: Caption[]): Caption[] {
    const out: Caption[] = [];
    for (const item of timings) {
      const timed = voice.isTimedString(item);
      if (timed) this.timedToS = Math.max(this.timedToS, item.endTime ?? item.startTime ?? 0);
      const end = this.matchEnd(timed ? item.text : item);
      if (end === undefined) continue;
      const text = this.text.slice(this.sent, end);
      this.sent = end;
      out.push(
        timed
          ? voice.createTimedString({ text, startTime: item.startTime, endTime: item.endTime })
          : text
      );
    }
    return out;
  }

  /** Where `word` ends (with the space after it) among the next words of the text, if there. */
  private matchEnd(word: string): number | undefined {
    const key = wordKey(word);
    if (!key) return undefined;
    const view = spokenView(this.text);
    const words = /\S+/g;
    words.lastIndex = this.sent;
    for (let n = 0; n < MATCH_WORDS; n++) {
      const m = words.exec(view);
      if (!m) return undefined;
      if (wordKey(m[0]) !== key) continue;
      let end = m.index + m[0].length;
      while (end < this.text.length && /\s/.test(this.text[end])) end++;
      return end;
    }
    return undefined;
  }

  /** A copy (frames may be cached and replayed) carrying `captions` in place of its own. */
  private withCaptions(frame: AudioFrame, captions: Caption[]): AudioFrame {
    const userdata: Record<string, unknown> = { ...frame.userdata };
    delete userdata[USERDATA_TIMED_TRANSCRIPT];
    if (captions.length > 0) userdata[USERDATA_TIMED_TRANSCRIPT] = captions;
    return new AudioFrame(
      frame.data,
      frame.sampleRate,
      frame.channels,
      frame.samplesPerChannel,
      userdata
    );
  }
}

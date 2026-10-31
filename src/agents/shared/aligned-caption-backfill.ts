/**
 * Keep a reply's words when its audio carries no word timings.
 *
 * When the TTS declares an aligned transcript (TTS_ALIGNED_TRANSCRIPT,
 * speech/tts/persona-aware.ts), the SDK builds the caption, and the assistant
 * message it saves to history, only from the timings on the audio frames
 * (USERDATA_TIMED_TRANSCRIPT, read in @livekit/agents voice/generation.js
 * performTTSInference). Audio that lost them on the way (a step that rebuilds
 * frames, a voice that returns no timestamps) would leave the reply with no
 * caption and nothing in history.
 *
 * Frames pass through untouched while timings arrive. If the first second of
 * audio brings none, the reply switches to plain text: each frame from then on
 * carries the text the TTS has been given since the last one (late timings are
 * dropped, so no word shows twice), and the SDK paces it by its speaking-rate
 * estimate, as with the flag off. Text left at the end rides a 10 ms silent frame.
 *
 * @module agents/shared/aligned-caption-backfill
 */

import { USERDATA_TIMED_TRANSCRIPT, type voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import { TransformStream, type ReadableStream } from 'node:stream/web';

/** True when this agent's replies are captioned from frame timings (agent_activity.js). */
export function captionsFromFrameTimings(agent: voice.Agent): boolean {
  const tts = agent.tts ?? (agent.session as voice.AgentSession | undefined)?.tts;
  return tts?.capabilities.alignedTranscript === true;
}

/** Audio, in seconds, after which a reply with no timings is taken to have none. */
const GRACE_S = 1;

type Mode = 'waiting' | 'timed' | 'plain';

export class CaptionBackfill {
  private pending = '';
  private mode: Mode = 'waiting';
  private heardS = 0;

  /** Records the reply text on its way to the TTS. */
  tapText(text: ReadableStream<string>): ReadableStream<string> {
    return text.pipeThrough(
      new TransformStream<string, string>({
        transform: (chunk, controller) => {
          this.pending += chunk;
          controller.enqueue(chunk);
        },
      })
    );
  }

  /** The reply audio, with plain text attached once it is clear no timings are coming. */
  wrapAudio(audio: ReadableStream<AudioFrame> | null): ReadableStream<AudioFrame> | null {
    if (!audio) return audio;
    let last: AudioFrame | undefined;
    return audio.pipeThrough(
      new TransformStream<AudioFrame, AudioFrame>({
        transform: (frame, controller) => {
          last = frame;
          if (this.mode === 'waiting') {
            const timings = frame.userdata[USERDATA_TIMED_TRANSCRIPT] as unknown[] | undefined;
            this.heardS += frame.samplesPerChannel / frame.sampleRate;
            if (timings && timings.length > 0) this.mode = 'timed';
            else if (this.heardS >= GRACE_S) this.mode = 'plain';
          }
          controller.enqueue(this.mode === 'plain' ? this.withText(frame) : frame);
        },
        flush: (controller) => {
          if (this.mode === 'timed' || !last || !this.pending) return;
          const samples = Math.max(1, Math.round(last.sampleRate / 100));
          const silence = new Int16Array(samples * last.channels);
          controller.enqueue(
            this.withText(new AudioFrame(silence, last.sampleRate, last.channels, samples))
          );
        },
      })
    );
  }

  /** A copy (frames may be cached and replayed) carrying only the text not yet sent. */
  private withText(frame: AudioFrame): AudioFrame {
    const userdata: Record<string, unknown> = { ...frame.userdata };
    delete userdata[USERDATA_TIMED_TRANSCRIPT];
    if (this.pending) userdata[USERDATA_TIMED_TRANSCRIPT] = [this.pending];
    this.pending = '';
    return new AudioFrame(
      frame.data,
      frame.sampleRate,
      frame.channels,
      frame.samplesPerChannel,
      userdata
    );
  }
}

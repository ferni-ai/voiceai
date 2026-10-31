/**
 * Word timings on reply frames (TTS_ALIGNED_TRANSCRIPT), kept right by the
 * steps that rebuild or prepend frames after the TTS.
 *
 * With the flag on, the SDK paces captions, and cuts the assistant message it
 * saves on an interrupt, by the timings on each frame
 * (USERDATA_TIMED_TRANSCRIPT, in seconds of reply audio). A step that puts
 * audio in front of the reply shifts them (`shiftTimings`); a step that rebuilds
 * frames and cannot keep them marks its frames (`markUntimed`), so the caption
 * backfill (aligned-caption-backfill.ts) captions the rest of the reply from its
 * text at once instead of waiting for timings that will not come.
 *
 * With the flag off no frame carries timings, and every helper here returns
 * the frame unchanged.
 *
 * @module agents/shared/frame-timings
 */

import { USERDATA_TIMED_TRANSCRIPT, voice } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';

/** On a frame rebuilt without the word timings it stood for. */
export const USERDATA_UNTIMED = 'ferni.untimed';

type Caption = string | voice.TimedString;

/** The frame's caption items, if any. */
export function frameTimings(frame: AudioFrame): Caption[] | undefined {
  const items = frame.userdata[USERDATA_TIMED_TRANSCRIPT] as Caption[] | undefined;
  return items && items.length > 0 ? items : undefined;
}

/** Marks a frame (one this step just built) as standing for audio whose timings were dropped. */
export function markUntimed(frame: AudioFrame): AudioFrame {
  frame.userdata[USERDATA_UNTIMED] = true;
  return frame;
}

/** Only the timing entries of `frame.userdata`, for a step that rebuilds the frame. */
export function timingUserdata(frame: AudioFrame): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of [USERDATA_TIMED_TRANSCRIPT, USERDATA_UNTIMED]) {
    if (frame.userdata[key] !== undefined) out[key] = frame.userdata[key];
  }
  return out;
}

const later = (t: number | undefined, byS: number): number | undefined =>
  t === undefined ? undefined : t + byS;

/** `frame` with its word timings `byS` later (audio was put in front of it); the frame itself when it has none. */
export function shiftTimings(frame: AudioFrame, byS: number): AudioFrame {
  const items = frameTimings(frame);
  if (!items || byS === 0) return frame;
  const moved = items.map((t) =>
    voice.isTimedString(t)
      ? voice.createTimedString({
          text: t.text,
          startTime: later(t.startTime, byS),
          endTime: later(t.endTime, byS),
          confidence: t.confidence,
          startTimeOffset: t.startTimeOffset,
          speakerId: t.speakerId,
        })
      : t
  );
  return new AudioFrame(frame.data, frame.sampleRate, frame.channels, frame.samplesPerChannel, {
    ...frame.userdata,
    [USERDATA_TIMED_TRANSCRIPT]: moved,
  });
}

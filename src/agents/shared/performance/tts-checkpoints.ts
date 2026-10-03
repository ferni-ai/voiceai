/**
 * Per-turn TTS latency checkpoints on the reply's audio stream.
 *
 * - ttsFirstByte: the first frame of any kind (unchanged meaning: first audio
 *   handed to playback). With a Stage 2 opening this is the breath/sigh.
 * - ttsFirstSpeech: the first frame that is speech, i.e. not a Stage 2 lead
 *   frame. Dashboards that mean "when did the first word start" use this; it
 *   equals ttsFirstByte when there is no opening.
 * - ttsComplete: the stream ended.
 *
 * @module agents/shared/performance/tts-checkpoints
 */

import type { AudioFrame } from '@livekit/rtc-node';
import {
  TransformStream as NodeTransformStream,
  type ReadableStream as NodeReadableStream,
} from 'node:stream/web';

import { isReplyAudioLeadFrame } from './reply-audio-stage.js';

/** `markTurnCheckpoint` from the turn profiler (injected; keeps this module services-free). */
export type MarkTurnCheckpoint = (
  sessionId: string,
  turnNumber: number,
  checkpoint: 'ttsFirstByte' | 'ttsFirstSpeech' | 'ttsComplete'
) => void;

export function wrapWithTTSCheckpoints(
  stream: NodeReadableStream<AudioFrame> | null,
  sessionId: string,
  turnNumber: number | undefined,
  mark: MarkTurnCheckpoint
): NodeReadableStream<AudioFrame> | null {
  if (!stream || sessionId === 'unknown' || turnNumber === undefined) return stream;
  let firstFrame = true;
  let firstSpeech = true;
  return stream.pipeThrough(
    new NodeTransformStream<AudioFrame, AudioFrame>({
      transform(frame, controller) {
        if (firstFrame) {
          firstFrame = false;
          mark(sessionId, turnNumber, 'ttsFirstByte');
        }
        if (firstSpeech && !isReplyAudioLeadFrame(frame)) {
          firstSpeech = false;
          mark(sessionId, turnNumber, 'ttsFirstSpeech');
        }
        controller.enqueue(frame);
      },
      flush() {
        mark(sessionId, turnNumber, 'ttsComplete');
      },
    })
  );
}

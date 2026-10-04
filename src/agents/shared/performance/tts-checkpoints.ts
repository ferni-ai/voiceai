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
 * At the first speech frame the lead's length goes to the session's barge-in
 * judge (barge-in-judge.ts), which then times Ferni from her first word.
 *
 * @module agents/shared/performance/tts-checkpoints
 */

import type { AudioFrame } from '@livekit/rtc-node';
import {
  TransformStream as NodeTransformStream,
  type ReadableStream as NodeReadableStream,
} from 'node:stream/web';

import { noteReplyLead } from '../../../speech/graceful-interrupt/barge-in-judge.js';
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
  if (!stream || sessionId === 'unknown') return stream;
  // Without a turn there are no checkpoints, but the judge still needs the lead.
  const markTurn = (checkpoint: Parameters<MarkTurnCheckpoint>[2]): void => {
    if (turnNumber !== undefined) mark(sessionId, turnNumber, checkpoint);
  };
  let firstFrame = true;
  let firstSpeech = true;
  let leadMs = 0;
  return stream.pipeThrough(
    new NodeTransformStream<AudioFrame, AudioFrame>({
      transform(frame, controller) {
        if (firstFrame) {
          firstFrame = false;
          markTurn('ttsFirstByte');
        }
        if (firstSpeech) {
          if (isReplyAudioLeadFrame(frame)) {
            leadMs += (frame.samplesPerChannel / frame.sampleRate) * 1000;
          } else {
            firstSpeech = false;
            markTurn('ttsFirstSpeech');
            if (leadMs > 0) noteReplyLead(sessionId, leadMs);
          }
        }
        controller.enqueue(frame);
      },
      flush() {
        markTurn('ttsComplete');
      },
    })
  );
}

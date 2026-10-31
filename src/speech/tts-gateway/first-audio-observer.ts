/**
 * First-audio observer for the gateway TTS node: logs TTFB once per reply and
 * marks the first audio frame in call analytics.
 *
 * @module speech/tts-gateway/first-audio-observer
 */

import { markCallStage, recordCallEvent } from '../../services/analytics/call-quality-monitor.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  noteReplyAudio,
  noteReplyText,
  replyAudioHoldMs,
} from '../output-control/reply-activity.js';
import { waitForPauseHold } from '../output-control/pause-hold.js';

// Same module name as the gateway node, so TTFB log lines are unchanged.
const log = createLogger({ module: 'GatewayTTSNode' });

export type FirstAudioObserver = (() => void) & {
  /** Record when the first LLM text arrived and when the first text went to the provider. */
  stage(stage: 'text' | 'push'): void;
  /**
   * Resolves once an opening sound no longer holds this session's reply audio,
   * and the caller has had time to go on after a pause (pause-hold.ts).
   */
  hold(): Promise<void>;
  /** Sonic's leading silence dropped before the first audio (lead-silence.ts). */
  trimmed(ms: number): void;
};

/**
 * What held a reply's first audio back once it existed (hold()): an opening clip
 * finishing (reply-activity.ts) and the pause hold (pause-hold.ts), in ms waited.
 * Both are inside its ttfbMs.
 */
export interface GatewayHolds {
  openerClipMs: number;
  pauseHoldMs: number;
}

/** A gateway reply's first audio: ms from the start of the TTS node, its first text sent, its holds. */
export type FirstAudioListener = (
  sessionId: string,
  ttfbMs: number,
  pushMs?: number,
  holds?: GatewayHolds
) => void;
const firstAudioListeners = new Set<FirstAudioListener>();

/** Hear each gateway reply's first audio (turn-receipt.ts records it). Returns an unsubscribe. */
export function onGatewayFirstAudio(listener: FirstAudioListener): () => void {
  firstAudioListeners.add(listener);
  return () => void firstAudioListeners.delete(listener);
}

interface FirstAudioObserverOptions {
  sessionId?: string;
  startTime: number;
}

export function createFirstAudioObserver({
  sessionId,
  startTime,
}: FirstAudioObserverOptions): FirstAudioObserver {
  let hasMarkedFirstAudio = false;
  const stages: { textMs?: number; pushMs?: number; leadTrimMs?: number } = {};
  const holds: GatewayHolds = { openerClipMs: 0, pauseHoldMs: 0 };

  const observe = (): void => {
    if (hasMarkedFirstAudio) return;
    hasMarkedFirstAudio = true;
    const ttfbMs = Date.now() - startTime;
    // Where the wait went: LLM text in (textMs), text sent (pushMs), audio back (ttfbMs).
    log.info({ ttfbMs, ...stages, sessionId }, `🔊 Gateway TTS TTFB: ${ttfbMs}ms`);
    if (sessionId) {
      noteReplyAudio(sessionId);
      for (const listener of firstAudioListeners)
        listener(sessionId, ttfbMs, stages.pushMs, { ...holds });
      try {
        const firstAudioAtMs = Date.now();
        markCallStage(sessionId, 'tts_first_frame', firstAudioAtMs);
        recordCallEvent({
          callId: sessionId,
          timestamp: firstAudioAtMs,
          type: 'first_response',
        });
      } catch {
        // Non-fatal observability
      }
    }
  };
  return Object.assign(observe, {
    trimmed(ms: number): void {
      stages.leadTrimMs ??= ms;
    },
    stage(stage: 'text' | 'push'): void {
      const key = stage === 'text' ? 'textMs' : 'pushMs';
      if (stage === 'text' && stages.textMs === undefined && sessionId) noteReplyText(sessionId);
      stages[key] ??= Date.now() - startTime;
    },
    async hold(): Promise<void> {
      const ms = sessionId ? replyAudioHoldMs(sessionId) : 0;
      let at = Date.now();
      if (ms > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        });
      }
      holds.openerClipMs = Date.now() - at;
      at = Date.now();
      await waitForPauseHold(sessionId);
      holds.pauseHoldMs = Date.now() - at;
    },
  });
}

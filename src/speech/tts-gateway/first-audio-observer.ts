/**
 * First-audio observer for the gateway TTS node: logs TTFB once per reply and
 * marks the first audio frame in call analytics.
 *
 * @module speech/tts-gateway/first-audio-observer
 */

import { markCallStage, recordCallEvent } from '../../services/analytics/call-quality-monitor.js';
import { createLogger } from '../../utils/safe-logger.js';
import { noteReplyAudio } from '../output-control/reply-activity.js';

// Same module name as the gateway node, so TTFB log lines are unchanged.
const log = createLogger({ module: 'GatewayTTSNode' });

export type FirstAudioObserver = (() => void) & {
  /** Record when the first LLM text arrived and when the first text went to the provider. */
  stage(stage: 'text' | 'push'): void;
};

interface FirstAudioObserverOptions {
  sessionId?: string;
  startTime: number;
}

export function createFirstAudioObserver({
  sessionId,
  startTime,
}: FirstAudioObserverOptions): FirstAudioObserver {
  let hasMarkedFirstAudio = false;
  const stages: { textMs?: number; pushMs?: number } = {};

  const observe = (): void => {
    if (hasMarkedFirstAudio) return;
    hasMarkedFirstAudio = true;
    const ttfbMs = Date.now() - startTime;
    // Where the wait went: LLM text in (textMs), text sent (pushMs), audio back (ttfbMs).
    log.info({ ttfbMs, ...stages, sessionId }, `🔊 Gateway TTS TTFB: ${ttfbMs}ms`);
    if (sessionId) {
      noteReplyAudio(sessionId);
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
    stage(stage: 'text' | 'push'): void {
      const key = stage === 'text' ? 'textMs' : 'pushMs';
      stages[key] ??= Date.now() - startTime;
    },
  });
}

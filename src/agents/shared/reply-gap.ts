/**
 * One REPLY_GAP line per caller turn: how long the caller waited for Ferni.
 *
 *   stopToCommitMs  = caller stopped speaking -> turn committed (ink end of turn)
 *   commitToAudioMs = turn committed -> first reply audio frame
 *   stopToAudioMs   = the two together: the gap the caller hears, before network
 *
 * TURN_METRICS cannot give this: it is emitted a turn late, its llmReadyMs ends
 * at the model's first token, and its TTS figures are empty on the gateway TTS.
 * Reconstructing the gap from multi-line "[AGENT STATE]" logs (2026-10-10) put
 * commit -> first audio at p50 ~0.9 s against ~0.55 s for the model alone, so
 * the stages after the model's first token matter and need measuring directly.
 *
 * The caller's stop comes from LiveKit's end-of-utterance metric (lastSpeakingTimeMs,
 * VAD-corrected); the commit and first audio from agent_state_changed
 * (thinking, then speaking). Only the first reply audio after a commit counts:
 * a tool call's second "speaking" is not the gap. The line has no words.
 *
 * @module agents/shared/reply-gap
 */

export interface ReplyGapRecord {
  stopToCommitMs: number;
  commitToAudioMs: number;
  stopToAudioMs: number;
}

interface Events {
  on(event: string, handler: (ev: unknown) => void): unknown;
  off(event: string, handler: (ev: unknown) => void): unknown;
}

interface StateEvent {
  newState?: string;
  createdAt?: number;
}

interface MetricsEvent {
  metrics?: { type?: string; lastSpeakingTimeMs?: number };
}

/** Subscribe to a session; `emit` gets one record per answered caller turn. Returns a detach. */
export function attachReplyGap(
  session: Events,
  emit: (record: ReplyGapRecord) => void
): () => void {
  let stoppedAt: number | undefined;
  let committedAt: number | undefined;

  const onMetrics = (ev: unknown): void => {
    const m = (ev as MetricsEvent | undefined)?.metrics;
    if (m?.type !== 'eou_metrics' || !m.lastSpeakingTimeMs) return;
    stoppedAt = m.lastSpeakingTimeMs;
    committedAt = undefined;
  };
  const onState = (ev: unknown): void => {
    const { newState, createdAt } = (ev ?? {}) as StateEvent;
    const at = typeof createdAt === 'number' ? createdAt : Date.now();
    if (newState === 'thinking' && stoppedAt !== undefined && committedAt === undefined) {
      committedAt = at;
      return;
    }
    if (newState !== 'speaking' || stoppedAt === undefined || committedAt === undefined) return;
    emit({
      stopToCommitMs: Math.max(0, committedAt - stoppedAt),
      commitToAudioMs: Math.max(0, at - committedAt),
      stopToAudioMs: Math.max(0, at - stoppedAt),
    });
    stoppedAt = undefined;
    committedAt = undefined;
  };
  session.on('metrics_collected', onMetrics);
  session.on('agent_state_changed', onState);
  return () => {
    session.off('metrics_collected', onMetrics);
    session.off('agent_state_changed', onState);
  };
}

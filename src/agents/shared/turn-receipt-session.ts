/**
 * Wires a TurnReceiptRecorder (turn-receipt.ts) to a live AgentSession: one
 * recorder per session, fed by the session's events, the TTS gateway's first
 * audio and pause-hold releases, and found by llmNode, withTurnReminder and the
 * barge-in paths through the note* calls.
 *
 * @module agents/shared/turn-receipt-session
 */
import { onGatewayFirstAudio } from '../../speech/tts-gateway/first-audio-observer.js';
import { onPauseHoldReleased } from '../../speech/output-control/pause-hold.js';
import {
  interruptionModeInUse,
  speechPausedForCaller,
} from '../multi-agent/interruption-config.js';
import type { ItemView, ReminderNote } from './prompt-sections.js';
import {
  TurnReceiptRecorder,
  type BargeInSource,
  type TurnReceiptOptions,
} from './turn-receipt.js';
import { eotCallFrom } from './turn-receipt-eot.js';
import { turnDetectionInUse } from './turn-patience.js';

// One recorder per AgentSession, so llmNode and withTurnReminder can find it.
const recorders = new WeakMap<object, TurnReceiptRecorder>();

/** withTurnReminder: the per-turn reminder of the request being built. */
export function noteReminder(session: object, note: ReminderNote): void {
  recorders.get(session)?.onReminder(note);
}

/** The barge-in fast path or LiveKit's barge-in model stopped Ferni (live-call-behaviors.ts). */
export function noteBargeIn(session: object, source: BargeInSource): void {
  recorders.get(session)?.onBargeIn(source);
}

/** llmNode: the request as it goes to the model, with the tools it carries. */
export function noteRequest(
  session: object,
  request: { items: readonly unknown[] },
  tools: { functionTools?: Record<string, unknown> }
): void {
  recorders
    .get(session)
    ?.onRequest(request.items as ItemView[], Object.keys(tools.functionTools ?? {}).length);
}

interface EventSource {
  on(event: string, handler: (ev: unknown) => void): unknown;
  off(event: string, handler: (ev: unknown) => void): unknown;
}

/**
 * Record a TURN_RECEIPT per caller turn on this session. Returns a detach that
 * emits a turn still open and stops listening.
 */
export function attachTurnReceipts(session: EventSource, opts: TurnReceiptOptions): () => void {
  const rec = new TurnReceiptRecorder({
    handling: () => ({
      turnDetection: turnDetectionInUse(session),
      interruptionMode: interruptionModeInUse(session),
    }),
    ...opts,
  });
  recorders.set(session, rec);
  const handlers: Array<[string, (ev: unknown) => void]> = [
    [
      'metrics_collected',
      (ev) => {
        const m = (ev as { metrics?: { type?: string } } | undefined)?.metrics;
        if (m) rec.onMetric(m as never);
      },
    ],
    ['conversation_item_added', (ev) => rec.onItem((ev as { item?: never } | undefined)?.item)],
    ['function_tools_executed', (ev) => rec.onToolsExecuted((ev ?? {}) as never)],
    ['eot_prediction', (ev) => rec.onEot(eotCallFrom(ev, session))],
    [
      'agent_state_changed',
      (ev) => {
        const { oldState, newState } = (ev ?? {}) as { oldState?: string; newState?: string };
        // LiveKit pauses a reply for the caller's voice and says "listening" (interruptByAudioActivity).
        const paused =
          oldState === 'speaking' && newState === 'listening' && speechPausedForCaller(session);
        if (paused) rec.onBargeIn('vad');
        rec.onAgentState(newState, paused);
      },
    ],
    // Our LiveKit patch: the PREEMPTIVE_DECISION, just before this turn's eou_metrics.
    [
      'ferni_preemptive_decision',
      (ev) => rec.onPreemptive(Boolean((ev as { used?: boolean })?.used)),
    ],
    ['close', () => rec.flush()],
  ];
  for (const [event, handler] of handlers) session.on(event, handler);
  const offAudio = onGatewayFirstAudio((sessionId, ttfbMs, pushMs) => {
    if (sessionId === opts.sessionId) rec.onGatewayAudio(ttfbMs, pushMs);
  });
  const offHold = onPauseHoldReleased((sessionId, heldMs) => {
    if (sessionId === opts.sessionId) rec.onPauseHold(heldMs);
  });
  return () => {
    offAudio();
    offHold();
    rec.flush();
    for (const [event, handler] of handlers) session.off(event, handler);
    recorders.delete(session);
  };
}

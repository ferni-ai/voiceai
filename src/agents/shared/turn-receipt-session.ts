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
  logReceipt,
  TurnReceiptRecorder,
  type BargeInSource,
  type TurnReceiptOptions,
} from './turn-receipt.js';
import {
  toolSchemaChars,
  turnTokenReceiptEnabled,
  withInputTokens,
  type ToolView,
} from './turn-input-tokens.js';
import { eotCallFrom } from './turn-receipt-eot.js';
import { noteOfferedTools, withTurnMetricsBq } from './turn-receipt-bq.js';
import { turnDetectionInUse } from './turn-patience.js';

// One recorder per AgentSession, so llmNode and withTurnReminder can find it.
const recorders = new WeakMap<object, TurnReceiptRecorder>();
// Sessions whose turns also get a turn_input_tokens line (TURN_TOKEN_RECEIPT=on).
const measuringTokens = new WeakSet<object>();

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
  tools: { functionTools?: Record<string, ToolView> }
): void {
  const functionTools = tools.functionTools ?? {};
  const schemaChars = measuringTokens.has(session) ? toolSchemaChars(functionTools) : undefined;
  noteOfferedTools(Object.keys(functionTools));
  recorders
    .get(session)
    ?.onRequest(request.items as ItemView[], Object.keys(functionTools).length, schemaChars);
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
  // TURN_METRICS_BQ: each receipt also queues its turn_metrics row (turn-receipt-bq.ts)
  const emit = withTurnMetricsBq(opts.emit ?? logReceipt, opts.userId, opts.env);
  const tokensOn = turnTokenReceiptEnabled(opts.env);
  const rec = new TurnReceiptRecorder({
    handling: () => ({
      turnDetection: turnDetectionInUse(session),
      interruptionMode: interruptionModeInUse(session),
    }),
    ...opts,
    emit: tokensOn ? withInputTokens(emit) : emit,
  });
  recorders.set(session, rec);
  if (tokensOn) measuringTokens.add(session);
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
    measuringTokens.delete(session);
  };
}

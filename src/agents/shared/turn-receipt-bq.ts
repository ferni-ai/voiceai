/**
 * One ferni_events.turn_metrics row (services/analytics/bq-events.ts) per TURN_RECEIPT, so
 * per-turn latency and naturalness can be queried in BigQuery instead of grepped from logs.
 * Off unless TURN_METRICS_BQ and BQ_EVENTS are both on.
 *
 * The row is the receipt's own numbers, enums and tool names: never words. The session and
 * user ids are hashed by bq-events; a string column off its allowlist becomes 'other'.
 * Handoff tools are named after personas, and a custom persona's name is the caller's own
 * words, so every handoffTo* tool is written as 'handoff'. A called tool is kept only when
 * it was offered to the model (noteOfferedTools), so a name the model made up is 'other'.
 *
 * Fire and forget: emitEvent queues the row and never throws or awaits the network; a
 * failure here is caught, so the turn and its TURN_RECEIPT log line are never affected.
 *
 * @module agents/shared/turn-receipt-bq
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { emitEvent, type BqRow } from '../../services/analytics/bq-events.js';
import { registerBqToolNames } from '../../services/analytics/bq-fields.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { TurnReceipt } from './turn-receipt.js';

const log = createLogger({ module: 'turn-receipt-bq' });

const HANDOFF = 'handoff';
/** handoffToMaya, handoffToGrandmaRuth: the persona's name stays out of the row. */
const bqToolName = (name: string): string => (/^handoffto/i.test(name) ? HANDOFF : name);

export const turnMetricsBqEnabled = (env: Env = process.env): boolean =>
  flagOn('TURN_METRICS_BQ', env);

/** The tools offered to the model this turn: the only names tools_called may hold. */
export function noteOfferedTools(names: Iterable<string>, env: Env = process.env): void {
  if (!turnMetricsBqEnabled(env)) return;
  registerBqToolNames([...names].map(bqToolName));
}

/** The receipt as a turn_metrics row. user_words and agent_words: the receipt has no words. */
export function turnMetricsRow(r: TurnReceipt): BqRow<'turn_metrics'> {
  const t = r.timing;
  return {
    turn: r.turn,
    persona: r.personaId,
    user_kind: r.userKind,
    eou_delay_ms: t.eouDelayMs,
    stt_ms: t.transcriptionDelayMs,
    llm_first_token_ms: t.llmTtftMs,
    tts_first_audio_ms: t.ttsTtfbMs,
    reply_delay_ms: t.firstAudioMs,
    commit_to_audio_ms: t.commitToAudioMs,
    prompt_tokens: r.tokens?.prompt ?? null,
    prompt_cached_tokens: r.tokens?.promptCached ?? null,
    model: r.tokens?.model ?? null,
    lane: r.prompt.lane?.lane ?? null,
    tools_offered: r.tools.offered,
    tools_called: r.tools.called.map(bqToolName),
    preemptive: r.preemptive,
    pause_hold_ms: r.pauseHoldMs,
    barge_in_source: r.bargeInSource,
    interrupted: r.reply.interrupted,
    reply_chars: r.reply.chars,
  };
}

/** Queues the receipt's row. False when off or refused; never throws. */
export function emitTurnMetrics(
  receipt: TurnReceipt,
  userId: string | undefined,
  env: Env = process.env
): boolean {
  try {
    if (!turnMetricsBqEnabled(env)) return false;
    return emitEvent(
      'turn_metrics',
      turnMetricsRow(receipt),
      { userId, sessionId: receipt.sessionId },
      env
    );
  } catch (error) {
    log.warn({ errorName: (error as Error)?.name ?? 'unknown' }, 'turn_metrics row not queued');
    return false;
  }
}

/** The receipt's emit, then its turn_metrics row (attachTurnReceipts). */
export function withTurnMetricsBq(
  emit: (receipt: TurnReceipt) => void,
  userId: string | undefined,
  env: Env = process.env
): (receipt: TurnReceipt) => void {
  return (receipt) => {
    emit(receipt);
    emitTurnMetrics(receipt, userId, env);
  };
}

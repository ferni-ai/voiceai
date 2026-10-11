/**
 * Per-turn voice metrics.
 *
 * LiveKit emits one `metrics_collected` event per component per turn (end of
 * utterance, LLM, TTS, ...). This joins them into one record per turn, by
 * arrival order (see TurnMetricsAggregator), so latency and cost can be
 * measured per turn rather than guessed.
 *
 *   llmReadyMs        = when the reply's first tokens existed, from the end of the
 *                       caller's speech (never before the turn was committed)
 *   responseLatencyMs = llmReadyMs + TTS time-to-first-byte
 *
 * With preemptive generation the LLM starts before the turn is committed, so
 * LiveKit's EOU delay + TTFT counts the overlap twice (dev, 2026-10-05: 25 of
 * 25 replies were preemptive). The first token's wall-clock time is used
 * instead when the metrics carry it.
 *
 * loopLagP99Ms / loopLagMaxMs: how late this process's event loop ran from
 * the turn's commit to its LLM metric (the reply model's leg), so a slow first
 * reply can be told apart from busy turn-1 work on the same thread.
 *
 * The record carries no transcript or reply text.
 *
 * @module agents/shared/turn-metrics
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';

interface EouMetric {
  type: 'eou_metrics';
  speechId?: string;
  endOfUtteranceDelayMs: number;
  transcriptionDelayMs: number;
  /** Epoch ms the caller stopped speaking; 0 when unknown. */
  lastSpeakingTimeMs?: number;
}

interface LlmMetric {
  type: 'llm_metrics';
  speechId?: string;
  ttftMs: number;
  promptTokens: number;
  /** Prompt tokens the model served from its cache (Gemini cachedContentTokenCount). */
  promptCachedTokens?: number;
  completionTokens: number;
  /** Epoch ms the request finished, and how long it ran. */
  timestamp?: number;
  durationMs?: number;
}

interface TtsMetric {
  type: 'tts_metrics';
  speechId?: string;
  ttfbMs: number;
  charactersCount: number;
  cancelled: boolean;
}

type AnyMetric = EouMetric | LlmMetric | TtsMetric | { type: string; speechId?: string };

export interface TurnMetricsRecord {
  speechId: string;
  /** llmReadyMs + TTS TTFB; null when the TTS reported no metrics. */
  responseLatencyMs: number | null;
  /** From the end of the caller's speech to the reply's first tokens (see module doc). */
  llmReadyMs: number;
  eouDelayMs: number;
  transcriptionDelayMs: number;
  llmTtftMs: number;
  ttsTtfbMs: number | null;
  promptTokens: number;
  /** Of promptTokens, how many came from the model's prompt cache. */
  promptCachedTokens: number;
  completionTokens: number;
  ttsCharacters: number;
  /** The TTS for this reply was cancelled, i.e. the user interrupted it. */
  interrupted: boolean;
  /** Event-loop delay from the commit to the LLM metric; null when not measured. */
  loopLagP99Ms: number | null;
  loopLagMaxMs: number | null;
}

export interface LoopLag {
  p99Ms: number;
  maxMs: number;
}

/** Starts measuring; the returned function stops and reads (null: no samples). */
export type LoopLagMeter = () => () => LoopLag | null;

const LAG_RESOLUTION_MS = 10;

/** perf_hooks' event-loop delay histogram over one window, minus its timer period. */
export const measureLoopLag: LoopLagMeter = () => {
  const h = monitorEventLoopDelay({ resolution: LAG_RESOLUTION_MS });
  h.enable();
  return () => {
    h.disable();
    if (h.count === 0) return null;
    const late = (ns: number): number => Math.max(0, Math.round(ns / 1e6 - LAG_RESOLUTION_MS));
    return { p99Ms: late(h.percentile(99)), maxMs: late(h.max) };
  };
};

interface OpenTurn {
  eou: EouMetric;
  llm?: LlmMetric;
  lag?: LoopLag | null;
}

/**
 * Joins metrics into turns by ARRIVAL ORDER, not speechId: in LiveKit 1.5.1
 * only eou_metrics carries a speechId; llm_metrics and tts_metrics carry just
 * a requestId. An end-of-utterance opens a turn; its first LLM metric and the
 * first TTS metric after that complete it. TTS with no open turn (e.g. the
 * greeting) is ignored, later LLM calls in the same turn (tool calls) are
 * ignored, and a new end-of-utterance abandons an unanswered turn.
 *
 * A TTS that emits no metrics (the Cartesia gateway TTS used by the cascade)
 * would leave every turn open forever, so a turn with an LLM metric but no TTS
 * metric is emitted, without TTS figures, when the next end-of-utterance
 * arrives.
 */
export class TurnMetricsAggregator {
  private open: OpenTurn | null = null;
  private stopLag: (() => LoopLag | null) | undefined;

  constructor(private readonly meter: LoopLagMeter = measureLoopLag) {}

  /** Add one metric. Returns the completed record once a turn has eou, llm and tts. */
  add(metric: AnyMetric): TurnMetricsRecord | null {
    if (metric.type === 'eou_metrics') {
      const open = this.open;
      const unfinished = open?.llm ? toRecord(open.eou, open.llm, undefined, open.lag) : null;
      this.stopLag?.();
      this.stopLag = this.meter();
      this.open = { eou: metric as EouMetric };
      return unfinished;
    }
    const turn = this.open;
    if (!turn) return null;
    if (metric.type === 'llm_metrics') {
      if (!turn.llm) {
        turn.llm = metric as LlmMetric;
        turn.lag = this.stopLag?.() ?? null;
        this.stopLag = undefined;
      }
      return null;
    }
    if (metric.type !== 'tts_metrics' || !turn.llm) return null;
    this.open = null;
    return toRecord(turn.eou, turn.llm, metric as TtsMetric, turn.lag);
  }
}

/** When the first tokens existed, from the end of the caller's speech; never before the commit. */
function llmReady(eou: EouMetric, llm: LlmMetric): number {
  const stoppedAt = eou.lastSpeakingTimeMs ?? 0;
  if (stoppedAt > 0 && llm.timestamp && llm.durationMs !== undefined && llm.ttftMs >= 0) {
    const firstTokenAt = llm.timestamp - llm.durationMs + llm.ttftMs;
    return Math.max(eou.endOfUtteranceDelayMs, firstTokenAt - stoppedAt);
  }
  return eou.endOfUtteranceDelayMs + llm.ttftMs;
}

function toRecord(
  eou: EouMetric,
  llm: LlmMetric,
  tts?: TtsMetric,
  lag?: LoopLag | null
): TurnMetricsRecord {
  const llmReadyMs = llmReady(eou, llm);
  return {
    speechId: eou.speechId ?? '',
    responseLatencyMs: tts ? llmReadyMs + tts.ttfbMs : null,
    llmReadyMs,
    eouDelayMs: eou.endOfUtteranceDelayMs,
    transcriptionDelayMs: eou.transcriptionDelayMs,
    llmTtftMs: llm.ttftMs,
    ttsTtfbMs: tts ? tts.ttfbMs : null,
    promptTokens: llm.promptTokens,
    promptCachedTokens: llm.promptCachedTokens ?? 0,
    completionTokens: llm.completionTokens,
    ttsCharacters: tts ? tts.charactersCount : 0,
    interrupted: tts ? tts.cancelled : false,
    loopLagP99Ms: lag?.p99Ms ?? null,
    loopLagMaxMs: lag?.maxMs ?? null,
  };
}

interface EventSource {
  on: (event: string, handler: (ev: unknown) => void) => unknown;
  off: (event: string, handler: (ev: unknown) => void) => unknown;
}

/** LiveKit's voice.AgentSessionEventTypes.MetricsCollected. */
const METRICS_COLLECTED = 'metrics_collected';

export const TURN_METRICS_EVENT = METRICS_COLLECTED;

/** A `metrics_collected` handler with its own aggregator, for event registries. */
export function createTurnMetricsHandler(
  sessionId: string,
  emit: (record: TurnMetricsRecord & { sessionId: string }) => void
): (ev: unknown) => void {
  const aggregator = new TurnMetricsAggregator();
  return (ev: unknown): void => {
    const metrics = (ev as { metrics?: AnyMetric } | undefined)?.metrics;
    if (!metrics) return;
    const record = aggregator.add(metrics);
    if (record) emit({ sessionId, ...record });
  };
}

/**
 * Subscribe a per-turn aggregator to a session's metrics events. `emit` gets
 * one record per completed turn. Returns a detach function.
 */
export function attachTurnMetrics(
  session: EventSource,
  sessionId: string,
  emit: (record: TurnMetricsRecord & { sessionId: string }) => void
): () => void {
  const handler = createTurnMetricsHandler(sessionId, emit);
  session.on(METRICS_COLLECTED, handler);
  return () => {
    session.off(METRICS_COLLECTED, handler);
  };
}

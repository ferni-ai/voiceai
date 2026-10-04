/**
 * Per-turn voice metrics.
 *
 * LiveKit emits one `metrics_collected` event per component per turn (end of
 * utterance, LLM, TTS, ...). This joins them into one record per turn, by
 * arrival order (see TurnMetricsAggregator), so latency and cost can be
 * measured per turn rather than guessed. Response latency follows LiveKit's definition:
 *
 *   responseLatencyMs = EOU delay + LLM time-to-first-token + TTS time-to-first-byte
 *
 * The record carries no transcript or reply text.
 *
 * @module agents/shared/turn-metrics
 */

interface EouMetric {
  type: 'eou_metrics';
  speechId?: string;
  endOfUtteranceDelayMs: number;
  transcriptionDelayMs: number;
}

interface LlmMetric {
  type: 'llm_metrics';
  speechId?: string;
  ttftMs: number;
  promptTokens: number;
  completionTokens: number;
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
  /** EOU delay + LLM TTFT + TTS TTFB; null when the TTS reported no metrics. */
  responseLatencyMs: number | null;
  /** EOU delay + LLM TTFT: when the reply's first words exist. */
  llmReadyMs: number;
  eouDelayMs: number;
  transcriptionDelayMs: number;
  llmTtftMs: number;
  ttsTtfbMs: number | null;
  promptTokens: number;
  completionTokens: number;
  ttsCharacters: number;
  /** The TTS for this reply was cancelled, i.e. the user interrupted it. */
  interrupted: boolean;
}

interface OpenTurn {
  eou: EouMetric;
  llm?: LlmMetric;
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

  /** Add one metric. Returns the completed record once a turn has eou, llm and tts. */
  add(metric: AnyMetric): TurnMetricsRecord | null {
    if (metric.type === 'eou_metrics') {
      const unfinished = this.open?.llm ? toRecord(this.open.eou, this.open.llm) : null;
      this.open = { eou: metric as EouMetric };
      return unfinished;
    }
    const turn = this.open;
    if (!turn) return null;
    if (metric.type === 'llm_metrics') {
      if (!turn.llm) turn.llm = metric as LlmMetric;
      return null;
    }
    if (metric.type !== 'tts_metrics' || !turn.llm) return null;
    this.open = null;
    return toRecord(turn.eou, turn.llm, metric as TtsMetric);
  }
}

function toRecord(eou: EouMetric, llm: LlmMetric, tts?: TtsMetric): TurnMetricsRecord {
  const llmReadyMs = eou.endOfUtteranceDelayMs + llm.ttftMs;
  return {
    speechId: eou.speechId ?? '',
    responseLatencyMs: tts ? llmReadyMs + tts.ttfbMs : null,
    llmReadyMs,
    eouDelayMs: eou.endOfUtteranceDelayMs,
    transcriptionDelayMs: eou.transcriptionDelayMs,
    llmTtftMs: llm.ttftMs,
    ttsTtfbMs: tts ? tts.ttfbMs : null,
    promptTokens: llm.promptTokens,
    completionTokens: llm.completionTokens,
    ttsCharacters: tts ? tts.charactersCount : 0,
    interrupted: tts ? tts.cancelled : false,
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

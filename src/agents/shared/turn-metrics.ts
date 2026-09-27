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
  responseLatencyMs: number;
  eouDelayMs: number;
  transcriptionDelayMs: number;
  llmTtftMs: number;
  ttsTtfbMs: number;
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
 */
export class TurnMetricsAggregator {
  private open: OpenTurn | null = null;

  /** Add one metric. Returns the completed record once a turn has eou, llm and tts. */
  add(metric: AnyMetric): TurnMetricsRecord | null {
    if (metric.type === 'eou_metrics') {
      this.open = { eou: metric as EouMetric };
      return null;
    }
    const turn = this.open;
    if (!turn) return null;
    if (metric.type === 'llm_metrics') {
      if (!turn.llm) turn.llm = metric as LlmMetric;
      return null;
    }
    if (metric.type !== 'tts_metrics' || !turn.llm) return null;
    const tts = metric as TtsMetric;
    this.open = null;
    return {
      speechId: turn.eou.speechId ?? '',
      responseLatencyMs: turn.eou.endOfUtteranceDelayMs + turn.llm.ttftMs + tts.ttfbMs,
      eouDelayMs: turn.eou.endOfUtteranceDelayMs,
      transcriptionDelayMs: turn.eou.transcriptionDelayMs,
      llmTtftMs: turn.llm.ttftMs,
      ttsTtfbMs: tts.ttfbMs,
      promptTokens: turn.llm.promptTokens,
      completionTokens: turn.llm.completionTokens,
      ttsCharacters: tts.charactersCount,
      interrupted: tts.cancelled,
    };
  }
}

interface EventSource {
  on(event: string, handler: (ev: unknown) => void): unknown;
  off(event: string, handler: (ev: unknown) => void): unknown;
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

/**
 * Per-turn voice metrics.
 *
 * LiveKit emits one `metrics_collected` event per component per turn (end of
 * utterance, LLM, TTS, ...), linked by `speechId`. This joins them into one
 * record per turn so latency and cost can be measured per turn rather than
 * guessed. Response latency follows LiveKit's definition:
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

interface PendingTurn {
  eou?: EouMetric;
  llm?: LlmMetric;
  tts?: TtsMetric;
}

export class TurnMetricsAggregator {
  private readonly pending = new Map<string, PendingTurn>();

  constructor(private readonly maxPending = 64) {}

  /** Add one metric. Returns the completed record once a turn has eou, llm and tts. */
  add(metric: AnyMetric): TurnMetricsRecord | null {
    const id = metric.speechId;
    if (!id) return null;
    const turn = this.pending.get(id) ?? {};
    if (metric.type === 'eou_metrics') turn.eou = metric as EouMetric;
    else if (metric.type === 'llm_metrics') turn.llm = metric as LlmMetric;
    else if (metric.type === 'tts_metrics') turn.tts = metric as TtsMetric;
    else return null;

    if (turn.eou && turn.llm && turn.tts) {
      this.pending.delete(id);
      return {
        speechId: id,
        responseLatencyMs: turn.eou.endOfUtteranceDelayMs + turn.llm.ttftMs + turn.tts.ttfbMs,
        eouDelayMs: turn.eou.endOfUtteranceDelayMs,
        transcriptionDelayMs: turn.eou.transcriptionDelayMs,
        llmTtftMs: turn.llm.ttftMs,
        ttsTtfbMs: turn.tts.ttfbMs,
        promptTokens: turn.llm.promptTokens,
        completionTokens: turn.llm.completionTokens,
        ttsCharacters: turn.tts.charactersCount,
        interrupted: turn.tts.cancelled,
      };
    }

    this.pending.set(id, turn);
    while (this.pending.size > this.maxPending) {
      const oldest = this.pending.keys().next().value;
      if (oldest === undefined) break;
      this.pending.delete(oldest);
    }
    return null;
  }

  pendingCount(): number {
    return this.pending.size;
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

/**
 * Development Telemetry - E2E Observability for Voice Pipeline
 *
 * Provides comprehensive logging for understanding the full request lifecycle
 * in development. Designed to answer: "Why did this turn take so long?"
 *
 * Features:
 * - Trace IDs that flow through entire request lifecycle
 * - Timing spans with hierarchical parent/child relationships
 * - Stage markers for pipeline visualization
 * - Tool execution tracking
 * - Audio pipeline metrics
 * - Context builder performance
 *
 * Usage:
 *   const trace = createTurnTrace(sessionId);
 *   const span = trace.startSpan('llm_call');
 *   // ... do work
 *   span.end({ tokens: 150 });
 *   trace.complete();
 *
 * @module agents/shared/dev-telemetry
 */

import { randomUUID } from 'node:crypto';

// Only enable detailed telemetry in development
const DEV_TELEMETRY_ENABLED =
  process.env.DEV_TELEMETRY === 'true' ||
  process.env.NODE_ENV === 'development' ||
  !process.env.K_SERVICE;

const VERBOSE_TELEMETRY = process.env.DEV_TELEMETRY_VERBOSE === 'true';

// ============================================================================
// TYPES
// ============================================================================

export interface SpanData {
  spanId: string;
  name: string;
  parentSpanId?: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'running' | 'ok' | 'error';
  metadata?: Record<string, unknown>;
}

export interface TurnTrace {
  traceId: string;
  sessionId: string;
  turnNumber: number;
  startTime: number;
  endTime?: number;
  spans: SpanData[];
  stages: string[];
  metrics: TurnMetrics;
}

export interface TurnMetrics {
  sttLatencyMs?: number;
  sttConfidence?: number;
  llmLatencyMs?: number;
  llmTokensIn?: number;
  llmTokensOut?: number;
  ttsLatencyMs?: number;
  ttsCharsProcessed?: number;
  toolCallCount: number;
  toolTotalMs: number;
  contextBuilderMs: number;
  totalTurnMs?: number;
}

export interface Span {
  end: (metadata?: Record<string, unknown>) => void;
  error: (err: Error, metadata?: Record<string, unknown>) => void;
  addMetadata: (data: Record<string, unknown>) => void;
}

export interface Trace {
  traceId: string;
  startSpan: (name: string, parentSpanId?: string) => Span;
  stage: (name: string) => void;
  recordSTT: (latencyMs: number, confidence?: number, transcript?: string) => void;
  recordLLM: (latencyMs: number, tokensIn?: number, tokensOut?: number) => void;
  recordTTS: (latencyMs: number, charsProcessed?: number) => void;
  recordTool: (toolName: string, latencyMs: number, success: boolean) => void;
  recordContextBuilder: (builderName: string, latencyMs: number) => void;
  complete: () => TurnTrace;
  getMetrics: () => TurnMetrics;
}

// ============================================================================
// ACTIVE TRACES
// ============================================================================

const activeTraces = new Map<string, TurnTrace>();
const turnCounter = new Map<string, number>();

// ============================================================================
// LOGGING HELPERS
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function logSpan(trace: TurnTrace, span: SpanData, status: 'start' | 'end' | 'error'): void {
  if (!DEV_TELEMETRY_ENABLED) return;

  const prefix = span.parentSpanId ? '  └─' : '├─';
  const emoji = status === 'start' ? '▶️' : status === 'error' ? '❌' : '✅';
  const duration = span.durationMs ? ` (${formatDuration(span.durationMs)})` : '';

  const metaStr = span.metadata && VERBOSE_TELEMETRY ? ` ${JSON.stringify(span.metadata)}` : '';

  process.stderr.write(
    `[trace:${trace.traceId.slice(0, 8)}] ${prefix} ${emoji} ${span.name}${duration}${metaStr}\n`
  );
}

function logStage(trace: TurnTrace, stage: string): void {
  if (!DEV_TELEMETRY_ENABLED) return;

  const stageEmojis: Record<string, string> = {
    connection: '🔌',
    persona_load: '🎭',
    tools_setup: '🔧',
    context_build: '📚',
    stt: '🎤',
    llm: '🧠',
    tts: '🔊',
    audio_send: '📡',
    tool_exec: '⚙️',
    handoff: '🤝',
    cleanup: '🧹',
    ready: '✅',
  };

  const emoji = stageEmojis[stage] || '📍';
  process.stderr.write(`[trace:${trace.traceId.slice(0, 8)}] ════ ${emoji} STAGE: ${stage}\n`);
}

function logMetric(trace: TurnTrace, category: string, value: string): void {
  if (!DEV_TELEMETRY_ENABLED) return;

  const categoryEmojis: Record<string, string> = {
    stt: '🎤',
    llm: '🧠',
    tts: '🔊',
    tool: '⚙️',
    context: '📚',
    total: '⏱️',
  };

  const emoji = categoryEmojis[category] || '📊';
  process.stderr.write(`[trace:${trace.traceId.slice(0, 8)}] │ ${emoji} ${category}: ${value}\n`);
}

// ============================================================================
// TRACE IMPLEMENTATION
// ============================================================================

/**
 * Create a new trace for a conversation turn.
 */
export function createTurnTrace(sessionId: string): Trace {
  const traceId = randomUUID();
  const turnNumber = (turnCounter.get(sessionId) || 0) + 1;
  turnCounter.set(sessionId, turnNumber);

  const trace: TurnTrace = {
    traceId,
    sessionId,
    turnNumber,
    startTime: Date.now(),
    spans: [],
    stages: [],
    metrics: {
      toolCallCount: 0,
      toolTotalMs: 0,
      contextBuilderMs: 0,
    },
  };

  activeTraces.set(traceId, trace);

  if (DEV_TELEMETRY_ENABLED) {
    process.stderr.write(
      `\n[trace:${traceId.slice(0, 8)}] ╔══════════════════════════════════════════╗\n` +
        `[trace:${traceId.slice(0, 8)}] ║ TURN #${turnNumber} - Session: ${sessionId.slice(0, 8)}...\n` +
        `[trace:${traceId.slice(0, 8)}] ╚══════════════════════════════════════════╝\n`
    );
  }

  return {
    traceId,

    startSpan(name: string, parentSpanId?: string): Span {
      const span: SpanData = {
        spanId: randomUUID().slice(0, 8),
        name,
        parentSpanId,
        startTime: Date.now(),
        status: 'running',
      };

      trace.spans.push(span);
      logSpan(trace, span, 'start');

      return {
        end(metadata?: Record<string, unknown>) {
          span.endTime = Date.now();
          span.durationMs = span.endTime - span.startTime;
          span.status = 'ok';
          if (metadata) span.metadata = { ...span.metadata, ...metadata };
          logSpan(trace, span, 'end');
        },

        error(err: Error, metadata?: Record<string, unknown>) {
          span.endTime = Date.now();
          span.durationMs = span.endTime - span.startTime;
          span.status = 'error';
          span.metadata = {
            ...span.metadata,
            ...metadata,
            error: err.message,
            stack: err.stack?.split('\n').slice(0, 3).join('\n'),
          };
          logSpan(trace, span, 'error');
        },

        addMetadata(data: Record<string, unknown>) {
          span.metadata = { ...span.metadata, ...data };
        },
      };
    },

    stage(name: string) {
      trace.stages.push(name);
      logStage(trace, name);
    },

    recordSTT(latencyMs: number, confidence?: number, transcript?: string) {
      trace.metrics.sttLatencyMs = latencyMs;
      if (confidence !== undefined) trace.metrics.sttConfidence = confidence;

      const confStr = confidence !== undefined ? `, conf=${(confidence * 100).toFixed(0)}%` : '';
      const textPreview = transcript ? `, "${transcript.slice(0, 30)}..."` : '';
      logMetric(trace, 'stt', `${formatDuration(latencyMs)}${confStr}${textPreview}`);
    },

    recordLLM(latencyMs: number, tokensIn?: number, tokensOut?: number) {
      trace.metrics.llmLatencyMs = latencyMs;
      if (tokensIn !== undefined) trace.metrics.llmTokensIn = tokensIn;
      if (tokensOut !== undefined) trace.metrics.llmTokensOut = tokensOut;

      const tokenStr =
        tokensIn !== undefined && tokensOut !== undefined
          ? `, tokens: ${tokensIn}→${tokensOut}`
          : '';
      logMetric(trace, 'llm', `${formatDuration(latencyMs)}${tokenStr}`);
    },

    recordTTS(latencyMs: number, charsProcessed?: number) {
      trace.metrics.ttsLatencyMs = latencyMs;
      if (charsProcessed !== undefined) trace.metrics.ttsCharsProcessed = charsProcessed;

      const charStr = charsProcessed !== undefined ? `, ${charsProcessed} chars` : '';
      logMetric(trace, 'tts', `${formatDuration(latencyMs)}${charStr}`);
    },

    recordTool(toolName: string, latencyMs: number, success: boolean) {
      trace.metrics.toolCallCount++;
      trace.metrics.toolTotalMs += latencyMs;

      const status = success ? '✓' : '✗';
      logMetric(trace, 'tool', `${toolName} ${status} ${formatDuration(latencyMs)}`);
    },

    recordContextBuilder(builderName: string, latencyMs: number) {
      trace.metrics.contextBuilderMs += latencyMs;
      if (VERBOSE_TELEMETRY) {
        logMetric(trace, 'context', `${builderName}: ${formatDuration(latencyMs)}`);
      }
    },

    complete(): TurnTrace {
      trace.endTime = Date.now();
      trace.metrics.totalTurnMs = trace.endTime - trace.startTime;

      if (DEV_TELEMETRY_ENABLED) {
        process.stderr.write(
          `[trace:${traceId.slice(0, 8)}] ╔══════════════════════════════════════════╗\n` +
            `[trace:${traceId.slice(0, 8)}] ║ TURN COMPLETE: ${formatDuration(trace.metrics.totalTurnMs)}\n`
        );

        // Summary breakdown
        const breakdown: string[] = [];
        if (trace.metrics.sttLatencyMs)
          breakdown.push(`STT:${formatDuration(trace.metrics.sttLatencyMs)}`);
        if (trace.metrics.llmLatencyMs)
          breakdown.push(`LLM:${formatDuration(trace.metrics.llmLatencyMs)}`);
        if (trace.metrics.ttsLatencyMs)
          breakdown.push(`TTS:${formatDuration(trace.metrics.ttsLatencyMs)}`);
        if (trace.metrics.toolCallCount > 0)
          breakdown.push(
            `Tools:${trace.metrics.toolCallCount}x/${formatDuration(trace.metrics.toolTotalMs)}`
          );
        if (trace.metrics.contextBuilderMs > 0)
          breakdown.push(`Context:${formatDuration(trace.metrics.contextBuilderMs)}`);

        if (breakdown.length > 0) {
          process.stderr.write(
            `[trace:${traceId.slice(0, 8)}] ║ ${breakdown.join(' | ')}\n`
          );
        }

        process.stderr.write(
          `[trace:${traceId.slice(0, 8)}] ╚══════════════════════════════════════════╝\n\n`
        );
      }

      activeTraces.delete(traceId);
      return trace;
    },

    getMetrics(): TurnMetrics {
      return { ...trace.metrics };
    },
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get active trace by ID
 */
export function getActiveTrace(traceId: string): TurnTrace | undefined {
  return activeTraces.get(traceId);
}

/**
 * Get all active traces for a session
 */
export function getSessionTraces(sessionId: string): TurnTrace[] {
  return Array.from(activeTraces.values()).filter((t) => t.sessionId === sessionId);
}

/**
 * Clear turn counter for session (call on disconnect)
 */
export function clearSessionTurnCounter(sessionId: string): void {
  turnCounter.delete(sessionId);
}

/**
 * Wrap an async function with automatic span tracking
 */
export function withSpan<T>(
  trace: Trace,
  spanName: string,
  fn: () => Promise<T>,
  parentSpanId?: string
): Promise<T> {
  const span = trace.startSpan(spanName, parentSpanId);
  return fn()
    .then((result) => {
      span.end();
      return result;
    })
    .catch((err) => {
      span.error(err);
      throw err;
    });
}

/**
 * Create a timing wrapper for any async function
 */
export function timed<T>(
  name: string,
  fn: () => Promise<T>,
  onComplete?: (durationMs: number, result: T) => void
): Promise<T> {
  const start = Date.now();
  return fn().then((result) => {
    const durationMs = Date.now() - start;
    if (DEV_TELEMETRY_ENABLED) {
      process.stderr.write(`[timing] ${name}: ${formatDuration(durationMs)}\n`);
    }
    onComplete?.(durationMs, result);
    return result;
  });
}

// ============================================================================
// STANDALONE RECORDING HELPERS
// ============================================================================

/**
 * Record a tool execution (can be called without a trace object).
 * Use this from function-call-telemetry to bridge to the dev-telemetry system.
 */
export function recordToolExecution(
  sessionId: string,
  toolName: string,
  durationMs: number,
  success: boolean
): void {
  if (!DEV_TELEMETRY_ENABLED) return;

  const status = success ? '✓' : '✗';
  const sid = sessionId.slice(0, 8);
  process.stderr.write(`[${sid}] ⚙️ tool: ${toolName} ${status} ${formatDuration(durationMs)}\n`);
}

/**
 * Log a pipeline stage (simplified version for non-trace contexts)
 */
export type StageType = 'processing' | 'context' | 'stt' | 'llm' | 'tts' | 'tools' | 'audio';

export function logPipelineStage(stage: string, type: StageType = 'processing'): void {
  if (!DEV_TELEMETRY_ENABLED) return;

  const stageEmojis: Record<StageType, string> = {
    processing: '⚙️',
    context: '📚',
    stt: '🎤',
    llm: '🧠',
    tts: '🔊',
    tools: '🔧',
    audio: '🔉',
  };

  const emoji = stageEmojis[type] || '📍';
  process.stderr.write(`[pipeline] ${emoji} ${stage}\n`);
}

// ============================================================================
// PIPELINE STAGE HELPERS (LEGACY)
// ============================================================================

/**
 * Log a pipeline stage transition (visible in all modes) - with sessionId
 * @deprecated Use logPipelineStage(stage, type) instead
 */
export function logPipelineStageWithSession(
  sessionId: string,
  stage: string,
  metadata?: Record<string, unknown>
): void {
  if (!DEV_TELEMETRY_ENABLED) return;

  const stageEmojis: Record<string, string> = {
    'session.start': '🚀',
    'session.end': '👋',
    'connection.start': '🔌',
    'connection.ready': '✅',
    'persona.loading': '🎭',
    'persona.ready': '🎭✅',
    'tools.building': '🔧',
    'tools.ready': '🔧✅',
    'turn.start': '💬',
    'turn.stt': '🎤',
    'turn.thinking': '🧠',
    'turn.responding': '🔊',
    'turn.complete': '✅',
    'handoff.start': '🤝',
    'handoff.complete': '🤝✅',
    'error': '❌',
  };

  const emoji = stageEmojis[stage] || '📍';
  const metaStr = metadata && VERBOSE_TELEMETRY ? ` ${JSON.stringify(metadata)}` : '';
  const sid = sessionId.slice(0, 8);

  process.stderr.write(`[${sid}] ${emoji} ${stage}${metaStr}\n`);
}

// ============================================================================
// AUDIO PIPELINE LOGGING
// ============================================================================

export interface AudioMetrics {
  framesReceived: number;
  framesProcessed: number;
  framesDropped: number;
  avgProcessingMs: number;
  bufferUnderruns: number;
  bufferOverruns: number;
}

const sessionAudioMetrics = new Map<string, AudioMetrics>();

export function recordAudioFrame(
  sessionId: string,
  type: 'received' | 'processed' | 'dropped',
  processingMs?: number
): void {
  if (!DEV_TELEMETRY_ENABLED) return;

  let metrics = sessionAudioMetrics.get(sessionId);
  if (!metrics) {
    metrics = {
      framesReceived: 0,
      framesProcessed: 0,
      framesDropped: 0,
      avgProcessingMs: 0,
      bufferUnderruns: 0,
      bufferOverruns: 0,
    };
    sessionAudioMetrics.set(sessionId, metrics);
  }

  if (type === 'received') metrics.framesReceived++;
  if (type === 'processed') {
    metrics.framesProcessed++;
    if (processingMs !== undefined) {
      // Running average
      metrics.avgProcessingMs =
        (metrics.avgProcessingMs * (metrics.framesProcessed - 1) + processingMs) /
        metrics.framesProcessed;
    }
  }
  if (type === 'dropped') metrics.framesDropped++;
}

export function recordBufferEvent(sessionId: string, type: 'underrun' | 'overrun'): void {
  if (!DEV_TELEMETRY_ENABLED) return;

  const metrics = sessionAudioMetrics.get(sessionId);
  if (!metrics) return;

  if (type === 'underrun') {
    metrics.bufferUnderruns++;
    process.stderr.write(`[${sessionId.slice(0, 8)}] ⚠️ Audio buffer underrun\n`);
  }
  if (type === 'overrun') {
    metrics.bufferOverruns++;
    process.stderr.write(`[${sessionId.slice(0, 8)}] ⚠️ Audio buffer overrun\n`);
  }
}

export function getAudioMetrics(sessionId: string): AudioMetrics | undefined {
  return sessionAudioMetrics.get(sessionId);
}

export function clearAudioMetrics(sessionId: string): void {
  sessionAudioMetrics.delete(sessionId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createTurnTrace,
  getActiveTrace,
  getSessionTraces,
  clearSessionTurnCounter,
  withSpan,
  timed,
  logPipelineStage,
  recordAudioFrame,
  recordBufferEvent,
  getAudioMetrics,
  clearAudioMetrics,
  DEV_TELEMETRY_ENABLED,
};

/**
 * TTS Gateway Tracing Types
 *
 * Per-request trace events recorded as a TTS request moves through
 * parsing, cache lookup, provider synthesis and sink delivery.
 */

import type { TTSRequest } from './types.js';

/**
 * Trace event types
 */
export type TraceEventType =
  | 'request_received'
  | 'ssml_parsed'
  | 'cache_lookup'
  | 'cache_hit'
  | 'cache_miss'
  | 'provider_call'
  | 'provider_complete'
  | 'sink_send'
  | 'complete'
  | 'error';

/**
 * Trace event
 */
export interface TraceEvent {
  type: TraceEventType;
  timestamp: number;
  durationMs?: number;
  data?: Record<string, unknown>;
}

/**
 * Complete trace for a TTS request
 */
export interface TTSTrace {
  traceId: string;
  request: TTSRequest;
  events: TraceEvent[];
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  outcome: 'success' | 'error' | 'pending';
  error?: string;
}

/**
 * Per-turn voice metrics: joins LiveKit's per-component metrics (end of
 * utterance, LLM, TTS) by speechId into one record per turn. Response latency
 * follows LiveKit's definition: EOU delay + LLM time-to-first-token + TTS
 * time-to-first-byte.
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { TurnMetricsAggregator, attachTurnMetrics } from '../turn-metrics.js';

const eou = (speechId: string, endOfUtteranceDelayMs = 400, transcriptionDelayMs = 120) =>
  ({ type: 'eou_metrics', speechId, endOfUtteranceDelayMs, transcriptionDelayMs, onUserTurnCompletedDelayMs: 5, lastSpeakingTimeMs: 0, timestamp: 0 }) as const;
const llmM = (speechId: string, ttftMs = 700) =>
  ({ type: 'llm_metrics', speechId, ttftMs, durationMs: 900, cancelled: false, completionTokens: 30, promptTokens: 4000, promptCachedTokens: 0, totalTokens: 4030, label: 'google.LLM', requestId: 'r', timestamp: 0 }) as const;
const ttsM = (speechId: string, ttfbMs = 250, cancelled = false) =>
  ({ type: 'tts_metrics', speechId, ttfbMs, durationMs: 800, audioDurationMs: 2000, cancelled, charactersCount: 60, label: 'cartesia.TTS', requestId: 'r', streamed: true, timestamp: 0 }) as const;

describe('TurnMetricsAggregator', () => {
  it('emits nothing until eou, llm and tts have all arrived for a turn', () => {
    const agg = new TurnMetricsAggregator();
    expect(agg.add(eou('s1'))).toBeNull();
    expect(agg.add(llmM('s1'))).toBeNull();
    const rec = agg.add(ttsM('s1'));
    expect(rec).not.toBeNull();
  });

  it('computes response latency as eou delay + llm ttft + tts ttfb', () => {
    const agg = new TurnMetricsAggregator();
    agg.add(ttsM('s2', 250));
    agg.add(llmM('s2', 700));
    const rec = agg.add(eou('s2', 400));
    expect(rec?.responseLatencyMs).toBe(1350);
    expect(rec).toMatchObject({ speechId: 's2', eouDelayMs: 400, llmTtftMs: 700, ttsTtfbMs: 250 });
  });

  it('carries cost inputs and marks interrupted replies', () => {
    const agg = new TurnMetricsAggregator();
    agg.add(eou('s3'));
    agg.add(llmM('s3'));
    const rec = agg.add(ttsM('s3', 250, true));
    expect(rec).toMatchObject({ promptTokens: 4000, completionTokens: 30, ttsCharacters: 60, interrupted: true });
  });

  it('keeps turns separate and ignores metrics without a speechId', () => {
    const agg = new TurnMetricsAggregator();
    agg.add(eou('a'));
    agg.add(llmM('b'));
    expect(agg.add({ type: 'stt_metrics', label: 'x', durationMs: 1, audioDurationMs: 1, streamed: true, requestId: 'r', timestamp: 0 } as never)).toBeNull();
    expect(agg.add(ttsM('a'))).toBeNull(); // turn a still lacks llm
  });

  it('bounds memory by evicting the oldest incomplete turns', () => {
    const agg = new TurnMetricsAggregator(2);
    agg.add(eou('old'));
    agg.add(eou('mid'));
    agg.add(eou('new'));
    expect(agg.pendingCount()).toBe(2);
  });
});

describe('attachTurnMetrics', () => {
  it('logs one TURN_METRICS record per completed turn from session events', () => {
    const session = new EventEmitter();
    const records: unknown[] = [];
    const detach = attachTurnMetrics(session, 'sess-1', (rec) => records.push(rec));
    for (const m of [eou('t1'), llmM('t1'), ttsM('t1')]) session.emit('metrics_collected', { type: 'metrics_collected', metrics: m, createdAt: 0 });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ sessionId: 'sess-1', speechId: 't1', responseLatencyMs: 1350 });
    detach();
    for (const m of [eou('t2'), llmM('t2'), ttsM('t2')]) session.emit('metrics_collected', { type: 'metrics_collected', metrics: m, createdAt: 0 });
    expect(records).toHaveLength(1);
  });
});

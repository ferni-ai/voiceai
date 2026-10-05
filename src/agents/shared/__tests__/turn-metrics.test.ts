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
  ({
    type: 'eou_metrics',
    speechId,
    endOfUtteranceDelayMs,
    transcriptionDelayMs,
    onUserTurnCompletedDelayMs: 5,
    lastSpeakingTimeMs: 0,
    timestamp: 0,
  }) as const;
// LiveKit 1.5.1: only eou_metrics carries speechId; llm/tts carry requestId.
const llmM = (_turn: string, ttftMs = 700) =>
  ({
    type: 'llm_metrics',
    ttftMs,
    durationMs: 900,
    cancelled: false,
    completionTokens: 30,
    promptTokens: 4000,
    promptCachedTokens: 0,
    totalTokens: 4030,
    label: 'google.LLM',
    requestId: 'r',
    timestamp: 0,
  }) as const;
const ttsM = (_turn: string, ttfbMs = 250, cancelled = false) =>
  ({
    type: 'tts_metrics',
    ttfbMs,
    durationMs: 800,
    audioDurationMs: 2000,
    cancelled,
    charactersCount: 60,
    label: 'cartesia.TTS',
    requestId: 'r',
    streamed: true,
    timestamp: 0,
  }) as const;

describe('TurnMetricsAggregator', () => {
  it('completes a turn from eou then llm then tts, in arrival order', () => {
    const agg = new TurnMetricsAggregator();
    expect(agg.add(eou('s1'))).toBeNull();
    expect(agg.add(llmM('s1'))).toBeNull();
    expect(agg.add(ttsM('s1'))).not.toBeNull();
  });

  it('computes response latency as eou delay + llm ttft + tts ttfb', () => {
    const agg = new TurnMetricsAggregator();
    agg.add(eou('s2', 400));
    agg.add(llmM('s2', 700));
    const rec = agg.add(ttsM('s2', 250));
    expect(rec?.responseLatencyMs).toBe(1350);
    expect(rec).toMatchObject({ speechId: 's2', eouDelayMs: 400, llmTtftMs: 700, ttsTtfbMs: 250 });
  });

  it('carries cost inputs and marks interrupted replies', () => {
    const agg = new TurnMetricsAggregator();
    agg.add(eou('s3'));
    agg.add(llmM('s3'));
    const rec = agg.add(ttsM('s3', 250, true));
    expect(rec).toMatchObject({
      promptTokens: 4000,
      completionTokens: 30,
      ttsCharacters: 60,
      interrupted: true,
    });
  });

  it('ignores tts that is not a reply to a user turn (e.g. the greeting)', () => {
    const agg = new TurnMetricsAggregator();
    expect(agg.add(ttsM('greeting'))).toBeNull();
    expect(agg.add(llmM('greeting'))).toBeNull();
    agg.add(eou('t1'));
    agg.add(llmM('t1', 600));
    expect(agg.add(ttsM('t1', 200))?.responseLatencyMs).toBe(400 + 600 + 200);
  });

  it('uses the first llm and tts of a turn (tool calls produce a second llm call)', () => {
    const agg = new TurnMetricsAggregator();
    agg.add(eou('t2'));
    agg.add(llmM('t2', 500));
    agg.add(llmM('t2', 900));
    expect(agg.add(ttsM('t2', 300))?.llmTtftMs).toBe(500);
  });

  it('abandons an unanswered turn when the next user turn starts', () => {
    const agg = new TurnMetricsAggregator();
    agg.add(eou('lost', 999));
    agg.add(eou('t3', 300));
    agg.add(llmM('t3', 600));
    expect(agg.add(ttsM('t3', 100))).toMatchObject({ speechId: 't3', eouDelayMs: 300 });
  });

  it('still reports turns when the TTS emits no metrics (the cascade gateway TTS)', () => {
    const agg = new TurnMetricsAggregator();
    expect(agg.add(eou('t1', 400))).toBeNull();
    expect(agg.add(llmM('t1', 5600))).toBeNull();
    expect(agg.add(eou('t2', 300))).toMatchObject({
      speechId: 't1',
      llmTtftMs: 5600,
      llmReadyMs: 6000,
      responseLatencyMs: null,
      ttsTtfbMs: null,
    });
  });
});

describe('llmReadyMs with wall-clock times (preemptive generation)', () => {
  const STOP = 1_000_000;
  /** Caller stopped at STOP; the turn was committed `eouDelay` ms later. */
  const eouAt = (eouDelay: number) => ({ ...eou('p', eouDelay), lastSpeakingTimeMs: STOP });
  /** An LLM request that started `startMs` after STOP. */
  const llmAt = (startMs: number, ttftMs: number, durationMs = 1500) => ({
    ...llmM('p', ttftMs),
    durationMs,
    timestamp: STOP + startMs + durationMs,
    promptCachedTokens: 3200,
  });

  it('a preemptive reply whose first tokens beat the commit is ready at the commit', () => {
    const agg = new TurnMetricsAggregator();
    agg.add(eouAt(900));
    agg.add(llmAt(120, 600)); // first token at +720 ms, before the +900 ms commit
    const rec = agg.add(ttsM('p', 250));
    expect(rec).toMatchObject({ llmReadyMs: 900, responseLatencyMs: 1150 });
  });

  it('counts the overlap once: first token at +930 ms is 930, not 900 + 810', () => {
    const agg = new TurnMetricsAggregator();
    agg.add(eouAt(900));
    agg.add(llmAt(120, 810));
    expect(agg.add(ttsM('p', 250))).toMatchObject({ llmReadyMs: 930, llmTtftMs: 810 });
  });

  it('a request started after the commit measures from the end of speech', () => {
    const agg = new TurnMetricsAggregator();
    agg.add(eouAt(400));
    agg.add(llmAt(450, 700));
    expect(agg.add(ttsM('p'))).toMatchObject({ llmReadyMs: 1150 });
  });

  it('carries cached prompt tokens', () => {
    const agg = new TurnMetricsAggregator();
    agg.add(eouAt(400));
    agg.add(llmAt(450, 700));
    expect(agg.add(ttsM('p'))).toMatchObject({ promptTokens: 4000, promptCachedTokens: 3200 });
  });
});

describe('attachTurnMetrics', () => {
  it('logs one TURN_METRICS record per completed turn from session events', () => {
    const session = new EventEmitter();
    const records: unknown[] = [];
    const detach = attachTurnMetrics(session, 'sess-1', (rec) => records.push(rec));
    for (const m of [eou('t1'), llmM('t1'), ttsM('t1')])
      session.emit('metrics_collected', { type: 'metrics_collected', metrics: m, createdAt: 0 });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sessionId: 'sess-1',
      speechId: 't1',
      responseLatencyMs: 1350,
    });
    detach();
    for (const m of [eou('t2'), llmM('t2'), ttsM('t2')])
      session.emit('metrics_collected', { type: 'metrics_collected', metrics: m, createdAt: 0 });
    expect(records).toHaveLength(1);
  });
});

/**
 * TURN_METRICS_BQ: one turn_metrics row per TURN_RECEIPT, through the live wiring
 * (attachTurnReceipts -> withTurnMetricsBq -> emitEvent), with the receipt's own numbers.
 */
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(() => {
    throw new Error('network must not be touched in tests');
  }),
}));

import {
  bqHash,
  flushBqEvents,
  setBqTransportForTests,
  type BqTable,
} from '../../../services/analytics/bq-events.js';
import { attachTurnReceipts, noteRequest } from '../turn-receipt-session.js';
import { emitTurnMetrics, turnMetricsRow } from '../turn-receipt-bq.js';
import type { TurnReceipt } from '../turn-receipt.js';

const CALLER = 'my name is Jane Doe, call me at +1 555 867 5309';
const REPLY = 'Hey Jane Doe! I will call +1 555 867 5309?';
const ON = { BQ_EVENTS: 'on', TURN_METRICS_BQ: 'on', LOG_HASH_SECRET: 'test-secret' };

let sent: Array<{ table: BqTable; rows: Record<string, unknown>[] }>;
beforeEach(() => {
  sent = [];
  setBqTransportForTests(async (table, rows) => void sent.push({ table, rows }));
  vi.stubEnv('TURN_METRICS_BQ', 'on'); // noteRequest reads process.env (the offered tools)
});
afterEach(() => {
  setBqTransportForTests(null);
  vi.unstubAllEnvs();
});

/** One caller turn on a session double, the way the LiveKit events arrive. */
function oneTurn(env: Record<string, string>, called: string[]) {
  const session = new EventEmitter();
  const receipts: TurnReceipt[] = [];
  let t = 1_000_000;
  const detach = attachTurnReceipts(session as never, {
    sessionId: 'RM_bq',
    userId: 'uid-secret-123',
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    now: () => t,
    env,
  });
  const metric = (m: Record<string, unknown>) => session.emit('metrics_collected', { metrics: m });
  const item = (role: string, text: string) =>
    session.emit('conversation_item_added', { item: { role, textContent: text } });
  const stoppedAt = t;
  t += 300;
  metric({
    type: 'eou_metrics',
    endOfUtteranceDelayMs: 300,
    transcriptionDelayMs: 90,
    lastSpeakingTimeMs: stoppedAt,
  });
  item('user', CALLER);
  session.emit('agent_state_changed', { newState: 'thinking' });
  noteRequest(
    session,
    { items: [] },
    { functionTools: { getWeather: {}, handoffToGrandmaRuth: {}, endCall: {} } }
  );
  session.emit('function_tools_executed', {
    functionCalls: called.map((name) => ({ name })),
    functionCallOutputs: [],
  });
  t += 500;
  metric({
    type: 'llm_metrics',
    ttftMs: 450,
    durationMs: 700,
    promptTokens: 4000,
    promptCachedTokens: 3000,
    completionTokens: 20,
    metadata: { modelName: 'gemini-2.5-flash' },
  });
  metric({ type: 'tts_metrics', ttfbMs: 150 });
  t += 200;
  session.emit('agent_state_changed', { newState: 'speaking' });
  t += 1500;
  item('assistant', REPLY);
  session.emit('agent_state_changed', { oldState: 'speaking', newState: 'listening' });
  detach();
  return receipts;
}

const rowsOf = (table: BqTable) => sent.filter((s) => s.table === table).flatMap((s) => s.rows);

describe('turn_metrics from TURN_RECEIPT', () => {
  it('flag off: the receipt is emitted and nothing is written', async () => {
    const receipts = oneTurn({ ...ON, TURN_METRICS_BQ: 'off' }, ['getWeather']);
    await flushBqEvents();
    expect(receipts).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it('BQ_EVENTS off: nothing is written either (both gates)', async () => {
    oneTurn({ ...ON, BQ_EVENTS: 'off' }, ['getWeather']);
    await flushBqEvents();
    expect(sent).toHaveLength(0);
  });

  it("flag on: exactly one row, with the receipt's numbers and no words or ids", async () => {
    const [receipt] = oneTurn(ON, ['getWeather', 'handoffToGrandmaRuth', 'madeUpTool']);
    await flushBqEvents();
    const rows = rowsOf('turn_metrics');
    expect(rows).toHaveLength(1);
    expect(sent).toHaveLength(1);
    const { timing } = receipt;
    // the receipt's numbers are real (not null), so the row can't match them by accident
    expect(timing).toMatchObject({ eouDelayMs: 300, firstAudioMs: 1000, commitToAudioMs: 700 });
    expect(rows[0]).toMatchObject({
      env: 'unknown',
      session_hash: bqHash('session', 'RM_bq', ON),
      user_hash: bqHash('user', 'uid-secret-123', ON),
      turn: 1,
      persona: 'ferni',
      user_kind: 'other',
      eou_delay_ms: timing.eouDelayMs,
      stt_ms: 90,
      llm_first_token_ms: 450,
      tts_first_audio_ms: 150,
      reply_delay_ms: timing.firstAudioMs,
      commit_to_audio_ms: timing.commitToAudioMs,
      prompt_tokens: 4000,
      prompt_cached_tokens: 3000,
      model: 'gemini-2.5-flash',
      tools_offered: 3,
      // a persona's name never leaves; a tool the model made up is 'other'
      tools_called: ['getWeather', 'handoff', 'other'],
      preemptive: 'none',
      pause_hold_ms: 0,
      interrupted: false,
      reply_chars: REPLY.length,
    });
    expect(rows[0]).not.toHaveProperty('lane'); // fast lane off: no lane
    const json = JSON.stringify(rows);
    for (const leak of ['Jane', '5309', 'uid-secret-123', 'RM_bq', 'GrandmaRuth']) {
      expect(json).not.toContain(leak);
    }
  });

  it('a writer error never throws into the turn', async () => {
    const [receipt] = oneTurn({ ...ON, TURN_METRICS_BQ: 'off' }, []);
    const broken = {
      ...receipt,
      get timing(): never {
        throw new Error('boom');
      },
    } as TurnReceipt;
    expect(() => turnMetricsRow(broken)).toThrow('boom');
    expect(emitTurnMetrics(broken, 'uid', ON)).toBe(false);
    expect(emitTurnMetrics(receipt, 'uid', ON)).toBe(true);
    setBqTransportForTests(() => Promise.reject(new Error('BigQuery down')));
    emitTurnMetrics(receipt, 'uid', ON);
    await expect(flushBqEvents()).resolves.toBeUndefined();
  });
});

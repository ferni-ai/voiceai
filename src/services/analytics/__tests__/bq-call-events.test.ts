/**
 * A finished call in the call-quality monitor sends one call_events row (BQ_EVENTS on).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../slack-notifications.js', () => ({
  SlackNotificationService: vi.fn().mockImplementation(() => ({
    notify: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('../../predictive-alerting.js', () => ({ recordMetricValue: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { bqHash, flushBqEvents, setBqTransportForTests } from '../bq-events.js';
import { callSummary, onExperimentFlags } from '../bq-call-events.js';
import {
  endCall,
  recordBargeInDetected,
  recordCallEvent,
  resetCallQualityStateForTests,
  startCall,
} from '../call-quality-monitor.js';

describe('call_events from the call-quality monitor', () => {
  let rows: Array<Record<string, unknown>>;
  beforeEach(() => {
    rows = [];
    setBqTransportForTests(async (table, batch) => {
      if (table === 'call_events') rows.push(...batch);
    });
    resetCallQualityStateForTests();
    vi.stubEnv('LOG_HASH_SECRET', 'test-secret');
    vi.stubEnv('BUILD_SHA', 'abcdef0123456789');
    vi.stubEnv('CASCADE_LLM_MODEL', 'gemini-3.5-flash');
    vi.stubEnv('DEPLOY_ENV', 'prod');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    setBqTransportForTests(null);
  });

  it('sends one pseudonymous row when a call ends', async () => {
    vi.stubEnv('BQ_EVENTS', 'on');
    startCall('RM_1', 'uid-42', 'ferni');
    recordCallEvent({ callId: 'RM_1', timestamp: Date.now() + 900, type: 'first_audio' });
    recordBargeInDetected('RM_1');
    endCall('RM_1', 'natural', { turns: 6 });
    await flushBqEvents();

    expect(rows).toHaveLength(1);
    const row = rows[0] ?? {};
    expect(row).toMatchObject({
      env: 'prod',
      event_type: 'call_end',
      agent_version: 'abcdef012345',
      persona: 'ferni',
      model: 'gemini-3.5-flash',
      end_reason: 'natural',
      turns: 6,
      interruptions: 1,
      user_hash: bqHash('user', 'uid-42', { LOG_HASH_SECRET: 'test-secret' }),
      session_hash: bqHash('session', 'RM_1', { LOG_HASH_SECRET: 'test-secret' }),
    });
    expect(row.first_response_ms).toBeGreaterThanOrEqual(900);
    expect(typeof row.duration_ms).toBe('number');
    expect(row.flags).toEqual(expect.arrayContaining(['BQ_EVENTS']));
    expect(JSON.stringify(row)).not.toMatch(/uid-42|RM_1/);
  });

  it('sends nothing with BQ_EVENTS off', async () => {
    startCall('RM_2', 'uid-42', 'ferni');
    endCall('RM_2', 'disconnect');
    await flushBqEvents();
    expect(rows).toHaveLength(0);
  });

  it('flags lists only experiment flags that are on, by name', () => {
    expect(
      onExperimentFlags({ BQ_EVENTS: 'on', WRAP_UP: 'off', CALLER_VOICE_GUARD: 'shadow' })
    ).toEqual(expect.arrayContaining(['BQ_EVENTS', 'CALLER_VOICE_GUARD']));
    expect(onExperimentFlags({ WRAP_UP: 'off' })).not.toContain('WRAP_UP');
    // kill switches that are on by default are not experiments
    expect(onExperimentFlags({})).not.toContain('CALLER_TURN_NOTE');
  });

  it('a persona id that is not a known persona is written as other (it comes from /token)', async () => {
    vi.stubEnv('BQ_EVENTS', 'on');
    startCall('RM_3', 'uid-42', 'pat@example.com');
    endCall('RM_3', 'natural');
    startCall('RM_4', 'uid-42', '+15551234567');
    endCall('RM_4', 'natural');
    await flushBqEvents();
    expect(rows.map((r) => r.persona)).toEqual(['other', 'other']);
    expect(JSON.stringify(rows)).not.toMatch(/pat@example|5551234567/);
  });

  it("in process-per-call mode the child's gate and flags decide, not the worker's env", async () => {
    vi.stubEnv('BQ_EVENTS', 'on');
    startCall('RM_5', 'uid-42', 'ferni');
    endCall('RM_5', 'natural', { bq: false, flags: ['WRAP_UP'] });
    vi.stubEnv('BQ_EVENTS', 'off');
    startCall('RM_6', 'uid-42', 'ferni');
    endCall('RM_6', 'natural', { bq: true, flags: ['WRAP_UP'] });
    await flushBqEvents();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.session_hash).toBe(
      bqHash('session', 'RM_6', { LOG_HASH_SECRET: 'test-secret' })
    );
    expect(rows[0]?.flags).toEqual(['WRAP_UP']);
  });

  it("callSummary reads the caller's flags and gate from the call's own env", async () => {
    const summary = await callSummary('RM_none', { BQ_EVENTS: 'on', WRAP_UP: 'on' });
    expect(summary).toEqual({ bq: true, flags: expect.arrayContaining(['BQ_EVENTS', 'WRAP_UP']) });
    expect((await callSummary('RM_none', {})).bq).toBe(false);
  });
});

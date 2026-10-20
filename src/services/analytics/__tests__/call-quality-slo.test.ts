/**
 * Call-quality alerts page on statistics of real prod calls, once per incident.
 *
 * Prod 2026-10-18 paged "first response 19.6s" (job start to the greeting, ringing
 * included), "100% disconnects" (one call after a restart) and "quality 39/100",
 * 126 times in 6 hours, while turn receipts showed reply p90 2.9 s.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notify = vi.fn().mockResolvedValue(true);
vi.mock('../../slack-notifications.js', () => ({
  SlackNotificationService: vi.fn().mockImplementation(function slack() {
    return { notify };
  }),
}));
vi.mock('../../predictive-alerting.js', () => ({ recordMetricValue: vi.fn() }));
const { logInfo } = vi.hoisted(() => ({ logInfo: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: logInfo, warn: vi.fn(), error: vi.fn() }),
}));

import {
  checkQualityAlerts,
  endCall,
  getActiveCalls,
  getRecentCalls,
  markCallStage,
  recordCallEvent,
  resetCallQualityStateForTests,
  startCall,
  startCallQualityMonitor,
} from '../call-quality-monitor.js';
import { evaluateSlos, type SloLimits } from '../call-quality-slo.js';

const MINUTE = 60_000;
const LIMITS: SloLimits = {
  reply_p90: { warn: 3000, critical: 5000 },
  greeting_p90: { warn: 4000, critical: Infinity },
  drop_rate: { warn: 0.05, critical: 0.1 },
  connect_fail: { warn: 0.05, critical: 0.1 },
  minCalls: 10,
  minTurns: 30,
  windowMs: 60 * MINUTE,
};

interface CallShape {
  replies?: number[];
  ringMs?: number;
  end?: 'natural' | 'disconnect';
  eval?: boolean;
  userKind?: string;
}

/** One call: join, ring (a call Ferni placed), answer, greeting 1.5 s later, replies, end. */
function call(id: string, shape: CallShape = {}): void {
  startCall(id);
  recordCallEvent({ callId: id, timestamp: Date.now(), type: 'connection_success' });
  if (shape.eval) {
    recordCallEvent({
      callId: id,
      timestamp: Date.now(),
      type: 'call_context',
      metadata: { traffic: 'eval' },
    });
  }
  markCallStage(id, 'participant_ready');
  vi.advanceTimersByTime(shape.ringMs ?? 0);
  markCallStage(id, 'call_answered');
  vi.advanceTimersByTime(1500);
  recordCallEvent({ callId: id, timestamp: Date.now(), type: 'first_audio' });
  for (const ms of shape.replies ?? []) {
    vi.advanceTimersByTime(ms + 4000);
    const metadata = { firstAudioMs: ms, userKind: shape.userKind ?? 'owner' };
    recordCallEvent({ callId: id, timestamp: Date.now(), type: 'first_response', metadata });
  }
  endCall(id, shape.end ?? 'natural');
}

const sent = (type: string) => notify.mock.calls.filter(([n]) => n.type === type);

/** `count` evaluations, `every` apart (the monitor runs one a minute). */
async function evaluate(count = 1, every = MINUTE): Promise<void> {
  for (let i = 0; i < count; i++) {
    await checkQualityAlerts();
    vi.advanceTimersByTime(every);
  }
}

describe('call-quality alerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    vi.stubEnv('CALL_QUALITY_ALERTS', 'on');
    notify.mockClear();
    startCallQualityMonitor({ qualityCheckIntervalMs: 24 * 60 * MINUTE });
  });
  afterEach(() => {
    resetCallQualityStateForTests();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('one outbound call with 20 s of ringing and a 1.5 s reply raises nothing', async () => {
    call('outbound-1', { ringMs: 20_000, replies: [1500] });

    const [reply, greeting] = evaluateSlos(getRecentCalls(), getActiveCalls(), LIMITS);
    // Measured from the caller's speech and from the pickup, never from the dial.
    expect(getRecentCalls()[0].firstReplyMs).toBe(1500);
    // The threshold path keeps main's greeting time, dial included.
    expect(getRecentCalls()[0].firstResponseTimeMs).toBe(21_500);
    expect(reply).toMatchObject({ key: 'reply_p90', value: 1500, sampled: false });
    expect(greeting).toMatchObject({ key: 'greeting_p90', value: 1500, sampled: false });
    await evaluate(5);
    expect(notify).not.toHaveBeenCalled();
  });

  it('one dropped call after a restart is not a 100% disconnect incident', async () => {
    call('only-call', { replies: [1200], end: 'disconnect' });

    const drop = evaluateSlos(getRecentCalls(), [], LIMITS).find((c) => c.key === 'drop_rate');
    expect(drop).toMatchObject({ value: 1, sampled: false, severity: null });
    await evaluate(5);
    expect(notify).not.toHaveBeenCalled();
  });

  it('12 calls with a 6 s reply p90 open exactly one critical incident over 5 evaluations', async () => {
    for (let i = 0; i < 12; i++) call(`slow-${i}`, { replies: [1200, 6000] });

    await evaluate(5, 6 * MINUTE); // past the old 5-minute re-alert cooldown each time
    expect(sent('incident_opened')).toHaveLength(1);
    expect(sent('incident_opened')[0][0]).toMatchObject({
      severity: 'error',
      metadata: { key: 'reply_p90', value: 6000, samples: 24 },
      message: 'Reply time p90 6.0s over 24 samples',
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('the incident closes once replies recover, and not while they hover at the line', async () => {
    const hour = async (tag: string, replies: number[]) => {
      vi.advanceTimersByTime(61 * MINUTE); // the previous hour leaves the window
      for (let i = 0; i < 12; i++) call(`${tag}-${i}`, { replies });
      await evaluate(3);
    };
    for (let i = 0; i < 12; i++) call(`slow-${i}`, { replies: [1200, 6000] });
    await evaluate();
    expect(sent('incident_opened')).toHaveLength(1);

    await hour('edge', [2900]); // under 3 s, inside the hysteresis band: stays open
    await hour('slow-again', [1200, 6000]);
    expect(sent('incident_opened')).toHaveLength(1);

    await hour('fast', [1200, 1800]); // recovered: closes, so the next breach is new
    await hour('slow-later', [1200, 6000]);
    expect(sent('incident_opened')).toHaveLength(2);
  });

  it('a dropped-call rate over 10% on 12 calls pages once', async () => {
    for (let i = 0; i < 12; i++)
      call(`c-${i}`, { replies: [1200], end: i < 2 ? 'disconnect' : 'natural' });

    await evaluate(5);
    expect(sent('incident_opened').map(([n]) => n.metadata.key)).toEqual(['drop_rate']);
  });

  it('calls still connecting are neither connected nor failed until 30 s in', async () => {
    for (let i = 0; i < 10; i++) call(`ok-${i}`, { replies: [1200] });
    startCall('connecting-1'); // startCall runs before connection_success
    startCall('connecting-2');
    const connect = () =>
      evaluateSlos(getRecentCalls(), getActiveCalls(), LIMITS).find(
        (c) => c.key === 'connect_fail'
      );
    expect(connect()).toMatchObject({ value: 0, samples: 10 });

    await evaluate(); // judged now, then a minute passes
    expect(notify).not.toHaveBeenCalled();
    // A minute on and still not connected: now they are failures (2 of 12).
    expect(connect()).toMatchObject({ samples: 12, severity: 'critical' });
  });

  it('an incident with no traffic to judge it expires after a window, so the next breach pages', async () => {
    for (let i = 0; i < 12; i++) call(`slow-${i}`, { replies: [1200, 6000] });
    await evaluate();
    vi.advanceTimersByTime(61 * MINUTE); // traffic stops: nothing left in the window
    await evaluate();
    vi.advanceTimersByTime(61 * MINUTE);
    await evaluate();
    for (let i = 0; i < 12; i++) call(`slow-again-${i}`, { replies: [1200, 6000] });
    await evaluate();
    expect(sent('incident_opened')).toHaveLength(2);
  });

  it('eval calls and eval callers never count toward prod metrics', async () => {
    for (let i = 0; i < 12; i++)
      call(`eval-room-${i}`, { replies: [8000], end: 'disconnect', eval: true });
    for (let i = 0; i < 12; i++)
      call(`eval-user-${i}`, { replies: [8000, 8000, 8000], userKind: 'eval' });

    await evaluate(5);
    expect(notify).not.toHaveBeenCalled();
    const conditions = evaluateSlos(getRecentCalls(), [], LIMITS);
    expect(conditions.every((c) => !c.sampled)).toBe(true);
  });
});

describe('CALL_QUALITY_ALERTS picks the rule that pages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    notify.mockClear();
    startCallQualityMonitor({ qualityCheckIntervalMs: 24 * 60 * MINUTE });
  });
  afterEach(() => {
    resetCallQualityStateForTests();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  /** 12 calls, 2 dropped: over both the 10% threshold and the drop-rate SLO. */
  const dropTwelve = (): void => {
    for (let i = 0; i < 12; i++)
      call(`c-${i}`, { replies: [1200], end: i < 2 ? 'disconnect' : 'natural' });
  };
  const titles = () => notify.mock.calls.map(([n]) => String(n.title));
  const sloPages = () => notify.mock.calls.filter(([n]) => n.metadata?.key !== undefined);

  it.each([undefined, 'off'])('%s: the threshold alerts page, as on main', async (value) => {
    if (value !== undefined) vi.stubEnv('CALL_QUALITY_ALERTS', value);
    dropTwelve();
    await evaluate();
    expect(titles()).toContain('📞 Disconnect Rate Critical');
    expect(sloPages()).toHaveLength(0);
  });

  it('off: one dropped call pages nothing (fewer than 5 calls)', async () => {
    call('only', { replies: [1200], end: 'disconnect' });
    await evaluate();
    expect(notify).not.toHaveBeenCalled();
  });

  it('shadow: the threshold alerts still page and the SLO incident is not sent', async () => {
    vi.stubEnv('CALL_QUALITY_ALERTS', 'shadow');
    logInfo.mockClear();
    dropTwelve();
    await evaluate(5);
    expect(titles()).toContain('📞 Disconnect Rate Critical');
    expect(sloPages()).toHaveLength(0);
    // The incident it would have paged is logged once, the evidence for promoting to on.
    const opened = logInfo.mock.calls.filter(([, msg]) =>
      String(msg).startsWith('Call-quality incident opened')
    );
    expect(opened.map(([o]) => o.key)).toEqual(['drop_rate']);
  });

  it('on: the SLO incident pages once and the threshold alerts are off', async () => {
    vi.stubEnv('CALL_QUALITY_ALERTS', 'on');
    dropTwelve();
    await evaluate(5);
    expect(sloPages().map(([n]) => n.metadata.key)).toEqual(['drop_rate']);
    expect(titles()).not.toContain('📞 Disconnect Rate Critical');
  });
});

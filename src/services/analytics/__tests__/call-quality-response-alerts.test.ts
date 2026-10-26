/**
 * "Response Time Critical" alerts: measured from pickup on calls Ferni places,
 * and held for a minimum sample.
 *
 * Prod (2026-10-22 to 10-25): 23 alerts, one every ~5 minutes for up to an
 * hour after a call. The first response of an on-behalf call was timed from
 * session start, so its ring counted (36 s on 10-24), and one call was enough.
 * Re-sending every cooldown during a real breach is unchanged from main (a
 * once-per-incident dedup is a separate follow-up).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notify = vi.hoisted(() => vi.fn(async () => undefined));
const recordMetricValue = vi.hoisted(() => vi.fn());
vi.mock('../../slack-notifications.js', () => ({
  SlackNotificationService: class {
    notify = notify;
  },
}));
vi.mock('../../predictive-alerting.js', () => ({ recordMetricValue }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  checkQualityAlerts,
  endCall,
  getMetrics,
  getRecentCalls,
  recordCallEvent,
  resetCallQualityStateForTests,
  startCall,
  startCallQualityMonitor,
} from '../call-quality-monitor.js';
import { markCallAnswered } from '../call-start-stages.js';

const T0 = Date.UTC(2026, 9, 24, 15, 0, 9);
const MINUTE = 60_000;
let seq = 0;

/** Move the clock (the monitor reads Date.now()). */
const at = (ms: number): void => void vi.setSystemTime(ms);

/** An inbound/app call whose first audio came `firstAudioMs` after the session started. */
function inboundCall(firstAudioMs: number): void {
  const id = `in-${seq++}`;
  const start = Date.now();
  startCall(id, undefined, 'ferni', 'inbound_call');
  recordCallEvent({ callId: id, timestamp: start + 300, type: 'connection_success' });
  recordCallEvent({ callId: id, timestamp: start + firstAudioMs, type: 'first_response' });
  endCall(id, 'natural');
  at(start); // calls are instant on the test clock
}

/** An on-behalf call that rang `ringMs`, then got Ferni's opener `replyMs` after pickup. */
async function onBehalfCall(ringMs: number, replyMs: number): Promise<string> {
  const id = `ob-${seq++}`;
  const start = Date.now();
  startCall(id, undefined, 'ferni', 'on_behalf_call');
  recordCallEvent({ callId: id, timestamp: start + 300, type: 'connection_success' });
  at(start + ringMs);
  markCallAnswered(id); // what line-screen / livekit-call-opening call at pickup
  await vi.dynamicImportSettled();
  recordCallEvent({ callId: id, timestamp: start + ringMs + replyMs, type: 'first_response' });
  endCall(id, 'natural');
  at(start);
  return id;
}

const responseAlerts = (): string[] =>
  notify.mock.calls
    .map((args) => (args as unknown as [{ title: string }])[0].title)
    .filter((title) => title.includes('Response Time'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(T0);
  seq = 0;
  resetCallQualityStateForTests();
  notify.mockClear();
  recordMetricValue.mockClear();
  startCallQualityMonitor({ qualityCheckIntervalMs: 3_600_000 });
});
afterEach(() => {
  resetCallQualityStateForTests();
  vi.useRealTimers();
});

describe('first response of a call Ferni places', () => {
  it('times it from pickup, so a 36 s ring with a 1.2 s reply raises no alert', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await onBehalfCall(36_000, 1_200));

    // The session clock still includes the ring...
    const raw = getRecentCalls().filter((c) => ids.includes(c.callId));
    expect(raw.map((c) => c.firstResponseTimeMs)).toEqual(Array(5).fill(37_200));
    // ...but the caller waited 1.2 s after picking up.
    expect(getMetrics().firstResponseSamples).toBe(5);
    expect(getMetrics().avgFirstResponseTimeMs).toBe(1_200);
    expect(recordMetricValue).toHaveBeenCalledWith('first_response_time', 1_200);
    expect(recordMetricValue).not.toHaveBeenCalledWith('first_response_time', 37_200);

    await checkQualityAlerts();
    expect(responseAlerts()).toEqual([]);
  });

  it('leaves a placed call with no recorded pickup out of the average', async () => {
    startCall('ob-no-pickup', undefined, 'ferni', 'family_checkin');
    recordCallEvent({ callId: 'ob-no-pickup', timestamp: T0 + 40_000, type: 'first_response' });
    endCall('ob-no-pickup', 'natural');
    inboundCall(1_000);

    expect(getMetrics().firstResponseSamples).toBe(1);
    expect(getMetrics().avgFirstResponseTimeMs).toBe(1_000);
  });
});

describe('response-time alerts wait for a minimum sample', () => {
  it('sends nothing for one slow inbound call', async () => {
    inboundCall(17_900);
    expect(getMetrics().avgFirstResponseTimeMs).toBe(17_900); // the condition is there
    await checkQualityAlerts();
    expect(responseAlerts()).toEqual([]);
  });

  it('sends nothing for 4 slow calls, below the 5-call minimum', async () => {
    for (let i = 0; i < 4; i++) inboundCall(8_000);
    await checkQualityAlerts();
    expect(responseAlerts()).toEqual([]);
  });
});

describe('a real breach (cooldown as on main)', () => {
  it('alerts for 5 slow calls, holds inside the cooldown, and re-sends after it', async () => {
    for (let i = 0; i < 5; i++) inboundCall(8_000);
    await checkQualityAlerts();
    expect(responseAlerts()).toEqual(['📞 Response Time Critical']);

    at(T0 + MINUTE);
    await checkQualityAlerts();
    expect(responseAlerts()).toHaveLength(1); // within the 5-minute cooldown

    at(T0 + 6 * MINUTE);
    await checkQualityAlerts();
    expect(responseAlerts()).toHaveLength(2); // noisy, never silent
  });
});

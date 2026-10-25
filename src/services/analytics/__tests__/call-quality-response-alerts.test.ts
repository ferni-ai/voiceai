/**
 * "Response Time Critical" alerts: measured from pickup on calls Ferni places,
 * held for a minimum sample, and sent once per incident.
 *
 * Prod (2026-10-22 to 10-25): 23 alerts, one every ~5 minutes for up to an
 * hour after a call. The first response of an on-behalf call was timed from
 * session start, so its ring counted (36 s on 10-24); one call was enough;
 * and the same incident re-alerted every cooldown while it stayed in the
 * one-hour window.
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
import { AlertIncidents } from '../call-quality-incidents.js';

const T0 = Date.UTC(2026, 9, 24, 15, 0, 9);
const MINUTE = 60_000;
let seq = 0;

/** Move the clock (the monitor reads Date.now()). */
const at = (ms: number): void => void vi.setSystemTime(ms);

/** An inbound/app call whose first audio came `firstAudioMs` after the session started. */
function inboundCall(firstAudioMs: number, end: 'natural' | 'disconnect' = 'natural'): void {
  const id = `in-${seq++}`;
  const start = Date.now();
  startCall(id, undefined, 'ferni', 'inbound_call');
  recordCallEvent({ callId: id, timestamp: start + 300, type: 'connection_success' });
  recordCallEvent({ callId: id, timestamp: start + firstAudioMs, type: 'first_response' });
  endCall(id, end);
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

const titles = (): string[] =>
  notify.mock.calls.map((args) => (args as unknown as [{ title: string }])[0].title);
const responseAlerts = (): string[] => titles().filter((title) => title.includes('Response Time'));
const RESPONSE = '📞 Response Time Critical';
const DISCONNECT = '📞 Disconnect Rate Critical';
const count = (title: string): number => titles().filter((t) => t === title).length;

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

describe('one alert per incident', () => {
  it('alerts once for 5 slow calls, then not again while the incident lasts', async () => {
    for (let i = 0; i < 5; i++) inboundCall(8_000);
    await checkQualityAlerts();
    expect(responseAlerts()).toEqual(['📞 Response Time Critical']);

    // Prod re-sent every 5 minutes while the calls stayed in the 1 h window.
    for (const minutes of [1, 6, 11, 30, 59]) {
      at(T0 + minutes * MINUTE);
      await checkQualityAlerts();
    }
    expect(responseAlerts()).toEqual(['📞 Response Time Critical']);
  });

  it('alerts again after the incident clears and a new one starts', async () => {
    for (let i = 0; i < 5; i++) inboundCall(8_000);
    await checkQualityAlerts();
    expect(responseAlerts()).toHaveLength(1);

    at(T0 + 2 * MINUTE);
    for (let i = 0; i < 20; i++) inboundCall(500); // (5×8 + 20×0.5) / 25 = 2.0 s: recovered
    await checkQualityAlerts();
    expect(responseAlerts()).toHaveLength(1);

    at(T0 + 8 * MINUTE);
    for (let i = 0; i < 20; i++) inboundCall(10_000); // (40 + 10 + 200) / 45 = 5.6 s
    await checkQualityAlerts();
    expect(responseAlerts()).toEqual(['📞 Response Time Critical', '📞 Response Time Critical']);
  });
});

describe('a failed send', () => {
  it('is retried at the next check, and then the incident holds', async () => {
    for (let i = 0; i < 5; i++) inboundCall(8_000);
    notify.mockImplementationOnce(async () => {
      throw new Error('slack 503');
    });
    await checkQualityAlerts(); // attempted, threw: not delivered
    expect(count(RESPONSE)).toBe(1);

    at(T0 + MINUTE);
    await checkQualityAlerts(); // retried and delivered
    expect(count(RESPONSE)).toBe(2);
    expect(await notify.mock.results.at(-1)?.value).toBeUndefined(); // the retry succeeded

    for (const minutes of [2, 7, 30]) {
      at(T0 + minutes * MINUTE);
      await checkQualityAlerts();
    }
    expect(count(RESPONSE)).toBe(2); // delivered once: no more sends this incident
  });
});

describe('two alerts at once', () => {
  it('each alerts once, and each incident opens and clears on its own', async () => {
    for (let i = 0; i < 5; i++) inboundCall(8_000, 'disconnect');
    await checkQualityAlerts();
    expect([count(RESPONSE), count(DISCONNECT)]).toEqual([1, 1]);

    for (const minutes of [1, 6]) {
      at(T0 + minutes * MINUTE);
      await checkQualityAlerts();
    }
    expect([count(RESPONSE), count(DISCONNECT)]).toEqual([1, 1]);

    at(T0 + 7 * MINUTE);
    for (let i = 0; i < 95; i++) inboundCall(8_000); // disconnects 5/100: cleared; still slow
    await checkQualityAlerts();
    expect([count(RESPONSE), count(DISCONNECT)]).toEqual([1, 1]);

    at(T0 + 13 * MINUTE);
    for (let i = 0; i < 20; i++) inboundCall(8_000, 'disconnect'); // 25/120: a new incident
    await checkQualityAlerts();
    expect([count(RESPONSE), count(DISCONNECT)]).toEqual([1, 2]);
  });
});

describe('AlertIncidents', () => {
  const timing = { alertCooldownMs: 5 * MINUTE, alertRepeatMs: 3 * 60 * MINUTE };
  const check = (incidents: AlertIncidents, now: number, firing: boolean): boolean => {
    incidents.beginCheck();
    const due = firing && incidents.shouldSend('critical:x', now, timing);
    if (due) incidents.sent('critical:x', now);
    incidents.endCheck();
    return due;
  };

  it('reminds about an incident still open after alertRepeatMs', () => {
    const incidents = new AlertIncidents();
    expect(check(incidents, 0, true)).toBe(true);
    expect(check(incidents, 179 * MINUTE, true)).toBe(false);
    expect(check(incidents, 181 * MINUTE, true)).toBe(true);
  });

  it('does not re-page a flapping alert inside the cooldown', () => {
    const incidents = new AlertIncidents();
    expect(check(incidents, 0, true)).toBe(true);
    expect(check(incidents, 1 * MINUTE, false)).toBe(false); // cleared
    expect(check(incidents, 2 * MINUTE, true)).toBe(false); // back within 5 min
    expect(check(incidents, 6 * MINUTE, true)).toBe(true);
  });
});

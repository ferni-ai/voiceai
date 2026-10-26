/**
 * Call-quality alerts page once per incident, and an incident opens only when
 * the alert was delivered.
 *
 * #2855 round 2: SlackNotificationService.notify never throws on a failed send
 * (no webhook, non-2xx incl. 429/5xx, fetch error or timeout all resolve
 * false), so a dedup that marked the alert sent anyway went silent for the
 * whole incident. These go through the real monitor (startCall /
 * recordCallEvent / endCall / checkQualityAlerts); only the notifier is fake.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  NotificationContext,
  SlackDelivery,
  SlackNotificationService as RealSlack,
} from '../../slack-notifications.js';

const h = vi.hoisted(() => {
  // the real SlackNotificationService (429 case) needs a webhook at load
  process.env.SLACK_WEBHOOK_URL = 'https://hooks.example.test/quality';
  return {
    notifyWithResult: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
});
vi.mock('../../slack-notifications.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  SlackNotificationService: class {
    notifyWithResult = h.notifyWithResult;
  },
}));
vi.mock('../../predictive-alerting.js', () => ({ recordMetricValue: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: h.warn, error: h.error }),
}));

import {
  checkQualityAlerts,
  endCall,
  recordCallEvent,
  resetCallQualityStateForTests,
  startCall,
  startCallQualityMonitor,
} from '../call-quality-monitor.js';
import { ALERT_REPEAT_MS } from '../call-quality-incidents.js';

const RESPONSE = '📞 Response Time Critical';
const DISCONNECT = '📞 Disconnect Rate Critical';
const DELIVERED: SlackDelivery = { status: 'delivered', via: 'slack' };
const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);
const MINUTE = 60_000;

/** Scripted results per title; anything unscripted is delivered. */
let script: Map<string, SlackDelivery[]>;
/** Every send the monitor attempted, with the result it got back. */
let sends: Array<{ title: string; status: SlackDelivery['status'] }>;
let seq = 0;

const at = (ms: number): void => void vi.setSystemTime(ms);

/** `n` calls with a first response after `firstAudioMs`, each ended for `end`. */
function calls(n: number, firstAudioMs: number, end: 'natural' | 'disconnect'): void {
  for (let i = 0; i < n; i++) {
    const id = `c-${seq++}`;
    const start = Date.now();
    startCall(id, undefined, 'ferni', 'inbound_call');
    recordCallEvent({ callId: id, timestamp: start + 200, type: 'connection_success' });
    recordCallEvent({ callId: id, timestamp: start + firstAudioMs, type: 'first_response' });
    endCall(id, end);
  }
}
const slowCalls = (): void => calls(5, 8_000, 'natural'); // avg 8 s > 5 s

const attempts = (title: string): number => sends.filter((s) => s.title === title).length;
const deliveries = (title: string): number =>
  sends.filter((s) => s.title === title && s.status === 'delivered').length;
const warned = (msg: string): number => h.warn.mock.calls.filter((c) => c[1] === msg).length;

/** One check per minute from `fromMin` to `toMin` (inclusive) after T0. */
async function checksAt(fromMin: number, toMin: number): Promise<void> {
  for (let m = fromMin; m <= toMin; m++) {
    at(T0 + m * MINUTE);
    await checkQualityAlerts();
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(T0);
  seq = 0;
  script = new Map();
  sends = [];
  resetCallQualityStateForTests();
  h.warn.mockClear();
  h.error.mockClear();
  h.notifyWithResult.mockReset();
  h.notifyWithResult.mockImplementation(async (ctx: NotificationContext) => {
    const result = script.get(ctx.title)?.shift() ?? DELIVERED;
    sends.push({ title: ctx.title, status: result.status });
    return result;
  });
  startCallQualityMonitor({ qualityCheckIntervalMs: 3_600_000 });
});
afterAll(() => {
  delete process.env.SLACK_WEBHOOK_URL;
});
afterEach(() => {
  resetCallQualityStateForTests();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('an incident opens only once the alert is delivered', () => {
  it('a failed send is retried on the next check, then the incident holds', async () => {
    script.set(RESPONSE, [{ status: 'failed', reason: 'http 503' }]);
    slowCalls();

    await checksAt(0, 0);
    expect([attempts(RESPONSE), deliveries(RESPONSE)]).toEqual([1, 0]);
    expect(warned('Slack alert failed; retrying next check')).toBe(1);

    await checksAt(1, 1); // not marked: retried
    expect([attempts(RESPONSE), deliveries(RESPONSE)]).toEqual([2, 1]);

    await checksAt(2, 30); // delivered: the incident holds
    expect([attempts(RESPONSE), deliveries(RESPONSE)]).toEqual([2, 1]);
  });

  it('a 429 from the real Slack webhook, then a 200: 2 attempts, 1 delivery', async () => {
    const { SlackNotificationService } = await vi.importActual<{
      SlackNotificationService: typeof RealSlack;
    }>('../../slack-notifications.js');
    const real = new SlackNotificationService();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate_limited', { status: 429 }))
      .mockResolvedValue(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    h.notifyWithResult.mockImplementation(async (ctx: NotificationContext) => {
      const result = await real.notifyWithResult(ctx);
      sends.push({ title: ctx.title, status: result.status });
      return result;
    });
    slowCalls();

    await checksAt(0, 10);
    expect(sends.filter((s) => s.title === RESPONSE)).toEqual([
      { title: RESPONSE, status: 'failed' },
      { title: RESPONSE, status: 'delivered' },
    ]);
    expect(fetchMock.mock.calls.every(([url]) => url === process.env.SLACK_WEBHOOK_URL)).toBe(true);
  });

  it('no webhook: tried once per 5-minute cooldown, logged once, never counted as sent', async () => {
    const NC: SlackDelivery = { status: 'not_configured' };
    script.set(RESPONSE, [NC, NC, NC]);
    slowCalls();

    await checksAt(0, 14); // #2900 tried every check: 15 attempts, 15 warning lines
    expect([attempts(RESPONSE), deliveries(RESPONSE)]).toEqual([3, 0]); // minutes 0, 5, 10
    expect(warned('alert not delivered: no Slack webhook')).toBe(1);

    await checksAt(15, 25); // a webhook appears: delivered at 15, then it holds
    expect([attempts(RESPONSE), deliveries(RESPONSE)]).toEqual([4, 1]);
  });

  it('a failed send after a no-webhook backoff is still retried at the next check', async () => {
    script.set(RESPONSE, [{ status: 'not_configured' }, { status: 'failed', reason: 'http 503' }]);
    slowCalls();

    await checksAt(0, 4);
    expect(attempts(RESPONSE)).toBe(1);
    await checksAt(5, 5); // backoff over: a webhook now, but it 503s
    expect([attempts(RESPONSE), deliveries(RESPONSE)]).toEqual([2, 0]);
    await checksAt(6, 6); // failed is not backed off
    expect([attempts(RESPONSE), deliveries(RESPONSE)]).toEqual([3, 1]);
  });

  it('a critical alert opsAlert raised (no webhook) counts as delivered', async () => {
    script.set(RESPONSE, [{ status: 'delivered', via: 'ops' }]);
    slowCalls();
    await checksAt(0, 20);
    expect([attempts(RESPONSE), deliveries(RESPONSE)]).toEqual([1, 1]);
    expect(warned('alert not delivered: no Slack webhook')).toBe(0);
  });
});

describe('once per incident', () => {
  it('a sustained breach pages once, not every 5 minutes, with a reminder after 3 h', async () => {
    slowCalls();
    await checksAt(0, 59);
    expect(attempts(RESPONSE)).toBe(1); // main: 12 (every 5 min)

    // keep the breach in the 1-hour window up to the reminder
    for (const m of [60, 90, 120, 150, 180]) {
      at(T0 + m * MINUTE);
      slowCalls();
      await checkQualityAlerts();
    }
    expect(attempts(RESPONSE)).toBe(1);
    expect(180 * MINUTE).toBe(ALERT_REPEAT_MS);

    await checksAt(181, 181);
    expect(attempts(RESPONSE)).toBe(2);
  });

  it('breach, clear, breach: alerts again', async () => {
    slowCalls();
    await checksAt(0, 5);
    expect(attempts(RESPONSE)).toBe(1);

    await checksAt(61, 61); // the slow calls left the 1-hour window: cleared
    expect(attempts(RESPONSE)).toBe(1);

    slowCalls();
    await checksAt(62, 70);
    expect(attempts(RESPONSE)).toBe(2);
  });

  it('two alerts at once keep separate incidents', async () => {
    script.set(DISCONNECT, [{ status: 'failed', reason: 'http 500' }]);
    calls(5, 8_000, 'disconnect'); // slow AND dropped: both breach

    await checksAt(0, 0);
    expect(sends.filter((s) => s.title === RESPONSE || s.title === DISCONNECT)).toEqual([
      { title: RESPONSE, status: 'delivered' },
      { title: DISCONNECT, status: 'failed' },
    ]);

    await checksAt(1, 10); // disconnect retried and delivered; response held
    expect([attempts(RESPONSE), deliveries(DISCONNECT)]).toEqual([1, 1]);

    calls(50, 8_000, 'natural'); // disconnect 5/55 = 9%: its critical clears; response holds
    await checksAt(11, 20);
    expect([attempts(RESPONSE), attempts(DISCONNECT)]).toEqual([1, 2]);

    calls(10, 8_000, 'disconnect'); // 15/65 = 23%: a new disconnect incident
    await checksAt(21, 30);
    expect([attempts(RESPONSE), deliveries(DISCONNECT)]).toEqual([1, 2]);
  });
});

describe('no webhook, two critical alerts at once', () => {
  it('both reach the operator through opsAlert on the first check', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', '');
    vi.stubEnv('SLACK_ALERTS_WEBHOOK', '');
    vi.resetModules(); // the real service reads its webhooks at load
    const { SlackNotificationService } = await vi.importActual<{
      SlackNotificationService: typeof RealSlack;
    }>('../../slack-notifications.js');
    const real = new SlackNotificationService();
    h.notifyWithResult.mockImplementation(async (ctx: NotificationContext) => {
      const result = await real.notifyWithResult(ctx);
      sends.push({ title: ctx.title, status: result.status });
      return result;
    });
    calls(5, 8_000, 'disconnect'); // slow AND dropped: both critical

    await checksAt(0, 0); // one shared 'notify:incident_opened' key: disconnect waited ~15 min
    expect(sends.filter((s) => s.title === RESPONSE || s.title === DISCONNECT)).toEqual([
      { title: RESPONSE, status: 'delivered' },
      { title: DISCONNECT, status: 'delivered' },
    ]);
    const keys = h.error.mock.calls.map((c) => (c[0] as { opsAlert?: string }).opsAlert);
    expect(keys).toEqual(
      expect.arrayContaining([
        'notify:incident_opened:critical:Response Time Critical',
        'notify:incident_opened:critical:Disconnect Rate Critical',
      ])
    );
  });
});

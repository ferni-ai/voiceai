/**
 * Rate and score alerts wait for a minimum number of calls.
 *
 * With no minimum sample, one disconnected call was a 100% disconnect rate and
 * a quality score under 70, so the monitor opened critical Slack incidents
 * from a single call (102 alerts in three days of prod logs, 2026-10-18).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notify = vi.hoisted(() =>
  vi.fn(async () => ({ status: 'delivered' as const, via: 'slack' as const }))
);
vi.mock('../../slack-notifications.js', () => ({
  SlackNotificationService: class {
    notifyWithResult = notify;
  },
}));
vi.mock('../../predictive-alerting.js', () => ({ recordMetricValue: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  checkQualityAlerts,
  endCall,
  recordCallEvent,
  resetCallQualityStateForTests,
  startCall,
  startCallQualityMonitor,
} from '../call-quality-monitor.js';

/** A call that connected, then ended as `reason`. */
function call(id: string, reason: 'natural' | 'disconnect'): void {
  startCall(id);
  recordCallEvent({ callId: id, timestamp: Date.now(), type: 'connection_success' });
  endCall(id, reason);
}

const alertTitles = (): string[] =>
  notify.mock.calls.map((args) => (args as unknown as [{ title: string }])[0].title);

beforeEach(() => {
  resetCallQualityStateForTests();
  notify.mockClear();
  startCallQualityMonitor({ qualityCheckIntervalMs: 3_600_000 });
});
afterEach(() => resetCallQualityStateForTests());

describe('call quality minimum sample', () => {
  it('opens no incident for one bad call', async () => {
    call('only-call', 'disconnect');
    await checkQualityAlerts();
    expect(alertTitles()).toEqual([]);
  });

  it('opens no incident for one call that never connected', async () => {
    startCall('never-connected');
    endCall('never-connected', 'error');
    await checkQualityAlerts();
    expect(alertTitles()).toEqual([]);
  });

  it('alerts when 5 of 10 calls disconnect', async () => {
    for (let i = 0; i < 10; i++) call(`call-${i}`, i % 2 === 0 ? 'disconnect' : 'natural');
    await checkQualityAlerts();
    expect(alertTitles()).toContain('📞 Disconnect Rate Critical');
  });

  it('honours a configured minimum', async () => {
    resetCallQualityStateForTests();
    startCallQualityMonitor({ qualityCheckIntervalMs: 3_600_000, minCallsForRateAlerts: 1 });
    call('only-call', 'disconnect');
    await checkQualityAlerts();
    expect(alertTitles()).toContain('📞 Disconnect Rate Critical');
  });
});

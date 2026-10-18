/**
 * The call quality monitor only alerts on a rate or the quality score once a
 * worker has seen enough calls, and only abnormal drops count as disconnects.
 *
 * Prod, the day to 2026-10-18: 17 "Disconnect Rate Critical" pages
 * ("100.0% of calls ending in disconnection") from { totalCalls: 1 }.
 */
import { DisconnectReason } from '@livekit/rtc-node';
import { afterEach, describe, expect, it, vi } from 'vitest';

const notify = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../slack-notifications.js', () => ({
  // a function, not an arrow: the monitor calls it with `new`
  SlackNotificationService: vi.fn().mockImplementation(function () {
    return { notify };
  }),
}));
vi.mock('../../predictive-alerting.js', () => ({ recordMetricValue: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { classifyCallEnd, roomDisconnectEndReason } from '../call-end-reason.js';
import { alertMinCalls } from '../call-quality-min-sample.js';
import {
  calculateMetrics,
  checkQualityAlerts,
  endCall,
  recordCallEvent,
  resetCallQualityStateForTests,
  startCall,
  startCallQualityMonitor,
} from '../call-quality-monitor.js';

/** A call that connected and answered, then ended for `waitEndReason`. */
function call(id: string, waitEndReason: string): void {
  startCall(id);
  const now = Date.now();
  recordCallEvent({ callId: id, timestamp: now + 200, type: 'connection_success' });
  recordCallEvent({ callId: id, timestamp: now + 900, type: 'first_response' });
  endCall(id, classifyCallEnd(waitEndReason));
}

async function alertTitles(): Promise<string[]> {
  startCallQualityMonitor({ qualityCheckIntervalMs: 3_600_000 });
  await checkQualityAlerts();
  return notify.mock.calls.map(([n]) => String(n.title));
}

afterEach(() => {
  resetCallQualityStateForTests();
  notify.mockClear();
  vi.unstubAllEnvs();
});

describe('call quality alerts need enough calls', () => {
  it('one call that ends normally raises no alert, even with a minimum of 1', async () => {
    vi.stubEnv('CALL_QUALITY_ALERT_MIN_CALLS', '1');
    call('a', 'empty_room');
    expect(await alertTitles()).toEqual([]);
  });

  it('one abnormal drop is 100% disconnects but below the minimum: no alert', async () => {
    call('a', 'room.disconnected');
    expect(calculateMetrics().disconnectRate).toBe(1);
    expect(await alertTitles()).toEqual([]);
  });

  it('one call that never connected is 0% connected but below the minimum: no alert', async () => {
    startCall('a');
    expect(calculateMetrics().connectionSuccessRate).toBe(0);
    expect(await alertTitles()).toEqual([]);
  });

  it('five calls with four abnormal drops still page', async () => {
    call('ok', 'empty_room');
    for (const id of ['d1', 'd2', 'd3', 'd4']) call(id, 'room.disconnected');

    expect(calculateMetrics().disconnectRate).toBe(0.8);
    expect(await alertTitles()).toContain('📞 Disconnect Rate Critical');
  });

  it('CALL_QUALITY_ALERT_MIN_CALLS lowers the minimum', async () => {
    vi.stubEnv('CALL_QUALITY_ALERT_MIN_CALLS', '1');
    expect(alertMinCalls()).toBe(1);
    call('a', 'room.disconnected');
    expect(await alertTitles()).toContain('📞 Disconnect Rate Critical');
  });

  it('ignores a bad override', () => {
    vi.stubEnv('CALL_QUALITY_ALERT_MIN_CALLS', 'zero');
    expect(alertMinCalls()).toBe(5);
  });
});

describe('normal endings never count as disconnects', () => {
  it.each([
    ['caller left (LiveKit closed the room)', DisconnectReason.ROOM_CLOSED],
    ['agent hung up (end-call tool deleted the room)', DisconnectReason.ROOM_DELETED],
    ['agent left the room itself', DisconnectReason.CLIENT_INITIATED],
    ['agent removed from the room', DisconnectReason.PARTICIPANT_REMOVED],
  ])('%s', async (_label, reason) => {
    for (const id of ['1', '2', '3', '4', '5']) call(id, roomDisconnectEndReason(reason));

    expect(calculateMetrics().disconnectCount).toBe(0);
    expect(await alertTitles()).toEqual([]);
  });

  it.each([
    ['signal websocket closed', DisconnectReason.SIGNAL_CLOSE],
    ['no reason given', undefined],
  ])('%s is a drop', (_label, reason) => {
    expect(classifyCallEnd(roomDisconnectEndReason(reason))).toBe('disconnect');
  });

  it.each(['empty_room', 'idle', 'demo_limit'])('%s is a normal ending', (reason) => {
    expect(classifyCallEnd(reason)).toBe('natural');
  });
});

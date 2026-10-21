/**
 * Only abnormal drops count as disconnects: a call the caller or the agent
 * ended on purpose is a natural end, so it never feeds the disconnect-rate
 * or quality-score alerts. (The minimum sample is call-quality-sample.ts.)
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
  recordCallEvent({ callId: id, timestamp: now + 900, type: 'first_audio' });
  endCall(id, classifyCallEnd(waitEndReason));
}

async function alertTitles(): Promise<string[]> {
  startCallQualityMonitor({ qualityCheckIntervalMs: 3_600_000, minCallsForRateAlerts: 1 });
  await checkQualityAlerts();
  return notify.mock.calls.map(([n]) => String(n.title));
}

afterEach(() => {
  resetCallQualityStateForTests();
  notify.mockClear();
});

describe('normal endings never count as disconnects', () => {
  it('one call that ends normally raises no alert, even with a minimum of 1', async () => {
    call('a', 'empty_room');
    expect(await alertTitles()).toEqual([]);
  });

  it('one abnormal drop with a minimum of 1 still pages', async () => {
    call('a', 'room.disconnected');
    expect(calculateMetrics().disconnectRate).toBe(1);
    expect(await alertTitles()).toContain('📞 Disconnect Rate Critical');
  });

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

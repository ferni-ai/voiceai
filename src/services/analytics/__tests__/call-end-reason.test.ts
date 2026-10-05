/**
 * classifyCallEnd: why the agent stopped waiting on the room → how the call ended.
 *
 * Every call used to be recorded as 'disconnect', so a caller hanging up opened
 * a critical "Disconnect Rate Critical" incident (local e2e, 2026-10-04).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../slack-notifications.js', () => ({
  SlackNotificationService: vi.fn().mockImplementation(() => ({
    notify: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('../../predictive-alerting.js', () => ({ recordMetricValue: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { classifyCallEnd } from '../call-end-reason.js';
import {
  calculateMetrics,
  endCall,
  resetCallQualityStateForTests,
  startCall,
} from '../call-quality-monitor.js';

describe('classifyCallEnd', () => {
  it.each([
    ['empty_room', 'natural'],
    ['job.shutdownCallback', 'natural'],
    ['room.disconnected', 'disconnect'],
    ['room.!isConnected', 'disconnect'],
    ['connectionStateChanged:disconnected', 'disconnect'],
    ['connectionStateChanged:3', 'disconnect'],
    ['room_closed_before_participant', 'error'],
    ['timeout', 'error'],
    [undefined, 'error'],
    ['something_new', 'disconnect'],
  ] as const)('%s → %s', (reason, expected) => {
    expect(classifyCallEnd(reason)).toBe(expected);
  });
});

describe('call quality metrics from real end reasons', () => {
  afterEach(() => resetCallQualityStateForTests());

  it('a caller hanging up does not count as a dropped connection', () => {
    startCall('call-hangup');
    endCall('call-hangup', classifyCallEnd('empty_room'));

    expect(calculateMetrics().disconnectRate).toBe(0);
  });

  it('the agent losing the room still counts as one', () => {
    startCall('call-drop');
    endCall('call-drop', classifyCallEnd('room.disconnected'));

    expect(calculateMetrics().disconnectRate).toBe(1);
  });
});

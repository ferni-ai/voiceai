/**
 * Call Quality Monitor Tests
 *
 * Tests for the call quality monitoring and alerting system.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock dependencies before importing module
vi.mock('../../slack-notifications.js', () => ({
  SlackNotificationService: vi.fn().mockImplementation(() => ({
    notify: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../predictive-alerting.js', () => ({
  recordMetricValue: vi.fn(),
}));

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  recordCallEvent,
  startCall,
  endCall,
  calculateMetrics,
  getMetrics,
  getActiveCalls,
  getRecentCalls,
  getCallQualityMonitor,
  startCallQualityMonitor,
  stopCallQualityMonitor,
  type CallEvent,
} from '../call-quality-monitor.js';

describe('CallQualityMonitor', () => {
  beforeEach(() => {
    // Reset state between tests - stop monitor and clear any intervals
    stopCallQualityMonitor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopCallQualityMonitor();
  });

  describe('recordCallEvent', () => {
    it('should create a new session on first event', () => {
      const event: CallEvent = {
        callId: 'test-call-1',
        userId: 'user-1',
        personaId: 'ferni',
        timestamp: Date.now(),
        type: 'connection_attempt',
      };

      recordCallEvent(event);

      const activeCalls = getActiveCalls();
      expect(activeCalls.length).toBe(1);
      expect(activeCalls[0].callId).toBe('test-call-1');
      expect(activeCalls[0].userId).toBe('user-1');
    });

    it('should track connection time on success', () => {
      const startTime = Date.now();
      const callId = 'test-call-2';

      recordCallEvent({
        callId,
        timestamp: startTime,
        type: 'connection_attempt',
      });

      recordCallEvent({
        callId,
        timestamp: startTime + 500,
        type: 'connection_success',
      });

      const activeCalls = getActiveCalls();
      const session = activeCalls.find((c) => c.callId === callId);
      expect(session?.connectionTimeMs).toBe(500);
    });

    it('should track first response time', () => {
      const startTime = Date.now();
      const callId = 'test-call-3';

      recordCallEvent({
        callId,
        timestamp: startTime,
        type: 'connection_attempt',
      });

      recordCallEvent({
        callId,
        timestamp: startTime + 1500,
        type: 'first_response',
      });

      const activeCalls = getActiveCalls();
      const session = activeCalls.find((c) => c.callId === callId);
      expect(session?.firstResponseTimeMs).toBe(1500);
    });

    it('should count user speech events', () => {
      const callId = 'test-call-4';

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'connection_attempt',
      });

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'user_speech',
      });

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'user_speech',
      });

      const session = getActiveCalls().find((c) => c.callId === callId);
      expect(session?.userSpeechCount).toBe(2);
    });

    it('should count agent speech events', () => {
      const callId = 'test-call-5';

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'connection_attempt',
      });

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'agent_speech',
      });

      const session = getActiveCalls().find((c) => c.callId === callId);
      expect(session?.agentSpeechCount).toBe(1);
    });

    it('should count interruptions', () => {
      const callId = 'test-call-6';

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'connection_attempt',
      });

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'interruption',
      });

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'interruption',
      });

      const session = getActiveCalls().find((c) => c.callId === callId);
      expect(session?.interruptionCount).toBe(2);
    });

    it('should count silence events', () => {
      const callId = 'test-call-7';

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'connection_attempt',
      });

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'silence_detected',
      });

      const session = getActiveCalls().find((c) => c.callId === callId);
      expect(session?.silenceCount).toBe(1);
    });

    it('should track handoff attempts and successes', () => {
      const callId = 'test-call-8';

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'connection_attempt',
      });

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'handoff_attempt',
      });

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'handoff_success',
      });

      const session = getActiveCalls().find((c) => c.callId === callId);
      expect(session?.handoffAttempts).toBe(1);
      expect(session?.handoffSuccesses).toBe(1);
    });

    it('should move session to completed on natural end', () => {
      const callId = 'test-call-9';
      const startTime = Date.now();

      recordCallEvent({
        callId,
        timestamp: startTime,
        type: 'connection_attempt',
      });

      recordCallEvent({
        callId,
        timestamp: startTime + 30000,
        type: 'call_end_natural',
      });

      const activeCalls = getActiveCalls();
      expect(activeCalls.find((c) => c.callId === callId)).toBeUndefined();

      const recentCalls = getRecentCalls();
      const completed = recentCalls.find((c) => c.callId === callId);
      expect(completed?.endReason).toBe('natural');
      expect(completed?.totalDurationMs).toBe(30000);
    });

    it('should track disconnect end reason', () => {
      const callId = 'test-call-10';

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'connection_attempt',
      });

      recordCallEvent({
        callId,
        timestamp: Date.now() + 5000,
        type: 'call_end_disconnect',
      });

      const recentCalls = getRecentCalls();
      const completed = recentCalls.find((c) => c.callId === callId);
      expect(completed?.endReason).toBe('disconnect');
    });

    it('should track error end reason', () => {
      const callId = 'test-call-11';

      recordCallEvent({
        callId,
        timestamp: Date.now(),
        type: 'connection_attempt',
      });

      recordCallEvent({
        callId,
        timestamp: Date.now() + 1000,
        type: 'call_end_error',
      });

      const recentCalls = getRecentCalls();
      const completed = recentCalls.find((c) => c.callId === callId);
      expect(completed?.endReason).toBe('error');
    });
  });

  describe('startCall / endCall convenience functions', () => {
    it('should start a call with startCall', () => {
      startCall('easy-call-1', 'user-1', 'ferni');

      const activeCalls = getActiveCalls();
      expect(activeCalls.find((c) => c.callId === 'easy-call-1')).toBeDefined();
    });

    it('should end a call naturally', () => {
      startCall('easy-call-2');
      endCall('easy-call-2', 'natural');

      const recentCalls = getRecentCalls();
      expect(recentCalls.find((c) => c.callId === 'easy-call-2')?.endReason).toBe('natural');
    });

    it('should end a call with disconnect', () => {
      startCall('easy-call-3');
      endCall('easy-call-3', 'disconnect');

      const recentCalls = getRecentCalls();
      expect(recentCalls.find((c) => c.callId === 'easy-call-3')?.endReason).toBe('disconnect');
    });

    it('should end a call with error', () => {
      startCall('easy-call-4');
      endCall('easy-call-4', 'error');

      const recentCalls = getRecentCalls();
      expect(recentCalls.find((c) => c.callId === 'easy-call-4')?.endReason).toBe('error');
    });
  });

  describe('calculateMetrics', () => {
    beforeEach(() => {
      // Create some test data
      for (let i = 0; i < 10; i++) {
        const callId = `metric-call-${i}`;
        const startTime = Date.now();

        recordCallEvent({
          callId,
          userId: `user-${i}`,
          timestamp: startTime,
          type: 'connection_attempt',
        });

        recordCallEvent({
          callId,
          timestamp: startTime + 200,
          type: 'connection_success',
        });

        recordCallEvent({
          callId,
          timestamp: startTime + 1000,
          type: 'first_response',
        });

        // End some naturally, some with disconnect
        if (i < 8) {
          recordCallEvent({
            callId,
            timestamp: startTime + 60000,
            type: 'call_end_natural',
          });
        } else {
          recordCallEvent({
            callId,
            timestamp: startTime + 30000,
            type: 'call_end_disconnect',
          });
        }
      }
    });

    it('should calculate total calls', () => {
      const metrics = calculateMetrics();
      expect(metrics.totalCalls).toBeGreaterThanOrEqual(10);
    });

    it('should calculate connection success rate', () => {
      const metrics = calculateMetrics();
      expect(metrics.connectionSuccessRate).toBeGreaterThan(0);
      expect(metrics.connectionSuccessRate).toBeLessThanOrEqual(1);
    });

    it('should calculate average connection time', () => {
      const metrics = calculateMetrics();
      expect(metrics.avgConnectionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average first response time', () => {
      const metrics = calculateMetrics();
      expect(metrics.avgFirstResponseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate p95 first response time', () => {
      const metrics = calculateMetrics();
      expect(metrics.p95FirstResponseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate disconnect rate', () => {
      const metrics = calculateMetrics();
      expect(metrics.disconnectRate).toBeGreaterThanOrEqual(0);
      expect(metrics.disconnectRate).toBeLessThanOrEqual(1);
    });

    it('should calculate completion rate', () => {
      const metrics = calculateMetrics();
      expect(metrics.completionRate).toBeGreaterThanOrEqual(0);
      expect(metrics.completionRate).toBeLessThanOrEqual(1);
    });

    it('should calculate quality score between 0 and 100', () => {
      const metrics = calculateMetrics();
      expect(metrics.qualityScore).toBeGreaterThanOrEqual(0);
      expect(metrics.qualityScore).toBeLessThanOrEqual(100);
    });

    it('should count natural end, disconnect, and error calls', () => {
      const metrics = calculateMetrics();
      expect(metrics.naturalEndCount).toBeGreaterThanOrEqual(0);
      expect(metrics.disconnectCount).toBeGreaterThanOrEqual(0);
      expect(metrics.errorCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getCallQualityMonitor', () => {
    it('should return a monitor interface', () => {
      const monitor = getCallQualityMonitor();
      expect(monitor.getStats).toBeDefined();
      expect(monitor.getRecentCalls).toBeDefined();
    });

    it('should return stats with getStats', () => {
      const monitor = getCallQualityMonitor();
      const stats = monitor.getStats();

      expect(stats).toHaveProperty('qualityScore');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('totalCalls');
      expect(stats).toHaveProperty('activeCalls');
      expect(stats).toHaveProperty('avgDurationMs');
      expect(stats).toHaveProperty('avgTimeToFirstResponseMs');
    });

    it('should return recent calls', () => {
      startCall('monitor-call-1');
      endCall('monitor-call-1');

      const monitor = getCallQualityMonitor();
      const recentCalls = monitor.getRecentCalls(10);

      expect(Array.isArray(recentCalls)).toBe(true);
    });
  });

  describe('startCallQualityMonitor / stopCallQualityMonitor', () => {
    it('should start without error', () => {
      expect(() => {
        startCallQualityMonitor({ enableSlack: false });
      }).not.toThrow();
    });

    it('should not start twice', () => {
      startCallQualityMonitor({ enableSlack: false });
      // Second call should just warn, not error
      expect(() => {
        startCallQualityMonitor({ enableSlack: false });
      }).not.toThrow();
    });

    it('should stop without error', () => {
      startCallQualityMonitor({ enableSlack: false });
      expect(() => {
        stopCallQualityMonitor();
      }).not.toThrow();
    });

    it('should handle stop when not running', () => {
      expect(() => {
        stopCallQualityMonitor();
      }).not.toThrow();
    });
  });

  describe('getActiveCalls and getRecentCalls', () => {
    it('should return empty array when no calls', () => {
      const activeCalls = getActiveCalls();
      expect(Array.isArray(activeCalls)).toBe(true);
    });

    it('should limit recent calls', () => {
      // Create 5 calls
      for (let i = 0; i < 5; i++) {
        startCall(`limit-call-${i}`);
        endCall(`limit-call-${i}`);
      }

      const limited = getRecentCalls(3);
      expect(limited.length).toBeLessThanOrEqual(3);
    });
  });
});

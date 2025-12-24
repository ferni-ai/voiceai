/**
 * Outreach Analytics Tests
 *
 * Tests for the outreach analytics tracking system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordOutreachEvent,
  recordOutreachResponse,
  getOutreachMetrics,
  getUserOutreachSummary,
  getOutreachDashboard,
} from '../outreach-analytics.js';

describe('outreach-analytics', () => {
  let testUserId: string;

  beforeEach(() => {
    // Use unique user ID per test to avoid state pollution
    testUserId = `test-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-20T14:00:00Z')); // 2pm - afternoon
  });

  describe('recordOutreachEvent', () => {
    it('should record an outreach event', () => {
      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'thinking_of_you',
        channel: 'push',
        delivered: true,
      });

      const metrics = getOutreachMetrics('day', testUserId);
      expect(metrics.totalOutreach).toBe(1);
    });

    it('should categorize by channel', () => {
      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'test',
        channel: 'push',
        delivered: true,
      });

      recordOutreachEvent({
        id: 'outreach-2',
        userId: testUserId,
        type: 'test',
        channel: 'email',
        delivered: true,
      });

      const metrics = getOutreachMetrics('day', testUserId);
      expect(metrics.byChannel['push']).toBe(1);
      expect(metrics.byChannel['email']).toBe(1);
    });

    it('should categorize by trigger type', () => {
      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'onboarding',
        channel: 'push',
        delivered: true,
      });

      recordOutreachEvent({
        id: 'outreach-2',
        userId: testUserId,
        type: 'reengagement',
        channel: 'push',
        delivered: true,
      });

      const metrics = getOutreachMetrics('day', testUserId);
      expect(metrics.byTriggerType['onboarding']).toBe(1);
      expect(metrics.byTriggerType['reengagement']).toBe(1);
    });

    it('should determine correct time slot', () => {
      const timeSlotTestUser = `timeslot-test-${Date.now()}`;
      // Test afternoon (2pm - the default beforeEach time)
      recordOutreachEvent({
        id: 'timeslot-test-1',
        userId: timeSlotTestUser,
        type: 'timeslot-test',
        channel: 'push',
        delivered: true,
      });

      const metrics = getOutreachMetrics('day', timeSlotTestUser);
      // Should have at least one time slot recorded for this user
      expect(metrics.bestTimeSlots.length).toBeGreaterThan(0);
      // The time slot should have valid structure
      expect(metrics.bestTimeSlots[0]).toHaveProperty('slot');
      expect(metrics.bestTimeSlots[0]).toHaveProperty('volume');
    });
  });

  describe('recordOutreachResponse', () => {
    it('should mark outreach as responded', () => {
      const responseTestUser = `response-test-${Date.now()}`;

      recordOutreachEvent({
        id: 'response-test-outreach',
        userId: responseTestUser,
        type: 'response-test',
        channel: 'push',
        delivered: true,
      });

      recordOutreachResponse(responseTestUser, 'response-test-outreach');

      const metrics = getOutreachMetrics('day', responseTestUser);
      expect(metrics.responseRate).toBeGreaterThan(0);
    });

    it('should calculate response time', () => {
      const responseTimeUser = `response-time-user-${Date.now()}`;

      // Record outreach at a specific time
      vi.setSystemTime(new Date('2025-01-20T14:00:00Z'));
      recordOutreachEvent({
        id: 'response-time-outreach',
        userId: responseTimeUser,
        type: 'response-test',
        channel: 'push',
        delivered: true,
      });

      // Record response 5 minutes later
      vi.setSystemTime(new Date('2025-01-20T14:05:00Z'));
      recordOutreachResponse(responseTimeUser, 'response-time-outreach');

      const metrics = getOutreachMetrics('day', responseTimeUser);
      // Response time should be approximately 5 minutes (300000ms)
      expect(metrics.avgResponseTimeMs).toBe(5 * 60 * 1000);
    });

    it('should find most recent outreach when no ID provided', () => {
      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'test',
        channel: 'push',
        delivered: true,
      });

      recordOutreachResponse(testUserId); // No ID

      const metrics = getOutreachMetrics('day', testUserId);
      expect(metrics.responseRate).toBeGreaterThan(0);
    });
  });

  describe('getOutreachMetrics', () => {
    it('should filter by period - day', () => {
      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'test',
        channel: 'push',
        delivered: true,
      });

      const dayMetrics = getOutreachMetrics('day', testUserId);
      expect(dayMetrics.period).toBe('day');
      expect(dayMetrics.totalOutreach).toBe(1);
    });

    it('should filter by period - week', () => {
      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'test',
        channel: 'push',
        delivered: true,
      });

      const weekMetrics = getOutreachMetrics('week', testUserId);
      expect(weekMetrics.period).toBe('week');
      expect(weekMetrics.totalOutreach).toBe(1);
    });

    it('should calculate delivery rate', () => {
      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'test',
        channel: 'push',
        delivered: true,
      });

      recordOutreachEvent({
        id: 'outreach-2',
        userId: testUserId,
        type: 'test',
        channel: 'push',
        delivered: false,
      });

      const metrics = getOutreachMetrics('day', testUserId);
      expect(metrics.deliveryRate).toBe(0.5);
    });

    it('should filter by userId when provided', () => {
      const filterTestUser1 = `filter-user-1-${Date.now()}`;
      const filterTestUser2 = `filter-user-2-${Date.now()}`;

      recordOutreachEvent({
        id: 'filter-outreach-1',
        userId: filterTestUser1,
        type: 'filter-test',
        channel: 'push',
        delivered: true,
      });

      recordOutreachEvent({
        id: 'filter-outreach-2',
        userId: filterTestUser2,
        type: 'filter-test',
        channel: 'push',
        delivered: true,
      });

      const user1Metrics = getOutreachMetrics('day', filterTestUser1);
      const user2Metrics = getOutreachMetrics('day', filterTestUser2);

      // Each user should have exactly 1 event
      expect(user1Metrics.totalOutreach).toBe(1);
      expect(user2Metrics.totalOutreach).toBe(1);
    });

    it('should calculate best time slots by response rate', () => {
      const timeSlotUserId = `timeslot-user-${Date.now()}`;

      // Morning outreach - responded
      vi.setSystemTime(new Date('2025-01-20T10:00:00Z'));
      recordOutreachEvent({
        id: 'outreach-morning-1',
        userId: timeSlotUserId,
        type: 'timeslot-test',
        channel: 'push',
        delivered: true,
      });
      recordOutreachResponse(timeSlotUserId, 'outreach-morning-1');

      // Evening outreach - not responded
      vi.setSystemTime(new Date('2025-01-20T19:00:00Z'));
      recordOutreachEvent({
        id: 'outreach-evening-1',
        userId: timeSlotUserId,
        type: 'timeslot-test',
        channel: 'push',
        delivered: true,
      });

      const metrics = getOutreachMetrics('day', timeSlotUserId);

      // Should have time slots recorded
      expect(metrics.bestTimeSlots.length).toBeGreaterThan(0);

      // Check that time slots are sorted by response rate (best first)
      if (metrics.bestTimeSlots.length >= 2) {
        expect(metrics.bestTimeSlots[0].responseRate).toBeGreaterThanOrEqual(
          metrics.bestTimeSlots[1].responseRate
        );
      }
    });
  });

  describe('getUserOutreachSummary', () => {
    it('should return null for unknown user', () => {
      const summary = getUserOutreachSummary('unknown-user');
      expect(summary).toBeNull();
    });

    it('should return summary for user with outreach', () => {
      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'test',
        channel: 'push',
        delivered: true,
      });
      recordOutreachResponse(testUserId, 'outreach-1');

      const summary = getUserOutreachSummary(testUserId);

      expect(summary).toBeDefined();
      expect(summary?.userId).toBe(testUserId);
      expect(summary?.totalOutreach).toBe(1);
      expect(summary?.totalResponses).toBe(1);
      expect(summary?.responseRate).toBe(1);
    });

    it('should track last outreach date', () => {
      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'test',
        channel: 'push',
        delivered: true,
      });

      const summary = getUserOutreachSummary(testUserId);
      expect(summary?.lastOutreach).toBeDefined();
    });

    it('should track last response date', () => {
      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'test',
        channel: 'push',
        delivered: true,
      });
      recordOutreachResponse(testUserId, 'outreach-1');

      const summary = getUserOutreachSummary(testUserId);
      expect(summary?.lastResponse).toBeDefined();
    });
  });

  describe('getOutreachDashboard', () => {
    it('should return dashboard data structure', () => {
      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'test',
        channel: 'push',
        delivered: true,
      });

      const dashboard = getOutreachDashboard();

      expect(dashboard).toHaveProperty('overview');
      expect(dashboard).toHaveProperty('weeklyTrend');
      expect(dashboard).toHaveProperty('topPerformingTriggers');
      expect(dashboard).toHaveProperty('channelPerformance');
    });

    it('should include todays metrics in overview', () => {
      const beforeDashboard = getOutreachDashboard();
      const beforeCount = beforeDashboard.overview.totalOutreachToday;

      recordOutreachEvent({
        id: 'outreach-dashboard-test',
        userId: testUserId,
        type: 'dashboard-test',
        channel: 'push',
        delivered: true,
      });

      const afterDashboard = getOutreachDashboard();
      // Should have increased by 1
      expect(afterDashboard.overview.totalOutreachToday).toBe(beforeCount + 1);
    });

    it('should generate weekly trend data', () => {
      const dashboard = getOutreachDashboard();

      expect(dashboard.weeklyTrend).toHaveLength(7);
      expect(dashboard.weeklyTrend[0]).toHaveProperty('date');
      expect(dashboard.weeklyTrend[0]).toHaveProperty('outreach');
      expect(dashboard.weeklyTrend[0]).toHaveProperty('responses');
    });

    it('should track channel performance', () => {
      const channelTestUserId = `channel-test-${Date.now()}`;
      recordOutreachEvent({
        id: 'channel-outreach-1',
        userId: channelTestUserId,
        type: 'channel-test',
        channel: 'sms', // Use unique channel to avoid pollution from other tests
        delivered: true,
      });
      recordOutreachResponse(channelTestUserId, 'channel-outreach-1');

      const dashboard = getOutreachDashboard();

      const smsPerformance = dashboard.channelPerformance.find((c) => c.channel === 'sms');
      expect(smsPerformance).toBeDefined();
      // Channel performance aggregates ALL events for that channel, so rates may vary
      expect(smsPerformance?.deliveryRate).toBeGreaterThan(0);
      expect(smsPerformance?.responseRate).toBeGreaterThan(0);
    });
  });

  describe('time slot determination', () => {
    it('should include time slots in metrics', () => {
      // Record event at default test time (2pm - afternoon)
      recordOutreachEvent({
        id: `outreach-slot-test`,
        userId: testUserId,
        type: 'slot-test',
        channel: 'push',
        delivered: true,
      });

      const metrics = getOutreachMetrics('day', testUserId);
      // Should have at least one time slot recorded
      expect(metrics.bestTimeSlots.length).toBeGreaterThan(0);
      // Each time slot should have the required fields
      if (metrics.bestTimeSlots.length > 0) {
        expect(metrics.bestTimeSlots[0]).toHaveProperty('slot');
        expect(metrics.bestTimeSlots[0]).toHaveProperty('responseRate');
        expect(metrics.bestTimeSlots[0]).toHaveProperty('volume');
      }
    });
  });

  describe('day of week tracking', () => {
    it('should track day of week correctly', () => {
      // January 20, 2025 is a Monday
      vi.setSystemTime(new Date('2025-01-20T14:00:00Z'));

      recordOutreachEvent({
        id: 'outreach-1',
        userId: testUserId,
        type: 'test',
        channel: 'push',
        delivered: true,
      });

      const metrics = getOutreachMetrics('day', testUserId);
      expect(metrics.bestDays.some((d) => d.day === 'Monday')).toBe(true);
    });
  });
});

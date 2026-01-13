/**
 * Workflow Scheduler Tests
 *
 * Tests for the scheduler service:
 * - Cron schedule parsing
 * - Basic scheduler operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSchedulerService,
  resetSchedulerService,
  parseCronExpression,
} from '../../services/workflows/scheduler/scheduler-service.js';

// ============================================================================
// CRON PARSING TESTS
// ============================================================================

describe('parseCronExpression', () => {
  it('should parse valid daily cron expression', () => {
    const result = parseCronExpression('0 9 * * *');
    expect(result.valid).toBe(true);
    expect(result.nextRun).toBeDefined();
    expect(result.description).toBeDefined();
  });

  it('should parse valid hourly cron expression', () => {
    const result = parseCronExpression('0 * * * *');
    expect(result.valid).toBe(true);
    expect(result.nextRun).toBeDefined();
  });

  it('should parse weekday patterns', () => {
    const result = parseCronExpression('0 9 * * 1-5');
    expect(result.valid).toBe(true);
    expect(result.description).toContain('weekday');
  });

  it('should parse interval patterns', () => {
    const result = parseCronExpression('*/15 * * * *');
    expect(result.valid).toBe(true);
  });

  it('should parse hourly intervals', () => {
    const result = parseCronExpression('0 */2 * * *');
    expect(result.valid).toBe(true);
  });

  it('should reject invalid cron expression', () => {
    const result = parseCronExpression('invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should reject cron with wrong number of fields', () => {
    const result = parseCronExpression('0 9 *'); // Only 3 fields
    expect(result.valid).toBe(false);
  });

  it('should handle specific minute and hour', () => {
    const result = parseCronExpression('30 14 * * *'); // 2:30 PM
    expect(result.valid).toBe(true);
    if (result.nextRun) {
      expect(result.nextRun.getMinutes()).toBe(30);
      expect(result.nextRun.getHours()).toBe(14);
    }
  });

  it('should calculate next run in the future', () => {
    const result = parseCronExpression('0 9 * * *');
    expect(result.valid).toBe(true);
    if (result.nextRun) {
      expect(result.nextRun.getTime()).toBeGreaterThan(Date.now());
    }
  });
});

// ============================================================================
// SCHEDULER SERVICE TESTS
// ============================================================================

describe('SchedulerService', () => {
  beforeEach(() => {
    resetSchedulerService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSchedulerService();
  });

  describe('getSchedulerService', () => {
    it('should return singleton instance', () => {
      const service1 = getSchedulerService();
      const service2 = getSchedulerService();
      expect(service1).toBe(service2);
    });
  });

  describe('scheduleWorkflow', () => {
    it('should reject invalid cron expressions', async () => {
      const scheduler = getSchedulerService();

      const result = await scheduler.scheduleWorkflow({
        workflowId: 'test-workflow-invalid',
        userId: 'test-user',
        schedule: 'invalid-cron',
        timezone: 'UTC',
        enabled: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('cancelSchedule', () => {
    it('should handle cancellation of non-existent schedule', async () => {
      const scheduler = getSchedulerService();

      // Should not throw even for non-existent schedule
      const result = await scheduler.cancelSchedule('test-user', 'non-existent');
      expect(result).toBeDefined();
    });
  });

  describe('getScheduleInfo', () => {
    it('should return null for non-existent workflow', async () => {
      const scheduler = getSchedulerService();
      const info = await scheduler.getScheduleInfo('test-user', 'non-existent');
      expect(info).toBeNull();
    });
  });
});

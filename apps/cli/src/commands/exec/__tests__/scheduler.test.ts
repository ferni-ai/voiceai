/**
 * Scheduler Tests
 *
 * Tests for the autonomous executive scheduler with cron integration.
 */

import { describe, it, expect } from 'vitest';

import {
  formatSchedule,
  scheduleToCron,
} from '../scheduler.js';

// These helpers were previously redefined verbatim inside this file, so the
// suite asserted against its own copy and could not catch drift in scheduler.ts.

// Test schedule-to-cron conversion logic
describe('Schedule to Cron Conversion', () => {
  // Helper to parse our schedule format
  it('converts daily@07:00 to correct cron', () => {
    expect(scheduleToCron('daily@07:00')).toBe('0 7 * * *');
  });

  it('converts daily@18:30 to correct cron', () => {
    expect(scheduleToCron('daily@18:30')).toBe('30 18 * * *');
  });

  it('converts weekly@mon-09:00 to correct cron', () => {
    expect(scheduleToCron('weekly@mon-09:00')).toBe('0 9 * * 1');
  });

  it('converts weekly@fri-16:00 to correct cron', () => {
    expect(scheduleToCron('weekly@fri-16:00')).toBe('0 16 * * 5');
  });

  it('converts monthly@1-09:00 to correct cron', () => {
    expect(scheduleToCron('monthly@1-09:00')).toBe('0 9 1 * *');
  });

  it('converts monthly@15-14:30 to correct cron', () => {
    expect(scheduleToCron('monthly@15-14:30')).toBe('30 14 15 * *');
  });
});

describe('Schedule Format Parsing', () => {
  it('formats daily schedule', () => {
    expect(formatSchedule('daily@07:00')).toBe('Daily at 07:00');
  });

  it('formats weekly schedule', () => {
    expect(formatSchedule('weekly@mon-09:00')).toBe('Every Mon at 09:00');
  });

  it('formats monthly schedule', () => {
    expect(formatSchedule('monthly@1-09:00')).toBe('1st of each month at 09:00');
  });
});

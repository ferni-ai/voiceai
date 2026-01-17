/**
 * Scheduler Tests
 *
 * Tests for the autonomous executive scheduler with cron integration.
 */

import { describe, it, expect } from 'vitest';

// Test schedule-to-cron conversion logic
describe('Schedule to Cron Conversion', () => {
  // Helper to parse our schedule format
  function scheduleToCron(schedule: string): string {
    const [frequency, time] = schedule.split('@');

    if (frequency === 'daily') {
      const [hours, minutes] = time.split(':').map(Number);
      return `${minutes} ${hours} * * *`;
    }

    if (frequency === 'weekly') {
      const [day, timeStr] = time.split('-');
      const [hours, minutes] = timeStr.split(':').map(Number);
      const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      const dayNum = dayMap[day.toLowerCase()] ?? 1;
      return `${minutes} ${hours} * * ${dayNum}`;
    }

    if (frequency === 'monthly') {
      const [dayOfMonth, timeStr] = time.split('-');
      const [hours, minutes] = timeStr.split(':').map(Number);
      return `${minutes} ${hours} ${dayOfMonth} * *`;
    }

    return '0 0 * * *';
  }

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
  function formatSchedule(schedule: string): string {
    const [frequency, time] = schedule.split('@');

    if (frequency === 'daily') {
      return `Daily at ${time}`;
    }
    if (frequency === 'weekly') {
      const [day, timeStr] = time.split('-');
      return `Every ${day.charAt(0).toUpperCase() + day.slice(1)} at ${timeStr}`;
    }
    if (frequency === 'monthly') {
      const [dayOfMonth, timeStr] = time.split('-');
      const suffix =
        dayOfMonth === '1' ? 'st' : dayOfMonth === '2' ? 'nd' : dayOfMonth === '3' ? 'rd' : 'th';
      return `${dayOfMonth}${suffix} of each month at ${timeStr}`;
    }
    return schedule;
  }

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

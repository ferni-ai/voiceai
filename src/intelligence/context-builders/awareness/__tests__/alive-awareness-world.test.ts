import { describe, expect, it } from 'vitest';
import { getWorldContext } from '../alive-awareness.js';

describe('getWorldContext', () => {
  it("uses the caller's clock, not the server's", () => {
    // 02:30 UTC on Saturday is 20:30 Friday evening in Denver
    const now = new Date('2026-09-26T02:30:00Z');
    const world = getWorldContext('America/Denver', now);
    expect(world.timeOfDay).toBe('evening');
    expect(world.dayOfWeek).toBe('Friday');
    expect(world.isWeekend).toBe(false);
  });

  it("knows the caller's date for special days", () => {
    // 05:00 UTC on Feb 15 is still Valentine's evening in Los Angeles
    const world = getWorldContext('America/Los_Angeles', new Date('2026-02-15T05:00:00Z'));
    expect(world.specialDay).toBe('valentines');
  });
});

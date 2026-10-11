import { describe, expect, it } from 'vitest';
import { ferniClockLine, localClockContext, localClockEnabled } from '../local-clock.js';
import { timeContext } from '../time-context.js';

// The prod call: 2026-10-11 07:47 UTC is Sunday 1:47 am in Denver, 3:47 am in New York.
const prodCall = new Date('2026-10-11T07:47:00Z');
// 2026-10-11 16:15 UTC is Sunday 10:15 am in Denver, 12:15 pm in New York.
const lateMorning = new Date('2026-10-11T16:15:00Z');

const DAYTIME_WORDS = /\b(morning|afternoon|evening)\b/i;

describe('Ferni local clock', () => {
  it('at 1:47 am mountain time says night and Sunday, never a daytime part, for Ferni', () => {
    const line = ferniClockLine(prodCall);
    expect(line).toContain('Sunday, October 11, 2026, 1:47 AM mountain time');
    expect(line).toContain('the middle of the night');
    expect(line).toContain('happening now, at night');
    expect(line).toContain('not up early');
    expect(line).not.toMatch(DAYTIME_WORDS);
    // The routine is framed as a habit, not the present.
    expect(line).toContain(
      'Waking around five is a habit of yours, not what is happening right now'
    );
  });

  it('in the day names the real part of the day for Ferni', () => {
    const line = ferniClockLine(lateMorning);
    expect(line).toContain('10:15 AM mountain time: morning');
    expect(line).toContain('happening now, in the morning');
    expect(line).not.toContain('night');
    expect(line).not.toContain('not up early');
  });

  it("gives the caller's own time when their zone is known", () => {
    const night = localClockContext(prodCall, 'America/New_York');
    expect(night).toContain(
      "For the caller it's Sunday, 3:47 AM (America/New_York): the middle of the night."
    );
    expect(night).not.toMatch(DAYTIME_WORDS);
    const day = localClockContext(lateMorning, 'America/New_York');
    expect(day).toContain('10:15 AM mountain time: morning');
    expect(day).toContain("For the caller it's Sunday, 12:15 PM (America/New_York): afternoon.");
  });

  it("without the caller's zone, keeps Ferni's clock and says the caller's time is unknown", () => {
    for (const tz of [undefined, 'Mars/Olympus']) {
      const text = localClockContext(prodCall, tz);
      expect(text).toContain('1:47 AM mountain time');
      expect(text).toContain("You don't know the caller's local time");
      expect(text).not.toContain('3:47');
    }
  });

  it('is off unless FERNI_LOCAL_CLOCK=on, and off leaves the old section as it was', () => {
    expect(localClockEnabled({})).toBe(false);
    expect(localClockEnabled({ FERNI_LOCAL_CLOCK: 'true' })).toBe(false);
    expect(localClockEnabled({ FERNI_LOCAL_CLOCK: 'on' })).toBe(true);
    // The old section has no clock for Ferni at all (the bug).
    expect(timeContext(prodCall, 'America/New_York')).not.toContain('mountain time');
  });
});

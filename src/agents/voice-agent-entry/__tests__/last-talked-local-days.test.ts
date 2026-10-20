/**
 * "Earlier today" / "yesterday" in the caller's calendar days (#2278).
 *
 * Prod 2026-10-20: a caller in New York last called at 5:29 pm local the day
 * before; at 5:24 am local the 24-hour count gave 0, the greeting director was
 * told "earlier today" and said "Back for round two today, huh?". These tests
 * run the real helper, the real greeting history and the real awareness block,
 * with AWARENESS_LOCAL_DAYS on and off.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { daysSinceLastTalk } from '../../../utils/days-since-last-talk.js';
import { callerHistory } from '../../multi-agent/greeting-direction.js';
import { injectUserAwareness } from '../user-awareness-injection.js';
import { createUserProfile } from '../../../types/user-profile.js';

const NY = 'America/New_York';
const ON = { AWARENESS_LOCAL_DAYS: 'on' };
const OFF = {};

// The two prod calls: 12 h after a call the evening before, 33.6 h after one two evenings before.
const NOW = new Date('2026-10-20T09:24:14Z'); // 05:24 Oct 20 in New York
const EVENING_BEFORE = new Date('2026-10-19T21:29:51Z'); // 17:29 Oct 19
const TWO_EVENINGS_BEFORE = new Date('2026-10-18T23:48:19Z'); // 19:48 Oct 18
const SAME_MORNING = new Date('2026-10-20T08:00:00Z'); // 04:00 Oct 20

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('daysSinceLastTalk', () => {
  it('flag off: 24-hour blocks, as before', () => {
    expect(daysSinceLastTalk(EVENING_BEFORE, NOW, NY, OFF)).toBe(0);
    expect(daysSinceLastTalk(TWO_EVENINGS_BEFORE, NOW, NY, OFF)).toBe(1);
    expect(daysSinceLastTalk(SAME_MORNING, NOW, NY, OFF)).toBe(0);
  });

  it('flag on: calendar days in the caller zone', () => {
    expect(daysSinceLastTalk(EVENING_BEFORE, NOW, NY, ON)).toBe(1);
    expect(daysSinceLastTalk(TWO_EVENINGS_BEFORE, NOW, NY, ON)).toBe(2);
    expect(daysSinceLastTalk(SAME_MORNING, NOW, NY, ON)).toBe(0);
  });

  it('flag on but no usable zone: 24-hour blocks', () => {
    expect(daysSinceLastTalk(EVENING_BEFORE, NOW, undefined, ON)).toBe(0);
    expect(daysSinceLastTalk(EVENING_BEFORE, NOW, 'Not/AZone', ON)).toBe(0);
  });

  it('counts across a DST change by date, not hours', () => {
    // New York falls back on 2026-11-01: 23:00 local Oct 31 to 23:30 local Nov 1 is 25.5 h.
    const before = new Date('2026-11-01T03:00:00Z'); // 23:00 Oct 31 EDT
    const after = new Date('2026-11-02T04:30:00Z'); // 23:30 Nov 1 EST
    expect(daysSinceLastTalk(before, after, NY, ON)).toBe(1);
  });
});

describe('greeting history (greeting-direction.ts callerHistory)', () => {
  const profile = { totalConversations: 3, lastContact: EVENING_BEFORE.toISOString() };

  it('flag off: the evening before is still day 0 (unchanged)', () => {
    vi.stubEnv('AWARENESS_LOCAL_DAYS', '');
    expect(callerHistory(profile, NOW, NY)?.daysSince).toBe(0);
  });

  it('flag on: the evening before is yesterday', () => {
    vi.stubEnv('AWARENESS_LOCAL_DAYS', 'on');
    expect(callerHistory(profile, NOW, NY)?.daysSince).toBe(1);
  });
});

describe('awareness block (voice-agent-entry injectUserAwareness)', () => {
  function inject(lastContact: Date) {
    const profile = createUserProfile('u-owner', 'seth');
    profile.totalConversations = 694;
    profile.lastContact = lastContact;
    return injectUserAwareness({
      sessionId: 'sess-days',
      userProfile: profile,
      userData: { callerTimezone: NY },
      isReturningUser: true,
      userName: 'seth',
      sessionStartTime: NOW,
    }).facts;
  }

  it('flag off: same lines as before', () => {
    vi.stubEnv('AWARENESS_LOCAL_DAYS', '');
    expect(inject(EVENING_BEFORE)).toContain('You talked earlier today.');
    expect(inject(TWO_EVENINGS_BEFORE)).toContain('You talked yesterday.');
  });

  it('flag on: yesterday and two days ago, by the caller calendar', () => {
    vi.stubEnv('AWARENESS_LOCAL_DAYS', 'on');
    const evening = inject(EVENING_BEFORE);
    expect(evening).toContain('You talked yesterday.');
    expect(evening).not.toContain('You talked earlier today.');
    expect(inject(TWO_EVENINGS_BEFORE)).toContain('Last talked 2 days ago.');
  });
});

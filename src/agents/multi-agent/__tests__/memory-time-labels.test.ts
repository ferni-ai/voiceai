/**
 * MEMORY_TIME_LABELS (#2530) on the system prompt's last-call lines, the path
 * that said "I hope you survived being the snack mom" before Saturday: the
 * summary line (agent-setup and the voice-agent user awareness, both through
 * lastTalkedAbout), "You talked earlier today." and LET_THEM_LEAD's example
 * (lastCallAwareness). Times are New York wall times in November (UTC-5).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildUserAwareness } from '../../voice-agent/phases/user-awareness.js';
import { lastTalkedAbout } from '../teammate-relationship.js';
import { lastCallAwareness } from '../welcome-back.js';
import type { UserProfile } from '../../../types/user-profile.js';
import { warmTemporalParser } from '../../../understanding/temporal/resolve-time.js';

const ZONE = 'America/New_York';
const et = (wall: string): number => Date.parse(`${wall}:00-05:00`);
/** Wednesday 2026-11-18, 8 pm: when the last call ended. */
const WED_8PM = et('2026-11-18T20:00');
const THU_11PM = et('2026-11-19T23:00');
const ISSUE_SUMMARY =
  "USER had back-to-back cleanings today; USER's daughter Ava has a soccer tournament on Saturday, so USER is the snack mom this week";
const AHEAD = '[coming up, not happened yet]';
const ON = { MEMORY_TIME_LABELS: 'on' };
const OFF = { MEMORY_TIME_LABELS: 'off' };

// compromise reads "this week" as a span; without it the week is never read at all.
beforeAll(async () => {
  expect(await warmTemporalParser()).toBe(true);
});
afterEach(() => vi.unstubAllEnvs());

describe('the last-call summary line (lastTalkedAbout)', () => {
  const last = { at: WED_8PM, now: THU_11PM, zone: ZONE };

  it('flag off: byte-identical to the line without a last call', () => {
    vi.stubEnv('MEMORY_TIME_LABELS', 'off');
    expect(lastTalkedAbout(false, ISSUE_SUMMARY, last)).toBe(
      `Last time you talked about: ${ISSUE_SUMMARY}`
    );
    expect(lastTalkedAbout(true, ISSUE_SUMMARY, last)).toBe(lastTalkedAbout(true, ISSUE_SUMMARY));
  });

  it("marks Saturday's tournament coming up on Thursday night, and only the Saturday, not the week", () => {
    vi.stubEnv('MEMORY_TIME_LABELS', 'on');
    expect(lastTalkedAbout(false, ISSUE_SUMMARY, last)).toBe(
      `Last time you talked about: USER had back-to-back cleanings today [already happened]; USER's daughter Ava has a soccer tournament on Saturday ${AHEAD}, so USER is the snack mom this week`
    );
  });

  it('reads tense per clause: a past interview and a final still ahead', () => {
    vi.stubEnv('MEMORY_TIME_LABELS', 'on');
    const mixed = 'Had a rough interview on Monday and the final round is on Friday';
    expect(lastTalkedAbout(true, mixed, last)).toBe(
      `Last time they called, they talked about: Had a rough interview on Monday [already happened] and the final round is on Friday ${AHEAD}`
    );
  });

  it('a whole-day event is "today" on its day, and may be over from the evening', () => {
    vi.stubEnv('MEMORY_TIME_LABELS', 'on');
    const plan = 'the tournament is on Saturday';
    const sat = (wall: string) =>
      lastTalkedAbout(false, plan, { at: WED_8PM, now: et(wall), zone: ZONE });
    expect(sat('2026-11-21T10:00')).toContain('on Saturday [today]');
    expect(sat('2026-11-21T21:00')).toContain('on Saturday [today, may be over by now]');
    expect(sat('2026-11-23T12:00')).toContain('on Saturday [already happened]');
  });

  it('gives a recurring time no mark', () => {
    vi.stubEnv('MEMORY_TIME_LABELS', 'on');
    expect(lastTalkedAbout(false, 'USER coaches soccer every Saturday', last)).toBe(
      'Last time you talked about: USER coaches soccer every Saturday'
    );
  });

  it('gives no mark to a time the resolver put before the line was said', () => {
    vi.stubEnv('MEMORY_TIME_LABELS', 'on');
    // "in the morning" at 8 pm resolves to that morning; the interview is tomorrow's.
    const plan = 'USER has a job interview in the morning';
    const read = (wall: string) =>
      lastTalkedAbout(false, plan, { at: WED_8PM, now: et(wall), zone: ZONE });
    expect(read('2026-11-18T20:05')).toBe(`Last time you talked about: ${plan}`);
    expect(read('2026-11-19T09:00')).toBe(`Last time you talked about: ${plan}`);
  });

  it('gives a cancelled or called-off plan no mark', () => {
    vi.stubEnv('MEMORY_TIME_LABELS', 'on');
    for (const plan of [
      "Ava's tournament on Saturday got cancelled",
      'the Saturday tournament was canceled',
      'the party on Friday is called off',
    ]) {
      expect(lastTalkedAbout(false, plan, last)).toBe(`Last time you talked about: ${plan}`);
    }
  });

  it('reaches the voice-agent user awareness the same way', () => {
    const profile = {
      name: 'Dana',
      totalConversations: 3,
      lastContact: new Date(WED_8PM),
      lastConversationSummary: ISSUE_SUMMARY,
    } as unknown as UserProfile;
    const facts = (env: Record<string, string>) => {
      vi.stubEnv('MEMORY_TIME_LABELS', env.MEMORY_TIME_LABELS);
      return buildUserAwareness({
        userProfile: profile,
        isReturningUser: true,
        sessionStartTime: new Date(THU_11PM),
        timeZone: ZONE,
      }).facts.find((f) => f.startsWith('Last time you talked about'));
    };
    expect(facts(OFF)).toBe(`Last time you talked about: ${ISSUE_SUMMARY}`);
    expect(facts(ON)).toContain(`on Saturday ${AHEAD}`);
  });
});

describe('when they last talked (lastCallAwareness)', () => {
  const HOW_DID = '("How did that go?")';
  const STILL_TO_COME = '("Is that still coming up?")';

  it("flag off: main's calendar-day lines", () => {
    const tenPmToElevenPm = { at: et('2026-11-19T22:58'), now: THU_11PM, zone: ZONE };
    const sameNight = lastCallAwareness(tenPmToElevenPm, ISSUE_SUMMARY, OFF);
    expect(sameNight[0]).toBe('You talked earlier today.');
    expect(sameNight[1]).toMatch(/^You already talked today, .* \("How did that go\?"\)/);
    const noZone = lastCallAwareness({ at: WED_8PM, now: THU_11PM }, ISSUE_SUMMARY, OFF);
    expect(noZone[0]).toBe('You talked yesterday.');
  });

  it('a call two minutes ago, at night, is minutes ago, never earlier today or this morning', () => {
    const lines = lastCallAwareness(
      { at: et('2026-11-19T22:58'), now: THU_11PM, zone: ZONE },
      undefined,
      ON
    );
    expect(lines[0]).toBe('You talked a few minutes ago.');
    const threeHours = { at: et('2026-11-19T20:00'), now: THU_11PM, zone: ZONE };
    expect(lastCallAwareness(threeHours, undefined, ON)[0]).toBe('You talked earlier today.');
  });

  it('with no known zone, 6 pm to 8 pm Eastern (a new UTC day) is hours ago, not yesterday', () => {
    const lines = lastCallAwareness(
      { at: et('2026-11-19T18:00'), now: et('2026-11-19T20:00') },
      undefined,
      ON
    );
    expect(lines[0]).toBe('You talked about 2 hours ago.');
    const known = { at: et('2026-11-19T18:00'), now: et('2026-11-19T20:00'), zone: ZONE };
    expect(lastCallAwareness(known, undefined, ON)[0]).toBe('You talked earlier today.');
  });

  it('asks about a plan still ahead as to come, not "How did that go?"', () => {
    const last = { at: WED_8PM, now: THU_11PM, zone: ZONE };
    const ahead = lastCallAwareness(last, ISSUE_SUMMARY, ON).join('\n');
    expect(ahead).toContain(STILL_TO_COME);
    expect(ahead).not.toContain(HOW_DID);
    const done = lastCallAwareness(last, 'USER went hiking last Saturday', ON).join('\n');
    expect(done).toContain(HOW_DID);
    expect(lastCallAwareness(last, ISSUE_SUMMARY, OFF).join('\n')).toContain(HOW_DID);
    expect(ahead).toContain('never guess how something went');
  });

  it('a past-tense plan on its own day already happened, so it is not asked about as to come', () => {
    const summary = 'USER had a dentist appointment today';
    const sameDay = { at: et('2026-11-18T13:00'), now: et('2026-11-18T15:00'), zone: ZONE };
    vi.stubEnv('MEMORY_TIME_LABELS', 'on');
    expect(lastTalkedAbout(false, summary, sameDay)).toBe(
      `Last time you talked about: ${summary} [already happened]`
    );
    const lines = lastCallAwareness(sameDay, summary, ON).join('\n');
    expect(lines).toContain(HOW_DID);
    expect(lines).not.toContain(STILL_TO_COME);
  });

  it('under an hour ago: the minutes line and the normal rule, no "still coming up" yet', () => {
    const halfHour = { at: et('2026-11-19T22:30'), now: THU_11PM, zone: ZONE };
    const lines = lastCallAwareness(halfHour, ISSUE_SUMMARY, ON);
    expect(lines[0]).toBe('You talked about 30 minutes ago.');
    expect(lines.join('\n')).toContain(HOW_DID);
    expect(lines.join('\n')).not.toContain(STILL_TO_COME);
  });
});

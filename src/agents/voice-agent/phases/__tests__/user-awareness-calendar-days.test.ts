/**
 * "You talked yesterday" counts the caller's calendar days (CALLER_CLOCK_TIME_OF_DAY,
 * #2278's last site, #2167's flag).
 *
 * addLastContactContext counted 24-hour blocks, so a call at 11:30 pm and the
 * next morning's call were "earlier today". With the flag on and the call's
 * zone known it counts calendar days where the caller lives, as the greeting
 * director already does (calendarDaysSince). Flag off or no zone: as before.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createUserProfile } from '../../../../types/user-profile.js';
import { buildUserAwareness } from '../user-awareness.js';
import { injectUserAwareness } from '../../../voice-agent-entry/user-awareness-injection.js';
import {
  forgetCallerTimeZone,
  markZonelessCall,
  rememberCallerTimeZone,
} from '../../../../utils/caller-time-zone.js';

const EASTERN = 'America/New_York';
const SESSION = 'riley-test-awareness-session';
/** 11:30 pm Tuesday in New York (EST). */
const LAST_CONTACT = '2026-11-18T04:30:00Z';
/** 10:00 am Wednesday in New York: 10.5 hours later, one calendar day later. */
const CALL_START = new Date('2026-11-18T15:00:00Z');

function rileyProfile() {
  const profile = createUserProfile('riley-test-user', 'Riley Test');
  profile.totalConversations = 3;
  profile.lastContact = new Date(LAST_CONTACT);
  return profile;
}

function facts(timeZone?: string): string[] {
  return buildUserAwareness({
    userProfile: rileyProfile(),
    isReturningUser: true,
    sessionStartTime: CALL_START,
    timeZone,
  }).facts;
}

afterEach(() => {
  delete process.env.CALLER_CLOCK_TIME_OF_DAY;
  forgetCallerTimeZone(SESSION);
});

describe('last contact with CALLER_CLOCK_TIME_OF_DAY on', () => {
  it('11:30 pm last night, called at 10 am: yesterday, not earlier today', () => {
    process.env.CALLER_CLOCK_TIME_OF_DAY = 'on';
    expect(facts(EASTERN)).toContain('You talked yesterday.');
    expect(facts(EASTERN)).not.toContain('You talked earlier today.');
  });

  it('no zone or an unknown zone counts 24-hour blocks, as before', () => {
    process.env.CALLER_CLOCK_TIME_OF_DAY = 'on';
    expect(facts(undefined)).toContain('You talked earlier today.');
    expect(facts('Not/AZone')).toContain('You talked earlier today.');
  });

  it('the injected block uses the zone the call settled', () => {
    process.env.CALLER_CLOCK_TIME_OF_DAY = 'on';
    rememberCallerTimeZone(EASTERN, SESSION);
    const inject = () =>
      injectUserAwareness({
        sessionId: SESSION,
        userProfile: rileyProfile(),
        userData: {},
        isReturningUser: true,
        sessionStartTime: CALL_START,
      }).facts;
    expect(inject()).toContain('You talked yesterday.');

    markZonelessCall(SESSION, undefined); // a phone call with no zone of its own
    expect(inject()).toContain('You talked earlier today.');
  });
});

describe('last contact with CALLER_CLOCK_TIME_OF_DAY off', () => {
  it('a known zone is ignored: 24-hour blocks, as before', () => {
    expect(facts(EASTERN)).toContain('You talked earlier today.');
  });
});

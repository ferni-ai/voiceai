/**
 * The privacy guard: a profile's zone reaches a call only for a verified
 * owner, never for an unverified caller or a call placed for someone else,
 * with PHONE_PARITY on or off. The scorecard covers the end-to-end rows.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setOutboundCallContext } from '../../../intelligence/context-builders/external/outbound-call-context.js';
import { rememberCallerRecognition } from '../caller-recognition.js';
import { callerTimeZoneFor } from '../../../utils/caller-time-zone.js';
import { callerZoneFor, settleCallerZone, verifiedOwnerProfileZone } from '../phone-parity.js';

const ON = { PHONE_PARITY: 'on' };
const NY = 'America/New_York';
const LA = 'America/Los_Angeles';

let n = 0;
const OUTBOUND = {
  callId: 'c1',
  recipientName: 'Doug',
  recipientPhone: '+15555550111',
  purpose: 'check in',
  callType: 'personal' as const,
  objective: '',
  script: '',
  complianceScript: '',
  mustConfirm: [],
  mustNotDo: [],
  informationToGather: [],
  userName: 'Seth',
  originalSessionId: 's0',
};

function session(status?: 'known' | 'maybe' | 'stranger'): string {
  const id = `zone-${n++}`;
  if (status)
    rememberCallerRecognition(id, { status, attestation: status === 'known' ? 'A' : 'none' });
  return id;
}

describe('callerZoneFor', () => {
  afterEach(() => delete process.env.PHONE_PARITY);

  it("always takes the browser's zone, flag or not", () => {
    expect(callerZoneFor(session(), LA, NY, {})).toBe(LA);
    expect(callerZoneFor(session('known'), LA, NY, ON)).toBe(LA);
  });

  it("gives a recognised phone caller their profile's zone only with PHONE_PARITY=on", () => {
    const id = session('known');
    expect(callerZoneFor(id, undefined, NY, {})).toBeUndefined();
    expect(callerZoneFor(id, undefined, NY, { PHONE_PARITY: 'off' })).toBeUndefined();
    expect(callerZoneFor(id, undefined, NY, ON)).toBe(NY);
  });

  it('never uses a profile zone for a caller who is not a verified owner', () => {
    expect(callerZoneFor(session('maybe'), undefined, NY, ON)).toBeUndefined();
    expect(callerZoneFor(session('stranger'), undefined, NY, ON)).toBeUndefined();
    expect(callerZoneFor(session(), undefined, NY, ON)).toBeUndefined();
  });

  it("keeps the sponsor's zone off a call Ferni placed for them", () => {
    const id = session('known');
    setOutboundCallContext(id, OUTBOUND);
    expect(callerZoneFor(id, undefined, NY, ON)).toBeUndefined();
  });

  it('ignores an invalid zone from either source', () => {
    const id = session('known');
    expect(callerZoneFor(id, 'Mars/Olympus', 'Not/AZone', ON)).toBeUndefined();
    expect(callerZoneFor(id, '', NY, ON)).toBe(NY);
  });
});

describe('settleCallerZone without a browser zone (a phone call), PHONE_PARITY off', () => {
  const profile = (timezone: string) => ({
    userProfile: { contactInfo: { timezone } },
    realtimeConversationId: 'conv',
  });

  it("never dates an unverified caller's memories in a loaded profile's zone", () => {
    for (const status of ['maybe', 'stranger', undefined] as const) {
      const id = session(status);
      const userData: { callerTimezone?: string } = {};
      settleCallerZone(
        { sessionId: id, userId: `u-${id}`, onBehalf: false },
        undefined,
        profile(NY),
        userData,
        {}
      );
      expect(callerTimeZoneFor(id)).toBeUndefined();
      expect(callerTimeZoneFor(`u-${id}`)).toBeUndefined();
      expect(userData.callerTimezone).toBeUndefined();
    }
  });

  it("dates a verified owner's memories in their profile zone, but leaves userData to the flag", () => {
    const id = session('known');
    const userData: { callerTimezone?: string } = {};
    settleCallerZone(
      { sessionId: id, userId: `u-${id}`, onBehalf: false },
      undefined,
      profile(NY),
      userData,
      {}
    );
    expect(callerTimeZoneFor(id)).toBe(NY);
    expect(callerTimeZoneFor(`u-${id}`)).toBe(NY);
    expect(userData.callerTimezone).toBeUndefined();
  });

  it("keeps the sponsor's profile zone off a call placed on their behalf", () => {
    const id = session('known');
    settleCallerZone({ sessionId: id, onBehalf: true }, undefined, profile(NY), {}, ON);
    expect(callerTimeZoneFor(id)).toBeUndefined();
    const placed = session('known');
    setOutboundCallContext(placed, OUTBOUND);
    expect(verifiedOwnerProfileZone(placed, NY)).toBeUndefined();
  });

  it("always records the browser's zone", () => {
    const id = session();
    const userData: { callerTimezone?: string } = {};
    settleCallerZone({ sessionId: id, onBehalf: false }, LA, profile(NY), userData, {});
    expect(callerTimeZoneFor(id)).toBe(LA);
    expect(userData.callerTimezone).toBe(LA);
  });
});

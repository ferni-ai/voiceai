/**
 * callerZoneFor's privacy guard: a profile's zone reaches a call only for a
 * verified owner, never for an unverified caller or a call placed for someone
 * else. The scorecard covers the end-to-end rows.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setOutboundCallContext } from '../../../intelligence/context-builders/external/outbound-call-context.js';
import { rememberCallerRecognition } from '../caller-recognition.js';
import { callerZoneFor } from '../phone-parity.js';

const ON = { PHONE_PARITY: 'on' };
const NY = 'America/New_York';
const LA = 'America/Los_Angeles';

let n = 0;
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
    setOutboundCallContext(id, {
      callId: 'c1',
      recipientName: 'Doug',
      recipientPhone: '+15555550111',
      purpose: 'check in',
      callType: 'personal',
      objective: '',
      script: '',
      complianceScript: '',
      mustConfirm: [],
      mustNotDo: [],
      informationToGather: [],
      userName: 'Seth',
      originalSessionId: 's0',
    });
    expect(callerZoneFor(id, undefined, NY, ON)).toBeUndefined();
  });

  it('ignores an invalid zone from either source', () => {
    const id = session('known');
    expect(callerZoneFor(id, 'Mars/Olympus', 'Not/AZone', ON)).toBeUndefined();
    expect(callerZoneFor(id, '', NY, ON)).toBe(NY);
  });
});

/**
 * The privacy guard: a profile's zone reaches a call only for its verified
 * owner, never for a caller matched by number alone or a call placed for
 * someone else, with PHONE_PARITY on or off. The scorecard covers the
 * end-to-end rows.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setOutboundCallContext } from '../../../intelligence/context-builders/external/outbound-call-context.js';
import { trackDeferredProfileLoad } from '../../../services/session/deferred-profile.js';
import {
  callerTimeZoneFor,
  rememberCallerTimeZone,
  userTimeZone,
} from '../../../utils/caller-time-zone.js';
import { rememberCallerRecognition, rememberDispatchIdentity } from '../caller-recognition.js';
import { settleCallerZone, verifiedOwnerProfileZone } from '../phone-parity.js';

const ON = { PHONE_PARITY: 'on' };
const NY = 'America/New_York';
const LA = 'America/Los_Angeles';
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

let n = 0;
function session(status?: 'known' | 'maybe' | 'stranger'): string {
  const id = `zone-${n++}`;
  if (status)
    rememberCallerRecognition(id, { status, attestation: status === 'known' ? 'A' : 'none' });
  return id;
}
const withProfile = (timezone: string) => ({
  userProfile: { contactInfo: { timezone } } as { contactInfo?: { timezone?: string } } | null,
  realtimeConversationId: `conv-${n++}`,
});

describe('verifiedOwnerProfileZone', () => {
  it('gives the zone to a caller recognised by a signed attestation, or named by a signed-in app', () => {
    expect(verifiedOwnerProfileZone(session('known'), NY)).toBe(NY);
    const app = session();
    rememberDispatchIdentity(app, 'firebase', '{}');
    expect(verifiedOwnerProfileZone(app, NY)).toBe(NY);
  });

  it('never to a caller who is not a verified owner', () => {
    expect(verifiedOwnerProfileZone(session('maybe'), NY)).toBeUndefined();
    expect(verifiedOwnerProfileZone(session('stranger'), NY)).toBeUndefined();
    expect(verifiedOwnerProfileZone(session(), NY)).toBeUndefined();
  });

  it('never on a call Ferni placed for someone, and never an invalid zone', () => {
    const placed = session('known');
    setOutboundCallContext(placed, OUTBOUND);
    expect(verifiedOwnerProfileZone(placed, NY)).toBeUndefined();
    expect(verifiedOwnerProfileZone(session('known'), 'Not/AZone')).toBeUndefined();
  });
});

describe('settleCallerZone', () => {
  afterEach(() => delete process.env.PHONE_PARITY);

  it("always takes the browser's zone, for memories and userData, flag or not", async () => {
    const id = session();
    const userData: { callerTimezone?: string } = {};
    expect(
      await settleCallerZone({ sessionId: id, onBehalf: false }, LA, withProfile(NY), userData, {})
    ).toBe(LA);
    expect(callerTimeZoneFor(id)).toBe(LA);
    expect(userData.callerTimezone).toBe(LA);
  });

  it("never dates an unverified caller's memories in a loaded profile's zone (main did)", async () => {
    for (const status of ['maybe', 'stranger', undefined] as const) {
      for (const env of [{}, ON]) {
        const id = session(status);
        const userData: { callerTimezone?: string } = {};
        const call = { sessionId: id, userId: `u-${id}`, onBehalf: false };
        expect(
          await settleCallerZone(call, undefined, withProfile(NY), userData, env)
        ).toBeUndefined();
        expect(userTimeZone({ sessionId: id, userId: `u-${id}` })).toBeUndefined();
        expect(userData.callerTimezone).toBeUndefined();
      }
    }
  });

  it("gives a verified owner's memories their profile zone; userData only with PHONE_PARITY", async () => {
    const off = session('known');
    const offData: { callerTimezone?: string } = {};
    await settleCallerZone(
      { sessionId: off, userId: `u-${off}`, onBehalf: false },
      undefined,
      withProfile(NY),
      offData,
      {}
    );
    expect(callerTimeZoneFor(off)).toBe(NY);
    expect(callerTimeZoneFor(`u-${off}`)).toBe(NY);
    expect(offData.callerTimezone).toBeUndefined();

    const on = session('known');
    const onData: { callerTimezone?: string } = {};
    await settleCallerZone(
      { sessionId: on, onBehalf: false },
      undefined,
      withProfile(NY),
      onData,
      ON
    );
    expect(onData.callerTimezone).toBe(NY);
  });

  it('waits for a profile that loads after session start (the multi-agent fast path)', async () => {
    const id = session('known');
    const services = withProfile(NY);
    const profile = services.userProfile;
    services.userProfile = null;
    let land = (): void => undefined;
    trackDeferredProfileLoad(
      services,
      new Promise<void>((resolve) => {
        land = () => {
          services.userProfile = profile;
          resolve();
        };
      })
    );
    const userData: { callerTimezone?: string } = {};
    const settled = settleCallerZone(
      { sessionId: id, onBehalf: false },
      undefined,
      services,
      userData,
      ON
    );
    await Promise.resolve();
    expect(callerTimeZoneFor(id)).toBeUndefined();
    land();
    expect(await settled).toBe(NY);
    expect(callerTimeZoneFor(id)).toBe(NY);
    expect(userData.callerTimezone).toBe(NY);
  });

  it("doesn't let a call inherit the zone an earlier call left under the same user id", async () => {
    rememberCallerTimeZone(NY, 'earlier-session', 'u-shared'); // the owner's app call
    const unverified = session();
    await settleCallerZone(
      { sessionId: unverified, userId: 'u-shared', onBehalf: false },
      undefined,
      withProfile(NY),
      {},
      ON
    );
    expect(userTimeZone({ sessionId: unverified, userId: 'u-shared' })).toBeUndefined();
  });

  it("keeps the sponsor's zone off a call placed on their behalf", async () => {
    rememberCallerTimeZone(NY, 'u-sponsor'); // the sponsor's own earlier call
    const id = session('known');
    const userData: { callerTimezone?: string } = {};
    await settleCallerZone(
      { sessionId: id, userId: 'u-sponsor', onBehalf: true },
      undefined,
      withProfile(NY),
      userData,
      ON
    );
    expect(userTimeZone({ sessionId: id, userId: 'u-sponsor' })).toBeUndefined();
    expect(userData.callerTimezone).toBeUndefined();
  });
});

describe('the call path reads a profile zone only through phone-parity.ts', () => {
  const AGENTS = join(__dirname, '..', '..');
  function files(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== '__tests__') files(path, out);
      } else if (/\.ts$/.test(entry) && !/\.(test|d)\.ts$/.test(entry)) out.push(path);
    }
    return out;
  }

  it('no other file under src/agents reads contactInfo.timezone', () => {
    const readers = files(AGENTS)
      .filter((f) => /contactInfo\??\.timezone/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(AGENTS, f));
    expect(readers).toEqual(['voice-agent-entry/phone-parity.ts']);
  });
});

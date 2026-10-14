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
  runContextTimeZone,
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

describe("a tool in a call reads the call's own zone first", () => {
  it('not one another call wrote under the same user id after this call settled', () => {
    rememberCallerTimeZone(NY, 'u-later'); // e.g. the owner's app session, after ours started
    expect(runContextTimeZone({ userData: { userId: 'u-later', callerTimezone: LA } })).toBe(LA);
    expect(userTimeZone({ sessionId: 'this-call', userId: 'u-later' })).toBe(NY); // no own zone
    rememberCallerTimeZone(LA, 'this-call');
    expect(userTimeZone({ sessionId: 'this-call', userId: 'u-later' })).toBe(LA);
  });
});

describe('a profile zone reaches a call only through phone-parity.ts', () => {
  const SRC = join(__dirname, '..', '..', '..');
  function files(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== '__tests__' && entry !== 'node_modules') files(path, out);
      } else if (/\.ts$/.test(entry) && !/\.(test|spec|d)\.ts$/.test(entry)) out.push(path);
    }
    return out;
  }
  /** Every other reader of contactInfo.timezone, and why it is not a call's caller zone. */
  const ALLOWED: Record<string, string> = {
    'agents/voice-agent-entry/phone-parity.ts': 'the guard itself',
    'tools/domains/simple-utilities/advanced-reminders.ts': 'only outside a call (no sessionId)',
    'tools/domains/telephony/call-on-behalf.ts': "the sponsor's zone, for a call they asked for",
    'tools/domains/proactive/outreach/service.ts': "the account's contact info for outreach",
    'services/outreach/user-contact.ts': "the account's contact info for outreach",
    'services/outreach/quiet-hours.ts': 'quiet hours for outreach to the account',
    'services/outreach/timing-intelligence.ts': 'outreach timing for the account',
    'services/engagement/engagement-notification-service.ts': 'notifications to the account',
    'services/identity/contacts/contact-onboarding.ts': "the account's own onboarding",
    'services/world-awareness/session-integration.ts': 'its one caller passes no profile',
    'tasks/scheduled/calendar-briefing-job.ts': 'a scheduled job for the account',
    'api/user-routes.ts': "the signed-in account's own settings",
    'api/gdpr-routes.ts': "the signed-in account's own data export",
  };

  it('no other file in src/ reads contactInfo.timezone', () => {
    const readers = files(SRC)
      .filter((f) =>
        /contactInfo\??\.timezone|'contactInfo\.timezone'/.test(readFileSync(f, 'utf8'))
      )
      .map((f) => relative(SRC, f).split('\\').join('/'))
      .sort();
    expect(
      readers,
      'A new reader must not hand a call a profile zone; list it here with why'
    ).toEqual(Object.keys(ALLOWED).sort());
  });
});

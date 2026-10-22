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
import { runSessionCleanup } from '../../session/event-cleanup-registry.js';
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

describe('two calls on one account at once', () => {
  it("an unverified call never gets the owner's zone, and doesn't take it from the owner", async () => {
    // A caller matched by number alone keeps the account's id (CALLER_RECOGNITION off).
    const unverified = session();
    await settleCallerZone(
      { sessionId: unverified, userId: 'u-both', onBehalf: false },
      undefined,
      withProfile(NY),
      {},
      ON
    );
    // The owner's app call on the same account settles after it, with a browser zone.
    const owner = session();
    await settleCallerZone(
      { sessionId: owner, userId: 'u-both', onBehalf: false },
      NY,
      undefined,
      {}
    );

    expect(userTimeZone({ sessionId: unverified, userId: 'u-both' })).toBeUndefined();
    expect(userTimeZone({ userId: 'u-both' })).toBeUndefined(); // a tool context without a session id
    expect(runContextTimeZone({ userData: { userId: 'u-both' } })).toBeUndefined();
    expect(userTimeZone({ sessionId: owner, userId: 'u-both' })).toBe(NY); // the owner keeps theirs
    expect(
      runContextTimeZone({ userData: { userId: 'u-both', services: { sessionId: owner } } })
    ).toBe(NY);

    await runSessionCleanup(unverified); // the unverified call ends
    expect(userTimeZone({ userId: 'u-both' })).toBe(NY);
    // Work still finishing for the ended call keeps reading its own "no zone".
    expect(userTimeZone({ sessionId: unverified, userId: 'u-both' })).toBeUndefined();
  });

  it("a run context's own session entry beats the user id's", () => {
    rememberCallerTimeZone(NY, 'u-run');
    rememberCallerTimeZone(LA, 'run-call');
    const data = { userId: 'u-run', services: { sessionId: 'run-call' } };
    expect(runContextTimeZone({ userData: data })).toBe(LA);
    expect(runContextTimeZone({ userData: { userId: 'u-run', callerTimezone: LA } })).toBe(LA);
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
  /**
   * Every other reader of an account's zone (the profile's contactInfo, or
   * getUserContactInfo's), and why it never sets the zone a call reads a time in.
   */
  const ALLOWED: Record<string, string> = {
    'agents/voice-agent-entry/phone-parity.ts': 'the guard itself',
    'tools/domains/telephony/call-on-behalf.ts': "the sponsor's zone, for a call they asked for",
    'tools/domains/proactive/outreach/service.ts':
      'delivery to the account; its schedule_reminder is in proactiveOutreachTools, which nothing loads',
    'tools/domains/family/leave-message-tool.ts':
      "the sponsor's own reminder's delivery zone; the time is parsed without it",
    'services/outreach/user-contact.ts': "the account's contact info, stored with delivery to it",
    'services/outreach/quiet-hours.ts': 'quiet hours for outreach to the account',
    'services/outreach/call-hours-guard.ts': 'call hours for outreach to the account',
    'services/outreach/confirm-thread-adapter.ts':
      "the verified owner's follow-up record (no due time, no repeat); never a call's zone",
    'services/outreach/timing-intelligence.ts': 'outreach timing for the account',
    'services/outreach/proactive-channels/proactive-tick.ts':
      'between-call outreach to the account',
    'services/outreach-admin.ts': 'the admin view of an account',
    'services/engagement/engagement-notification-service.ts': 'notifications to the account',
    'services/identity/contacts/contact-onboarding.ts': "the account's own onboarding",
    'services/world-awareness/session-integration.ts': 'its one caller passes no profile',
    'intelligence/context-builders/behavioral/awareness.ts':
      'reads profile.contact, a field UserProfile does not have (always undefined)',
    'tasks/scheduled/calendar-briefing-job.ts': 'a scheduled job for the account',
    'api/user-routes.ts': "the signed-in account's own settings",
    'api/gdpr-routes.ts': "the signed-in account's own data export",
    'api/insights-relationship.ts': "the signed-in account's own time-together count, in its zone",
    'api/milestone-outreach-route.ts': "the signed-in account's own milestone count, in its zone",
  };
  const READS_ACCOUNT_ZONE =
    /contactInfo\??\.timezone|'contactInfo\.timezone'|[cC]ontact\??\.timezone|getUserContactInfo\([^)]*\)\)\??\.timezone/;

  it("no other file in src/ reads an account's zone", () => {
    const readers = files(SRC)
      .filter((f) => READS_ACCOUNT_ZONE.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split('\\').join('/'))
      .sort();
    expect(
      readers,
      'A new reader must not hand a call a profile zone; list it here with why'
    ).toEqual(Object.keys(ALLOWED).sort());
  });
});

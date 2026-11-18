/**
 * The family circle decision (resolveFamilyCircle): a phone caller is in the
 * owner's family circle only when every proof holds at once. Their number is a
 * sponsored identity the owner made, with the right relationship, active, its
 * number verified by the holder and equal to the caller's, and the call carries
 * a signed attestation A for that number. Both gates must be open. Anything
 * else, a thrown error included, is the public circle (null). All data here is
 * fictional.
 */
import { ParticipantKind } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PhoneLookupResult,
  SponsoredIdentity,
} from '../../../services/identity/sponsored-identity.js';
import type { SipAttestation } from '../sip-caller.js';

const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const spy = (...args: unknown[]): void => void logged.push(args);
  const logger = { info: spy, warn: spy, debug: spy, error: spy, child: () => logger };
  return { ...real, createLogger: () => logger };
});

const { resolveFamilyCircle } = await import('../family-circle.js');
const { familyCircleFor, forgetFamilyCircle } =
  await import('../../../services/family/family-circle-state.js');
const { runSessionCleanup } = await import('../../session/event-cleanup-registry.js');

const CALLER = '+15555550101';
const OTHER = '+15555550102';
const OWNER = 'uid-owner-test';
const OPEN = {
  SETH_TEAMMATE: 'on',
  ROSTER_VOICE_SETH: 'fake-seth-id',
  SETH_FAMILY_CIRCLE: 'on',
  SETH_OWNER_UID: OWNER,
};

function identity(over: Partial<SponsoredIdentity> = {}): SponsoredIdentity {
  return {
    id: 'sid-test',
    sponsorUserId: OWNER,
    familyUserId: 'family_sid-test',
    displayName: 'Test Member',
    relationship: 'child',
    phoneNumber: CALLER,
    status: 'active',
    phoneVerifiedAt: '2026-11-01T00:00:00.000Z',
    voiceEnrolled: false,
    accessLevel: 'full',
    allowedPersonas: ['*'],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    totalCalls: 0,
    totalMinutes: 0,
    ...over,
  };
}

function fakeDeps(found: SponsoredIdentity | null, signed: SipAttestation | null = 'A') {
  return {
    lookup: vi.fn(async (_e164: string): Promise<PhoneLookupResult> =>
      found ? { found: true, identity: found } : { found: false }
    ),
    signedAttestation: vi.fn(
      async (_p: object, _e164: string): Promise<SipAttestation | null> => signed
    ),
  };
}

function room(number = CALLER) {
  const caller = {
    identity: `sip_${number}`,
    kind: ParticipantKind.SIP,
    attributes: { 'sip.phoneNumber': number },
  };
  return { remoteParticipants: new Map([['caller', caller]]), on: vi.fn(), off: vi.fn() };
}

let n = 0;
const nextSession = (): string => `fc-${++n}`;

beforeEach(() => void (logged.length = 0));
afterEach(() => vi.unstubAllEnvs());

describe('resolveFamilyCircle', () => {
  it('admits a proven sponsored caller of the owner, and remembers them for the session', async () => {
    const sessionId = nextSession();
    const deps = fakeDeps(identity());
    const member = await resolveFamilyCircle(room(), sessionId, deps, OPEN);
    expect(member).toEqual({
      sponsoredIdentityId: 'sid-test',
      familyUserId: 'family_sid-test',
      displayName: 'Test Member',
    });
    expect(familyCircleFor(sessionId)).toEqual(member);
    expect(deps.lookup).toHaveBeenCalledWith(CALLER);
    expect(deps.signedAttestation.mock.calls[0]?.[1]).toBe(CALLER);
  });

  it.each<[string, SponsoredIdentity | null, SipAttestation | null]>([
    ['a signed B', identity(), 'B'],
    ['no signed attestation', identity(), 'none'],
    ['a missing attestation', identity(), null],
    ['a number the holder never verified', identity({ phoneVerifiedAt: undefined }), 'A'],
    ['a pending identity', identity({ status: 'pending' }), 'A'],
    ['another relationship', identity({ relationship: 'spouse' }), 'A'],
    ['someone else as sponsor', identity({ sponsorUserId: 'uid-someone-else' }), 'A'],
    ["an identity on another number than the caller's", identity({ phoneNumber: OTHER }), 'A'],
    ['no identity for the number', null, 'A'],
  ])('is the public circle for %s', async (_case, found, signed) => {
    const sessionId = nextSession();
    expect(await resolveFamilyCircle(room(), sessionId, fakeDeps(found, signed), OPEN)).toBeNull();
    expect(familyCircleFor(sessionId)).toBeNull();
  });

  it.each([
    ['SETH_FAMILY_CIRCLE off', { ...OPEN, SETH_FAMILY_CIRCLE: 'off' }],
    ['SETH_TEAMMATE off', { ...OPEN, SETH_TEAMMATE: 'off' }],
    ['no voice for the teammate', { ...OPEN, ROSTER_VOICE_SETH: '' }],
    ['no owner set', { ...OPEN, SETH_OWNER_UID: '' }],
    ['a blank owner', { ...OPEN, SETH_OWNER_UID: '   ' }],
  ])('looks nothing up with %s', async (_case, env) => {
    const deps = fakeDeps(identity());
    expect(await resolveFamilyCircle(room(), nextSession(), deps, env)).toBeNull();
    expect(deps.lookup).not.toHaveBeenCalled();
    expect(deps.signedAttestation).not.toHaveBeenCalled();
  });

  it('fails closed when the lookup or the attestation read throws', async () => {
    const lookupThrows = fakeDeps(identity());
    lookupThrows.lookup.mockRejectedValue(new Error('firestore down'));
    expect(await resolveFamilyCircle(room(), nextSession(), lookupThrows, OPEN)).toBeNull();
    const attestThrows = fakeDeps(identity());
    attestThrows.signedAttestation.mockRejectedValue(new Error('no secret'));
    expect(await resolveFamilyCircle(room(), nextSession(), attestThrows, OPEN)).toBeNull();
  });

  it('is null for a caller with no phone number, or nobody in the room', async () => {
    const deps = fakeDeps(identity());
    expect(await resolveFamilyCircle(room('not-a-number'), nextSession(), deps, OPEN)).toBeNull();
    const empty = { remoteParticipants: new Map(), on: vi.fn(), off: vi.fn() };
    vi.useFakeTimers();
    const pending = resolveFamilyCircle(empty, nextSession(), deps, OPEN);
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    expect(await pending).toBeNull();
    expect(deps.lookup).not.toHaveBeenCalled();
  });

  it('runs the lookup and the attestation read together, so timing says nothing', async () => {
    let releaseLookup: (r: PhoneLookupResult) => void = () => {};
    let releaseSigned: (s: SipAttestation | null) => void = () => {};
    const deps = {
      lookup: vi.fn(
        () =>
          new Promise<PhoneLookupResult>((r) => {
            releaseLookup = r;
          })
      ),
      signedAttestation: vi.fn(
        () =>
          new Promise<SipAttestation | null>((r) => {
            releaseSigned = r;
          })
      ),
    };
    const pending = resolveFamilyCircle(room(), nextSession(), deps, OPEN);
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
    expect(deps.lookup).toHaveBeenCalledTimes(1);
    expect(deps.signedAttestation).toHaveBeenCalledTimes(1);
    releaseLookup({ found: false });
    releaseSigned('A');
    expect(await pending).toBeNull();
  });

  it('logs the sponsored identity id only: never the number, the name or the family user id', async () => {
    await resolveFamilyCircle(room(), nextSession(), fakeDeps(identity()), OPEN);
    await resolveFamilyCircle(room(), nextSession(), fakeDeps(identity(), 'B'), OPEN);
    const text = JSON.stringify(logged);
    expect(text).toContain('family_circle');
    expect(text).toContain('sid-test');
    for (const secret of [CALLER, '5555550101', 'Test Member', 'family_sid-test']) {
      expect(text).not.toContain(secret);
    }
  });

  it('forgets the session when the call ends', async () => {
    const sessionId = nextSession();
    await resolveFamilyCircle(room(), sessionId, fakeDeps(identity()), OPEN);
    expect(familyCircleFor(sessionId)).not.toBeNull();
    await runSessionCleanup(sessionId);
    expect(familyCircleFor(sessionId)).toBeNull();
    forgetFamilyCircle(sessionId); // a second forget is harmless
  });
});

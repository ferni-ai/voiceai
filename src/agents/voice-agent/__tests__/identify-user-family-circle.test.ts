/**
 * The family circle hook in identifyUser: a phone caller with no account of
 * their own runs as their sponsored identity's own id and name (never verified)
 * only once the job executor has registered the decision and it admits them.
 * With either gate closed nothing is looked up, and a caller recognised as an
 * account owner never reaches the family lookup. Only Firebase Auth, the
 * sponsored-identity lookup and the signed attestation are faked; all data is
 * fictional.
 */
import type { Room } from '@livekit/rtc-node';
import { ParticipantKind } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SipAttestation } from '../../voice-agent-entry/sip-caller.js';

const fakes = vi.hoisted(() => ({
  getFirebaseUserByPhone: vi.fn(),
  identifyFromMetadata: vi.fn(),
  lookupByPhone: vi.fn(),
  signed: { level: 'A' as string | null },
}));

vi.mock('../../voice-agent-entry/index.js', () => ({ runFullVoiceAgentEntry: vi.fn() }));
vi.mock('../../../services/identity/firebase-auth.js', () => ({
  getFirebaseUserByPhone: fakes.getFirebaseUserByPhone,
}));
vi.mock('../../../services/identity/user-identification.js', () => ({
  identifyFromMetadata: fakes.identifyFromMetadata,
}));
vi.mock('../../../services/identity/sponsored-identity.js', () => ({
  lookupByPhone: fakes.lookupByPhone,
}));
vi.mock('../../voice-agent-entry/sip-caller.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../voice-agent-entry/sip-caller.js')>()),
  readSignedAttestation: async () => fakes.signed.level as SipAttestation | null,
}));
vi.mock('../../../services/superhuman/commitment-prefetch.js', () => ({
  prefetchUserCommitments: async () => {},
}));
vi.mock('../../../services/trust-and-identity/voice-agent-integration.js', () => ({
  onSessionStart: async () => ({ identityContext: {} }),
}));
vi.mock('../../../services/voice/voice-speaker-change.js', () => ({
  getSpeakerChangeDetector: () => ({ on: vi.fn(), start: vi.fn() }),
}));
vi.mock('../../../tools/domains/entertainment/spotify.js', () => ({ setStreamIntoCall: () => {} }));

const { identifyUser } = await import('../user-identification-handler.js');
const { familyCircleFor } = await import('../../../services/family/index.js');

const CALLER = '+15555550101';
const OWNER = 'uid-owner-test';

const member = {
  id: 'sid-test',
  sponsorUserId: OWNER,
  familyUserId: 'family_sid-test',
  displayName: 'Test Member',
  relationship: 'child',
  phoneNumber: CALLER,
  status: 'active',
  phoneVerifiedAt: '2026-11-01T00:00:00.000Z',
};

function roomWithCaller(): Room {
  const caller = {
    identity: `sip_${CALLER}`,
    kind: ParticipantKind.SIP,
    attributes: { 'sip.phoneNumber': CALLER, 'sip.callStatus': 'active' },
  };
  return {
    remoteParticipants: new Map([['caller', caller]]),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as Room;
}

let n = 0;
async function call() {
  const sessionId = `ifc-${++n}`;
  const result = await identifyUser({ room: roomWithCaller(), sessionId });
  return { result, sessionId };
}

const registered = async (): Promise<unknown> => import('../../gce/job-executor.js');

beforeEach(() => {
  vi.stubEnv('CALLER_RECOGNITION', 'on');
  vi.stubEnv('SETH_TEAMMATE', 'on');
  vi.stubEnv('ROSTER_VOICE_SETH', 'fake-seth-id');
  vi.stubEnv('SETH_FAMILY_CIRCLE', 'on');
  vi.stubEnv('SETH_OWNER_UID', OWNER);
  fakes.getFirebaseUserByPhone.mockReset().mockResolvedValue(null);
  fakes.lookupByPhone.mockReset().mockResolvedValue({ found: true, identity: member });
  fakes.signed.level = 'A';
});
afterEach(() => vi.unstubAllEnvs());

describe('identifyUser and the family circle', () => {
  it('decides nothing until the job executor registers the decision', async () => {
    const before = await call();
    expect(fakes.lookupByPhone).not.toHaveBeenCalled();
    expect(before.result.userId).toMatch(/^anon:/);
    await registered();
    const after = await call();
    expect(after.result.userId).toBe('family_sid-test');
  });

  it('runs a proven family caller as their own sponsored identity, never verified', async () => {
    await registered();
    const { result, sessionId } = await call();
    expect(fakes.lookupByPhone).toHaveBeenCalledWith(CALLER);
    expect(result.userId).toBe('family_sid-test');
    expect(result.userName).toBe('Test Member');
    expect(result.verified).toBe(false);
    expect(result.identificationSource).toBe('phone');
    expect(familyCircleFor(sessionId)?.sponsoredIdentityId).toBe('sid-test');
  });

  it.each(['SETH_FAMILY_CIRCLE', 'SETH_TEAMMATE'])(
    'looks nothing up with %s off: the caller stays anonymous',
    async (flag) => {
      await registered();
      vi.stubEnv(flag, 'off');
      const { result, sessionId } = await call();
      expect(fakes.lookupByPhone).not.toHaveBeenCalled();
      expect(result.userId).toMatch(/^anon:/);
      expect(result.userName).toBeUndefined();
      expect(familyCircleFor(sessionId)).toBeNull();
    }
  );

  it('never reaches the family lookup for a caller recognised as an account owner', async () => {
    await registered();
    fakes.getFirebaseUserByPhone.mockResolvedValue({
      uid: 'uid-account-test',
      displayName: 'Test Owner',
    });
    const { result } = await call();
    expect(fakes.lookupByPhone).not.toHaveBeenCalled();
    expect(result.userId).toBe('uid-account-test');
  });

  it('a caller without a signed A stays anonymous', async () => {
    await registered();
    fakes.signed.level = 'B';
    const { result, sessionId } = await call();
    expect(result.userId).toMatch(/^anon:/);
    expect(result.userName).toBeUndefined();
    expect(familyCircleFor(sessionId)).toBeNull();
  });
});

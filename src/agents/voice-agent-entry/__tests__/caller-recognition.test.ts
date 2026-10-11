/**
 * CALLER_RECOGNITION on the inbound path: identifyUser (what voice-agent-entry
 * calls at session start) with a room holding a SIP caller shaped as LiveKit
 * delivers a Twilio call, then the greeting that reads the result. Only
 * Firebase Auth (the verified-owner lookup) and the signed-attestation check
 * are faked.
 */
import type { Room } from '@livekit/rtc-node';
import { ParticipantKind } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SipAttestation } from '../sip-caller.js';

const { getFirebaseUserByPhone, identifyFromMetadata } = vi.hoisted(() => ({
  getFirebaseUserByPhone: vi.fn(),
  identifyFromMetadata: vi.fn(),
}));

vi.mock('../../../services/identity/firebase-auth.js', () => ({ getFirebaseUserByPhone }));
vi.mock('../../../services/identity/user-identification.js', () => ({ identifyFromMetadata }));
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

const { identifyUser } = await import('../../voice-agent/user-identification-handler.js');
const {
  callerRecognitionFor,
  phoneOnlyIdentity,
  productionRecognitionDeps,
  toE164,
  unrecognisedCallerGreeting,
} = await import('../caller-recognition.js');

const SETH = '+15555550100';
const realSignedAttestation = productionRecognitionDeps.signedAttestation;

/** A Twilio caller as LiveKit SIP shows them to the agent; every attribute is caller-settable. */
function sipCaller(verstat: string | null, number = SETH) {
  return {
    identity: `sip_${number}`,
    kind: ParticipantKind.SIP,
    attributes: {
      'sip.phoneNumber': number,
      'sip.trunkPhoneNumber': '+15550199',
      'sip.callStatus': 'active',
      ...(verstat ? { 'sip.h.x-twilio-verstat': verstat } : {}),
    } as Record<string, string>,
  };
}

/** A signed token verified for this number would give `level`; none for any other number. */
function signedFor(number: string, level: SipAttestation): void {
  productionRecognitionDeps.signedAttestation = async (_p, e164) =>
    e164 === number ? level : null;
}

function roomWith(participant: object): Room {
  return {
    remoteParticipants: new Map([['caller', participant]]),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as Room;
}

let n = 0;
async function inbound(participant: object, jobMetadata?: string) {
  const sessionId = `call-${n++}`;
  const result = await identifyUser({ jobMetadata, room: roomWith(participant), sessionId });
  return { result, recognition: callerRecognitionFor(sessionId), sessionId };
}

describe('caller recognition on an inbound call', () => {
  beforeEach(() => {
    process.env.CALLER_RECOGNITION = 'on';
    productionRecognitionDeps.signedAttestation = realSignedAttestation;
    getFirebaseUserByPhone.mockReset();
    getFirebaseUserByPhone.mockImplementation(async (e164: string) =>
      e164 === SETH ? { uid: 'user-seth', displayName: 'Seth Ford' } : null
    );
    identifyFromMetadata.mockReset();
  });
  afterEach(() => {
    delete process.env.CALLER_RECOGNITION;
    productionRecognitionDeps.signedAttestation = realSignedAttestation;
  });

  it('recognises a verified owner with a signed attestation A', async () => {
    signedFor(SETH, 'A');
    const { result, recognition, sessionId } = await inbound(sipCaller(null));
    expect(getFirebaseUserByPhone).toHaveBeenCalledWith(SETH);
    expect(result.userId).toBe('user-seth');
    expect(result.userName).toBe('Seth');
    expect(recognition?.status).toBe('known');
    expect(phoneOnlyIdentity(sessionId)).toBe(true);
    expect(unrecognisedCallerGreeting(recognition)).toBeNull();
  });

  it('never trusts a raw X-Twilio-VerStat header: A in the header alone is not recognised', async () => {
    const { result, recognition, sessionId } = await inbound(sipCaller('TN-Validation-Passed-A'));
    expect(result.userId).toBeUndefined();
    expect(recognition?.status).toBe('maybe');
    expect(recognition?.attestation).toBe('none');
    expect(phoneOnlyIdentity(sessionId)).toBe(false);
  });

  it('fails closed on a missing attestation and on a signed B', async () => {
    expect((await inbound(sipCaller(null))).result.userId).toBeUndefined();
    signedFor(SETH, 'B');
    const { result, recognition } = await inbound(sipCaller('TN-Validation-Passed-A'));
    expect(result.userId).toBeUndefined();
    expect(recognition?.status).toBe('maybe');
  });

  it('fails closed when the signed attestation check throws', async () => {
    productionRecognitionDeps.signedAttestation = async () => {
      throw new Error('secret missing');
    };
    expect((await inbound(sipCaller('TN-Validation-Passed-A'))).result.userId).toBeUndefined();
  });

  it("does not tell an unverified caller whose number it is: no name, a neutral who's-this", async () => {
    const { result, recognition } = await inbound(sipCaller('TN-Validation-Passed-B'));
    expect(result.userName).toBeUndefined();
    expect(recognition?.name).toBeUndefined();
    expect(recognition?.userId).toBeUndefined();
    expect(JSON.stringify(recognition)).not.toMatch(/Seth/);
    const greeting = unrecognisedCallerGreeting(recognition);
    expect(greeting).toMatch(/who's this/);
    expect(greeting).not.toMatch(/Seth/);
  });

  it('greets a maybe and a stranger exactly alike', async () => {
    const maybe = (await inbound(sipCaller('TN-Validation-Passed-B'))).recognition;
    const stranger = (await inbound(sipCaller('TN-Validation-Passed-A', '+15555550123')))
      .recognition;
    expect(maybe?.status).toBe('maybe');
    expect(stranger?.status).toBe('stranger');
    expect(unrecognisedCallerGreeting(maybe)).toBe(unrecognisedCallerGreeting(stranger));
  });

  it("drops the webhook's unverified number lookup without a signed A", async () => {
    identifyFromMetadata.mockResolvedValue({ userId: 'user-seth', source: { type: 'web_auth' } });
    const { result } = await inbound(
      sipCaller('TN-Validation-Passed-A'),
      JSON.stringify({ type: 'inbound_call', user_id: 'user-seth', callerPhone: SETH })
    );
    expect(result.userId).toBeUndefined();
  });

  it('leaves a session the app named alone', async () => {
    identifyFromMetadata.mockResolvedValue({ userId: 'user-app', source: { type: 'web_auth' } });
    const { result, recognition } = await inbound(
      sipCaller('TN-Validation-Passed-B'),
      JSON.stringify({ userId: 'user-app' })
    );
    expect(result.userId).toBe('user-app');
    expect(recognition).toBeUndefined();
  });

  it('does nothing with the flag off', async () => {
    delete process.env.CALLER_RECOGNITION;
    signedFor(SETH, 'A');
    const { result, recognition } = await inbound(sipCaller(null));
    expect(result.userId).toBeUndefined();
    expect(recognition).toBeUndefined();
    expect(getFirebaseUserByPhone).not.toHaveBeenCalled();
  });

  it('has no signed attestation in production yet, so nobody is known (#605 adds it)', async () => {
    expect(await realSignedAttestation(sipCaller('TN-Validation-Passed-A'), SETH)).toBeNull();
  });
});

describe('toE164', () => {
  it('normalises the forms a SIP trunk sends', () => {
    expect(toE164('+15550100123')).toBe('+15550100123');
    expect(toE164('tel:+1 (555) 010-0123')).toBe('+15550100123');
    expect(toE164('5550100123')).toBe('+15550100123');
    expect(toE164('sip:+442079460958@pstn.twilio.com')).toBe('+442079460958');
    expect(toE164('anonymous')).toBeNull();
    expect(toE164(undefined)).toBeNull();
  });
});

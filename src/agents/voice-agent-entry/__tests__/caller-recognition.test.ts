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
const { mintPhoneAttestation, PHONE_ATTEST_ATTRIBUTE } =
  await import('../../../services/identity/phone-attestation.js');

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

/** Nobody's account: a per-call anon: id of their own (identifyUser never leaves it empty). */
function expectAnonId(userId: string | undefined): void {
  expect(userId).toMatch(/^anon:/);
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
    expectAnonId(result.userId);
    expect(recognition?.status).toBe('maybe');
    expect(recognition?.attestation).toBe('none');
    expect(phoneOnlyIdentity(sessionId)).toBe(false);
  });

  it('fails closed on a missing attestation and on a signed B', async () => {
    expectAnonId((await inbound(sipCaller(null))).result.userId);
    signedFor(SETH, 'B');
    const { result, recognition } = await inbound(sipCaller('TN-Validation-Passed-A'));
    expectAnonId(result.userId);
    expect(recognition?.status).toBe('maybe');
  });

  it('fails closed when the signed attestation check throws', async () => {
    productionRecognitionDeps.signedAttestation = async () => {
      throw new Error('secret missing');
    };
    expectAnonId((await inbound(sipCaller('TN-Validation-Passed-A'))).result.userId);
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
    expectAnonId(result.userId);
  });

  it('reads and awaits the attestation for a number with no account (no timing oracle)', async () => {
    let release: (level: SipAttestation | null) => void = () => {};
    const reads: string[] = [];
    productionRecognitionDeps.signedAttestation = (_p, e164) => {
      reads.push(e164);
      return new Promise((resolve) => (release = resolve));
    };
    const stranger = '+15555550123';
    let settled = false;
    const call = inbound(sipCaller(null, stranger)).then((r) => ((settled = true), r));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reads).toEqual([stranger]);
    expect(settled).toBe(false);
    release('A');
    const { result, recognition } = await call;
    expect(recognition?.status).toBe('stranger');
    expectAnonId(result.userId);
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
    expectAnonId(result.userId);
    expect(recognition).toBeUndefined();
    expect(getFirebaseUserByPhone).not.toHaveBeenCalled();
  });
});

/**
 * The production signed-attestation check, end to end: a token minted the way
 * our Twilio webhook mints it (attested-twiml.ts), carried on the participant
 * as the trunk maps X-Ferni-Attest, read through identifyUser.
 */
describe('caller recognition with a signed attestation token', () => {
  const SECRET = 'test-attest-secret';
  const OTHER = '+15555550199';

  const token = (
    verstat: string,
    opts: { from?: string; secret?: string; nowMs?: number } = {}
  ): string =>
    mintPhoneAttestation(
      { callSid: 'CA123', from: opts.from ?? SETH, to: '+15550199', verstat },
      opts.secret ?? SECRET,
      { nowMs: opts.nowMs }
    );

  const withToken = (value: string, extra: Record<string, string> = {}) => {
    const p = sipCaller(null);
    Object.assign(p.attributes, { [PHONE_ATTEST_ATTRIBUTE]: value }, extra);
    return p;
  };

  beforeEach(() => {
    process.env.CALLER_RECOGNITION = 'on';
    process.env.PHONE_ATTEST_SECRET = SECRET;
    productionRecognitionDeps.signedAttestation = realSignedAttestation;
    getFirebaseUserByPhone.mockReset();
    getFirebaseUserByPhone.mockImplementation(async (e164: string) =>
      e164 === SETH ? { uid: 'user-seth', displayName: 'Seth Ford' } : null
    );
    identifyFromMetadata.mockReset();
  });
  afterEach(() => {
    delete process.env.CALLER_RECOGNITION;
    delete process.env.PHONE_ATTEST_SECRET;
  });

  /** Unrecognised: no account loads and the session isn't phone-only. */
  function expectNoAccount(r: Awaited<ReturnType<typeof inbound>>): void {
    expectAnonId(r.result.userId);
    expect(r.result.userName).toBeUndefined();
    expect(r.recognition?.userId).toBeUndefined();
    expect(['maybe', 'stranger']).toContain(r.recognition?.status);
    expect(phoneOnlyIdentity(r.sessionId)).toBe(false);
  }

  it("runs a valid A token for the owner's number as the owner", async () => {
    const r = await inbound(withToken(token('TN-Validation-Passed-A')));
    expect(r.recognition?.status).toBe('known');
    expect(r.recognition?.attestation).toBe('A');
    expect(r.result.userId).toBe('user-seth');
    expect(r.result.userName).toBe('Seth');
    expect(phoneOnlyIdentity(r.sessionId)).toBe(true);
  });

  it('reads the token from the raw sip.h.x-ferni-attest header attribute too', async () => {
    const p = sipCaller(null);
    p.attributes['sip.h.x-ferni-attest'] = token('TN-Validation-Passed-A');
    expect((await inbound(p)).recognition?.status).toBe('known');
  });

  it('waits for a token that lands in a later attributes update', async () => {
    const p = sipCaller(null);
    let listener: ((changed: Record<string, string>, who: object) => void) | undefined;
    const room = {
      remoteParticipants: new Map([['caller', p]]),
      on: (event: string, fn: typeof listener) => {
        if (event === 'participantAttributesChanged') listener = fn;
      },
      off: vi.fn(),
    } as unknown as Room;
    setTimeout(
      () => listener?.({ [PHONE_ATTEST_ATTRIBUTE]: token('TN-Validation-Passed-A') }, p),
      20
    );
    const sessionId = `call-late-${n++}`;
    const result = await identifyUser({ room, sessionId });
    expect(callerRecognitionFor(sessionId)?.status).toBe('known');
    expect(result.userId).toBe('user-seth');
  });

  it('never falls back to a raw X-Twilio-VerStat A when no token arrives', async () => {
    const r = await inbound(sipCaller('TN-Validation-Passed-A'));
    expect(r.recognition?.attestation).toBe('none');
    expectNoAccount(r);
  });

  it('a valid B token is only a maybe', async () => {
    const r = await inbound(withToken(token('TN-Validation-Passed-B')));
    expect(r.recognition?.status).toBe('maybe');
    expect(r.recognition?.attestation).toBe('B');
    expectNoAccount(r);
  });

  it('fails closed on an expired token', async () => {
    const r = await inbound(
      withToken(token('TN-Validation-Passed-A', { nowMs: Date.now() - 10 * 60_000 }))
    );
    expect(r.recognition?.attestation).toBe('none');
    expectNoAccount(r);
  });

  it('fails closed on a token minted for a different number, even with A in the header', async () => {
    const r = await inbound(
      withToken(token('TN-Validation-Passed-A', { from: OTHER }), {
        'sip.h.x-twilio-verstat': 'TN-Validation-Passed-A',
      })
    );
    expect(r.recognition?.attestation).toBe('none');
    expectNoAccount(r);
  });

  it('fails closed on a forged signature', async () => {
    const forged = token('TN-Validation-Passed-A', { secret: 'attacker-secret' });
    expectNoAccount(await inbound(withToken(forged)));
    const [body] = token('TN-Validation-Passed-B').split('.');
    const [, sig] = token('TN-Validation-Passed-A').split('.');
    expectNoAccount(await inbound(withToken(`${body}.${sig}`)));
  });

  it('fails closed with no PHONE_ATTEST_SECRET on the agent', async () => {
    delete process.env.PHONE_ATTEST_SECRET;
    expectNoAccount(await inbound(withToken(token('TN-Validation-Passed-A'))));
  });

  it('looks nobody up with the flag off, even with a valid A token', async () => {
    delete process.env.CALLER_RECOGNITION;
    const r = await inbound(withToken(token('TN-Validation-Passed-A')));
    expect(getFirebaseUserByPhone).not.toHaveBeenCalled();
    expect(r.recognition).toBeUndefined();
    expectAnonId(r.result.userId);
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

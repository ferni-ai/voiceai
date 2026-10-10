/**
 * CALLER_RECOGNITION on the inbound path: identifyUser (what voice-agent-entry
 * calls at session start) with a room holding a SIP caller shaped as LiveKit
 * delivers a Twilio call, then the greeting and turn note that read the result.
 * Only Firebase Auth (the verified-owner lookup) and the profile store are faked.
 */
import type { Room } from '@livekit/rtc-node';
import { ParticipantKind } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getFirebaseUserByPhone, identifyFromMetadata } = vi.hoisted(() => ({
  getFirebaseUserByPhone: vi.fn(),
  identifyFromMetadata: vi.fn(),
}));

vi.mock('../../../services/identity/firebase-auth.js', () => ({ getFirebaseUserByPhone }));
vi.mock('../../../services/identity/user-identification.js', () => ({ identifyFromMetadata }));
vi.mock('../../../services/data-layer/profile-cache.js', () => ({
  getProfileWithCache: async () => ({ lastConversationSummary: 'the knee surgery on Friday' }),
}));
vi.mock('../../../services/global-services.js', () => ({
  getGlobalServices: async () => ({ store: { getProfile: async () => null } }),
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

const { identifyUser } = await import('../../voice-agent/user-identification-handler.js');
const { callerRecognitionFor, maybeCallerGreeting, maybeCallerNote, phoneOnlyIdentity, toE164 } =
  await import('../caller-recognition.js');

const SETH = '+15555550100';

/** A Twilio caller as LiveKit SIP shows them to the agent. */
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
    getFirebaseUserByPhone.mockReset();
    getFirebaseUserByPhone.mockImplementation(async (e164: string) =>
      e164 === SETH ? { uid: 'user-seth', displayName: 'Seth Ford' } : null
    );
    identifyFromMetadata.mockReset();
  });
  afterEach(() => {
    delete process.env.CALLER_RECOGNITION;
  });

  it('recognises an A-attested caller whose verified number matches', async () => {
    const { result, recognition, sessionId } = await inbound(sipCaller('TN-Validation-Passed-A'));
    expect(getFirebaseUserByPhone).toHaveBeenCalledWith(SETH);
    expect(result.userId).toBe('user-seth');
    expect(result.userName).toBe('Seth');
    expect(recognition?.status).toBe('known');
    // Known by phone alone: the sensitive-account gate is on for this session.
    expect(phoneOnlyIdentity(sessionId)).toBe(true);
    expect(maybeCallerGreeting(recognition)).toBeNull();
  });

  it('does not auto-match a B-attested caller: asks instead, and checks from memory', async () => {
    const { result, recognition, sessionId } = await inbound(sipCaller('TN-Validation-Passed-B'));
    expect(result.userId).toBeUndefined();
    expect(result.userName).toBeUndefined();
    expect(recognition?.status).toBe('maybe');
    expect(phoneOnlyIdentity(sessionId)).toBe(false);
    const greeting = maybeCallerGreeting(recognition);
    expect(greeting?.direction).toMatch(/ask lightly whether it's Seth/);
    expect(greeting?.direction).toMatch(/without using a name/);
    const note = maybeCallerNote(recognition);
    expect(note).toContain('the knee surgery on Friday');
    expect(note).toMatch(/Never say that yourself/);
  });

  it('treats a caller with no attestation header as maybe, not known', async () => {
    const { result, recognition } = await inbound(sipCaller(null));
    expect(result.userId).toBeUndefined();
    expect(recognition?.status).toBe('maybe');
  });

  it('gives an unknown number the stranger greeting', async () => {
    const { result, recognition } = await inbound(
      sipCaller('TN-Validation-Passed-A', '+15555550123')
    );
    expect(result.userId).toBeUndefined();
    expect(recognition?.status).toBe('stranger');
    expect(maybeCallerGreeting(recognition)).toBeNull();
    expect(maybeCallerNote(recognition)).toBe('');
  });

  it("drops the webhook's unverified number lookup when the carrier doesn't vouch for it", async () => {
    identifyFromMetadata.mockResolvedValue({ userId: 'user-seth', source: { type: 'web_auth' } });
    const { result } = await inbound(
      sipCaller('TN-Validation-Passed-C'),
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
    const { result, recognition } = await inbound(sipCaller('TN-Validation-Passed-A'));
    expect(result.userId).toBeUndefined();
    expect(recognition).toBeUndefined();
    expect(getFirebaseUserByPhone).not.toHaveBeenCalled();
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

import { EventEmitter } from 'node:events';
import { ParticipantKind } from '@livekit/rtc-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.fn();
const warn = vi.fn();
vi.mock('../../../utils/safe-logger.js', () => ({ getLogger: () => ({ info, warn }) }));

const {
  logSipCallerShadow,
  maskPhoneNumber,
  noteCallerJoined,
  parseVerStat,
  phoneVerifyMode,
  readSipCaller,
} = await import('../sip-caller.js');
const { mintPhoneAttestation } = await import('../../../services/identity/phone-attestation.js');
const { isPhoneListener } = await import('../../shared/performance/phone-voice-profile.js');
type SipParticipantLike = import('../sip-caller.js').SipParticipantLike;

const FULL_NUMBER = '+15551234567';

function sipCaller(attributes: Record<string, string> = {}): SipParticipantLike {
  return {
    kind: ParticipantKind.SIP,
    identity: 'sip_caller',
    attributes: { 'sip.phoneNumber': FULL_NUMBER, 'sip.callID': 'SCL_abc', ...attributes },
  };
}

/** A room stand-in: emits participantAttributesChanged like a LiveKit Room. */
function fakeRoom(): EventEmitter {
  return new EventEmitter();
}

describe('parseVerStat', () => {
  it.each([
    ['TN-Validation-Passed-A', 'A'],
    ['TN-Validation-Passed-B', 'B'],
    ['TN-Validation-Passed-C', 'C'],
    ['TN-Validation-Failed-A', 'failed'],
    ['TN-Validation-Failed-B', 'failed'],
    ['TN-Validation-Failed-C', 'failed'],
    ['TN-Validation-Failed', 'failed'],
    ['No-TN-Validation', 'none'],
    ['tn-validation-passed-a', 'A'],
    ['  TN-VALIDATION-PASSED-B  ', 'B'],
    ['something-else', 'none'],
    ['', 'none'],
  ] as const)('%s -> %s', (value, expected) => {
    expect(parseVerStat(value)).toBe(expected);
  });

  it('treats a missing header as none', () => {
    expect(parseVerStat(undefined)).toBe('none');
  });
});

describe('maskPhoneNumber', () => {
  it('keeps only the last two digits', () => {
    expect(maskPhoneNumber(FULL_NUMBER)).toBe('**67');
    expect(maskPhoneNumber('(555) 123-4589')).toBe('**89');
  });

  it('hides very short numbers entirely and returns null with no number', () => {
    expect(maskPhoneNumber('7')).toBe('**');
    expect(maskPhoneNumber(undefined)).toBeNull();
    expect(maskPhoneNumber('anonymous')).toBeNull();
  });
});

describe('readSipCaller', () => {
  it('reads attestation from a header present at join without waiting', async () => {
    const r = await readSipCaller(
      sipCaller({ 'sip.h.X-Twilio-VerStat': 'TN-Validation-Passed-A' }),
      {
        updates: fakeRoom(),
      }
    );
    expect(r).toMatchObject({
      isSip: true,
      phoneNumberMasked: '**67',
      attestation: 'A',
      waitedMs: 0,
    });
  });

  it.each([
    'sip.h.x-twilio-verstat',
    'sip.h.X-Twilio-VerStat',
    'SIP.H.X-TWILIO-VERSTAT',
    'X-Twilio-VerStat',
  ])('matches the header key %s case-insensitively', async (key) => {
    const r = await readSipCaller(sipCaller({ [key]: 'TN-Validation-Passed-C' }));
    expect(r.attestation).toBe('C');
  });

  it('lists attribute names only, never values', async () => {
    const r = await readSipCaller(
      sipCaller({
        'sip.h.X-Twilio-VerStat': 'TN-Validation-Passed-B',
        'sip.h.Identity': 'secret-token',
      })
    );
    expect(r.attributeKeys).toEqual([
      'sip.callID',
      'sip.h.Identity',
      'sip.h.X-Twilio-VerStat',
      'sip.phoneNumber',
    ]);
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain(FULL_NUMBER);
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('TN-Validation');
  });

  describe('with fake timers', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('waits for the header to arrive in a later attributes update', async () => {
      const room = fakeRoom();
      const caller = sipCaller();
      const pending = readSipCaller(caller, { updates: room, waitMs: 1500 });
      expect(room.listenerCount('participantAttributesChanged')).toBe(1);

      await vi.advanceTimersByTimeAsync(400);
      room.emit(
        'participantAttributesChanged',
        { 'sip.h.X-Twilio-VerStat': 'TN-Validation-Passed-A' },
        caller
      );

      const r = await pending;
      expect(r.attestation).toBe('A');
      expect(r.waitedMs).toBe(400);
      expect(r.attributeKeys).toContain('sip.h.X-Twilio-VerStat');
      expect(room.listenerCount('participantAttributesChanged')).toBe(0);
    });

    it('ignores updates for other participants', async () => {
      const room = fakeRoom();
      const caller = sipCaller();
      const pending = readSipCaller(caller, { updates: room, waitMs: 1000 });
      room.emit(
        'participantAttributesChanged',
        { 'sip.h.X-Twilio-VerStat': 'TN-Validation-Passed-A' },
        { identity: 'someone-else', attributes: {} }
      );
      await vi.advanceTimersByTimeAsync(1000);
      const r = await pending;
      expect(r.attestation).toBe('none');
      expect(r.waitedMs).toBe(1000);
    });

    it('gives up after waitMs when the header never arrives', async () => {
      const room = fakeRoom();
      const pending = readSipCaller(sipCaller(), { updates: room, waitMs: 1500 });
      await vi.advanceTimersByTimeAsync(1500);
      const r = await pending;
      expect(r).toMatchObject({ isSip: true, attestation: 'none', waitedMs: 1500 });
      expect(room.listenerCount('participantAttributesChanged')).toBe(0);
    });
  });

  it('returns at once for a non-SIP participant', async () => {
    const room = fakeRoom();
    const r = await readSipCaller(
      { kind: ParticipantKind.STANDARD, identity: 'web-user', attributes: { foo: 'bar' } },
      { updates: room }
    );
    expect(r).toEqual({
      isSip: false,
      phoneNumberMasked: null,
      attestation: 'none',
      attestationSource: 'none',
      signedStatus: 'unsigned',
      attributeKeys: ['foo'],
      waitedMs: 0,
    });
    expect(room.listenerCount('participantAttributesChanged')).toBe(0);
  });

  it('detects SIP from sip.* attributes when kind is not set', async () => {
    const r = await readSipCaller({
      identity: 'x',
      attributes: { 'sip.phoneNumber': FULL_NUMBER, 'sip.h.X-Twilio-VerStat': 'No-TN-Validation' },
    });
    expect(r.isSip).toBe(true);
    expect(r.attestation).toBe('none');
  });
});

describe('phoneVerifyMode', () => {
  it('is off unless PHONE_VERIFY=shadow', () => {
    expect(phoneVerifyMode({})).toBe('off');
    expect(phoneVerifyMode({ PHONE_VERIFY: 'off' })).toBe('off');
    expect(phoneVerifyMode({ PHONE_VERIFY: 'live' })).toBe('off');
    expect(phoneVerifyMode({ PHONE_VERIFY: 'shadow' })).toBe('shadow');
  });
});

describe('logSipCallerShadow', () => {
  beforeEach(() => {
    info.mockClear();
    warn.mockClear();
  });

  it('logs nothing and does not listen when the flag is off', async () => {
    const room = fakeRoom();
    const r = await logSipCallerShadow({
      participant: sipCaller(),
      room,
      sessionId: 's1',
      env: {},
    });
    expect(r).toBeNull();
    expect(info).not.toHaveBeenCalled();
    expect(room.listenerCount('participantAttributesChanged')).toBe(0);
  });

  it('logs one SIP_CALLER line per call in shadow, without the full number', async () => {
    const room = fakeRoom();
    const participant = sipCaller({ 'sip.h.X-Twilio-VerStat': 'TN-Validation-Failed-B' });
    const env = { PHONE_VERIFY: 'shadow' };
    await logSipCallerShadow({ participant, room, sessionId: 's2', env });
    await logSipCallerShadow({ participant, room, sessionId: 's2', env });

    expect(info).toHaveBeenCalledTimes(1);
    const [fields, msg] = info.mock.calls[0] as [Record<string, unknown>, string];
    expect(msg).toBe('SIP_CALLER');
    expect(fields).toMatchObject({
      sessionId: 's2',
      isSip: true,
      phoneNumberMasked: '**67',
      attestation: 'failed',
    });
    expect(JSON.stringify(fields)).not.toContain(FULL_NUMBER);
    expect(JSON.stringify(fields)).not.toContain('TN-Validation');
  });
});

describe('signed attestation (ferni.attest)', () => {
  const SECRET = 'agent-attest-secret';
  const env = { PHONE_ATTEST_SECRET: SECRET };
  const token = (from = FULL_NUMBER, verstat = 'TN-Validation-Passed-A', secret = SECRET): string =>
    mintPhoneAttestation({ callSid: 'CA1', from, to: '+18885983952', verstat }, secret);

  it('takes the attestation from a token that verifies for this caller', async () => {
    const r = await readSipCaller(sipCaller({ 'ferni.attest': token() }), { env });
    expect(r).toMatchObject({
      attestation: 'A',
      attestationSource: 'signed',
      signedStatus: 'signed',
    });
  });

  it('prefers the signed verstat over a forged raw header', async () => {
    const r = await readSipCaller(
      sipCaller({
        'ferni.attest': token(FULL_NUMBER, 'TN-Validation-Passed-C'),
        'sip.h.X-Twilio-VerStat': 'TN-Validation-Passed-A',
      }),
      { env }
    );
    expect(r).toMatchObject({ attestation: 'C', attestationSource: 'signed' });
  });

  it.each([
    ['another caller number', () => token('+15559999999'), env, 'number-mismatch'],
    [
      'another secret',
      () => token(FULL_NUMBER, 'TN-Validation-Passed-A', 'other'),
      env,
      'bad-signature',
    ],
    ['no secret on the agent', () => token(), {}, 'no-secret'],
  ] as const)('never reports signed for a token minted for %s', async (_l, make, e, reason) => {
    const r = await readSipCaller(
      sipCaller({ 'ferni.attest': make(), 'sip.h.X-Twilio-VerStat': 'TN-Validation-Passed-A' }),
      { env: e }
    );
    expect(r).toMatchObject({
      attestation: 'A',
      attestationSource: 'header',
      signedStatus: 'invalid',
      signedReason: reason,
    });
  });

  it('reports the raw header as unsigned when no token was sent', async () => {
    const r = await readSipCaller(
      sipCaller({ 'sip.h.X-Twilio-VerStat': 'TN-Validation-Passed-A' }),
      {
        env,
      }
    );
    expect(r).toMatchObject({ attestationSource: 'header', signedStatus: 'unsigned' });
  });

  it('reads the token from a trunk that maps all headers (sip.h.X-Ferni-Attest)', async () => {
    const r = await readSipCaller(sipCaller({ 'sip.h.X-Ferni-Attest': token() }), { env });
    expect(r.attestationSource).toBe('signed');
  });

  it('logs neither the token nor the full number', async () => {
    info.mockClear();
    const t = token();
    await logSipCallerShadow({
      participant: sipCaller({ 'ferni.attest': t }),
      room: fakeRoom(),
      sessionId: 's-signed',
      env: { ...env, PHONE_VERIFY: 'shadow' },
    });
    const [fields] = info.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields).toMatchObject({ attestationSource: 'signed', attestation: 'A' });
    const logged = JSON.stringify(fields);
    expect(logged).not.toContain(t.split('.')[1]);
    expect(logged).not.toContain(t.split('.')[0]);
    expect(logged).not.toContain(FULL_NUMBER);
  });

  describe('with fake timers', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('stops waiting when the token arrives in a later update', async () => {
      const room = fakeRoom();
      const caller = sipCaller();
      const pending = readSipCaller(caller, { updates: room, waitMs: 1500, env });
      await vi.advanceTimersByTimeAsync(300);
      room.emit('participantAttributesChanged', { 'ferni.attest': token() }, caller);
      const r = await pending;
      expect(r).toMatchObject({ attestationSource: 'signed', waitedMs: 300 });
    });
  });
});

describe('noteCallerJoined', () => {
  it('marks a SIP caller as a phone listener (telephony audio profile) and not a web user', async () => {
    expect(isPhoneListener('call-s')).toBe(false);
    await noteCallerJoined({
      participant: sipCaller(),
      room: fakeRoom(),
      sessionId: 'call-s',
      env: {},
    });
    await noteCallerJoined({
      participant: { kind: ParticipantKind.STANDARD, identity: 'user-1' },
      room: fakeRoom(),
      sessionId: 'app-s',
      env: {},
    });
    expect(isPhoneListener('call-s')).toBe(true);
    expect(isPhoneListener('app-s')).toBe(false);
  });
});

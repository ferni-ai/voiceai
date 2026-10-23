import { ParticipantKind } from '@livekit/rtc-node';
import { describe, expect, it } from 'vitest';

import { computeTtfwRecord, parseClientTiming, platformOf } from '../time-to-first-word-record.js';

const T0 = 1_760_000_000_000;
const bytes = (value: unknown): Uint8Array =>
  new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));

describe('computeTtfwRecord', () => {
  it('measures first word from the later of agent join and caller join', () => {
    const r = computeTtfwRecord({
      jobStart: 100,
      agentJoined: 700,
      callerJoined: 1_000,
      openerText: 1_900,
      firstAudio: 2_300,
      ttsFirstAudioMs: 420,
    });
    expect(r).toEqual({
      ttfwMs: 1_300,
      jobToAgentJoinMs: 600,
      agentJoinToCallerMs: 300,
      readyToOpenerTextMs: 900,
      openerTextToAudioMs: 400,
      ttsFirstAudioMs: 420,
      jobToFirstAudioMs: 2_200,
    });
  });

  it('uses the agent join when the caller was there first', () => {
    const r = computeTtfwRecord({ agentJoined: 900, callerJoined: 400, firstAudio: 2_000 });
    expect(r.ttfwMs).toBe(1_100);
    expect(r.agentJoinToCallerMs).toBe(-500);
  });

  it('leaves a segment out, never NaN, when one of its ends is missing', () => {
    const r = computeTtfwRecord({ jobStart: 0, agentJoined: 500 });
    expect(r).toEqual({ jobToAgentJoinMs: 500 });
    expect(Object.values(r).some((v) => Number.isNaN(v))).toBe(false);
    expect(computeTtfwRecord({ agentJoined: 500, firstAudio: 900 })).not.toHaveProperty('ttfwMs');
  });

  it('turns the app moments into offsets on the device clock', () => {
    const r = computeTtfwRecord(
      {},
      { tapAt: T0, roomConnectedAt: T0 + 600, firstAudioHeardAt: T0 + 1_750 }
    );
    expect(r).toEqual({
      clientTapToRoomMs: 600,
      clientTapToHeardMs: 1_750,
      clientRoomToHeardMs: 1_150,
    });
  });

  it('drops a client offset that runs backwards or past two minutes', () => {
    const r = computeTtfwRecord(
      {},
      { tapAt: T0, roomConnectedAt: T0 - 5, firstAudioHeardAt: T0 + 600_000 }
    );
    expect(r).toEqual({});
  });
});

describe('parseClientTiming', () => {
  it('keeps the numeric epoch fields and an allow-listed platform', () => {
    const { timing } = parseClientTiming(
      bytes({ tapAt: T0, roomConnectedAt: T0 + 1, firstAudioHeardAt: T0 + 2, platform: 'iOS' })
    );
    expect(timing).toEqual({
      tapAt: T0,
      roomConnectedAt: T0 + 1,
      firstAudioHeardAt: T0 + 2,
      platform: 'ios',
    });
  });

  it('ignores garbage without throwing', () => {
    for (const payload of [
      bytes('not json {'),
      bytes([1, 2, 3]),
      bytes(null),
      bytes({ tapAt: 'soon', roomConnectedAt: Number.NaN, firstAudioHeardAt: 42 }),
      bytes({ tapAt: 1e20 }),
      new Uint8Array(0),
      new Uint8Array(4096),
    ]) {
      const result = parseClientTiming(payload);
      expect(result.timing).toBeNull();
      expect(result.error).toBeTypeOf('string');
    }
  });

  it('keeps the valid fields of a partly bad message and drops a free-text platform', () => {
    const { timing } = parseClientTiming(
      bytes({ tapAt: T0, firstAudioHeardAt: 'later', platform: 'My iPhone' })
    );
    expect(timing).toEqual({ tapAt: T0 });
  });
});

describe('platformOf', () => {
  it('reads a SIP caller as phone and an app caller from its platform attribute', () => {
    expect(platformOf({ kind: ParticipantKind.SIP, attributes: { platform: 'ios' } })).toBe(
      'phone'
    );
    expect(
      platformOf({ kind: ParticipantKind.STANDARD, attributes: { platform: 'android' } })
    ).toBe('android');
    expect(
      platformOf({ kind: ParticipantKind.STANDARD, attributes: { platform: '+15551234567' } })
    ).toBeUndefined();
  });
});

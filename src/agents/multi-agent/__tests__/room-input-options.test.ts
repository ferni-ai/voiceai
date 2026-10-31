/**
 * WEB_NOISE_CANCEL=on gives a web caller BVC on the room input; off, a web
 * caller gets no input processing, as before. Phone callers keep the AGC +
 * high-pass frame processor either way, unless PHONE_NOISE_CANCEL=on gives
 * them telephony BVC instead (web callers never get it).
 */
import { ParticipantKind } from '@livekit/rtc-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const BVC = { moduleId: 'livekit.plugins.noise_cancellation', options: { modelPath: 'bvc' } };
const PHONE_PROCESSOR = { kind: 'pre-stt-frame-processor' };
const TELEPHONY = { moduleId: 'livekit.plugins.noise_cancellation', options: { modelPath: 'tel' } };
const bvcCalls = vi.fn(() => BVC);
const telephonyCalls = vi.fn(() => TELEPHONY);
const preStt = vi.fn(async (_sessionId: string) => PHONE_PROCESSOR);

vi.mock('@livekit/noise-cancellation-node', () => ({
  BackgroundVoiceCancellation: () => bvcCalls(),
  TelephonyBackgroundVoiceCancellation: () => telephonyCalls(),
}));
vi.mock('../../integrations/pre-stt-frame-processor.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../integrations/pre-stt-frame-processor.js')>()),
  createPreSTTFrameProcessor: (sessionId: string) => preStt(sessionId),
}));

const { roomInputOptions } = await import('../room-input-options.js');

const web = { kind: ParticipantKind.STANDARD, identity: 'user-123', attributes: {} };
const phone = { kind: ParticipantKind.SIP, identity: 'sip_+15551234567', attributes: {} };
const ON = { WEB_NOISE_CANCEL: 'on' };

describe('roomInputOptions', () => {
  beforeEach(() => {
    bvcCalls.mockClear();
    telephonyCalls.mockClear();
    preStt.mockClear();
  });

  it('gives a web caller BVC when WEB_NOISE_CANCEL is on', async () => {
    expect(await roomInputOptions(web, 's1', ON)).toEqual({
      inputOptions: { noiseCancellation: BVC },
    });
    expect(bvcCalls).toHaveBeenCalledTimes(1);
  });

  it('leaves a web caller alone when off or unset', async () => {
    expect(await roomInputOptions(web, 's1', {})).toEqual({});
    expect(await roomInputOptions(web, 's1', { WEB_NOISE_CANCEL: 'off' })).toEqual({});
    expect(bvcCalls).not.toHaveBeenCalled();
  });

  it('keeps the phone frame processor and never adds BVC to a phone caller', async () => {
    const phoneInput = { inputOptions: { noiseCancellation: PHONE_PROCESSOR } };
    expect(await roomInputOptions(phone, 's1', {})).toEqual(phoneInput);
    expect(await roomInputOptions(phone, 's1', ON)).toEqual(phoneInput);
    expect(preStt).toHaveBeenCalledTimes(2);
    expect(bvcCalls).not.toHaveBeenCalled();
    expect(telephonyCalls).not.toHaveBeenCalled();
  });

  it('leaves every caller exactly as before while PHONE_NOISE_CANCEL is off', async () => {
    for (const value of [undefined, '', 'off', 'false']) {
      const env = { PHONE_NOISE_CANCEL: value };
      expect(JSON.stringify(await roomInputOptions(phone, 's1', env))).toBe(
        JSON.stringify({ inputOptions: { noiseCancellation: PHONE_PROCESSOR } })
      );
      expect(JSON.stringify(await roomInputOptions(web, 's1', env))).toBe('{}');
    }
    expect(telephonyCalls).not.toHaveBeenCalled();
  });

  it('PHONE_NOISE_CANCEL=on gives a phone caller telephony BVC in place of AGC', async () => {
    const sipByAttribute = { identity: 'caller', attributes: { 'sip.callStatus': 'active' } };
    for (const caller of [phone, sipByAttribute]) {
      expect(await roomInputOptions(caller, 's1', { PHONE_NOISE_CANCEL: 'on' })).toEqual({
        inputOptions: { noiseCancellation: TELEPHONY },
      });
    }
    expect(telephonyCalls).toHaveBeenCalledTimes(2);
    expect(preStt).not.toHaveBeenCalled();
    expect(bvcCalls).not.toHaveBeenCalled();
  });

  it('PHONE_NOISE_CANCEL=on leaves web and unknown callers unchanged', async () => {
    expect(await roomInputOptions(web, 's1', { PHONE_NOISE_CANCEL: 'on' })).toEqual({});
    expect(await roomInputOptions(web, 's1', { ...ON, PHONE_NOISE_CANCEL: 'on' })).toEqual({
      inputOptions: { noiseCancellation: BVC },
    });
    expect(await roomInputOptions(undefined, 's1', { PHONE_NOISE_CANCEL: 'on' })).toEqual({});
    expect(telephonyCalls).not.toHaveBeenCalled();
  });

  it('falls back to the AGC processor when telephony BVC fails to load', async () => {
    telephonyCalls.mockImplementationOnce(() => {
      throw new Error('Library not found');
    });
    expect(await roomInputOptions(phone, 's1', { PHONE_NOISE_CANCEL: 'on' })).toEqual({
      inputOptions: { noiseCancellation: PHONE_PROCESSOR },
    });
  });

  it('keeps PRE_STT_SIP=off meaning no processing for a phone caller', async () => {
    expect(await roomInputOptions(phone, 's1', { ...ON, PRE_STT_SIP: 'off' })).toEqual({});
    expect(preStt).not.toHaveBeenCalled();
    expect(bvcCalls).not.toHaveBeenCalled();
  });

  it('leaves a caller it cannot identify alone', async () => {
    expect(await roomInputOptions(undefined, 's1', ON)).toEqual({});
    expect(bvcCalls).not.toHaveBeenCalled();
  });

  it('starts without BVC when the plugin fails', async () => {
    bvcCalls.mockImplementationOnce(() => {
      throw new Error('Library not found');
    });
    expect(await roomInputOptions(web, 's1', ON)).toEqual({});
  });
});

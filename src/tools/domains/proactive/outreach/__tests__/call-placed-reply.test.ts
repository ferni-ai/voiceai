/**
 * callUser's reply says what really rang: the persona live, or a recorded
 * message in an automated voice. Neither lets the model say the call connected
 * (prod 2026-10-22: "Calling you now." and then "it connected", in Twilio's voice).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CALLING_LATER,
  CALLING_LIVE,
  CALLING_VOICE_MESSAGE,
  callPlacedReply,
} from '../call-placed-reply.js';

describe('CALL_PLACED_HONEST_REPLY=on', () => {
  beforeEach(() => vi.stubEnv('CALL_PLACED_HONEST_REPLY', 'on'));
  afterEach(() => vi.unstubAllEnvs());

  it('the live agent ringing: the persona is on that call, but not in this one', () => {
    expect(callPlacedReply({ status: 'initiated', live: true })).toBe(CALLING_LIVE);
    expect(CALLING_LIVE).toMatch(/on that call yourself, live/);
  });

  it('a Twilio message: says it is an automated voice, not the persona live', () => {
    expect(callPlacedReply({ status: 'initiated' })).toBe(CALLING_VOICE_MESSAGE);
    expect(CALLING_VOICE_MESSAGE).toMatch(/automated phone voice/);
    expect(CALLING_VOICE_MESSAGE).toMatch(/not you live and not your voice/);
  });

  it('neither lets the model claim the call connected', () => {
    for (const reply of [CALLING_LIVE, CALLING_VOICE_MESSAGE]) {
      expect(reply).toMatch(/don't say it connected/);
      expect(reply).not.toMatch(/—|\.\.\./);
    }
  });

  it('held for calling hours, live or not', () => {
    expect(callPlacedReply({ status: 'scheduled', live: true })).toBe(CALLING_LATER);
    expect(callPlacedReply({ status: 'scheduled' })).toBe(CALLING_LATER);
  });
});

describe('CALL_PLACED_HONEST_REPLY off (the default)', () => {
  it('keeps the old reply', () => {
    expect(callPlacedReply({ status: 'initiated', live: true })).toBe('Calling you now.');
    expect(callPlacedReply({ status: 'initiated' })).toBe('Calling you now.');
    expect(callPlacedReply({ status: 'scheduled' })).toBe(CALLING_LATER);
  });
});

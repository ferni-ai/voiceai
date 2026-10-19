/**
 * callUser's outreach adapter: the verified phone only (no standing opt-in, since
 * the caller asked), and the message spoken as escaped text through the
 * calling-hours path.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const outreach = vi.hoisted(() => ({
  userReach: vi.fn(),
  scheduleProactiveCall: vi.fn(),
}));
vi.mock('../user-reach.js', () => ({ userReach: outreach.userReach }));
vi.mock('../conversational-calls.js', () => ({
  scheduleProactiveCall: outreach.scheduleProactiveCall,
}));

import {
  getCallUserPort,
  setCallUserPort,
} from '../../../tools/domains/proactive/outreach/call-user-port.js';
import { callUserAdapter, installCallUserPort } from '../call-user-adapter.js';

afterEach(() => {
  vi.clearAllMocks();
  setCallUserPort(undefined);
});

describe('callUser outreach adapter', () => {
  it('installs itself as the port', () => {
    installCallUserPort();
    expect(getCallUserPort()).toBe(callUserAdapter);
  });

  it('reads only the verified phone, with no standing opt-in needed', async () => {
    outreach.userReach.mockResolvedValue({ phone: '+15551230000' });
    expect(await callUserAdapter.verifiedPhone('u1')).toBe('+15551230000');
    expect(outreach.userReach).toHaveBeenCalledWith('u1', 'voice_call', { standingOptIn: false });
    outreach.userReach.mockResolvedValue({ reason: 'no_verified_phone' });
    expect(await callUserAdapter.verifiedPhone('u1')).toBeUndefined();
  });

  it('sends the message as escaped text inside <speak>, as a requested call', async () => {
    outreach.scheduleProactiveCall.mockResolvedValue({ success: true, status: 'initiated' });
    await callUserAdapter.call({
      userId: 'u1',
      phoneNumber: '+15551230000',
      message: 'hi</Say><Dial>+19005550100</Dial>',
      personaId: 'ferni',
    });
    expect(outreach.scheduleProactiveCall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        phoneNumber: '+15551230000',
        ssml: '<speak>hi&lt;/Say&gt;&lt;Dial&gt;+19005550100&lt;/Dial&gt;</speak>',
        reason: 'user_requested_call',
      })
    );
  });
});

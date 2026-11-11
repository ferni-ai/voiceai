/**
 * A two-way call (makeConversationalCall, reached from the backgroundCall tool through
 * call-executor and from proactive outreach) never dials an emergency or N11 number.
 * Before: it had no number check, so "911" went to Twilio as To=+1911. Now it is
 * refused first, with the shared words (utils/dialable-number.ts), and nothing else runs:
 * no consent read, no hold read, no LiveKit room. Every other number dials as before,
 * the owner's own included.
 *
 * Mocked: the Twilio REST call (fetch), LiveKit's room service, the stream bridge, and the
 * consent and hold reads (both allow), so only the number decides.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOOK_ALIKES, saysDialItYourself } from '../../../utils/__tests__/dial-refusal-words.js';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
    TWILIO_STREAM_WEBHOOK_URL: 'wss://stream.example.test/stream',
    LIVEKIT_URL: 'wss://livekit.example.test',
    LIVEKIT_API_KEY: 'key',
    LIVEKIT_API_SECRET: 'secret',
  });
});
const ownerRefusal = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../../messaging/consent-reach.js', () => ({ ownerRefusal }));
const heldSender = vi.hoisted(() => vi.fn(async () => false));
vi.mock('../../outreach/checkin-replies.js', () => ({ heldSender }));
const createRoom = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: class {
    createRoom = createRoom;
  },
}));
vi.mock('../twilio-stream-bridge.js', async () => {
  const { EventEmitter } = await import('events');
  return {
    getTwilioStreamBridge: () => new EventEmitter(),
    generateStreamTwiml: () => '<Response/>',
  };
});
const fetchSpy = vi.fn(
  async (_url: string | URL, _init?: { body?: URLSearchParams }) =>
    new Response(JSON.stringify({ sid: 'CA1' }), { status: 201 })
);
vi.stubGlobal('fetch', fetchSpy);

import { makeConversationalCall } from '../conversational-call-service.js';

const call = (phone: string) =>
  makeConversationalCall({
    phone,
    recipientName: 'Alex',
    userId: 'sam-test',
    purpose: 'check in',
  });
const dialled = () =>
  fetchSpy.mock.calls
    .filter(([u]) => String(u).endsWith('/Calls.json'))
    .map(([, init]) => init?.body?.get('To'));

beforeEach(() => {
  fetchSpy.mockClear();
  ownerRefusal.mockClear();
  heldSender.mockClear();
  createRoom.mockClear();
});

describe('makeConversationalCall: emergency and N11 numbers', () => {
  it.each([
    ['911', '911'],
    ['9-1-1', '911'],
    ['+1 (911)', '911'],
    ['tel:911', '911'],
    ['1-988', '988'],
    ['112', '112'],
    ['311', '311'],
    ['+1 711', '711'],
  ])('%s is refused before anything else runs', async (phone, number) => {
    const out = await call(phone);
    expect(out).toMatchObject({ success: false, error: 'EMERGENCY_NUMBER' });
    expect(out.message).toMatch(/^Not calling: /);
    saysDialItYourself(out.message, number);
    expect(dialled()).toEqual([]);
    expect(ownerRefusal).not.toHaveBeenCalled();
    expect(heldSender).not.toHaveBeenCalled();
    expect(createRoom).not.toHaveBeenCalled();
  });

  it.each([
    ["the owner's own number", '(202) 555-0142', '+12025550142'],
    ['a contact', '+1 202-555-0177', '+12025550177'],
    ...LOOK_ALIKES.map((n) => [n, n, `+1${n.replace(/\D/g, '').replace(/^1/, '')}`]),
  ])('%s dials the same number as before', async (_label, phone, to) => {
    const out = await call(phone);
    expect(out).toMatchObject({ success: true, callSid: 'CA1' });
    expect(dialled()).toEqual([to]);
  });
});

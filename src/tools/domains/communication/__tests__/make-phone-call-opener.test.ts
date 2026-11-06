/**
 * makePhoneCall plays one message over Twilio. Whoever it rings first hears
 * the shared outbound identity, "it's Ferni, Sam's AI friend" (utils/ferni-intro.ts),
 * never "a call from Alex, your communication assistant". Ringing the owner's
 * own phone keeps the words it always had, byte for byte.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_PHONE_NUMBER: '+12025550100',
  });
});
const own = vi.hoisted(() => ({ fails: false }));
const OWN = '+12025550101';
const ALEX = '+12025550142';

vi.mock('@livekit/agents', () => ({ llm: { tool: (config: unknown) => config } }));
vi.mock('../../../../utils/consent-port.js', () => ({
  ownerRefusal: vi.fn(async () => null),
  notCalling: vi.fn(() => 'not calling'),
}));
vi.mock('../../../../services/communication-service.js', async (orig) => ({
  ...(await orig<typeof import('../../../../services/communication-service.js')>()),
  directSendHeld: vi.fn(async () => false),
}));
const fetchSpy = vi.fn(
  async (_url: string | URL, _init?: { body?: URLSearchParams }) =>
    new Response(JSON.stringify({ sid: 'CA1' }), { status: 201 })
);
vi.stubGlobal('fetch', fetchSpy);

const { createCommunicationTools } = await import('../communication-tools.js');
const { ferniIntro, messageCallGreeting } = await import('../../../../utils/ferni-intro.js');
const { setCallUserPort } = await import('../../proactive/outreach/call-user-port.js');

/** The account's verified phone, as the call-user port reads it: u1 owns OWN. */
function installPort(): void {
  setCallUserPort({
    verifiedPhone: async (uid) => {
      if (own.fails) throw new Error('firestore unavailable');
      return uid === 'u1' ? OWN : undefined;
    },
    call: async () => ({ success: false }),
  });
}
installPort();

type Tool = { execute: (a: Record<string, unknown>, o: unknown) => Promise<unknown> };
const tools = createCommunicationTools() as unknown as Record<string, Tool>;

/** Ring `phoneNumber` for a session whose userData is `userData`; return the TwiML sent. */
async function twimlFor(phoneNumber: string, userData: Record<string, unknown>): Promise<string> {
  await tools.makePhoneCall!.execute(
    { phoneNumber, message: 'Dinner moved to 7' },
    { ctx: { userData } }
  );
  expect(fetchSpy).toHaveBeenCalledOnce();
  return String(fetchSpy.mock.calls[0]![1]!.body!.get('Twiml'));
}

const said = (twiml: string) => /<Say voice="alice">(.*)<\/Say>/.exec(twiml)?.[1] ?? '';

afterEach(() => {
  own.fails = false;
  installPort();
  fetchSpy.mockClear();
});

describe('makePhoneCall to someone else', () => {
  it('opens with the shared outbound identity, naming the user it calls for', async () => {
    const twiml = await twimlFor(ALEX, { userId: 'u1', name: 'Sam' });

    expect(messageCallGreeting('Sam')).toBe(
      `Hi, ${ferniIntro({ sponsorName: 'Sam', personal: true })}.`
    );
    expect(said(twiml)).toBe(`${messageCallGreeting('Sam')} Dinner moved to 7. Have a great day!`);
    expect(said(twiml)).toContain(ferniIntro({ sponsorName: 'Sam', personal: true }));
    expect(twiml).not.toContain('communication assistant');
  });

  it.each([
    ['no name in the session', { userId: 'u1' }],
    ['a placeholder name', { userId: 'u1', name: 'the user' }],
  ])("with %s: the opener's no-user form", async (_label, userData) => {
    const twiml = await twimlFor(ALEX, userData);

    expect(said(twiml)).toBe(
      `Hi, ${ferniIntro({ personal: true })}. Dinner moved to 7. Have a great day!`
    );
  });

  it("a failed own-number read counts as someone else's phone: the disclosure plays", async () => {
    own.fails = true;
    const twiml = await twimlFor(OWN, { userId: 'u1', name: 'Sam' });

    expect(said(twiml)).toBe(`${messageCallGreeting('Sam')} Dinner moved to 7. Have a great day!`);
  });

  it('with no call-user port installed, even the own number hears the disclosure', async () => {
    setCallUserPort(undefined);
    const twiml = await twimlFor(OWN, { userId: 'u1', name: 'Sam' });

    expect(said(twiml)).toBe(`${messageCallGreeting('Sam')} Dinner moved to 7. Have a great day!`);
  });
});

describe("makePhoneCall to the owner's own phone", () => {
  it('sends the TwiML main sent, byte for byte', async () => {
    const twiml = await twimlFor(OWN, { userId: 'u1', name: 'Sam' });

    expect(twiml).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi! This is a call from Alex, your communication assistant. Dinner moved to 7. Have a great day!</Say>
</Response>`);
  });
});

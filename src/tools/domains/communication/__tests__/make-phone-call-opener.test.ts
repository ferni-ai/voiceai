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
async function twimlFor(
  phoneNumber: string,
  userData: Record<string, unknown>,
  message = 'Dinner moved to 7'
): Promise<string> {
  await tools.makePhoneCall!.execute({ phoneNumber, message }, { ctx: { userData } });
  expect(fetchSpy).toHaveBeenCalledOnce();
  return String(fetchSpy.mock.calls[0]![1]!.body!.get('Twiml'));
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * A strict read of the TwiML: every byte is a tag or text, tags balance, and
 * text has no raw "<" or ">" and no "&" outside the five XML entities. Returns
 * the elements in document order and their text, entities decoded.
 */
function parseTwiml(xml: string): { elements: string[]; text: string } {
  const body = xml.replace(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n/, '');
  const elements: string[] = [];
  const open: string[] = [];
  let text = '';
  let read = 0;
  for (const m of body.matchAll(/<(\/?)([A-Za-z]+)((?:\s+\w+="[^"<>&]*")*)\s*(\/?)>|[^<>]+/g)) {
    if (m.index !== read)
      throw new Error(`stray markup at ${read}: ${body.slice(read, read + 20)}`);
    read += m[0].length;
    const [, close, name, , selfClosing] = m;
    if (!name) {
      if (/&(?!(?:amp|lt|gt|quot|apos);)/.test(m[0])) throw new Error(`bare & in ${m[0]}`);
      if (!m[0].trim()) continue; // indentation between elements
      if (open.length) text += m[0].replace(/&(\w+);/g, (_e, n: string) => ENTITIES[n]!);
      else throw new Error(`text outside the root: ${m[0]}`);
    } else if (close) {
      if (open.pop() !== name) throw new Error(`unbalanced </${name}>`);
    } else {
      elements.push(name);
      if (!selfClosing) open.push(name);
    }
  }
  if (read !== body.length || open.length) throw new Error('truncated TwiML');
  return { elements, text };
}

const said = (twiml: string) => parseTwiml(twiml).text;

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

  it.each([
    ['Sam Lee', 'Sam'],
    ['  sam   lee  ', 'Sam'],
    ["O'Neil Park", "O'Neil"],
    ['Mary-Jo Diaz', 'Mary-Jo'],
  ])('a full name %j: the callee hears only %j', async (name, first) => {
    const twiml = await twimlFor(ALEX, { userId: 'u1', name });

    expect(said(twiml)).toBe(
      `Hi, it's Ferni, ${first}'s AI friend. Dinner moved to 7. Have a great day!`
    );
    expect(said(twiml)).not.toMatch(/Lee|Park|Diaz/);
  });

  it('a name with no usable first word: the no-user form, never the raw text', async () => {
    const twiml = await twimlFor(ALEX, { userId: 'u1', name: '+15550100 Sam' });

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

const SELF_CALL = 'Hi! This is a call from Alex, your communication assistant.';

describe("makePhoneCall to the owner's own phone", () => {
  it('sends the TwiML main sent, byte for byte', async () => {
    const twiml = await twimlFor(OWN, { userId: 'u1', name: 'Sam' });

    expect(twiml).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi! This is a call from Alex, your communication assistant. Dinner moved to 7. Have a great day!</Say>
</Response>`);
  });
});

describe('makePhoneCall with markup in the name or the message', () => {
  const HOSTILE = `</Say><Dial>+15550100</Dial><Say> & <b> "quoted" it's`;

  it.each([
    [
      'someone else, hostile name and message',
      ALEX,
      `Sam${HOSTILE}`,
      () => messageCallGreeting(`Sam${HOSTILE}`),
    ],
    ["the owner's own phone, hostile message", OWN, 'Sam', () => SELF_CALL],
  ])(
    '%s: one <Say>, no <Dial>, the text spoken as written',
    async (_label, phone, name, greeting) => {
      const twiml = await twimlFor(phone, { userId: 'u1', name }, HOSTILE);
      const { elements, text } = parseTwiml(twiml);

      expect(elements).toEqual(['Response', 'Say']);
      expect(text).toBe(`${greeting()} ${HOSTILE}. Have a great day!`);
    }
  );

  it('the strict read rejects the unescaped template', () => {
    expect(() => parseTwiml(`<Response><Say>${HOSTILE}</Say></Response>`)).toThrow();
  });
});

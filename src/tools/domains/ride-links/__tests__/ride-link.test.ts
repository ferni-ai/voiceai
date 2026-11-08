/**
 * openRideLink (RIDE_LINKS): the real geocoder (Google's response stubbed at
 * fetch), the real link builder, and texts through the call-user port the call
 * session installs (its textOwner is the guarded sender: STOP, texts off,
 * holds; guarded-text.test.ts covers those). Fixtures are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallUserPort } from '../../proactive/outreach/call-user-port.js';

vi.hoisted(() => {
  process.env.GOOGLE_API_KEY = 'test-key';
});

const { openRideLink } = await import('../ride-link.js');
const { bindSessionPhone } = await import('../../../../utils/minor-care.js');
const { setCallUserPort } = await import('../../proactive/outreach/call-user-port.js');

/** The guarded sender's answer for this test, and every text it was asked to send. */
let refusal: string | undefined;
const textOwner = vi.fn(async (_userId: string, _body: string, _opts: { askedNow: boolean }) =>
  refusal ? { sent: false, reason: refusal } : { sent: true }
);
const port = { verifiedPhone: async () => undefined, call: vi.fn(), textOwner } as CallUserPort;

/** What Google's geocoder knows: the place's words → its coordinates. */
const PLACES: Record<string, { lat: number; lng: number }> = {
  'Maple Grove Airport': { lat: 39.8561, lng: -104.6737 },
  '12 Elm Street, Springfield': { lat: 39.7392, lng: -104.9903 },
};
const fetchSpy = vi.fn(async (url: string | URL) => {
  const u = new URL(String(url));
  const hit = PLACES[u.searchParams.get('address') ?? ''];
  const body = hit
    ? { status: 'OK', results: [{ geometry: { location: hit } }] }
    : { status: 'ZERO_RESULTS', results: [] };
  return new Response(JSON.stringify(body), { status: 200 });
});

const PHONE = '+12025550123';
const call = (sessionId: string) => ({
  ctx: { userData: { userId: 'caller-1', services: { sessionId } } },
});
const APP = call('session-app');
const PHONE_CALL = call('session-phone');
const TRIP = { destination: 'Maple Grove Airport', pickup: '12 Elm Street, Springfield' };

/** The link's pickup and drop-off Location objects. */
function ends(link: string): { pickup: Record<string, unknown>; drop: Record<string, unknown> } {
  const u = new URL(link);
  expect(`${u.origin}${u.pathname}`).toBe('https://m.uber.com/looking');
  return {
    pickup: JSON.parse(u.searchParams.get('pickup') as string),
    drop: JSON.parse(u.searchParams.get('drop[0]') as string),
  };
}

const said: string[] = [];
async function ride(...args: Parameters<typeof openRideLink>) {
  const result = await openRideLink(...args);
  said.push(result.say);
  return result;
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy);
  bindSessionPhone('session-phone', PHONE);
  setCallUserPort(port);
  refusal = undefined;
  textOwner.mockClear();
  fetchSpy.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  setCallUserPort(undefined);
});

describe('the link carries the geocoded trip', () => {
  it('drop-off and pickup are the geocoded coordinates, named in the caller words', async () => {
    const result = await ride(TRIP, APP);
    expect(result.outcome).toBe('link_ready');
    if (!('link' in result)) throw new Error('no link');
    const { pickup, drop } = ends(result.link);
    expect(drop).toEqual({
      latitude: 39.8561,
      longitude: -104.6737,
      addressLine1: 'Maple Grove Airport',
    });
    expect(pickup).toEqual({
      latitude: 39.7392,
      longitude: -104.9903,
      addressLine1: '12 Elm Street, Springfield',
    });
    expect(result.delivery).toBe('app');
    expect(result.say).toBe(
      "I can't book it for you, but here's a link that opens Uber with your trip filled in."
    );
  });
});

describe('a place the geocoder cannot find gets honest words and no link', () => {
  it('unknown destination: "I couldn\'t find", no link', async () => {
    const result = await ride({ ...TRIP, destination: 'Nowhere Lane 999' }, APP);
    expect(result.outcome).toBe('not_found');
    expect(result).not.toHaveProperty('link');
    expect(result.say).toContain('I couldn\'t find "Nowhere Lane 999"');
  });

  it('a 0,0 answer is a failed lookup, never a drop-off', async () => {
    PLACES['Null Island Cafe'] = { lat: 0, lng: 0 };
    const result = await ride({ ...TRIP, destination: 'Null Island Cafe' }, APP);
    expect(result.outcome).toBe('not_found');
    expect(result).not.toHaveProperty('link');
  });

  it('no Google key: no city-level guess from another geocoder', async () => {
    vi.stubEnv('GOOGLE_API_KEY', '');
    const result = await ride(TRIP, APP);
    vi.unstubAllEnvs();
    expect(result.outcome).toBe('not_found');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([undefined, 'here', 'my current location'])(
    'pickup %s: asks where, looks nothing up',
    async (pickup) => {
      const result = await ride({ destination: 'Maple Grove Airport', pickup }, APP);
      expect(result.outcome).toBe('needs_input');
      expect(result.say).toMatch(/Where should Uber pick you up/);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});

describe('on a phone call it texts only on a yes, through the guarded sender', () => {
  it('first ask: offers a text and sends nothing', async () => {
    const result = await ride(TRIP, PHONE_CALL);
    expect(result.outcome).toBe('offer_text');
    expect(result.say).toMatch(/Want me to send it\?$/);
    expect(textOwner).not.toHaveBeenCalled();
  });

  it('yes: one text to the caller account, asked for now, carrying the link', async () => {
    const result = await ride({ ...TRIP, sendText: true }, PHONE_CALL);
    expect(result.outcome).toBe('texted');
    expect(textOwner).toHaveBeenCalledTimes(1);
    const [userId, body, opts] = textOwner.mock.calls[0];
    expect(userId).toBe('caller-1');
    expect(opts).toEqual({ askedNow: true });
    if (!('link' in result)) throw new Error('no link');
    expect(body).toContain(result.link);
    said.push(body);
  });

  it('yes, but the guarded sender refuses (STOP): it says why, and claims no text', async () => {
    refusal = 'you replied STOP to my texts';
    const result = await ride({ ...TRIP, sendText: true }, PHONE_CALL);
    expect(result.outcome).toBe('text_not_sent');
    expect(result.say).toBe("I didn't text you the link: you replied STOP to my texts.");
  });

  it('yes, but no sender is installed: nothing sent, and it says so', async () => {
    setCallUserPort(undefined);
    const result = await ride({ ...TRIP, sendText: true }, PHONE_CALL);
    expect(result.outcome).toBe('text_not_sent');
    expect(result.say).toBe("I didn't text you the link: texting isn't set up here.");
  });

  it('in the app a text asked for is not sent', async () => {
    const result = await ride({ ...TRIP, sendText: true }, APP);
    expect(textOwner).not.toHaveBeenCalled();
    expect(result.outcome).toBe('link_ready');
  });
});

describe('it never claims a booking', () => {
  it('no reply or text says a ride is booked, requested, confirmed or on its way', () => {
    expect(said.length).toBeGreaterThanOrEqual(10);
    for (const line of said) {
      expect(line).not.toMatch(
        /\b(?:is|been|was|got)\s+(?:booked|requested|confirmed)\b|on (?:the|its|their) way|driver/i
      );
      expect(line).not.toMatch(/(?<!can't )\bbook/i); // only ever "can't book"
    }
  });
});

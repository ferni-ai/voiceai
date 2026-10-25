/**
 * The language chosen in the app reaches the call.
 *
 * Before: the web's token request sent no Accept-Language of its own, so /token
 * took the call's locale from the browser's language (or none), not from Look &
 * Feel; and for anyone with a saved location it never read the header at all and
 * sent 'en-US'.
 *
 * Here the REAL web token fetch (token-fetch.service.ts) calls the REAL /token
 * handler (src/servers/api/routes/token.ts), including its real geo detection.
 * Fakes: Firebase token verification, the profile store, LiveKit (the room
 * metadata it would dispatch the agent with is captured), and the side effects
 * that would reach other services (prefetch, LLM prewarm, admission, room claim).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

delete process.env.DEV_GEO_LOCATION; // it would replace the detected languages

vi.mock('../../../../src/services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: vi.fn(async (token: string) =>
    token.startsWith('tok-')
      ? { uid: `uid-${token.slice(4)}-0000`, claims: {}, isAnonymous: false, emailVerified: false }
      : null
  ),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
}));
const profiles = vi.hoisted(() => new Map<string, Record<string, unknown>>());
vi.mock('../../../../src/memory/profile-store.js', () => ({
  getProfileStore: async () => ({ getProfile: async (uid: string) => profiles.get(uid) ?? null }),
}));
const dispatched = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../../../src/servers/token/livekit.js', () => ({
  createToken: async () => 'livekit-jwt',
  getLiveKitUrl: () => 'wss://livekit.localhost.invalid',
  getRoomService: () => ({}),
  createRoomWithAgent: async (_room: string, metadata: Record<string, unknown>) => {
    dispatched.push(metadata);
    return { agentDispatched: true };
  },
}));
vi.mock('../../../../src/servers/api/routes/token-room-owner.js', () => ({
  refuseUnownedRoom: async () => false,
}));
vi.mock('../../../../src/api/admission.js', () => ({ refuseUnadmitted: async () => false }));
vi.mock('../../../../src/servers/api/routes/user-data-prefetch.js', () => ({
  prefetchUserData: () => undefined,
}));
vi.mock('../../../../src/services/llm-dynamic-content.js', () => ({
  prewarmContent: async () => undefined,
}));
vi.mock('../../../../src/marketplace/registry.js', () => ({ getAgentAsync: async () => null }));

const signedInAs = vi.hoisted(() => ({ token: 'tok-ana' }));
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthToken: async () => signedInAs.token,
}));

const { handleTokenRoutes } = await import('../../../../src/servers/api/routes/token.js');
const { fetchConnectionToken } = await import('../../src/services/token-fetch.service.js');
const { setLocale } = await import('../../src/i18n/index.js');

/** The Accept-Language a browser sends on its own, as Chrome writes it: "en-US,en;q=0.9". */
const ownHeader = (tags: readonly string[]) =>
  tags.map((tag, i) => (i ? `${tag};q=${(1 - i * 0.1).toFixed(1)}` : tag)).join(',');

/** A fresh IP per request, so /token's per-IP rate limit never answers the grid with 429. */
let requestCount = 0;

/**
 * The browser's fetch, answered by the real /token handler; anything else fails.
 * Like a real browser it sends its own Accept-Language unless the page set one.
 */
async function browserFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input), 'http://localhost:3000');
  if (url.pathname !== '/token') throw new Error(`unexpected request to ${url.href}`);
  const headers: Record<string, string> = { 'accept-language': ownHeader(navigator.languages) };
  for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
    headers[k.toLowerCase()] = v;
  }
  requestCount++;
  const req = {
    url: url.pathname + url.search,
    method: init.method ?? 'GET',
    headers,
    socket: { remoteAddress: `10.${(requestCount >> 8) & 255}.${requestCount & 255}.9` },
  } as unknown as IncomingMessage;
  let status = 200;
  let body = '';
  const res = {
    setHeader: () => res,
    writeHead: (code: number) => ((status = code), res),
    end: (data?: string) => ((body = data ?? ''), res),
  } as unknown as ServerResponse;
  await handleTokenRoutes(req, res, '/token', url);
  return new Response(body, { status });
}

const realFetch = globalThis.fetch;
const browserLanguages = (tags: string[]) =>
  Object.defineProperty(navigator, 'languages', { value: tags, configurable: true });

/** Start a call as `who` and return the metadata the agent would be dispatched with. */
async function callMetadata(who: string): Promise<Record<string, unknown>> {
  signedInAs.token = `tok-${who}`;
  dispatched.length = 0;
  await fetchConnectionToken({
    room: `room-${who}`,
    username: who,
    deviceId: `device-${who}`,
    personaId: 'ferni',
  } as Parameters<typeof fetchConnectionToken>[0]);
  expect(dispatched).toHaveLength(1);
  return dispatched[0]!;
}

describe('the app language reaches /token', () => {
  beforeEach(() => {
    globalThis.fetch = browserFetch as typeof fetch;
    profiles.clear();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it('a Spanish app in an English browser starts a Spanish-locale call', async () => {
    browserLanguages(['en-US', 'en']);
    await setLocale('es');
    const meta = await callMetadata('ana');
    expect(meta.locale).toBe('es');
    expect((meta.locales as string[])[0]).toBe('es');
    expect(meta.preferredAccent).toBe('american'); // from the browser's en-US, as before
  });

  it('still does when the person has a saved location', async () => {
    profiles.set('uid-bo-0000', {
      location: { city: 'Tampa', regionCode: 'FL', countryCode: 'US' },
    });
    browserLanguages(['en-US']);
    await setLocale('fr');
    const meta = await callMetadata('bo');
    expect(meta.city).toBe('Tampa');
    expect(meta.locale).toBe('fr');
  });

  it("an English app language leaves the browser's header: en-GB in an en-US browser stays American", async () => {
    browserLanguages(['en-US', 'en']);
    await setLocale('en-GB');
    const meta = await callMetadata('cy');
    expect(meta.locale).toBe('en-US');
    expect(meta.preferredAccent).toBe('american');
  });
});

/**
 * A UI language choice never changes Ferni's voice (lead decision on #2791): a
 * non-American accent swaps the persona voice for a Cartesia-localized one.
 *
 * Every app language x browser language list x saved location, through the real
 * web fetch and the real /token, against the same /token call carrying only the
 * browser's own header, which is what main's web sent (it set no Accept-Language).
 * This PR doesn't touch how /token picks the accent, so that call's accent is main's.
 */
describe('the accent never follows the app language', () => {
  const APP = ['en-US', 'en-GB', 'es', 'fr', 'ja', 'zh-Hant'] as const;
  const BROWSERS: string[][] = [
    ['en-US'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['en-AU'],
    ['en-NZ'],
    ['en-IN'],
    ['en-CA', 'fr-CA'],
    ['es-MX', 'en-US'],
    ['pt-BR', 'en-GB'],
    ['de-DE'],
    ['fr-FR', 'en'],
  ];
  const SAVED: Record<string, Record<string, unknown> | null> = {
    none: null,
    US: { location: { city: 'Tampa', regionCode: 'FL', countryCode: 'US' } },
    GB: { location: { city: 'Leeds', countryCode: 'GB' } },
  };

  /** The accent main's web got: the same call with only the browser's own header. */
  async function mainAccent(who: string, browser: string[]): Promise<unknown> {
    dispatched.length = 0;
    const res = await browserFetch(`/token?room=room-${who}-main&username=${who}`, {
      headers: { Authorization: `Bearer tok-${who}`, 'Accept-Language': ownHeader(browser) },
    });
    expect(res.status).toBe(200);
    return dispatched[0]?.preferredAccent;
  }

  beforeEach(() => {
    globalThis.fetch = browserFetch as typeof fetch;
    profiles.clear();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it(`is unchanged in all ${APP.length * BROWSERS.length * 3} cases`, async () => {
    const changed: string[] = [];
    let n = 0;
    for (const app of APP) {
      await setLocale(app);
      for (const browser of BROWSERS) {
        browserLanguages(browser);
        for (const [saved, profile] of Object.entries(SAVED)) {
          const who = `g${n++}`;
          if (profile) profiles.set(`uid-${who}-0000`, profile);
          const before = await mainAccent(who, browser);
          const after = (await callMetadata(who)).preferredAccent;
          if (after !== before)
            changed.push(
              `${app} | ${browser.join(',')} | ${saved}: ${String(before)} -> ${String(after)}`
            );
        }
      }
    }
    expect(n).toBe(APP.length * BROWSERS.length * 3);
    expect(changed).toEqual([]);
  });
});

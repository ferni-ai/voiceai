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

/** The browser's fetch, answered by the real /token handler; anything else fails. */
async function browserFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input), 'http://localhost:3000');
  if (url.pathname !== '/token') throw new Error(`unexpected request to ${url.href}`);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
    headers[k.toLowerCase()] = v;
  }
  const req = {
    url: url.pathname + url.search,
    method: init.method ?? 'GET',
    headers,
    socket: { remoteAddress: '198.51.100.9' },
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

  it("keeps the browser's region for the chosen language: en-AU stays Australian", async () => {
    browserLanguages(['en-AU', 'en']);
    await setLocale('en-GB');
    const meta = await callMetadata('cy');
    expect(meta.locale).toBe('en-AU');
    expect(meta.preferredAccent).toBe('australian');
  });
});

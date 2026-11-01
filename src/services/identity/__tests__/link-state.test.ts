/**
 * LINK_STATUS_V2: one connection-status reader over the real token stores, used by
 * the model's service-availability note and the link /status routes.
 *
 * Runs the real stores (the shared user token store for Google Calendar, Oura's
 * oura_tokens, the wearable store's doc for WHOOP) and the real persistence layer
 * over the Firestore fake. Only IntegrationHub (Spotify, Gmail, Plaid lines) is faked.
 * Fixtures are fictional.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const world = vi.hoisted(() => {
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
  process.env.OURA_CLIENT_ID = 'oura-id';
  process.env.OURA_CLIENT_SECRET = 'oura-secret';
  return { db: null as unknown };
});
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return world.db as object;
    }
  },
}));
const { isConnectedAsync } = vi.hoisted(() => ({ isConnectedAsync: vi.fn() }));
vi.mock('../../integrations/index.js', () => ({
  getIntegrationHub: () => ({ isConnectedAsync }),
}));

const firestore = newMergeFakeState();
world.db = createMergeFakeFirestore(firestore);

// The setup file mocks both Firestore-utils modules; point them at the same fake.
const firestoreUtils = [
  await import('../../../utils/firestore-utils.js'),
  await import('../../superhuman/firestore-utils.js'),
];
const { getLinkState, storedGrantState } = await import('../link-state.js');
const { googleTokenStore } = await import('../google-calendar-token-store.js');
const { saveOuraTokens } = await import('../oura-auth.js');
const { encryptData } = await import('../../../utils/token-encryption.js');
const { buildServiceAvailabilityInjection } =
  await import('../../../agents/processors/injection-builders/service-availability.js');
const { clearNonVolatileInjectionCache } =
  await import('../../../agents/processors/injection-builders/cache.js');
const { handleGoogleCalendarRoutes } =
  await import('../../../servers/api/routes/google-calendar.js');
const { handleWearablesRoutes } = await import('../../../servers/api/routes/wearables.js');

const AVA = 'uid-ava-5550101';
const BEN = 'uid-ben-5550102';
const LATER = Date.now() + 3_600_000;
const CALENDAR_SCOPES =
  'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';
const grant = (refresh = 'rt-ava') => ({
  access_token: 'at',
  refresh_token: refresh,
  expires_at: LATER,
  scope: CALENDAR_SCOPES,
});

async function availability(uid: string): Promise<string> {
  clearNonVolatileInjectionCache(uid);
  return (
    (await buildServiceAvailabilityInjection({ services: { userId: uid } } as never))?.content ?? ''
  );
}

async function route(
  handler: (req: IncomingMessage, res: ServerResponse, path: string, url: URL) => Promise<boolean>,
  path: string,
  uid: string
): Promise<Record<string, unknown>> {
  let body = '';
  const req = { headers: { 'x-firebase-uid': uid }, method: 'GET', url: path } as never;
  const res = {
    writeHead: () => res,
    setHeader: () => {},
    end: (b: string) => (body = b),
  } as never;
  await handler(req, res, path, new URL(`http://localhost${path}`));
  return JSON.parse(body) as Record<string, unknown>;
}

beforeEach(() => {
  for (const utils of firestoreUtils)
    vi.mocked(utils.getFirestoreDb).mockReturnValue(world.db as never);
  process.env.LINK_STATUS_V2 = 'on';
  isConnectedAsync.mockResolvedValue(false);
});
afterEach(async () => {
  delete process.env.LINK_STATUS_V2;
  delete process.env.WHOOP_CLIENT_ID;
  delete process.env.WHOOP_CLIENT_SECRET;
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
  await googleTokenStore.remove(AVA);
  await googleTokenStore.remove(BEN);
  firestore.docs.clear();
});

describe('getLinkState, flag on', () => {
  it('a linked caller is connected, and the model is no longer told NOT CONNECTED', async () => {
    await googleTokenStore.save(AVA, grant());
    expect(await getLinkState(AVA, 'google_calendar')).toEqual({
      state: 'connected',
      scopesOk: true,
    });
    const note = await availability(AVA);
    expect(note).not.toContain('Google Calendar: NOT CONNECTED');
    expect(note).toContain('Connected services: Google Calendar');
  });

  it('a needs_reauth doc reads needs_reauth, with honest copy for the model and the route', async () => {
    await googleTokenStore.save(AVA, grant());
    expect(await googleTokenStore.markNeedsReauth(AVA, 'invalid_grant', 'rt-ava')).toBe('recorded');
    const link = await getLinkState(AVA, 'google_calendar');
    expect(link.state).toBe('needs_reauth');
    expect(link.needsReauth?.errorClass).toBe('invalid_grant');
    const note = await availability(AVA);
    expect(note).toContain('your calendar link needs reconnecting');
    expect(note).not.toContain('Google Calendar: NOT CONNECTED');
    const status = await route(handleGoogleCalendarRoutes, '/auth/google/status', AVA);
    expect(status).toMatchObject({ linked: false, link_state: 'needs_reauth' });
  });

  it('reads the doc, not this process memory, after a reconnect through another process', async () => {
    await googleTokenStore.save(AVA, grant());
    await googleTokenStore.markNeedsReauth(AVA, 'invalid_grant', 'rt-ava'); // memory: needs_reauth
    // Another process saves a fresh grant: the doc changes, this process's memory does not.
    firestore.docs.set(`bogle_users/${AVA}/google_calendar_tokens/data`, {
      encrypted: encryptData(grant('rt-new')),
      updated_at: Date.now(),
      needs_reauth: null,
    });
    expect((await getLinkState(AVA, 'google_calendar')).state).toBe('connected');
  });

  it('no doc is not_connected, and the model still hears NOT CONNECTED', async () => {
    expect(await getLinkState(AVA, 'google_calendar')).toEqual({ state: 'not_connected' });
    expect(await availability(AVA)).toContain('Google Calendar: NOT CONNECTED');
  });

  it('missing client credentials are unconfigured, never "connect it"', async () => {
    await googleTokenStore.save(AVA, grant());
    process.env.GOOGLE_CALENDAR_CLIENT_ID = '';
    expect(await getLinkState(AVA, 'google_calendar')).toEqual({ state: 'unconfigured' });
    expect(await availability(AVA)).toContain('Google Calendar: NOT AVAILABLE YET');
    expect(await getLinkState(AVA, 'whoop')).toEqual({ state: 'unconfigured' });
  });

  it('a grant without the calendar scope is connected with scopesOk false, and not usable', async () => {
    await googleTokenStore.save(AVA, { ...grant(), scope: 'openid email' });
    expect(await getLinkState(AVA, 'google_calendar')).toEqual({
      state: 'connected',
      scopesOk: false,
    });
    expect(await availability(AVA)).toContain('LINKED WITHOUT CALENDAR ACCESS');
  });

  it('one caller never sees another caller state', async () => {
    await googleTokenStore.save(AVA, grant());
    const [ava, ben, avaNote, benNote] = await Promise.all([
      getLinkState(AVA, 'google_calendar'),
      getLinkState(BEN, 'google_calendar'),
      availability(AVA),
      availability(BEN),
    ]);
    expect(ava.state).toBe('connected');
    expect(ben.state).toBe('not_connected');
    expect(avaNote).not.toContain('Google Calendar: NOT CONNECTED');
    expect(benNote).toContain('Google Calendar: NOT CONNECTED');
    // Back to back, nothing cleared between: Ben's turn is never served Ava's note.
    const turn = async (uid: string) =>
      (await buildServiceAvailabilityInjection({ services: { userId: uid } } as never))?.content;
    expect(await turn(AVA)).not.toContain('Google Calendar: NOT CONNECTED');
    expect(await turn(BEN)).toContain('Google Calendar: NOT CONNECTED');
    expect((await route(handleGoogleCalendarRoutes, '/auth/google/status', BEN)).linked).toBe(
      false
    );
  });

  it('wearables read their own stores: Oura oura_tokens, WHOOP its wearable doc', async () => {
    process.env.WHOOP_CLIENT_ID = 'whoop-id';
    process.env.WHOOP_CLIENT_SECRET = 'whoop-secret';
    await saveOuraTokens(AVA, { ...grant(), token_type: 'bearer' });
    firestore.docs.set(`bogle_users/${AVA}/wearable_whoop_tokens/data`, {
      encrypted: encryptData({ access_token: 'at', expires_at: Date.now() - 1 }),
      provider: 'whoop',
      updated_at: Date.now(),
    });
    expect((await getLinkState(AVA, 'oura')).state).toBe('connected');
    expect((await getLinkState(BEN, 'oura')).state).toBe('not_connected');
    expect((await getLinkState(AVA, 'whoop')).state).toBe('needs_reauth'); // expired, no refresh token
    const { providers } = (await route(handleWearablesRoutes, '/wearables/status', AVA)) as {
      providers: Array<{ provider: string; linked: boolean; link_state?: string }>;
    };
    expect(providers.find((p) => p.provider === 'oura')).toMatchObject({
      linked: true,
      link_state: 'connected',
    });
    expect(providers.find((p) => p.provider === 'whoop')).toMatchObject({
      linked: false,
      link_state: 'needs_reauth',
    });
  });

  it('a grant that no longer opens needs a reconnect; an expired one with a refresh token does not', () => {
    expect(storedGrantState(null).state).toBe('needs_reauth');
    expect(storedGrantState({ refresh_token: 'rt', expires_at: 1 }, 2).state).toBe('connected');
    expect(storedGrantState({ expires_at: 1 }, 2).state).toBe('needs_reauth');
  });
});

describe('flag off: identical to main', () => {
  beforeEach(() => {
    delete process.env.LINK_STATUS_V2;
  });

  it('the model note still comes from IntegrationHub, word for word', async () => {
    await googleTokenStore.save(AVA, grant());
    isConnectedAsync.mockImplementation(async (_u: string, id: string) => id === 'spotify');
    expect(await availability(AVA)).toBe(`[🔌 SERVICE AVAILABILITY - What you CAN and CANNOT do]

The following services are NOT connected for this user:
- Google Calendar: NOT CONNECTED - Do NOT offer to schedule events, check your calendar, set reminders
- Gmail: NOT CONNECTED - Do NOT offer to send emails, read your inbox, draft messages
- Banking (Plaid): NOT CONNECTED - Do NOT offer to check account balances, review transactions, track spending

CRITICAL: Do NOT promise or offer features from disconnected services.
Instead, say "I'd need you to connect [Service] to do that" if the user asks.

Connected services: Spotify`);
  });

  it('the routes add no link fields', async () => {
    await googleTokenStore.save(AVA, grant());
    const status = await route(handleGoogleCalendarRoutes, '/auth/google/status', AVA);
    expect(status.linked).toBe(true);
    expect(status).not.toHaveProperty('link_state');
    const { providers } = (await route(handleWearablesRoutes, '/wearables/status', AVA)) as {
      providers: Array<Record<string, unknown>>;
    };
    expect(providers.every((p) => !('link_state' in p))).toBe(true);
  });
});

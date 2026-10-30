/**
 * LINK_STATUS_V2: the service-availability note follows the stores the connect
 * callbacks write, so a linked caller is not told "NOT CONNECTED".
 *
 * REAL: the builder, services/integrations/connection-status.ts, the Google
 * token store, spotify-link-status.ts. Mocked: the Firestore-backed persistence
 * store (one in-memory map per collection) and the hub's oauth_tokens read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  collections: new Map<string, Map<string, unknown>>(),
  unreadable: new Set<string>(), // uids whose load() throws, as a Firestore outage does
  loads: vi.fn(),
  hubConnected: vi.fn(),
}));

vi.mock('../../../../services/persistence/index.js', () => ({
  createPersistenceStore: ({ collection }: { collection: string }) => {
    const docs = () => {
      if (!h.collections.has(collection)) h.collections.set(collection, new Map());
      return h.collections.get(collection) as Map<string, unknown>;
    };
    return {
      load: async (id: string) => {
        h.loads(collection, id);
        if (h.unreadable.has(id)) throw new Error('firestore unavailable');
        return docs().get(id) ?? null;
      },
      get: async (id: string) => docs().get(id) ?? null,
      setImmediate: async () => undefined,
      delete: async () => undefined,
      shutdown: async () => undefined,
    };
  },
}));
vi.mock('../../../../services/integrations/integration-hub.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../services/integrations/integration-hub.js')
  >()),
  getIntegrationHub: () => ({ isConnectedAsync: h.hubConnected }),
}));

const { buildServiceAvailabilityInjection } = await import('../service-availability.js');
const { clearNonVolatileInjectionCache } = await import('../cache.js');
const { getLinkState } = await import('../../../../services/integrations/index.js');
const { SPOTIFY_LINK_COLLECTION } = await import('../../../../servers/token/oauth/spotify.js');

const ctx = (userId: string) => ({ services: { userId } }) as never;
const GMAIL = 'https://www.googleapis.com/auth/gmail.readonly';
const CAL = 'https://www.googleapis.com/auth/calendar';

/** Seed a grant the way the connect callback stores it (an unsealed JSON envelope reads back). */
function linkGoogle(uid: string, tokens: Record<string, unknown> = {}): void {
  const grant = {
    access_token: 'a',
    refresh_token: 'r',
    expires_at: Date.now() + 3_600_000,
    scope: `${CAL} ${GMAIL}`,
    ...tokens,
  };
  const docs = h.collections.get('google_calendar_tokens') ?? new Map();
  docs.set(uid, { encrypted: JSON.stringify(grant), updated_at: 1 });
  h.collections.set('google_calendar_tokens', docs);
}

describe('LINK_STATUS_V2', () => {
  beforeEach(() => {
    vi.stubEnv('LINK_STATUS_V2', 'on');
    h.hubConnected.mockResolvedValue(false); // the legacy collection: nothing ever writes it
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    h.collections.clear();
    h.unreadable.clear();
    h.loads.mockClear();
    for (const uid of ['linked', 'stranger', 'outage', 'expired'])
      clearNonVolatileInjectionCache(uid);
  });

  it('a linked Google user is connected and the prompt does not refuse Calendar or Gmail', async () => {
    linkGoogle('linked');
    expect(await getLinkState('linked', 'google_calendar')).toBe('connected');
    expect(await getLinkState('linked', 'gmail')).toBe('connected');

    const note = (await buildServiceAvailabilityInjection(ctx('linked')))?.content ?? '';
    expect(note).not.toContain('Google Calendar: NOT CONNECTED');
    expect(note).not.toContain('Gmail: NOT CONNECTED');
    expect(note).toContain('Spotify: NOT CONNECTED'); // never linked: still true
    expect(note).toContain('Connected services: Google Calendar, Gmail');
  });

  it("a linked Spotify user is connected (seeded under the connect callback's own collection name)", async () => {
    h.collections.set(
      SPOTIFY_LINK_COLLECTION,
      new Map([['linked', { encrypted: '{}', updated_at: 1 }]])
    );
    expect(await getLinkState('linked', 'spotify')).toBe('connected');
  });

  it('an unlinked user is not_connected and is told so', async () => {
    expect(await getLinkState('stranger', 'google_calendar')).toBe('not_connected');
    expect(await getLinkState('stranger', 'spotify')).toBe('not_connected');
    const note = (await buildServiceAvailabilityInjection(ctx('stranger')))?.content ?? '';
    expect(note).toContain('Google Calendar: NOT CONNECTED');
    expect(note).toContain('Spotify: NOT CONNECTED');
  });

  it('a Google grant without the Gmail scope has no inbox but still has a calendar', async () => {
    linkGoogle('linked', { scope: CAL });
    expect(await getLinkState('linked', 'google_calendar')).toBe('connected');
    expect(await getLinkState('linked', 'gmail')).toBe('not_connected');
  });

  it('a grant that cannot be refreshed is needs_reauth, not NOT CONNECTED', async () => {
    linkGoogle('expired', { refresh_token: '', expires_at: Date.now() - 1000 });
    expect(await getLinkState('expired', 'google_calendar')).toBe('needs_reauth');
    const note = (await buildServiceAvailabilityInjection(ctx('expired')))?.content ?? '';
    expect(note).not.toContain('Google Calendar: NOT CONNECTED');
    expect(note).toContain('must be reconnected');
  });

  it('a store read error is unknown: no false refusal, and it is looked up again next turn', async () => {
    h.unreadable.add('outage');
    expect(await getLinkState('outage', 'google_calendar')).toBe('unknown');
    expect(await getLinkState('outage', 'spotify')).toBe('unknown');

    const note = (await buildServiceAvailabilityInjection(ctx('outage')))?.content ?? '';
    expect(note).not.toContain('Google Calendar: NOT CONNECTED');
    expect(note).not.toContain('Gmail: NOT CONNECTED');
    expect(note).not.toContain('Spotify: NOT CONNECTED');
    expect(note).toContain('Could not check right now');
    expect(note).toContain('Do not say they are connected or that they are not');

    const before = h.loads.mock.calls.length;
    h.unreadable.delete('outage');
    linkGoogle('outage');
    const next = (await buildServiceAvailabilityInjection(ctx('outage')))?.content ?? '';
    expect(h.loads.mock.calls.length).toBeGreaterThan(before); // not served from a cached "unknown"
    expect(next).toContain('Connected services: Google Calendar, Gmail');
  });

  it('flag off: the legacy hub read decides, exactly as on main', async () => {
    vi.stubEnv('LINK_STATUS_V2', 'off');
    linkGoogle('linked'); // linked for real, but the hub (legacy collection) says no
    const note = (await buildServiceAvailabilityInjection(ctx('linked')))?.content ?? '';
    expect(note).toContain('Google Calendar: NOT CONNECTED - Do NOT offer to schedule events');
    expect(h.hubConnected).toHaveBeenCalledTimes(4);
    expect(h.loads).not.toHaveBeenCalled(); // the new stores are never read
  });
});

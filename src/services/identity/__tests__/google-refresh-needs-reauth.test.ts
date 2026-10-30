/**
 * Both Google refreshers (the agent's getValidAccessToken and the UI server's
 * refreshToken) go through the shared handler: a good refresh is unchanged, and
 * invalid_grant records needs_reauth where the status reader can find it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.hoisted(() => {
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
});
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: (config: { collection: string }) => {
    const path = (uid: string) => `bogle_users/${uid}/${config.collection}/data`;
    const read = async (uid: string) => firestore.get(path(uid)) ?? null;
    return {
      get: read,
      load: read,
      setImmediate: async (uid: string, data: Record<string, unknown>) => {
        firestore.set(path(uid), { ...firestore.get(path(uid)), ...data });
      },
      delete: async (uid: string) => void firestore.delete(path(uid)),
      shutdown: async () => {},
    };
  },
}));

const { googleTokenStore } = await import('../google-calendar-token-store.js');
const { getValidAccessToken } = await import('../google-calendar-oauth.js');
const { refreshToken } = await import('../../../servers/token/oauth/google-calendar.js');

const UID = 'google-user-abcdefghijklmnopqrs';
const EXPIRED = { access_token: 'at-old', refresh_token: 'rt-1', expires_at: 1 };
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(async () => {
  await googleTokenStore.shutdown();
  firestore.clear();
  vi.unstubAllGlobals();
  await googleTokenStore.save(UID, EXPIRED);
});

describe.each([
  ['agent getValidAccessToken', () => getValidAccessToken(UID)],
  ['UI server refreshToken', async () => (await refreshToken(UID))?.access_token ?? null],
])('%s', (_name, refresh) => {
  it('stores the new token and reports connected when the refresh works', async () => {
    vi.stubGlobal('fetch', reply(200, { access_token: 'at-new', expires_in: 3600 }));
    expect(await refresh()).toBe('at-new');
    expect(await googleTokenStore.get(UID)).toMatchObject({
      access_token: 'at-new',
      refresh_token: 'rt-1',
    });
    expect(await googleTokenStore.linkStatus(UID)).toEqual({ state: 'connected' });
  });

  it('records needs_reauth on invalid_grant and keeps the stored tokens', async () => {
    vi.stubGlobal('fetch', reply(400, { error: 'invalid_grant' }));
    expect(await refresh()).toBeNull();

    await googleTokenStore.shutdown();
    const status = await googleTokenStore.linkStatus(UID);
    expect(status.state).toBe('needs_reauth');
    expect(status.needsReauth?.errorClass).toBe('invalid_grant');
    expect(await googleTokenStore.get(UID)).toMatchObject({ refresh_token: 'rt-1' });
  });

  it('records nothing when Google is merely down', async () => {
    vi.stubGlobal('fetch', reply(503, { error: 'backend_error' }));
    expect(await refresh()).toBeNull();
    expect(await googleTokenStore.linkStatus(UID)).toEqual({ state: 'connected' });
  });
});

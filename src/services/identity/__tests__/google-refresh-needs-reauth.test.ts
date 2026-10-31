/**
 * Both Google refreshers (the agent's getValidAccessToken and the UI server's
 * refreshToken) go through the shared handler: a good refresh is unchanged, and
 * invalid_grant records needs_reauth where the status reader can find it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
  type MergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown }));

vi.hoisted(() => {
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'client-secret';
});
// The real persistence layer on the Firestore fake: the doc path is pinned, not mocked away
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firestore: class {
    constructor() {
      return fake.db as object;
    }
  },
}));

const state: MergeFakeState = newMergeFakeState();
fake.db = createMergeFakeFirestore(state);

const { googleTokenStore } = await import('../google-calendar-token-store.js');
const { getValidAccessToken, refreshAccessTokenForUser } =
  await import('../google-calendar-oauth.js');
const { refreshToken } = await import('../../../servers/token/oauth/google-calendar.js');

const UID = 'google-user-abcdefghijklmnopqrs';
const DOC = `bogle_users/${UID}/google_calendar_tokens/data`;
const EXPIRED = { access_token: 'at-old', refresh_token: 'rt-1', expires_at: 1 };
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(async () => {
  await googleTokenStore.shutdown();
  state.docs.clear();
  state.writes.length = 0;
  vi.unstubAllGlobals();
  await googleTokenStore.save(UID, EXPIRED);
});

it('keeps the link at bogle_users/{uid}/google_calendar_tokens/data', () => {
  expect([...state.docs.keys()]).toEqual([DOC]);
});

describe.each([
  ['agent getValidAccessToken', () => getValidAccessToken(UID), true],
  [
    'direct readers (busy detection, location calendar)',
    async () => (await refreshAccessTokenForUser(UID, 'rt-1'))?.access_token ?? null,
    false, // for one call only: the result is not stored
  ],
  ['UI server refreshToken', async () => (await refreshToken(UID))?.access_token ?? null, true],
])('%s', (_name, refresh, stores) => {
  it('returns the new token and reports connected when the refresh works', async () => {
    vi.stubGlobal('fetch', reply(200, { access_token: 'at-new', expires_in: 3600 }));
    expect(await refresh()).toBe('at-new');
    expect(await googleTokenStore.get(UID)).toMatchObject({
      access_token: stores ? 'at-new' : 'at-old',
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

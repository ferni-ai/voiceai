/**
 * The two readers that refresh a Google token for one call (busy detection and the location
 * calendar) go through the revocation handler: a revoked grant must show up as needs_reauth on
 * the stored link, whichever reader hit it. Reverting either to a raw refreshAccessToken(rt)
 * turns these red. Real store, real persistence, Firestore fake; only fetch is stubbed.
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
const { getCalendarBusyProfile } = await import('../../scheduling/calendar-busy-detection.js');
const { fetchUpcomingEvents } = await import('../../context-awareness/location-calendar.js');

const UID = 'direct-user-abcdefghijklmnopqrs';
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

describe.each([
  ['calendar-busy-detection getCalendarBusyProfile', () => getCalendarBusyProfile(UID)],
  ['location-calendar fetchUpcomingEvents', () => fetchUpcomingEvents(UID)],
])('%s with an expired token', (_name, run) => {
  it('records needs_reauth when Google says invalid_grant', async () => {
    const fetchMock = reply(400, { error: 'invalid_grant' });
    vi.stubGlobal('fetch', fetchMock);
    await run();

    expect(fetchMock).toHaveBeenCalledTimes(1); // it did try to refresh, with the stored token
    await googleTokenStore.shutdown();
    const status = await googleTokenStore.linkStatus(UID);
    expect(status.state).toBe('needs_reauth');
    expect(status.needsReauth?.errorClass).toBe('invalid_grant');
  });

  it('records nothing when Google is merely down', async () => {
    vi.stubGlobal('fetch', reply(503, { error: 'backend_error' }));
    await run();
    expect(await googleTokenStore.linkStatus(UID)).toEqual({ state: 'connected' });
  });
});

/**
 * The smart_home routes (Sonos, LIFX, Hue) and the Outlook calendar provider
 * wrote tokens in plaintext. Both now seal through token-at-rest, and every
 * reader accepts the sealed and the legacy shape.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
  };
  const logger = { debug: fn, info: fn, warn: fn, error: fn, trace: fn, fatal: fn };
  return { calls, logger: { ...logger, child: () => logger }, db: null as unknown };
});

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => h.logger,
  getLogger: () => h.logger,
}));
vi.mock('firebase-admin/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase-admin/firestore')>()),
  getFirestore: () => h.db,
}));
vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@google-cloud/firestore')>()),
  Firestore: function FakeFirestore() {
    return h.db;
  },
}));

const ACCESS = 'fixture-access-token-0001';
const REFRESH = 'fixture-refresh-token-0002';
const state = newMergeFakeState();
const doc = (path: string) => state.docs.get(path);
const noRawToken = (v: unknown) => {
  const s = JSON.stringify(v);
  for (const t of [ACCESS, REFRESH, 'fixture-lifx-token', 'fixture-hue-username']) {
    expect(s).not.toContain(t);
  }
};

describe('smart_home and Outlook tokens are sealed at rest', () => {
  const saved = process.env.OAUTH_ENCRYPTION_KEY;
  beforeAll(() => {
    h.db = createMergeFakeFirestore(state);
    process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.OAUTH_ENCRYPTION_KEY;
    else process.env.OAUTH_ENCRYPTION_KEY = saved;
  });
  beforeEach(() => state.docs.clear());
  afterEach(() => noRawToken(h.calls.splice(0))); // no token reaches the logger

  it('smart_home routes: sealed writes, legacy reads, earlier fields carried over', async () => {
    const routes = await import('../../../servers/api/routes/smart-home.js');
    const base = 'bogle_users/u1/smart_home';

    await routes.saveCredentials('u1', 'lifx', { token: 'fixture-lifx-token' });
    expect(Object.keys(doc(`${base}/lifx`)!)).toEqual(['encrypted']);
    noRawToken(doc(`${base}/lifx`));
    expect(await routes.getCredentials('u1', 'lifx')).toEqual({ token: 'fixture-lifx-token' });

    await routes.saveCredentials('u1', 'hue', {
      bridgeIp: '10.0.0.2',
      username: 'fixture-hue-username',
    });
    noRawToken(doc(`${base}/hue`));

    // A legacy plaintext Sonos doc: read as stored; a refresh seals it and keeps householdId.
    state.docs.set(`${base}/sonos`, {
      accessToken: 'old',
      refreshToken: REFRESH,
      householdId: 'hh-1',
    });
    expect(await routes.getCredentials('u1', 'sonos')).toMatchObject({ refreshToken: REFRESH });
    await routes.saveCredentials('u1', 'sonos', {
      accessToken: ACCESS,
      refreshToken: REFRESH,
      tokenExpiry: 1,
    });
    expect(Object.keys(doc(`${base}/sonos`)!)).toEqual(['encrypted']);
    noRawToken(doc(`${base}/sonos`));
    expect(await routes.getCredentials('u1', 'sonos')).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      tokenExpiry: 1,
      householdId: 'hh-1',
    });

    // HomeKit config is not token-shaped and is read as stored.
    state.docs.set(`${base}/homekit`, { enabled: true });
    expect(await routes.getCredentials('u1', 'homekit')).toEqual({ enabled: true });
  });

  it('the agent reader (user-credentials) opens what the routes sealed', async () => {
    const routes = await import('../../../servers/api/routes/smart-home.js');
    const creds = await import('../../smart-home/user-credentials.js');
    await routes.saveCredentials('u2', 'lifx', { token: 'fixture-lifx-token' });
    await routes.saveCredentials('u2', 'hue', {
      bridgeIp: '10.0.0.2',
      username: 'fixture-hue-username',
    });
    const all = await creds.getUserSmartHomeCredentials('u2');
    expect(all.lifx?.token).toBe('fixture-lifx-token');
    expect(all.hue?.username).toBe('fixture-hue-username');
    expect((await creds.getCredential('u2', 'lifx'))?.token).toBe('fixture-lifx-token');

    // Its own writer drops the sealed copy so it can't shadow the new fields.
    await creds.saveCredential('u2', 'lifx', { token: 'fixture-lifx-token' });
    expect(doc('bogle_users/u2/smart_home/lifx')).not.toHaveProperty('encrypted');
    expect((await creds.getCredential('u2', 'lifx'))?.token).toBe('fixture-lifx-token');
  });

  it('outlook: the tokens map is sealed over legacy plaintext, both forms read', async () => {
    const { OutlookCalendarProvider } =
      await import('../../calendar/providers/outlook-provider.js');
    const provider = new OutlookCalendarProvider() as unknown as {
      storeTokens: (uid: string, t: Record<string, unknown>) => Promise<void>;
      getTokens: (uid: string) => Promise<Record<string, unknown> | null>;
    };
    const path = 'users/u3/calendar_providers/outlook';
    state.docs.set(path, {
      provider: 'outlook',
      selectedCalendars: ['c1'],
      tokens: { accessToken: 'old', refreshToken: REFRESH, expiresAt: 1 },
    });
    expect((await provider.getTokens('u3'))?.refreshToken).toBe(REFRESH); // legacy read

    await provider.storeTokens('u3', { accessToken: ACCESS, refreshToken: REFRESH, expiresAt: 2 });
    const stored = doc(path)!;
    expect(stored.tokens).not.toHaveProperty('accessToken');
    expect(stored.tokens).not.toHaveProperty('refreshToken');
    expect(stored.tokens).toHaveProperty('encrypted');
    expect(stored.selectedCalendars).toEqual(['c1']);
    noRawToken(stored);
    expect(await provider.getTokens('u3')).toEqual({
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresAt: 2,
    });
  });
});

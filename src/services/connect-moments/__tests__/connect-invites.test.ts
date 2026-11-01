/**
 * Connect invites: single use, 30 minutes, redeemed only by the signed-in uid
 * they name (anyone else leaves them unspent), stored only as a hash, and dead
 * once the integration's flag is off. A spent invite is put back, with its own
 * expiry, only while its account exists and is not being erased.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeFirestore,
  newFakeFirestoreState,
} from '../../../tests/helpers/fake-firestore.js';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import {
  memorySingleUseStore,
  sha256Hex,
  type SingleUseStore,
} from '../../stores/single-use-records.js';
import {
  CONNECT_INVITE_TTL_MS,
  connectInviteUrl,
  createConnectInvite,
  deleteConnectInvitesFor,
  redeemConnectInvite,
  returnConnectInvite,
  setConnectInviteStore,
  type ConnectInvite,
} from '../connect-invites.js';

let store: SingleUseStore<ConnectInvite>;
const firestore = newFakeFirestoreState();

beforeEach(() => {
  vi.stubEnv('CONNECT_MOMENT_CALENDAR', 'on');
  firestore.docs.clear();
  for (const uid of ['user-ana', 'user-ben']) firestore.docs.set(`bogle_users/${uid}`, {});
  vi.mocked(getFirestoreDb).mockImplementation(createFakeFirestore(firestore) as never);
  store = memorySingleUseStore<ConnectInvite>(100);
  setConnectInviteStore(store);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setConnectInviteStore(null);
});

const invite = () =>
  createConnectInvite({ uid: 'user-ana', integration: 'calendar', sessionId: 's-1' });

const ANA = 'user-ana';
const BEN = 'user-ben';

describe('createConnectInvite / redeemConnectInvite', () => {
  it('redeems once for its own uid and integration, then never again', async () => {
    const token = await invite();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const first = await redeemConnectInvite(token, ANA);
    expect(first).toMatchObject({ uid: ANA, integration: 'calendar', sessionId: 's-1' });
    expect(await redeemConnectInvite(token, ANA)).toBeNull();
  });

  it("refuses someone else's account and leaves the invite for its owner", async () => {
    const token = (await invite()) as string;
    expect(await redeemConnectInvite(token, BEN)).toBeNull();
    expect(await store.get(sha256Hex(token))).not.toBeNull();
    expect((await redeemConnectInvite(token, ANA))?.uid).toBe(ANA);
  });

  it('has exactly one winner when the owner taps several times at once', async () => {
    const token = await invite();
    const results = await Promise.all([1, 2, 3, 4].map(() => redeemConnectInvite(token, ANA)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('keeps only the hash of the token, never the token', async () => {
    const token = (await invite()) as string;
    const stored = await store.get(sha256Hex(token));
    expect(stored?.uid).toBe(ANA);
    expect(await store.get(token)).toBeNull();
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('a returned invite keeps its original expiry', async () => {
    const token = (await invite()) as string;
    const spent = await redeemConnectInvite(token, ANA);
    if (!spent) throw new Error('the owner could not spend the invite');
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 10 * 60_000 });
    await returnConnectInvite(token, spent);
    expect((await store.get(sha256Hex(token)))?.expiresAt).toBe(spent.expiresAt);
  });

  it.each([
    ['gone', undefined],
    ['being erased', { erasing: true, erasingAt: '2026-11-02T10:00:00.000Z' }],
  ])('puts nothing back for an account that is %s', async (_state, record) => {
    const token = (await invite()) as string;
    const spent = await redeemConnectInvite(token, ANA);
    if (!spent) throw new Error('the owner could not spend the invite');
    if (record) firestore.docs.set(`bogle_users/${ANA}`, record);
    else firestore.docs.delete(`bogle_users/${ANA}`);
    await returnConnectInvite(token, spent);
    expect(await store.get(sha256Hex(token))).toBeNull();
  });

  it('puts nothing back when there is no Firestore to ask about the account', async () => {
    const token = (await invite()) as string;
    const spent = await redeemConnectInvite(token, ANA);
    if (!spent) throw new Error('the owner could not spend the invite');
    vi.mocked(getFirestoreDb).mockReturnValue(null as never);
    await returnConnectInvite(token, spent);
    expect(await store.get(sha256Hex(token))).toBeNull();
  });

  it('expires after 30 minutes, and the expired invite is deleted', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-02T10:00:00Z') });
    const token = (await invite()) as string;
    vi.setSystemTime(Date.now() + CONNECT_INVITE_TTL_MS + 1);
    expect(await redeemConnectInvite(token, ANA)).toBeNull();
    expect(await store.get(sha256Hex(token))).toBeNull();
  });

  it('is dead, and spent, once the flag is turned off', async () => {
    const token = (await invite()) as string;
    vi.stubEnv('CONNECT_MOMENT_CALENDAR', 'off');
    expect(await redeemConnectInvite(token, ANA)).toBeNull();
    vi.stubEnv('CONNECT_MOMENT_CALENDAR', 'on');
    expect(await redeemConnectInvite(token, ANA)).toBeNull();
  });

  it('ignores anything that is not a well-formed token without touching the store', async () => {
    const get = vi.spyOn(store, 'get');
    const take = vi.spyOn(store, 'take');
    const put = vi.spyOn(store, 'put');
    const record = { uid: ANA, integration: 'calendar' as const, createdAt: 0, expiresAt: 1 };
    for (const bad of [undefined, 42, '', 'short', `${'a'.repeat(43)}/`]) {
      expect(await redeemConnectInvite(bad, ANA)).toBeNull();
      await returnConnectInvite(bad, record);
    }
    expect(get).not.toHaveBeenCalled();
    expect(take).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('returns null rather than throwing when the store fails', async () => {
    vi.spyOn(store, 'put').mockRejectedValueOnce(new Error('down'));
    expect(await invite()).toBeNull();
    vi.spyOn(store, 'get').mockRejectedValueOnce(new Error('down'));
    expect(await redeemConnectInvite('a'.repeat(43), ANA)).toBeNull();
  });
});

describe('deleteConnectInvitesFor', () => {
  it("removes one user's invites and leaves another's", async () => {
    const ana = (await invite()) as string;
    const ben = (await createConnectInvite({ uid: BEN, integration: 'calendar' })) as string;
    expect(await deleteConnectInvitesFor(ANA)).toBe(1);
    expect(await redeemConnectInvite(ana, ANA)).toBeNull();
    expect((await redeemConnectInvite(ben, BEN))?.uid).toBe(BEN);
  });
});

describe('connectInviteUrl', () => {
  it('carries the token in the fragment only, and no uid', () => {
    const url = new URL(connectInviteUrl('t'.repeat(43)));
    expect(url.pathname).toBe('/connect');
    expect(url.search).toBe('');
    expect(url.hash).toBe(`#i=${'t'.repeat(43)}`);
  });
});

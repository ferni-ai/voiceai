/**
 * Single-use records on the Firestore emulator, for both stores built on them:
 * OAuth connect states (oauth_link_states) and connect-moment invites
 * (connect_invites). Each is used at most once even when taps race (`take` is
 * a transaction), an expired one is refused and deleted, the stored copy
 * carries ttlAt as a Timestamp for the TTL policy (TTL ignores numbers), and an
 * invite put back while its account is erased never outlives the erasure.
 *
 * The memory store can't show any of this: it runs on one thread, so a race
 * never interleaves. Runs in CI under data-layer-e2e.yml ("Run Single-Use
 * Record Tests"); skipped without FIRESTORE_EMULATOR_HOST.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DocumentReference,
  Timestamp,
  Transaction,
  type Firestore,
} from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { OAuthLinkRecord } from '../../../servers/token/oauth-link-state.js';
import type { ConnectInvite } from '../../connect-moments/connect-invites.js';
import { erasingMark } from '../../../utils/erasing-mark.js';

// The shared setup fakes Firestore for every test; here the store must reach the emulator
vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../../utils/firestore-utils.js', async () =>
  vi.importActual('../../../utils/firestore-utils.js')
);

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-single-use-records';
if (emulator) {
  // getFirestoreDb() resolves the project from these, in this order: pin them all
  vi.stubEnv('GCP_PROJECT_ID', PROJECT);
  vi.stubEnv('GOOGLE_CLOUD_PROJECT', PROJECT);
  vi.stubEnv('FIREBASE_PROJECT_ID', PROJECT);
  vi.stubEnv('GCLOUD_PROJECT', PROJECT);
  vi.stubEnv('OAUTH_STATE_STORE', 'firestore');
  vi.stubEnv('CONNECT_MOMENT_CALENDAR', 'on');
}

const { firestoreSingleUseStore, sha256Hex } = await import('../single-use-records.js');
const linkState = await import('../../../servers/token/oauth-link-state.js');
const invites = await import('../../connect-moments/connect-invites.js');
const { getFirestoreDb } = await import('../../../utils/firestore-utils.js');

const ROUNDS = 5;
const RACERS = 4;
const run = String(Date.now()).slice(-7);
const COOKIE = `${linkState.OAUTH_BINDING_COOKIE}=${'b'.repeat(43)}`;
const browser = { headers: { cookie: COOKIE } } as unknown as IncomingMessage;
const response = { setHeader: () => undefined } as unknown as ServerResponse;

let db: Firestore;
beforeAll(() => {
  if (!emulator) return;
  db = getFirestoreDb() as Firestore;
  linkState.setOAuthLinkStore(null);
  invites.setConnectInviteStore(null);
});

const winners = (results: unknown[]) => results.filter((r) => r !== null).length;
const raw = async (collection: string, secret: string) =>
  (await db.collection(collection).doc(sha256Hex(secret)).get()).data();

describe.skipIf(!emulator)('oauth_link_states on Firestore', () => {
  const startFlow = (uid: string) =>
    linkState.createOAuthLinkState(browser, response, { uid, provider: 'google', returnUrl: '/' });
  const consume = (state: string) => linkState.consumeOAuthLinkState(browser, state, 'google');

  it('a second consume returns null', async () => {
    const state = (await startFlow(`link-once-${run}`)) as string;
    expect((await consume(state))?.uid).toBe(`link-once-${run}`);
    expect(await consume(state)).toBeNull();
  });

  it(`${RACERS} concurrent consumes have exactly one winner, every round`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const state = (await startFlow(`link-race-${run}-${round}`)) as string;
      const results = await Promise.all(Array.from({ length: RACERS }, () => consume(state)));
      expect(winners(results), `round ${round}`).toBe(1);
    }
  });

  it('an expired state is refused and deleted', async () => {
    const state = 'e'.repeat(43);
    await firestoreSingleUseStore<OAuthLinkRecord>('oauth_link_states').put(sha256Hex(state), {
      uid: `link-expired-${run}`,
      provider: 'google',
      returnUrl: '/',
      bindingHash: sha256Hex('b'.repeat(43)),
      expiresAt: Date.now() - 1000,
    });
    expect(await consume(state)).toBeNull();
    expect(await raw('oauth_link_states', state)).toBeUndefined();
  });

  it('stores ttlAt as a Timestamp at expiresAt, keyed by the hash', async () => {
    const state = (await startFlow(`link-ttl-${run}`)) as string;
    const doc = await raw('oauth_link_states', state);
    expect(doc?.ttlAt).toBeInstanceOf(Timestamp);
    expect((doc?.ttlAt as Timestamp).toMillis()).toBe(doc?.expiresAt);
    expect(JSON.stringify(doc)).not.toContain(state);
  });
});

describe.skipIf(!emulator)('connect_invites on Firestore', () => {
  const inviteFor = async (uid: string) =>
    (await invites.createConnectInvite({ uid, integration: 'calendar' })) as string;

  it('a second redeem returns null', async () => {
    const uid = `invite-once-${run}`;
    const token = await inviteFor(uid);
    expect((await invites.redeemConnectInvite(token, uid))?.uid).toBe(uid);
    expect(await invites.redeemConnectInvite(token, uid)).toBeNull();
  });

  it(`${RACERS} concurrent redeems by the owner have exactly one winner, every round`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const uid = `invite-race-${run}-${round}`;
      const token = await inviteFor(uid);
      const results = await Promise.all(
        Array.from({ length: RACERS }, () => invites.redeemConnectInvite(token, uid))
      );
      expect(winners(results), `round ${round}`).toBe(1);
    }
  });

  it("someone else's redeem leaves the invite for its owner", async () => {
    const uid = `invite-owner-${run}`;
    const token = await inviteFor(uid);
    expect(await invites.redeemConnectInvite(token, `invite-other-${run}`)).toBeNull();
    expect(await raw('connect_invites', token)).toBeDefined();
    expect((await invites.redeemConnectInvite(token, uid))?.uid).toBe(uid);
  });

  it('an expired invite is refused and deleted', async () => {
    const uid = `invite-expired-${run}`;
    const token = 'x'.repeat(43);
    await firestoreSingleUseStore<ConnectInvite>('connect_invites').put(sha256Hex(token), {
      uid,
      integration: 'calendar',
      createdAt: Date.now() - invites.CONNECT_INVITE_TTL_MS - 1000,
      expiresAt: Date.now() - 1000,
    });
    expect(await invites.redeemConnectInvite(token, uid)).toBeNull();
    expect(await raw('connect_invites', token)).toBeUndefined();
  });

  it('stores ttlAt as a Timestamp at expiresAt, keyed by the hash, never the token', async () => {
    const token = await inviteFor(`invite-ttl-${run}`);
    const doc = await raw('connect_invites', token);
    expect(doc?.ttlAt).toBeInstanceOf(Timestamp);
    expect((doc?.ttlAt as Timestamp).toMillis()).toBe(doc?.expiresAt);
    expect(JSON.stringify(doc)).not.toContain(token);
  });

  it('puts a spent invite back, with its own expiry, for a live account', async () => {
    const uid = `invite-return-${run}`;
    await db.collection('bogle_users').doc(uid).set({ name: 'Ana Example' });
    const token = await inviteFor(uid);
    // Without the ttlAt the taken copy carries, so the restore must write its own.
    const { ttlAt: _taken, ...spent } = (await invites.redeemConnectInvite(
      token,
      uid
    )) as ConnectInvite & { ttlAt?: unknown };
    await invites.returnConnectInvite(token, spent);
    const doc = await raw('connect_invites', token);
    expect(doc?.expiresAt).toBe(spent.expiresAt);
    expect((doc?.ttlAt as Timestamp).toMillis()).toBe(spent.expiresAt);
  });

  it(`an invite put back during erasure never outlives it, every round`, async () => {
    // Erasure's order: mark the account, delete it (platform/erase-user-record.ts),
    // then sweep its invites (account-routes.ts LINKED_RECORDS).
    const erase = async (uid: string) => {
      const account = db.collection('bogle_users').doc(uid);
      await account.set(erasingMark(), { merge: true });
      await account.delete();
      await invites.deleteConnectInvitesFor(uid);
    };
    const txGet = Transaction.prototype.get;
    const docGet = DocumentReference.prototype.get;
    for (let round = 0; round < ROUNDS; round++) {
      const uid = `invite-erase-${run}-${round}`;
      await db.collection('bogle_users').doc(uid).set({ name: 'Ana Example' });
      const token = await inviteFor(uid);
      const spent = (await invites.redeemConnectInvite(token, uid)) as ConnectInvite;
      // The erasure starts the moment the restore has read the account, wherever it
      // reads it; the restore then gives it a second to finish before it writes.
      let erasure: Promise<void> | undefined;
      const afterRead = async <T>(ref: unknown, snap: T): Promise<T> => {
        if (ref instanceof DocumentReference && ref.path === `bogle_users/${uid}` && !erasure) {
          erasure = erase(uid);
          await Promise.race([
            erasure,
            new Promise<void>((done) => {
              setTimeout(done, 1000);
            }),
          ]);
        }
        return snap;
      };
      const inTx = vi.spyOn(Transaction.prototype, 'get').mockImplementation(async function (
        this: Transaction,
        ref: never
      ) {
        return afterRead(ref, await txGet.call(this, ref));
      } as never);
      const outside = vi
        .spyOn(DocumentReference.prototype, 'get')
        .mockImplementation(async function (this: DocumentReference) {
          return afterRead(this, await docGet.call(this));
        } as never);
      try {
        await invites.returnConnectInvite(token, spent);
        await erasure;
      } finally {
        inTx.mockRestore();
        outside.mockRestore();
      }
      expect(erasure, `round ${round}: the restore read the account`).toBeDefined();
      expect(await raw('connect_invites', token), `round ${round}`).toBeUndefined();
    }
  });
});

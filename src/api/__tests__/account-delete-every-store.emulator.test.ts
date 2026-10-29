/**
 * DELETE /api/account leaves nothing behind for the person, on the Firestore emulator.
 *
 * Before this, deletion erased only bogle_users/{uid}: users/{uid}/* (calendar, journal,
 * routines, practices, shared memories), user_seeds/{uid} and contact_relationships all
 * survived it (measured on the emulator 2026-10-12). User A and user B each get one
 * document in every known store (the stores below, written out here so the test does not
 * trust the list it checks, and every store in ERASED_STORES), each with a document under
 * it, since Firestore doesn't cascade. Then the real route and the real deleteAllData run
 * for A, and the whole database is scanned: nothing may name A, and all of B is still there.
 *
 * Stores keyed by something other than the uid are seeded the way their writers key them:
 * the waitlist and access grants by email, the sponsored phone index by identity, A/B test
 * assignments under each test, the router's turn events under each day, and tool-call
 * telemetry shared by many people in one doc.
 */
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CollectionReference, DocumentReference, Firestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { emailDocId, KEYED_STORES } from '../../services/platform/erase-other-keys.js';
import { eraseUserRecord } from '../../services/platform/erase-user-record.js';
import { ERASED_STORES, storeLabel } from '../../services/platform/user-stores.js';

/** The Firebase record each test uid signs in with: its email, whether Firebase verified it, its phone */
const firebaseUsers = vi.hoisted(
  () => new Map<string, { email?: string; emailVerified: boolean; phoneNumber?: string }>()
);
/** Uids whose Firebase lookup fails (a network error or quota, not "no such user") */
const lookupFails = vi.hoisted(() => new Set<string>());

// The shared setup fakes Firestore for every test; here the erase must reach the emulator
vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => true,
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUserOrThrow: vi.fn(async (uid: string) => {
    if (lookupFails.has(uid)) throw new Error('auth/internal-error: quota exceeded');
    const user = firebaseUsers.get(uid);
    return user ? { providerData: [], ...user } : null;
  }),
}));
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage) => {
    const uid = String(req.headers['x-test-uid']);
    return { userId: uid, firebaseUid: uid, isAdmin: false, authMethod: 'firebase' };
  }),
  rateLimit: vi.fn(() => false),
}));
vi.mock('../../services/security-events.js', () => ({
  recordSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
/** A project of its own: the test clears it first, then scans all of it */
const PROJECT = 'demo-account-delete';
if (emulator) {
  // getAdminFirestore() (here and in the erase) resolves the project from GCP_PROJECT_ID,
  // then GOOGLE_CLOUD_PROJECT, then FIREBASE_PROJECT_ID: pin all three, so the project the
  // test clears is the one it seeds, erases and scans
  vi.stubEnv('GCP_PROJECT_ID', PROJECT);
  vi.stubEnv('GOOGLE_CLOUD_PROJECT', PROJECT);
  vi.stubEnv('FIREBASE_PROJECT_ID', PROJECT);
  vi.stubEnv('GCLOUD_PROJECT', PROJECT);
}

/** Stores measured surviving deletion, credentials and the agent's stores, written out */
const MUST_ERASE = [
  'users/{uid}/calendar_events',
  'users/{uid}/journal',
  'users/{uid}/life_automation',
  'users/{uid}/practices',
  'users/{uid}/shared_memories',
  'user_seeds/{uid}',
  'contact_relationships[userId]',
  'contact_interactions[userId]',
  'households/{uid}',
  'sponsored_identities[sponsorUserId]',
  'engagement_profiles/{uid}',
  'bogle_users/{uid}/summaries',
  'bogle_users/{uid}/conversations',
  'bogle_users/{uid}/conversations/conv_1/timeline', // CALL_TIMELINE (call-timeline.ts)
  'bogle_users/{uid}/activity', // the activity ledger (activity-store.ts)
  'bogle_users/{uid}/activity/a_1/events', // each record's event log
  'bogle_users/{uid}/facts', // bi-temporal facts (facts-store.ts)
  'bogle_users/{uid}/user_contacts',
  'bogle_users/{uid}/outreach_attempts',
  'bogle_users/{uid}/wellbeing_snapshots',
  'bogle_users/{uid}/trust_profiles',
  'bogle_users/{uid}/relationship_arc',
  'bogle_users/{uid}/memory_highlights',
  'bogle_users/{uid}/voice_profile',
  'bogle_users/{uid}/google_calendar_tokens', // a credential inside the record
  'oura_tokens/{uid}',
  'apple_calendar_tokens/{uid}',
  'developer_oauth_tokens[userId]',
  'feature_checkins[userId]',
  'context_injection_outcomes[injection.userId]',
  'vectors[metadata.userId]', // the semantic index (#2971 verify)
  'memory_vectors[metadata.userId]',
  'user_profiles[firebaseUid]',
  // The router's stores of each turn and correction (no words since 2026-10-25)
  'routing_events[userId]',
  'semantic_router_corrections[userId]',
  'semantic_routing_feedback[userId]',
  'semantic_routing_vocabulary/{uid}',
  'semantic_routing_corrections/{uid}/corrections',
];

let db: Firestore;

beforeAll(async () => {
  if (!emulator) return;
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
});

/** One document in a store, and one under it: "a/{uid}/b" a subcollection, "a/{uid}" a doc, "a[f]" a field */
async function seed(store: string, uid: string): Promise<void> {
  const field = /^(.+)\[(.+)\]$/.exec(store);
  let doc: DocumentReference;
  if (field) {
    // "injection.userId" is a field inside a map
    // "grants.{uid}" is an entry keyed by the uid in a contact's consent record
    const value = field[2]!
      .replace('{uid}', uid)
      .split('.')
      .reduceRight<unknown>((v, key) => ({ [key]: v }), uid);
    doc = await db.collection(field[1]!).add({ ...(value as object), marker: 'seeded' });
  } else {
    const path = store.replace('{uid}', uid);
    doc = path.split('/').length % 2 === 0 ? db.doc(path) : db.collection(path).doc();
    await doc.set({ marker: 'seeded' });
  }
  await doc.collection('nested').add({ marker: 'under' });
}

/** True when any value in the document, however deep, is one of names */
const holds = (value: unknown, names: readonly string[]): boolean =>
  typeof value === 'string'
    ? names.includes(value)
    : typeof value === 'object' &&
      value !== null &&
      Object.values(value).some((v) => holds(v, names));

/** Every document in the database that names the person (uid or other keys), in its path or any field */
async function docsNaming(uid: string, ...otherKeys: string[]): Promise<string[]> {
  const names = [uid, ...otherKeys];
  const found: string[] = [];
  // A document under one that names uid is the person's too
  const walk = async (collections: CollectionReference[], underNamed: boolean): Promise<void> => {
    for (const collection of collections) {
      const [existing, refs] = await Promise.all([collection.get(), collection.listDocuments()]);
      const data = new Map(existing.docs.map((d) => [d.ref.path, d.data()]));
      for (const ref of refs) {
        const fields = data.get(ref.path);
        const named =
          underNamed ||
          ref.path.split('/').some((part) => names.includes(part)) ||
          holds(fields, names);
        if (named && fields) found.push(ref.path);
        await walk(await ref.listCollections(), named);
      }
    }
  };
  await walk(await db.listCollections(), false);
  return found;
}

/** DELETE /api/account through the real route handler, as the web calls it */
async function deleteAccount(uid: string): Promise<{ status: number; body: string }> {
  const { handleAccountRoutes } = await import('../account-routes.js');
  const req = new EventEmitter() as IncomingMessage;
  Object.assign(req, {
    method: 'DELETE',
    url: '/api/account',
    headers: { 'x-test-uid': uid, 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 200;
  let body = '';
  const done = new Promise<void>((resolve) => {
    const res = {
      headersSent: false,
      setHeader: () => undefined,
      writeHead: (code: number) => ((status = code), res),
      end: (chunk?: string) => ((body = chunk ?? ''), resolve()),
    };
    setTimeout(() => {
      req.emit('data', Buffer.from(JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' })));
      req.emit('end');
    }, 0);
    void handleAccountRoutes(req, res as unknown as ServerResponse, '/api/account');
  });
  await done;
  return { status, body };
}

/** The stores keyed by something other than the uid, as their writers key them; returns those keys */
async function seedOtherKeys(uid: string, email: string, phone: string): Promise<string[]> {
  const identity = await db.collection('sponsored_identities').add({ sponsorUserId: uid });
  await Promise.all([
    db.doc(`waitlist/${emailDocId(email)}`).set({ email, status: 'pending' }),
    db.doc(`user_profiles/${emailDocId(email)}`).set({ email, subscription: { tier: 'partner' } }),
    db.doc(`sponsored_identity_phone_index/${phone}`).set({ identityId: identity.id }),
    db.doc('ab_tests/t-tone').set({ name: 'tone test' }), // shared by everyone in the test
    db.doc(`ab_tests/t-tone/assignments/${uid}`).set({ userId: uid, testId: 't-tone' }),
    db.doc(`ab_tests/t-pace/assignments/${uid}`).set({ userId: uid, testId: 't-pace' }),
    // The router's turn events: one partition per day, the day documents never written
    db.doc(`semantic_router_events/2026-03-01/events/ev-${uid}`).set({ userId: uid }),
    db.doc(`semantic_router_events/2026-10-24/events/ev-${uid}`).set({ userId: uid }),
  ]);
  return [email, emailDocId(email), phone, identity.id];
}

describe.skipIf(!emulator)('DELETE /api/account erases every store kept for the person', () => {
  it('leaves no document naming the deleted user, and all of another user', async () => {
    const a = `del-a-${Date.now()}`;
    const b = `del-b-${Date.now()}`;
    firebaseUsers.set(a, { email: `${a}@example.com`, emailVerified: true });
    firebaseUsers.set(b, { email: `${b}@example.com`, emailVerified: true });
    const stores = [...new Set([...MUST_ERASE, ...ERASED_STORES.map(storeLabel)])];
    for (const uid of [a, b]) await Promise.all(stores.map((s) => seed(s, uid)));
    const aKeys = await seedOtherKeys(a, `${a}@example.com`, '+15550000001');
    const bKeys = await seedOtherKeys(b, `${b}@example.com`, '+15550000002');
    // Tool-call telemetry: both people's calls in one batch, written before calls lost their uid
    await db.doc('tool_usage_calls/batch_1700000000001').set({
      calls: [
        { toolId: 'weather', userId: a, sessionId: 's-a' },
        { toolId: 'music', userId: b, sessionId: 's-b' },
      ],
    });
    // A STOP for A's phone stays, so nobody texts that number again
    await db.doc('feature_checkin_optouts/hash-of-a-phone').set({ at: 'now', via: 'reply' });
    expect((await docsNaming(a, ...aKeys)).length).toBeGreaterThanOrEqual(MUST_ERASE.length + 6);
    const bBefore = (await docsNaming(b, ...bKeys)).sort();

    const res = await deleteAccount(a);

    expect(res.status, res.body).toBe(200);
    expect(await docsNaming(a, ...aKeys)).toEqual([]);
    expect((await docsNaming(b, ...bKeys)).sort()).toEqual(bBefore);
    expect((await db.doc('tool_usage_calls/batch_1700000000001').get()).get('calls')).toEqual([
      { toolId: 'weather', sessionId: 's-a' },
      { toolId: 'music', userId: b, sessionId: 's-b' },
    ]);
    expect((await db.doc('ab_tests/t-tone').get()).exists).toBe(true);
    expect((await db.doc('feature_checkin_optouts/hash-of-a-phone').get()).exists).toBe(true);
  }, 120_000);

  it("never erases by an unverified email, or another person's access grant", async () => {
    const c = `del-c-${Date.now()}`;
    const someoneElse = `del-x-${Date.now()}`;
    // Anyone can make an account claiming an address; only Firebase-verified ones count
    firebaseUsers.set(c, { email: 'victim@example.com', emailVerified: false });
    await db
      .doc(`waitlist/${emailDocId('victim@example.com')}`)
      .set({ email: 'victim@example.com' });
    const d = `del-d-${Date.now()}`;
    firebaseUsers.set(d, { email: 'shared@example.com', emailVerified: true });
    const grant = db.doc(`user_profiles/${emailDocId('shared@example.com')}`);
    await grant.set({ email: 'shared@example.com', firebaseUid: someoneElse });

    expect((await deleteAccount(c)).status).toBe(200);
    expect((await deleteAccount(d)).status).toBe(200);

    expect((await db.doc(`waitlist/${emailDocId('victim@example.com')}`).get()).exists).toBe(true);
    expect((await grant.get()).get('firebaseUid')).toBe(someoneElse);
  }, 60_000);

  it('fails, and erases nothing kept by email, when the Firebase lookup errors', async () => {
    const e = `del-e-${Date.now()}`;
    const email = `${e}@example.com`;
    firebaseUsers.set(e, { email, emailVerified: true });
    lookupFails.add(e);
    await db.doc(`waitlist/${emailDocId(email)}`).set({ email, status: 'pending' });
    await db
      .doc(`user_profiles/${emailDocId(email)}`)
      .set({ email, subscription: { tier: 'partner' } });

    const res = await deleteAccount(e);
    lookupFails.delete(e);

    // Not a 200 "all associated data deleted": the person can retry
    expect(res.status, res.body).toBe(500);
    expect((await db.doc(`waitlist/${emailDocId(email)}`).get()).exists).toBe(true);
    expect((await db.doc(`user_profiles/${emailDocId(email)}`).get()).exists).toBe(true);
    // The retry, once Firebase answers, erases them
    expect((await deleteAccount(e)).status).toBe(200);
    expect((await db.doc(`waitlist/${emailDocId(email)}`).get()).exists).toBe(false);
  }, 60_000);

  it('erases by the email on their access grant when the Firebase user is already gone', async () => {
    const g = `del-g-${Date.now()}`;
    const email = `${g}@example.com`; // no Firebase record: deleted by Apple, or a GDPR request
    await db
      .collection('user_profiles')
      .add({ email, firebaseUid: g, subscription: { tier: 'free' } });
    await db.doc(`waitlist/${emailDocId(email)}`).set({ email, status: 'approved' });

    expect((await deleteAccount(g)).status).toBe(200);

    expect((await db.doc(`waitlist/${emailDocId(email)}`).get()).exists).toBe(false);
    expect(await docsNaming(g, email)).toEqual([]);
  }, 60_000);

  it("erases the person's own phone profiles, and never another person's", async () => {
    const h = `del-h-${Date.now()}`;
    const n = String(Date.now()).slice(-7);
    const verified = `+1555${n}`; // the phone Firebase verified for this account
    const linked = `+1556${n}`; // linked to the profile after a texted code (linkPhoneToProfile)
    const authed = `+1557${n}`; // a phone profile that linked this sign-in (linkWebAuthToPhone)
    const similar = `+1555${n}1`; // someone else's number, one digit longer
    const other = `+1558${n}`; // someone else's, linked to their own sign-in
    firebaseUsers.set(h, { emailVerified: false, phoneNumber: verified });
    await db.doc(`bogle_users/${h}`).set({ linkedIdentifiers: [`phone:${linked}`] });
    for (const phone of [verified, linked]) {
      await db.doc(`bogle_users/phone:${phone}`).set({ name: 'Caller' });
      await db.doc(`bogle_users/phone:${phone}/summaries/s1`).set({ text: 'a call' });
      await db.collection('phone_mappings').add({ phone, userId: `phone:${phone}` });
      // The router's stores, as kept for the phone profile
      await db.doc(`semantic_routing_vocabulary/phone:${phone}`).set({ phrases: [] });
      await db.doc(`semantic_routing_corrections/phone:${phone}/corrections/c1`).set({ x: 1 });
      await db.collection('semantic_router_corrections').add({ userId: `phone:${phone}` });
      await db.collection('routing_events').add({ userId: `phone:${phone}` });
    }
    await db.doc(`bogle_users/phone:${authed}`).set({ linkedIdentifiers: [`auth:default:${h}`] });
    await db.doc(`bogle_users/phone:${similar}`).set({ name: 'Someone' });
    await db.doc(`bogle_users/phone:${similar}/summaries/s1`).set({ text: 'their call' });
    await db
      .doc(`bogle_users/phone:${other}`)
      .set({ linkedIdentifiers: ['auth:default:someone-else'] });
    // Linked to this sign-in and to someone else's: it is theirs too
    const shared = `+1559${n}`;
    await db
      .doc(`bogle_users/phone:${shared}`)
      .set({ linkedIdentifiers: [`auth:default:${h}`, 'auth:google.com:someone-else'] });

    expect((await deleteAccount(h)).status).toBe(200);

    expect(await docsNaming(h, `phone:${verified}`, `phone:${linked}`, `phone:${authed}`)).toEqual(
      []
    );
    expect((await db.doc(`bogle_users/phone:${similar}`).get()).exists).toBe(true);
    expect((await db.doc(`bogle_users/phone:${similar}/summaries/s1`).get()).exists).toBe(true);
    expect((await db.doc(`bogle_users/phone:${other}`).get()).exists).toBe(true);
    expect((await db.doc(`bogle_users/phone:${shared}`).get()).exists).toBe(true);
  }, 60_000);

  it('strips every batch still holding a uid, even one an old agent wrote after the new writer started', async () => {
    const k = `del-k-${Date.now()}`;
    firebaseUsers.set(k, { email: `${k}@example.com`, emailVerified: true });
    await db.collection('user_profiles').add({
      email: `${k}@example.com`,
      firebaseUid: k,
      subscription: { tier: 'partner', stripeCustomerId: `cus_${k}` },
    });
    const day = 24 * 60 * 60 * 1000;
    await db
      .doc('tool_usage_calls/batch_1700000000002')
      .set({ calls: [{ toolId: 'w', userId: k }] });
    // The new writer's batches carry no uid and are never rewritten
    await db
      .doc('tool_usage_calls/batch_1800000000000')
      .set({ calls: [{ toolId: 'music', sessionId: 's-k' }], noUserIds: true });
    const before = (await db.doc('tool_usage_calls/batch_1800000000000').get()).updateTime;
    // Two days later an agent not yet redeployed still writes the old way
    const late = `tool_usage_calls/batch_${1800000000000 + 2 * day}`;
    await db.doc(late).set({ calls: [{ toolId: 'x', userId: k }] });

    expect((await deleteAccount(k)).status).toBe(200);

    expect((await db.doc('tool_usage_calls/batch_1700000000002').get()).get('calls')).toEqual([
      { toolId: 'w' },
    ]);
    expect((await db.doc(late).get()).get('calls')).toEqual([{ toolId: 'x' }]);
    expect((await db.doc('tool_usage_calls/batch_1800000000000').get()).updateTime).toEqual(before);
    // The pointer billing needs to close the Stripe customer, without who it was
    const cleanup = await db.doc(`billing_cleanup/cus_${k}`).get();
    expect(cleanup.get('stripeCustomerId')).toBe(`cus_${k}`);
    expect(holds(cleanup.data(), [k, `${k}@example.com`])).toBe(false);
  }, 60_000);

  /** The keyed stores with the waitlist erase failing, as on a first attempt that hit an outage */
  const waitlistFails = KEYED_STORES.map((k) =>
    k.label === 'waitlist/{email}'
      ? {
          ...k,
          erase: async () => {
            throw new Error('unavailable');
          },
        }
      : k
  );

  it.each([
    ['the Firebase user is gone', undefined],
    ['their verified email changed since the grant', 'new-address@example.com'],
  ])(
    'a retry still erases the waitlist place when %s, because the grant naming the email outlives it',
    async (_case, currentEmail) => {
      const r = `del-r-${Date.now()}-${currentEmail ? 2 : 1}`;
      const email = `${r}@example.com`;
      if (currentEmail) firebaseUsers.set(r, { email: currentEmail, emailVerified: true });
      await db.doc(`user_profiles/${emailDocId(email)}`).set({ email, firebaseUid: r });
      await db.doc(`waitlist/${emailDocId(email)}`).set({ email, status: 'approved' });

      await expect(eraseUserRecord(r, db, ERASED_STORES, waitlistFails)).rejects.toThrow(
        'waitlist/{email}'
      );
      expect((await db.doc(`user_profiles/${emailDocId(email)}`).get()).exists).toBe(true);

      await eraseUserRecord(r, db);
      expect((await db.doc(`waitlist/${emailDocId(email)}`).get()).exists).toBe(false);
      expect((await db.doc(`user_profiles/${emailDocId(email)}`).get()).exists).toBe(false);
    },
    60_000
  );
});

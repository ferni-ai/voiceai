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
 */
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import admin from 'firebase-admin';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ERASED_STORES, storeLabel } from '../../services/platform/user-stores.js';

// The shared setup fakes Firestore for every test; here the erase must reach the emulator
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => true,
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUser: vi.fn(async () => null),
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
];

let db: admin.firestore.Firestore;

beforeAll(async () => {
  if (!emulator) return;
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
  db = admin.firestore();
});

/** One document in a store, and one under it: "a/{uid}/b" a subcollection, "a/{uid}" a doc, "a[f]" a field */
async function seed(store: string, uid: string): Promise<void> {
  const field = /^(.+)\[(.+)\]$/.exec(store);
  let doc: admin.firestore.DocumentReference;
  if (field) {
    doc = await db.collection(field[1]!).add({ [field[2]!]: uid, marker: 'seeded' });
  } else {
    const path = store.replace('{uid}', uid);
    doc = path.split('/').length % 2 === 0 ? db.doc(path) : db.collection(path).doc();
    await doc.set({ marker: 'seeded' });
  }
  await doc.collection('nested').add({ marker: 'under' });
}

/** Every document in the database that names uid, in its path or a top-level field */
async function docsNaming(uid: string): Promise<string[]> {
  const found: string[] = [];
  // A document under one that names uid is the person's too
  const walk = async (
    collections: admin.firestore.CollectionReference[],
    underNamed: boolean
  ): Promise<void> => {
    for (const collection of collections) {
      const [existing, refs] = await Promise.all([collection.get(), collection.listDocuments()]);
      const data = new Map(existing.docs.map((d) => [d.ref.path, d.data()]));
      for (const ref of refs) {
        const fields = data.get(ref.path);
        const named =
          underNamed ||
          ref.path.split('/').includes(uid) ||
          Object.values(fields ?? {}).includes(uid);
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

describe.skipIf(!emulator)('DELETE /api/account erases every store kept for the person', () => {
  it('leaves no document naming the deleted user, and all of another user', async () => {
    const a = `del-a-${Date.now()}`;
    const b = `del-b-${Date.now()}`;
    const stores = [...new Set([...MUST_ERASE, ...ERASED_STORES.map(storeLabel)])];
    for (const uid of [a, b]) await Promise.all(stores.map((s) => seed(s, uid)));
    expect((await docsNaming(a)).length).toBeGreaterThanOrEqual(MUST_ERASE.length);
    const bBefore = (await docsNaming(b)).sort();

    const res = await deleteAccount(a);

    expect(res.status, res.body).toBe(200);
    expect(await docsNaming(a)).toEqual([]);
    expect((await docsNaming(b)).sort()).toEqual(bBefore);
  }, 120_000);
});

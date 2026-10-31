/**
 * Team Insights and account erasure racing each other, on the Firestore emulator.
 *
 * #2833 verifier, item 4: the erasure deleted a user's sub-documents before their record
 * (bogle_users/{uid}). An insight write that read the record in that window, then found
 * no insights document, wrote the document back, with the insight's words, under an
 * erased user; from then on every later write got in too. Now the erasure first marks the
 * record `erasing` in a transaction (erase-user-record.ts markErasing) and still deletes
 * it last, and the write reads the record in its own transaction and drops itself
 * whenever the record is missing or marked (insight-store.ts).
 *
 * Each race is made deterministic by pausing the write's transaction at a chosen read.
 * Synthetic users only.
 */
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  CollectionReference,
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes firebase-admin and getFirestoreDb; the erasure and the insight
// store must both reach the emulator
vi.mock('firebase-admin/app', () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../utils/firestore-utils.js', () => vi.importActual('../../utils/firestore-utils.js'));
vi.mock('../../services/superhuman/firestore-utils.js', () =>
  vi.importActual('../../utils/firestore-utils.js')
);
/** The Firebase record each test uid signs in with (a verified phone, for the auth-linked profile) */
const firebaseUsers = vi.hoisted(() => new Map<string, { phoneNumber?: string }>());
vi.mock('../../services/identity/firebase-auth.js', () => ({
  setFirebaseUserDisabled: vi.fn(async () => 'done' as const),
  ensureFirebaseAdmin: () => true,
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUserOrThrow: vi.fn(async (uid: string) => ({
    providerData: [],
    emailVerified: false,
    ...firebaseUsers.get(uid),
  })),
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
/** A project of its own, cleared first */
const PROJECT = 'demo-menu-team-insights-erasure';
if (emulator) {
  vi.stubEnv('GCP_PROJECT_ID', PROJECT);
  vi.stubEnv('GOOGLE_CLOUD_PROJECT', PROJECT);
  vi.stubEnv('FIREBASE_PROJECT_ID', PROJECT);
  vi.stubEnv('GCLOUD_PROJECT', PROJECT);
}

let db: Firestore;

beforeAll(async () => {
  if (!emulator) return;
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  const { getAdminFirestore } = await import('../../utils/firebase-admin-app.js');
  db = getAdminFirestore();
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

const rid = () => Math.random().toString(36).slice(2, 10);
const recordOf = (uid: string) => db.doc(`bogle_users/${uid}`);
const docOf = (uid: string) => db.doc(`bogle_users/${uid}/team_insights/data`);

/** A signed-up user with one stored insight */
async function userWithInsights(uid: string): Promise<void> {
  const now = Date.now();
  await recordOf(uid).set({ id: uid, firstContact: new Date(now).toISOString() });
  await docOf(uid).set({
    insights: [
      {
        id: 'insight_stored',
        source: 'peter',
        target: 'all',
        priority: 'normal',
        content: 'Stored before the erasure',
        category: 'check_in',
        createdAt: now - 60_000,
        expiresAt: now + 3_600_000,
        proactive: true,
        oneTime: false,
      },
    ],
    _userId: uid,
  });
}

const note = {
  source: 'maya',
  target: 'all',
  priority: 'normal',
  content: 'Walks after dinner stick',
  category: 'behavior_pattern',
  proactive: true,
  oneTime: false,
} as const;

/** A voice-agent process: its own copy of the insight modules, sharing only Firestore */
async function agentProcess() {
  vi.resetModules();
  return {
    insights: await import('../../services/cross-persona/cross-persona-insights.js'),
    store: await import('../../services/cross-persona/insight-store.js'),
    firestoreUtils: await import('../../utils/firestore-utils.js'),
  };
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

/** Resolves when `p` settles or `ms` pass, whichever is first (an erasure may wait on the write) */
const settledOrAfter = async (p: Promise<unknown>, ms: number): Promise<void> => {
  await Promise.race([
    p.then(undefined, () => undefined),
    new Promise((r) => {
      setTimeout(r, ms);
    }),
  ]);
};

/** Every document in the project that names one of `names` in its path or its fields */
const holds = (value: unknown, names: readonly string[]): boolean =>
  typeof value === 'string'
    ? names.some((n) => value.includes(n))
    : typeof value === 'object' &&
      value !== null &&
      Object.values(value).some((v) => holds(v, names));
async function docsNaming(...names: string[]): Promise<string[]> {
  const found: string[] = [];
  const walk = async (collections: CollectionReference[], underNamed: boolean): Promise<void> => {
    for (const collection of collections) {
      const [existing, refs] = await Promise.all([collection.get(), collection.listDocuments()]);
      const data = new Map(existing.docs.map((d) => [d.ref.path, d.data()]));
      for (const ref of refs) {
        const fields = data.get(ref.path);
        const named = underNamed || names.some((n) => ref.path.includes(n)) || holds(fields, names);
        if (named && fields) found.push(ref.path);
        await walk(await ref.listCollections(), named);
      }
    }
  };
  await walk(await db.listCollections(), false);
  return found;
}

describe.skipIf(!emulator)('Team Insights, an erasure racing a write (Firestore emulator)', () => {
  it('an erasure that runs while a write has read the record, but not yet the insights, leaves nothing; DELETE /api/account answers 200', async () => {
    const uid = `race-${rid()}`;
    await userWithInsights(uid);
    const agent = await agentProcess();
    const firestore = agent.firestoreUtils.getFirestoreDb();
    if (!firestore) throw new Error('no Firestore client');

    // The write's first transaction attempt: the record read goes through, the insights
    // read waits for `release`
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let reachedInsights!: () => void;
    const atInsights = new Promise<void>((r) => {
      reachedInsights = r;
    });
    const recordReads: Array<Promise<unknown>> = [];
    let attempt = 0;
    const realRun = firestore.runTransaction.bind(firestore);
    vi.spyOn(firestore, 'runTransaction').mockImplementation((update, options) =>
      realRun(async (tx) => {
        attempt += 1;
        const first = attempt === 1;
        const realGet = tx.get.bind(tx) as (ref: unknown) => Promise<unknown>;
        (tx as unknown as { get: unknown }).get = (ref: { path: string }) => {
          if (ref.path === recordOf(uid).path) {
            const read = realGet(ref);
            if (first) recordReads.push(read);
            return read;
          }
          if (first && ref.path === docOf(uid).path) {
            reachedInsights();
            return gate.then(async () => realGet(ref));
          }
          return realGet(ref);
        };
        return update(tx as Transaction);
      }, options)
    );

    agent.insights.addCrossPersonaInsight(uid, note);
    await atInsights;
    await Promise.all(recordReads); // the record was read (it exists) before the erasure starts

    const erasing = deleteAccount(uid);
    await settledOrAfter(erasing, 3_000);
    release();
    const { status } = await erasing;
    await agent.store.insightWritesSettled();

    expect(status).toBe(200);
    expect((await recordOf(uid).get()).exists).toBe(false);
    expect((await docOf(uid).get()).exists).toBe(false);
    expect(await recordOf(uid).listCollections()).toEqual([]);

    // The same process writes again: still nothing
    vi.mocked(firestore.runTransaction).mockRestore();
    agent.insights.addCrossPersonaInsight(uid, { ...note, category: 'later' });
    await agent.store.insightWritesSettled();
    expect((await docOf(uid).get()).exists).toBe(false);
  }, 60_000);

  it('the record is read in the write’s own transaction: a write whose transaction starts after the erasure writes nothing', async () => {
    const uid = `late-${rid()}`;
    await userWithInsights(uid);
    const agent = await agentProcess();
    const firestore = agent.firestoreUtils.getFirestoreDb();
    if (!firestore) throw new Error('no Firestore client');

    // The write is held before its transaction starts; anything it read before that (outside
    // the transaction) is from before the erasure
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let reachedTransaction!: () => void;
    const atTransaction = new Promise<void>((r) => {
      reachedTransaction = r;
    });
    const realRun = firestore.runTransaction.bind(firestore);
    vi.spyOn(firestore, 'runTransaction').mockImplementation(async (update, options) => {
      reachedTransaction();
      await gate;
      return realRun(update, options);
    });

    agent.insights.addCrossPersonaInsight(uid, note);
    await atTransaction;
    const { eraseUserRecord } = await import('../../services/platform/erase-user-record.js');
    await eraseUserRecord(uid, db, undefined, []);
    expect((await recordOf(uid).get()).exists).toBe(false);
    expect((await docOf(uid).get()).exists).toBe(false);

    release();
    await agent.store.insightWritesSettled();

    expect((await docOf(uid).get()).exists).toBe(false);
    expect(await recordOf(uid).listCollections()).toEqual([]);
  }, 60_000);
  /**
   * The mark (not deleting the record first) is what stops the write, because a retry reads
   * the keys off the record: the phone profiles linked to it (erasure-keys.ts). Here the
   * first erasure fails partway through the auth-linked phone profile; the retry must still
   * find and erase both phone profiles and everything under them, and answer 200.
   */
  it('an erasure that fails partway keeps the record (marked) and its links; the retry erases everything, 200', async () => {
    const uid = `retry-${rid()}`;
    const n = String(Date.now()).slice(-7);
    const authed = `phone:+1555${n}`; // the phone Firebase verified for this sign-in
    const linked = `phone:+1556${n}`; // linked to the record after a texted code
    firebaseUsers.set(uid, { phoneNumber: authed.slice('phone:'.length) });
    await userWithInsights(uid);
    await recordOf(uid).set({ linkedIdentifiers: [linked] }, { merge: true });
    for (const id of [authed, linked]) {
      await userWithInsights(id);
      for (const i of [1, 2])
        await db.doc(`bogle_users/${id}/summaries/s${i}`).set({ text: 'a call' });
    }

    // The first pass over the auth-linked profile deletes one document, then fails
    const proto = Object.getPrototypeOf(db) as Firestore;
    const realRecursiveDelete = proto.recursiveDelete;
    let failures = 0;
    vi.spyOn(proto, 'recursiveDelete').mockImplementation(async function (
      this: Firestore,
      ref,
      writer
    ) {
      if (failures === 0 && (ref as DocumentReference).path === recordOf(authed).path) {
        failures += 1;
        await db.doc(`bogle_users/${authed}/summaries/s1`).delete();
        throw Object.assign(new Error('14 UNAVAILABLE: injected'), { code: 14 });
      }
      return realRecursiveDelete.call(this, ref, writer);
    });

    expect((await deleteAccount(uid)).status).toBe(500);
    expect(failures).toBe(1);
    // Nothing of the user's own record went: it is marked, and its links are still there
    const record = (await recordOf(uid).get()).data();
    // ...with every field it had (the account still works; only marked writers stop)
    expect(record).toMatchObject({ id: uid, erasing: true, linkedIdentifiers: [linked] });
    expect((await docOf(uid).get()).exists).toBe(true);
    // A write meanwhile (a live call) adds nothing, to the user or the phone profile left
    const agent = await agentProcess();
    agent.insights.addCrossPersonaInsight(uid, note);
    agent.insights.addCrossPersonaInsight(authed, note);
    await agent.store.insightWritesSettled();
    for (const id of [uid, authed]) {
      const stored = ((await docOf(id).get()).data()?.insights ?? []) as Array<{ id: string }>;
      expect(stored.map((i) => i.id)).toEqual(['insight_stored']);
    }

    expect((await deleteAccount(uid)).status).toBe(200);
    // The retry clears everything, the records (and with them the mark) last
    for (const id of [uid, authed, linked]) expect((await recordOf(id).get()).exists).toBe(false);
    expect(await docsNaming(uid, authed, linked)).toEqual([]);
    for (const id of [uid, authed, linked])
      expect(await recordOf(id).listCollections()).toEqual([]);
  }, 120_000);
});

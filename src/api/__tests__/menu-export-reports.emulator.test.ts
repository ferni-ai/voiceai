/**
 * Take Your Story carries the reports a person made, with their own words: the replies they
 * reported (POST /api/reports, reply_reports). The voice agent stores a call's turns as
 * session-manager does, the real route stores the reports, then the real export runs on the
 * Firestore emulator. Only the person's own reports leave, and only the allowlisted fields.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Firestore } from '@google-cloud/firestore';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { exportUserRecords } from '../../services/platform/user-records-export.js';

// src/tests/setup.ts fakes getFirestoreDb for every test; the route and the agent write through it
vi.mock('../../utils/firestore-utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../utils/firestore-utils.js')>(
    '../../utils/firestore-utils.js'
  );
  return { ...actual, getFirestoreDb: vi.fn(actual.getFirestoreDb) };
});
vi.mock('../../services/platform/ops-alert.js', () => ({ opsAlert: vi.fn(() => true) }));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => true,
  getFirebaseUserOrThrow: async () => null, // no Firebase user: no proven phone profiles
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-export-reports';

let server: Server;
let base: string;
let db: Firestore;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

/** Auth is not under test here: the caller is whoever x-test-uid names. */
const authenticate = async (req: IncomingMessage) => {
  const uid = req.headers['x-test-uid'];
  return typeof uid === 'string' ? { userId: uid, isAnonymous: false } : null;
};

beforeAll(async () => {
  if (!emulator) return;
  const { handleReplyReportRoutes } = await import('../reply-reports/reply-report-routes.js');
  const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
  db = getFirestoreDb() as Firestore;
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    void handleReplyReportRoutes(req, res, url.pathname, {
      authenticate,
      getDb: () => db,
      now: Date.now,
    }).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

/** One call as session-manager.ts writes it: the person's turn, then Ferni's reply. */
async function call(uid: string, said: string, reply: string): Promise<number> {
  const realtime = await import('../../services/memory/realtime-memory.js');
  const id = await realtime.startConversation(uid, 'ferni');
  const T0 = Date.now() + 1_000;
  await realtime.persistTurn(uid, id, { role: 'user', content: said, timestamp: new Date(T0) });
  await realtime.persistTurn(uid, id, {
    role: 'assistant',
    content: reply,
    timestamp: new Date(T0 + 4_000),
  });
  return T0 + 5_000; // when the reply was on screen
}

async function report(uid: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${base}/api/reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-uid': uid },
    body: JSON.stringify({ sessionId: 'voice-1760799600000', reason: 'harmful', ...body }),
  });
  expect(res.status).toBe(201);
}

const exportOf = async (uid: string) =>
  exportUserRecords(uid, undefined, db as unknown as FirebaseFirestore.Firestore);

/** The fields a reply report exports (user-records-owned-elsewhere.ts), plus the doc id */
const REPLY_REPORT_KEYS = [
  'id',
  'reason',
  'note',
  'sessionId',
  'messageAt',
  'userTurnText',
  'replyText',
  'replyAt',
  'personaId',
  'platform',
  'createdAt',
].sort();

describe.skipIf(!emulator)('export carries the reports a person made (Firestore emulator)', () => {
  it("reply_reports: the person's reports with their words, nobody else's, allowlisted fields", async () => {
    const [a, b] = [newUser(), newUser()];
    const A_SAID = 'My knee hurts when I run downhill, what should I do?';
    const A_REPLY = 'Just run through the pain, it builds character.';
    const shownA = await call(a, A_SAID, A_REPLY);
    const shownB = await call(b, 'B private turn about my sister', 'B private reply');
    await report(a, {
      messageAt: shownA,
      note: 'A note: this could hurt someone',
      platform: 'ios',
      appVersion: '1.4.2',
    });
    await report(a, { messageAt: Date.now() - 60_000, reason: 'wrong' }); // no call there, no note
    await report(b, { messageAt: shownB, note: 'B note: not for A', platform: 'web' });

    const out = await exportOf(a);
    const rows = out.reply_reports as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    const text = JSON.stringify(rows);
    // A's own words: the note, the turn they reported, and the reply as the transcript has it
    expect(text).toContain('A note: this could hurt someone');
    expect(text).toContain(A_SAID);
    expect(text).toContain(A_REPLY);
    expect(rows.map((r) => r.reason).sort()).toEqual(['harmful', 'wrong']);
    // Nothing of B's
    expect(JSON.stringify(out)).not.toContain('B note');
    expect(JSON.stringify(out)).not.toContain('B private');
    expect(JSON.stringify(out)).not.toContain(b);
    // Only the allowlisted fields: no uid, matching ids, versions or triage status
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(REPLY_REPORT_KEYS);

    // And B's export has B's report, not A's
    const theirs = (await exportOf(b)).reply_reports as Array<Record<string, unknown>>;
    expect(theirs.map((r) => r.note)).toEqual(['B note: not for A']);
  }, 60_000);
});

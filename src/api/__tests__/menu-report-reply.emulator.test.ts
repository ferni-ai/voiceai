/**
 * Reporting a reply, call → report: the voice agent stores a call's turns
 * (realtime-memory persistTurn, as session-manager does for every call), then the
 * person reports one of Ferni's replies through POST /api/reports, the route the
 * web app and the iPhone app call. The stored report must carry the reply and the
 * person's turn before it as the transcript has them, never text the client sent,
 * only from the caller's own calls, and within the daily limit.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Firestore } from '@google-cloud/firestore';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// src/tests/setup.ts fakes getFirestoreDb for every test; the route reads through it.
vi.mock('../../utils/firestore-utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../utils/firestore-utils.js')>(
    '../../utils/firestore-utils.js'
  );
  return { ...actual, getFirestoreDb: vi.fn(actual.getFirestoreDb) };
});
const alerts = vi.hoisted(() => ({ opsAlert: vi.fn(() => true) }));
vi.mock('../../services/platform/ops-alert.js', () => alerts);
// Every log line any module writes, kept outside vi.fn so clearMocks can't empty it
const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/safe-logger.js')>();
  const push = (...args: unknown[]) => void logged.push(args);
  const recorder = (): Record<string, unknown> => {
    const l: Record<string, unknown> = { debug: push, info: push, warn: push, error: push };
    return Object.assign(l, { trace: push, fatal: push, child: () => l });
  };
  return { ...actual, createLogger: recorder, getLogger: recorder };
});

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-report-reply';

let server: Server;
let base: string;
let db: Firestore;
const newUser = () => `u-${Math.random().toString(36).slice(2)}`;

/** Auth is not under test here: the caller is whoever x-test-uid names. */
const authenticate = async (req: IncomingMessage) => {
  const uid = req.headers['x-test-uid'];
  return typeof uid === 'string' ? { userId: uid, isAnonymous: true } : null;
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

const USER_1 = 'I keep waking up at three and I cannot get back to sleep.';
const REPLY_1 = 'That sounds exhausting. What usually goes through your head at three?';
const USER_2 = 'Mostly work. Should I just take something to knock me out?';
const REPLY_2 = 'You could double whatever sleeping pills you have, that usually does it.';
const REPLY_3 = 'Actually, scratch that. Please check with a pharmacist before changing a dose.';

/** One call as session-manager.ts writes it: start, then each turn as it happens. */
async function callLikeTheAgent(uid: string): Promise<{ id: string; T0: number }> {
  const realtime = await import('../../services/memory/realtime-memory.js');
  const id = await realtime.startConversation(uid, 'ferni');
  const T0 = Date.now() + 1_000;
  const turns: Array<['user' | 'assistant', string, number]> = [
    ['user', USER_1, T0],
    ['assistant', REPLY_1, T0 + 4_000],
    ['user', USER_2, T0 + 20_000],
    ['assistant', REPLY_2, T0 + 24_000],
    ['assistant', REPLY_3, T0 + 32_000], // Ferni follows up without being asked
  ];
  for (const [role, content, at] of turns) {
    // In order, as the agent writes them
    // eslint-disable-next-line no-await-in-loop
    await realtime.persistTurn(uid, id, { role, content, timestamp: new Date(at) });
  }
  return { id, T0 };
}

async function report(uid: string, body: Record<string, unknown>) {
  const res = await fetch(`${base}/api/reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-uid': uid },
    body: JSON.stringify({ sessionId: 'voice-1760799600000', reason: 'harmful', ...body }),
  });
  const json = (await res.json()) as { reportId?: string; matched?: boolean };
  const stored = json.reportId
    ? (await db.collection('reply_reports').doc(json.reportId).get()).data()
    : undefined;
  return { status: res.status, json, stored };
}

describe.skipIf(!emulator)('reporting a reply, call to report (Firestore emulator)', () => {
  it("stores the transcript's reply and the turn before it, not the client's words", async () => {
    const uid = newUser();
    const { id: conversationId, T0 } = await callLikeTheAgent(uid);
    // The caption showed one spoken segment, a little after the turn was stored
    const { status, json, stored } = await report(uid, {
      messageAt: T0 + 26_000,
      textHint: 'double whatever sleeping pills',
      note: 'This is dangerous advice',
      appVersion: '1.0.1',
      platform: 'android',
    });

    expect(status).toBe(201);
    expect(json.matched).toBe(true);
    expect(stored).toMatchObject({
      uid,
      reason: 'harmful',
      note: 'This is dangerous advice',
      matched: true,
      matchedBy: 'text_and_time',
      conversationId,
      replyText: REPLY_2,
      userTurnText: USER_2,
      personaId: 'ferni',
      appVersion: '1.0.1',
      platform: 'android',
      status: 'open',
    });
    expect(Object.values(stored ?? {})).not.toContain('double whatever sleeping pills');
  });

  it('a reply the transcript never had is not stored, even if the client sends it', async () => {
    const uid = newUser();
    const { T0 } = await callLikeTheAgent(uid);
    const invented = 'Ferni told me to drive after drinking';
    const { stored } = await report(uid, { messageAt: T0 + 5_000, textHint: invented });

    expect(stored?.replyText).toBe(REPLY_1); // the nearest real reply
    expect(stored?.matchedBy).toBe('time');
    expect(JSON.stringify(stored)).not.toContain(invented);
  });

  it('the on-screen words pick the right reply when the time alone points elsewhere', async () => {
    const uid = newUser();
    const { T0 } = await callLikeTheAgent(uid);
    // Halfway between the two replies, nearer the first, with words from the second
    const { stored } = await report(uid, {
      messageAt: T0 + 12_000,
      textHint: 'You could double whatever sleeping pills you have',
    });
    expect(stored?.replyText).toBe(REPLY_2);
    expect(stored?.userTurnText).toBe(USER_2);
  });

  it("a follow-up reply keeps the person's last words, not Ferni's previous reply", async () => {
    const uid = newUser();
    const { T0 } = await callLikeTheAgent(uid);
    const { stored } = await report(uid, {
      messageAt: T0 + 33_000,
      textHint: 'check with a pharmacist',
    });
    expect(stored?.replyText).toBe(REPLY_3);
    expect(stored?.userTurnText).toBe(USER_2);
  });

  it('finds a reply by turn id inside a named call', async () => {
    const uid = newUser();
    const { id: conversationId } = await callLikeTheAgent(uid);
    const turns = await db
      .collection('bogle_users')
      .doc(uid)
      .collection('conversations')
      .doc(conversationId)
      .collection('turns')
      .get();
    const first = turns.docs.find((d) => d.data().content === REPLY_1);
    const theirOwn = turns.docs.find((d) => d.data().content === USER_1);

    const { stored } = await report(uid, { sessionId: conversationId, turnId: first?.id });
    expect(stored).toMatchObject({ matchedBy: 'turn_id', turnId: first?.id, replyText: REPLY_1 });
    expect(stored?.userTurnText).toBe(USER_1);
    // Only Ferni's turns can be reported, not the person's own words
    const own = await report(uid, { sessionId: conversationId, turnId: theirOwn?.id });
    expect(own.stored).toMatchObject({ matched: false, replyText: null });
  });

  it("can't pull someone else's call into a report", async () => {
    const owner = newUser();
    const { id: conversationId, T0 } = await callLikeTheAgent(owner);
    const other = newUser();

    const { status, stored } = await report(other, {
      sessionId: conversationId,
      messageAt: T0 + 24_000,
      textHint: 'sleeping pills',
    });
    expect(status).toBe(201); // the report itself is kept, for a person to look at
    expect(stored).toMatchObject({ uid: other, matched: false, replyText: null });
    expect(stored?.userTurnText).toBeNull();
  });

  it('takes 20 reports a day from one person, then says no until tomorrow', async () => {
    const uid = newUser();
    const { T0 } = await callLikeTheAgent(uid);
    const day = new Date().toISOString().slice(0, 10);
    const quota = db.collection('reply_report_quota').doc(uid);

    await quota.set({ day, count: 19 });
    expect((await report(uid, { messageAt: T0 + 4_000 })).status).toBe(201);
    const refused = await report(uid, { messageAt: T0 + 4_000 });
    expect(refused.status).toBe(429);
    expect(refused.json.reportId).toBeUndefined();
    expect((await quota.get()).data()?.count).toBe(20);

    await quota.set({ day: '2026-01-01', count: 20 }); // yesterday's count
    expect((await report(uid, { messageAt: T0 + 4_000 })).status).toBe(201);
  });

  it('rejects a reason outside the four and a note over 500 characters', async () => {
    const uid = newUser();
    const T0 = Date.now();
    expect((await report(uid, { messageAt: T0, reason: 'spam' })).status).toBe(400);
    expect((await report(uid, { messageAt: T0, note: 'x'.repeat(501) })).status).toBe(400);
    expect((await report(uid, { reason: 'wrong' })).status).toBe(400); // names no reply
  });

  it('never writes reply or note text to the logs', async () => {
    const uid = newUser();
    const { T0 } = await callLikeTheAgent(uid);
    logged.length = 0; // only what the report wrote (the agent's own debug lines are not this route's)
    await report(uid, { messageAt: T0 + 24_000, note: 'please look at this one' });

    const lines = JSON.stringify(logged);
    expect(lines).toContain('Reply reported'); // the route did log
    expect(lines).not.toContain('sleeping pills');
    expect(lines).not.toContain('please look at this one');
  });

  it('the daily summary sends counts by reason, and no text', async () => {
    const { runReplyReportSummary } = await import('../reply-reports/reply-report-summary.js');
    const uid = newUser();
    const { T0 } = await callLikeTheAgent(uid);
    const before = await runReplyReportSummary(db);
    await report(uid, { messageAt: T0 + 24_000, reason: 'wrong' });
    await report(uid, { messageAt: T0 + 4_000, reason: 'inappropriate' });
    await report(newUser(), { messageAt: T0 + 4_000, reason: 'other' }); // no call: unmatched

    alerts.opsAlert.mockClear();
    const after = await runReplyReportSummary(db);
    expect(after.total).toBe(before.total + 3);
    expect(after.unmatched).toBe(before.unmatched + 1);
    expect(after.byReason.wrong).toBe(before.byReason.wrong + 1);
    expect(after.byReason.inappropriate).toBe(before.byReason.inappropriate + 1);
    expect(alerts.opsAlert).toHaveBeenCalledTimes(1);
    const [key, , details] = alerts.opsAlert.mock.calls[0] as unknown as [string, string, object];
    expect(key).toBe('reply-reports:daily');
    expect(JSON.stringify(details)).not.toMatch(/sleeping|exhausting/);
  });
});

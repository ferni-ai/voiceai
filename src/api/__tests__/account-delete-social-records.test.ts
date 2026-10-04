/**
 * DELETE /api/account also removes the user's social game records, which live
 * in shared collections the deleteAllData sweep never reached:
 * - Musical You and social challenges they sent or received. Open ones are
 *   resolved first, freeing the other party's open-challenge slot (otherwise
 *   a deleted user's 50 unanswered challenges would block their friends);
 * - both open-challenge slots documents;
 * - Musical You leaderboard entries (every board, via the membership list)
 *   and social game stats.
 * Same A/B shape as account-delete-linked-records: seed A and B, delete A, A's
 * records are gone and B's remain.
 *
 * Real route and real services over the shared fake Firestore (K_SERVICE set);
 * the token verifier, deleteAllData, Firebase user deletion and the push,
 * OAuth and Apple sweeps (covered in account-delete-linked-records) are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { resetFakeFirestore } from '../../tests/helpers/fake-firestore.js';

const fake = await vi.hoisted(async () =>
  (await import('../../tests/helpers/fake-firestore.js')).newFakeFirestoreState()
);

vi.mock('../../utils/firestore-utils.js', async (importOriginal) => {
  const { createFakeFirestore } = await import('../../tests/helpers/fake-firestore.js');
  return {
    ...(await importOriginal<typeof import('../../utils/firestore-utils.js')>()),
    getFirestoreDb: createFakeFirestore(fake),
  };
});

vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? header.match(/^Bearer verified-(.+)$/) : null;
    if (!match) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return null;
    }
    return { userId: match[1], firebaseUid: match[1], isAdmin: false, authMethod: 'firebase' };
  }),
  rateLimit: vi.fn(() => false),
}));
vi.mock('../../services/data-export.js', () => ({
  getDataExportService: () => ({ deleteAllData: vi.fn(async () => undefined) }),
}));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUser: vi.fn(),
}));
vi.mock('../../services/security-events.js', () => ({
  recordSecurityEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../memory/index.js', () => ({ getDefaultStore: vi.fn() }));
vi.mock('../../services/push-endpoint-owners.js', () => ({
  erasePushRecordsFor: vi.fn(async () => undefined),
}));
vi.mock('../../servers/token/oauth-link-state.js', () => ({
  deleteOAuthLinkStatesFor: vi.fn(async () => undefined),
}));
vi.mock('../../services/billing/apple-signed-data.js', () => ({
  tombstoneTransactionOwnersFor: vi.fn(async () => undefined),
}));

const { handleAccountRoutes } = await import('../account-routes.js');
const musical = await import('../../services/musical-you/social.js');
const social = await import('../../services/social/challenges.js');
const stats = await import('../../services/social/user-stats.js');

function deleteRequest(uid: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = 'DELETE';
  req.url = '/api/account';
  req.headers = { authorization: `Bearer verified-${uid}` };
  (req as unknown as { socket: unknown }).socket = { remoteAddress: '127.0.0.1' };
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' })));
    req.emit('end');
  }, 0);
  return req;
}

async function deleteAccount(uid: string) {
  const sent = { status: 200, body: {} as { details?: { failures?: string[] } } };
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((status: number) => {
      sent.status = status;
    }),
    end: vi.fn((data?: string) => {
      sent.body = JSON.parse(data || '{}') as typeof sent.body;
    }),
  } as unknown as ServerResponse;
  await handleAccountRoutes(deleteRequest(uid), res, '/api/account');
  return sent;
}

const docsNaming = (uid: string) =>
  [...fake.docs].filter(([path, data]) => `${path} ${JSON.stringify(data)}`.includes(uid));
const slotsOf = (collection: string, uid: string) =>
  fake.docs.get(`${collection}/${uid}`) as
    | { sent: Record<string, number>; received: Record<string, number> }
    | undefined;

const result = { score: 30, correctAnswers: 3, totalQuestions: 3, timeMs: 9, usedHints: false };

describe('DELETE /api/account social game records', () => {
  beforeEach(() => {
    resetFakeFirestore(fake);
    vi.stubEnv('K_SERVICE', 'api');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("removes A's challenges, slots, boards and stats, frees B's slots, keeps B's records", async () => {
    // Musical You: A challenges B, C challenges A (both open), B challenges C.
    await musical.sendChallenge('alice', 'Al', 'bob', 'guess', 10);
    await musical.sendChallenge('carol', 'Cy', 'alice', 'guess', 20);
    const bobsOwn = await musical.sendChallenge('bob', 'Bo', 'carol', 'guess', 30);
    // Social: A challenges B; stats and leaderboard entries for A and B.
    await social.createChallenge('score-beat', 'guess', 'alice', 'Al', 'bob');
    for (const uid of ['alice', 'bob']) {
      await stats.updateUserStats(uid, 'guess', result);
      await musical.updateLeaderboardEntry(
        'weekly',
        'guess',
        uid,
        uid === 'bob' ? 'Bo' : 'Al',
        5,
        1,
        1
      );
      await musical.updateLeaderboardEntry(
        'all-time',
        'overall',
        uid,
        uid === 'bob' ? 'Bo' : 'Al',
        5,
        1,
        1
      );
    }
    expect(docsNaming('alice').length).toBeGreaterThan(0);
    expect(
      Object.keys(slotsOf('musical_open_challenge_slots', 'bob')?.received ?? {})
    ).toHaveLength(1);

    const sent = await deleteAccount('alice');

    expect(sent.status).toBe(200);
    expect(sent.body.details?.failures).toEqual([]);
    expect(docsNaming('alice')).toEqual([]);
    expect(fake.docs.has('musical_open_challenge_slots/alice')).toBe(false);
    expect(fake.docs.has('social_open_challenge_slots/alice')).toBe(false);

    // The other parties' slots for A's challenges are free again.
    expect(slotsOf('musical_open_challenge_slots', 'bob')?.received).toEqual({});
    expect(slotsOf('musical_open_challenge_slots', 'carol')?.sent).toEqual({});
    expect(slotsOf('social_open_challenge_slots', 'bob')?.received).toEqual({});

    // B's own records are untouched.
    expect(await musical.getChallenge(bobsOwn.id)).toMatchObject({ status: 'pending' });
    expect(Object.keys(slotsOf('musical_open_challenge_slots', 'bob')?.sent ?? {})).toEqual([
      bobsOwn.id,
    ]);
    expect((await stats.getUserStats('bob')).totalGamesPlayed).toBe(1);
    expect((await musical.getUserRank('bob', 'weekly', 'guess'))?.rank).toBe(1);
    expect((await musical.getUserRank('bob', 'all-time', 'overall'))?.rank).toBe(1);
  });
});

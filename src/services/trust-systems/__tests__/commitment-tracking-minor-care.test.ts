/**
 * MINOR_CARE=on: a member caller (not a verified owner) who says "I'm 15." processCommitments
 * runs on every turn of the call (the commitment follow-up builder). On a held call it stores
 * nothing: no new commitment, no progress note, and no answer to a follow-up (in their words).
 * Only Firestore and the semantic index are faked; the same turn still writes for a verified
 * owner and with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const awaiting = {
  content: 'call my grandma this weekend',
  status: 'active',
  awaitingAnswer: true,
  createdAt: new Date().toISOString(),
  lastMentioned: new Date().toISOString(),
};
const commitments = {
  doc: () => ({
    set: async (d: Record<string, unknown>) => void writes.push(d),
    update: async (d: Record<string, unknown>) => void writes.push(d),
    get: async () => ({ exists: false }),
  }),
  where: () => ({
    orderBy: () => ({
      limit: () => ({
        get: async () => ({
          docs: [{ id: 'c1', data: () => ({ ...awaiting, followUpAskedAt: new Date() }) }],
        }),
      }),
    }),
  }),
};
const db = { collection: () => ({ doc: () => ({ collection: () => commitments }) }) };
vi.mock('../../../utils/firebase-admin-app.js', () => ({ getAdminFirestore: () => db }));
vi.mock('../../data-layer/integrations/index.js', () => ({
  indexCommitment: () => undefined,
  deindexCommitment: () => undefined,
}));
vi.mock('../../superhuman/index.js', () => ({ commitmentsShown: async () => () => true }));

import { processCommitments } from '../commitment-tracking.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../../../utils/minor-care.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

function callAfterAge(c: Case): { userId: string; sessionId: string } {
  n++;
  const sessionId = `session-AJ_track${n}-1792867440000`;
  const userId = `Tp3kWz8NcT2vHs6Lq9dXa5Gm${String(n).padStart(4, '0')}`; // a member uid
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId);
  heldAfter(sessionId, "I'm 15, I live with my grandma.", { userId });
  expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  return { userId, sessionId };
}

beforeEach(() => {
  writes.length = 0;
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: processCommitments on a turn of a caller who said "I\'m 15."', () => {
  it.each(['held', 'owner', 'off'] as Case[])('stores nothing when held (%s)', async (c) => {
    const { userId, sessionId } = callAfterAge(c);
    const said = "Yeah I called her, it went great. I'm going to start running before school.";
    const result = await processCommitments(userId, said, {}, sessionId);
    if (c === 'held') {
      expect(writes).toEqual([]);
      expect(result).toEqual({
        newCommitments: [],
        progressUpdates: [],
        followUpsDue: [],
        answers: [],
      });
      return;
    }
    // The answer to Ferni's follow-up, kept in the caller's words, and the new plan.
    expect(writes).toContainEqual(expect.objectContaining({ followUpAnswer: said }));
    expect(result.answers.map((a) => a.outcome)).toEqual(['done']);
    expect(writes.some((w) => typeof w.originalQuote === 'string')).toBe(true);
  });

  it('holds on the userId alone, while any of their sessions is held', async () => {
    const { userId } = callAfterAge('held');
    await processCommitments(userId, 'Yeah I called her, it went great.', {});
    expect(writes).toEqual([]);
  });
});

/**
 * MINOR_CARE=on: a member caller (not a verified owner) who says "I'm 15." Their plans are
 * personal: a commitment they state is not saved, marking one done changes nothing (no status,
 * no win, no celebration), and no win is recorded for them. Only Firestore and the side-effect
 * modules are faked; the same calls still write for a verified owner and with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => [] as string[]);
const doc = {
  set: async () => void writes.push('set'),
  update: async () => void writes.push('update'),
};
const db = { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => doc }) }) }) };
vi.mock('../firestore-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestoreDb: () => db,
}));
vi.mock('../../data-layer/hooks/superhuman-hooks.js', () => ({
  onCommitmentKeeperChange: async () => undefined,
}));
vi.mock('../../outreach/superhuman-outreach-bridge.js', () => ({
  onCommitmentMade: async () => undefined,
  onCommitmentAtRisk: async () => undefined,
}));

import { usePersonFlagLookup } from '../../../config/person-flag.js';
import { saveCommitment, updateCommitmentStatus, type Commitment } from '../commitment-keeper.js';
import { recordWinFromCommitment, type Win, type WinStore } from '../wins.js';
import {
  bindSessionUser,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  setVerifiedOwnerCheck,
} from '../../../utils/minor-care.js';

type Case = 'held' | 'owner' | 'off';
let n = 0;

function callAfterAge(c: Case): string {
  n++;
  const sessionId = `session-AJ_commit${n}-1792867440000`;
  const userId = `Qm7tWz8NcT2vHs6Lq9dXa5Gm${String(n).padStart(4, '0')}`; // a member uid
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  bindSessionUser(sessionId, userId);
  heldAfter(sessionId, "I'm 15 and I'm going to try out for the soccer team.", { userId });
  expect(memoryHeld(sessionId)).toBe(c === 'held'); // the precondition each case rests on
  return userId;
}

function draft(userId: string, statement: string): Omit<Commitment, 'id'> {
  const now = Date.now();
  return {
    userId,
    statement,
    summary: statement,
    text: statement,
    type: 'intention',
    emotionalWeight: 0.3,
    createdAt: now,
    lastMentioned: now,
    followUpAfter: now,
    status: 'active',
    followUpCount: 0,
  };
}

beforeEach(() => {
  writes.length = 0;
  vi.stubEnv('COACH_WINS', 'on');
  usePersonFlagLookup(async () => undefined);
});
afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('MINOR_CARE: the commitments of a caller who said "I\'m 15."', () => {
  it.each(['held', 'owner', 'off'] as Case[])('saves none when held (%s)', async (c) => {
    const userId = callAfterAge(c);
    const said = "I'll ask Coach Rivera about tryouts on Monday.";
    const result = await saveCommitment(draft(userId, said), { validateCalendar: false });
    expect(result.commitment.statement).toBe(said);
    // The commitment document (other side effects may write through the same fake db).
    expect(writes).toEqual(c === 'held' ? [] : expect.arrayContaining(['set']));
  });

  it.each(['held', 'owner', 'off'] as Case[])('marks none done when held (%s)', async (c) => {
    const userId = callAfterAge(c);
    await updateCommitmentStatus(userId, 'c1', 'completed');
    expect(writes).toEqual(c === 'held' ? [] : ['update']);
  });

  it.each(['held', 'owner', 'off'] as Case[])('records no win when held (%s)', async (c) => {
    const userId = callAfterAge(c);
    const wins: Win[] = [];
    const store: WinStore = {
      commitment: async () => ({ statement: "I'll ask Coach Rivera about tryouts on Monday." }),
      create: async (_u, win) => wins.push(win) > 0,
      recent: async () => wins,
      markSurfaced: async () => undefined,
    };
    const written = await recordWinFromCommitment(userId, 'c1', {
      store,
      forgotten: async () => [],
    });
    expect(written).toBe(c !== 'held');
    expect(wins.map((w) => w.id)).toEqual(c === 'held' ? [] : ['c1']);
  });
});

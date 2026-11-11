/**
 * K1e: the commitment store every tool and turn path writes through (saveCommitment,
 * updateCommitmentStatus) stores nothing for a call that told of abuse, so no check-in,
 * win or celebration can follow from it later. A suicidal-only call stores as on main.
 * Only Firestore and the calendar/outreach side effects are fakes. Fictional lines only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const set = vi.fn(async (_doc: unknown) => undefined);
const update = vi.fn(async () => undefined);
const db = {
  collection: () => ({
    doc: () => ({ collection: () => ({ doc: () => ({ set, update }) }) }),
  }),
};
vi.mock('../firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../firestore-utils.js')>()),
  getFirestoreDb: () => db,
}));
vi.mock('../../data-layer/hooks/superhuman-hooks.js', () => ({
  onCommitmentKeeperChange: vi.fn(async () => undefined),
}));
vi.mock('../../outreach/superhuman-outreach-bridge.js', () => ({
  onCommitmentMade: vi.fn(async () => undefined),
  onCommitmentAtRisk: vi.fn(async () => undefined),
}));

import { saveCommitment, updateCommitmentStatus, type Commitment } from '../commitment-keeper.js';
import { detectCrisis } from '../../safety/crisis-guard.js';
import { noteAbuseRead } from '../../safety/abuse-outreach-hold.js';
import { bindSessionUser } from '../../../utils/minor-care.js';

const LINE = "I'll call the landlord about the lease tomorrow.";
let n = 0;
/** A fresh call bound to a fresh user; `told` is what the caller said on it. */
function call(told?: string): string {
  const id = ++n;
  const userId = `keeper-user-${id}`;
  bindSessionUser(`keeper-session-${id}`, userId);
  if (told) noteAbuseRead(`keeper-session-${id}`, detectCrisis(told));
  return userId;
}
function draft(userId: string): Omit<Commitment, 'id'> {
  const now = Date.now();
  return {
    userId,
    statement: LINE,
    summary: LINE,
    text: LINE,
    type: 'intention',
    emotionalWeight: 0.5,
    createdAt: now,
    lastMentioned: now,
    followUpAfter: now,
    status: 'active',
    followUpCount: 0,
  };
}
const stored = (): boolean =>
  set.mock.calls.some(([doc]) => (doc as Partial<Commitment>).statement === LINE);

beforeEach(() => {
  set.mockClear();
  update.mockClear();
});

describe('the commitment store on an abuse call', () => {
  it.each([
    ['an everyday call', undefined, true],
    ['a suicidal-only call', 'I want to end my life.', true],
    ['a call that told of abuse', 'my husband hits me', false],
  ])('saveCommitment on %s', async (_name, told, expected) => {
    expect(stored()).toBe(false);
    await saveCommitment(draft(call(told)), { validateCalendar: false });
    expect(stored()).toBe(expected);
  });

  it.each([
    ['an everyday call', undefined, 1],
    ['a call that told of abuse', 'my husband hits me', 0],
  ])('updateCommitmentStatus on %s', async (_name, told, writes) => {
    await updateCommitmentStatus(call(told), 'commit-1', 'completed');
    expect(update).toHaveBeenCalledTimes(writes);
  });
});

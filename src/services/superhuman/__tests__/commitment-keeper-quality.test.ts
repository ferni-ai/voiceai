/**
 * saveCommitment, the store every turn-path capture writes through, does not
 * write a goodbye or a bare "call her tomorrow". Only Firestore and the
 * calendar/outreach side effects are fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const set = vi.fn(async () => undefined);
const db = {
  collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ set }) }) }) }),
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

import { saveCommitment, type Commitment } from '../commitment-keeper.js';

function draft(statement: string): Omit<Commitment, 'id'> {
  const now = Date.now();
  return {
    userId: 'u1',
    statement,
    summary: statement,
    text: statement,
    type: 'intention',
    emotionalWeight: 0.5,
    createdAt: now,
    lastMentioned: now,
    followUpAfter: now,
    status: 'active',
    followUpCount: 0,
  };
}

describe('saveCommitment', () => {
  beforeEach(() => set.mockClear());

  it.each(["I'll catch you later.", "I'm good, thanks."])('does not write %j', async (s) => {
    const result = await saveCommitment(draft(s), { validateCalendar: false });
    expect(result.notActionable).toBe(true);
    expect(set).not.toHaveBeenCalled();
  });

  it.each([
    "I'll send Mindy the photos.",
    "I'll be at the dentist at 2.",
    "I'll call her tomorrow.",
  ])('writes %j', async (s) => {
    const result = await saveCommitment(draft(s), { validateCalendar: false });
    expect(result.notActionable).toBeUndefined();
    // The commitment document (other side effects may write through the same fake db).
    expect(set.mock.calls.map((c) => (c as unknown[])[0])).toContainEqual(
      expect.objectContaining({ statement: s, status: 'active' })
    );
  });
});

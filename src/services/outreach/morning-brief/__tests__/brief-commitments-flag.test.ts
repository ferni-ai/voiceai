/**
 * Commitments reach the text brief only with MORNING_BRIEF_COMMITMENTS=on: the
 * turn-path capture stored "catch you later" and "call her tomorrow" as
 * commitments, and a standalone text can't recover who "her" is.
 */
import { describe, expect, it, vi } from 'vitest';

const active = vi.fn(async () => [
  { id: 'c1', data: { statement: 'I will send Mindy the photos', status: 'open' } },
]);
vi.mock('../../../calendar/calendar-service.js', () => ({ getEventsForDay: async () => [] }));
vi.mock('../../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../../../memory/recall/forget.js', () => ({ forgottenTopicsOrNull: async () => [] }));
vi.mock('../../../superhuman/commitment-follow-up.js', () => ({
  firestoreCommitmentStore: { active },
  toOpenCommitment: (id: string, data: { statement: string }) => ({ id, statement: data.statement }),
}));

const now = new Date('2026-10-19T12:05:00Z');

describe('readDay commitments', () => {
  it('leaves commitments out and never reads them while the flag is off', async () => {
    active.mockClear();
    const { readDay } = await import('../default-deps.js');
    const day = await readDay('uid-seth', {}, 'America/New_York', now, {});
    expect(day.commitments).toEqual([]);
    expect(active).not.toHaveBeenCalled();
  });

  it('includes open commitments when MORNING_BRIEF_COMMITMENTS=on', async () => {
    active.mockClear();
    const { readDay } = await import('../default-deps.js');
    const day = await readDay('uid-seth', {}, 'America/New_York', now, {
      MORNING_BRIEF_COMMITMENTS: 'on',
    });
    expect(active).toHaveBeenCalledWith('uid-seth');
    expect(day.commitments).toEqual(['I will send Mindy the photos']);
  });
});

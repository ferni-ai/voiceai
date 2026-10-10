import { describe, expect, it, vi } from 'vitest';
import type {
  CommitmentStore,
  OpenCommitment,
} from '../../../services/superhuman/commitment-follow-up.js';
import {
  pickDuePerUser,
  pushMessage,
  sendCommitmentPushes,
  type DueCommitment,
} from '../commitment-push.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-10T18:00:00Z');

function row(userId: string, over: Partial<OpenCommitment> = {}): DueCommitment {
  return {
    userId,
    commitment: {
      id: `${userId}-c`,
      statement: "I'll call the landlord about the leak.",
      createdAt: NOW - 4 * DAY,
      followUpAfter: NOW - DAY,
      followUpCount: 0,
      ...over,
    },
  };
}

describe('pickDuePerUser', () => {
  it('sends each caller one push, for the follow-up that came due first', () => {
    const picked = pickDuePerUser(
      [
        row('a', { id: 'later', followUpAfter: NOW - DAY }),
        row('a', { id: 'earlier', followUpAfter: NOW - 2 * DAY }),
        row('b', { id: 'not-yet', followUpAfter: NOW + DAY }),
        row('c', { id: 'asked-yesterday', lastFollowUp: NOW - DAY }),
      ],
      NOW
    );
    expect(picked.map((r) => r.commitment.id)).toEqual(['earlier']);
  });
});

describe('pushMessage', () => {
  it('uses their own words', () => {
    expect(pushMessage(row('a').commitment)).toBe(
      'How did it go? Last time you said: "I\'ll call the landlord about the leak."'
    );
  });
});

describe('sendCommitmentPushes', () => {
  const store = (): CommitmentStore => ({
    active: async () => [],
    markFollowedUp: vi.fn(async () => undefined),
  });

  it('marks a commitment followed up only when its push went out', async () => {
    const s = store();
    const send = vi.fn(async (userId: string) => userId === 'a');
    const sent = await sendCommitmentPushes(
      { scan: async () => [row('a'), row('b')], send, store: s },
      NOW
    );
    expect(sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(s.markFollowedUp).toHaveBeenCalledTimes(1);
    expect(s.markFollowedUp).toHaveBeenCalledWith('a', row('a').commitment, NOW);
  });

  it('sends nothing and does not throw when the scan fails', async () => {
    const send = vi.fn(async () => true);
    const scan = async () => {
      throw new Error('FAILED_PRECONDITION: index');
    };
    await expect(sendCommitmentPushes({ scan, send, store: store() }, NOW)).resolves.toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

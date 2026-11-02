/**
 * One person's commitment that can't be screened skips only that person: the screen
 * runs inside the per-commitment try, so a throw there never stops the pushes after it
 * (PR 3329, item 6). Fictional people and lines only.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CommitmentStore } from '../../../services/superhuman/commitment-follow-up.js';

vi.mock('../../../tools/domains/proactive/outreach/index.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    storedTextForOwner: (_texts: readonly unknown[], where: { userId: string }) => {
      if (where.userId === 'first-uid') throw new Error('screen failed');
      return true;
    },
  };
});

const { sendCommitmentPushes } = await import('../commitment-push.js');

const NOW = Date.parse('2026-10-10T18:00:00Z');
const due = (userId: string) => ({
  userId,
  commitment: {
    id: `${userId}-c`,
    statement: 'water the plants',
    createdAt: NOW - 4 * 86_400_000,
    followUpAfter: NOW - 86_400_000,
    followUpCount: 0,
  },
});

describe('commitment push: the screen runs per commitment', () => {
  it('a throw screening the first person still pushes to the second, and only to them', async () => {
    const send = vi.fn(async () => true);
    const store: CommitmentStore = { active: async () => [], markFollowedUp: vi.fn(async () => undefined) }; // prettier-ignore
    const sent = await sendCommitmentPushes(
      { scan: async () => [due('first-uid'), due('second-uid')], send, store },
      NOW
    );
    expect(sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('second-uid', expect.any(String), 'second-uid-c');
    expect(store.markFollowedUp).toHaveBeenCalledTimes(1);
  });
});

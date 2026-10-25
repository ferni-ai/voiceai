/**
 * forgetTopic closes the open follow-ups about the topic through the
 * follow-through port, and a missing or failing port never stops the forget.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: logged.info, warn: logged.warn, error: vi.fn() }),
}));

import type { FollowUp } from '../../../services/follow-through/index.js';
import { releaseForgotten } from '../../../services/follow-through/index.js';
import { followUp } from '../../../services/follow-through/__tests__/fixtures.js';
import { forgetTopic, type ForgetStore } from '../forget.js';
import { setForgetFollowUpsPort } from '../forget-follow-ups.js';

const NOW = new Date('2026-10-18T12:00:00Z');

function forgetStore(): ForgetStore {
  const topics: string[] = [];
  return {
    facts: async () => [],
    markForgotten: async () => undefined,
    addTopic: async (_u, t) => void topics.push(t),
    topics: async () => topics,
  };
}

/** The real release rule over an in-memory follow-through store. */
function followThrough(rows: FollowUp[]) {
  const docs = new Map(rows.map((f) => [f.id, f]));
  const store = {
    live: async (u: string) =>
      [...docs.values()].filter((f) => f.userId === u && ['open', 'surfaced'].includes(f.status)),
    save: async (next: FollowUp, expected: string) => {
      if (docs.get(next.id)?.updatedAt !== expected) return false;
      docs.set(next.id, next);
      return true;
    },
  };
  setForgetFollowUpsPort({
    closeAbout: (userId, about, now) => releaseForgotten(store, userId, about, now),
  });
  return docs;
}

afterEach(() => {
  setForgetFollowUpsPort(undefined);
  logged.warn.mockClear();
});

describe('forgetTopic closes follow-ups about the topic', () => {
  it('releases matching open follow-ups as forgotten and leaves the rest open', async () => {
    const docs = followThrough([
      followUp({ id: 'trip', userId: 'u1', text: 'ask how the Lisbon trip planning went' }),
      followUp({ id: 'mom', userId: 'u1', text: 'call mom' }),
      followUp({ id: 'other', userId: 'u2', text: 'Lisbon trip packing list' }),
    ]);
    const result = await forgetTopic('u1', 'the Lisbon trip', forgetStore(), NOW);
    expect(result.kind).toBe('forgotten');
    expect(docs.get('trip')).toMatchObject({
      status: 'released',
      closedReason: 'forgotten',
      closedAt: NOW.toISOString(),
    });
    expect(docs.get('mom')?.status).toBe('open');
    expect(docs.get('other')?.status).toBe('open'); // someone else's
  });

  it('still forgets, with a fixed reason logged, when no port is installed', async () => {
    const result = await forgetTopic('u1', 'the Lisbon trip', forgetStore(), NOW);
    expect(result.kind).toBe('forgotten');
    expect(logged.warn).toHaveBeenCalledWith({ reason: 'port-not-installed' }, expect.any(String));
  });

  it('still forgets, with a fixed reason logged, when closing fails', async () => {
    setForgetFollowUpsPort({
      closeAbout: async () => {
        throw new Error('firestore down');
      },
    });
    const result = await forgetTopic('u1', 'the Lisbon trip', forgetStore(), NOW);
    expect(result.kind).toBe('forgotten');
    expect(logged.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'close-failed' }),
      expect.any(String)
    );
  });
});

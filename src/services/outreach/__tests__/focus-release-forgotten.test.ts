/**
 * forgottenAtRelease's own topic read (no injected loader): the topics stored
 * for the person (forget.ts) plus any forgotten in this process since, so a
 * forget handled by this server counts before its write is read back.
 */
import { describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ topics: [] as string[] | null }));
vi.mock('../../../memory/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../memory/index.js')>()),
  forgottenTopicsOrNull: async () => stored.topics,
}));

const { forgottenAtRelease } = await import('../focus-send-hold.js');
const { forgetTopic } = await import('../../../memory/recall/forget.js');

const held = (userId: string) => ({
  reason: 'focus',
  text: {
    userId,
    body: 'You asked me to remind you: call my divorce lawyer',
    kind: 'follow-up' as const,
    refId: 'f-1',
    minGapMs: 0,
  },
});

describe('forgottenAtRelease, reading the topics itself', () => {
  it('a topic forgotten in this process counts before the stored list has it', async () => {
    stored.topics = [];
    expect(await forgottenAtRelease(held('u-release-1'))).toBeNull();
    const noop = {
      facts: async () => [],
      markForgotten: async () => {},
      addTopic: async () => {},
      topics: async () => [],
    };
    await forgetTopic('u-release-1', 'my divorce lawyer', noop);
    expect(await forgottenAtRelease(held('u-release-1'))).toBe('forgotten');
  });

  it('a stored forgotten topic counts; an unreadable list waits', async () => {
    stored.topics = ['divorce lawyer'];
    expect(await forgottenAtRelease(held('u-release-2'))).toBe('forgotten');
    stored.topics = null;
    expect(await forgottenAtRelease(held('u-release-2'))).toBe('unreadable');
  });
});

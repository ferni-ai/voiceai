/**
 * FORGET_EVERY_READER and group outreach: a team celebration (Ferni, Maya and
 * Jordan) or any group message about a topic the caller asked Ferni to forget
 * is never sent, nor stored on the thread; while the forget list can't be
 * read, no group message is sent. The real teamCelebrationOutreach; the
 * thread store, outreach context and delivery are stubs at their edges.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const edge = vi.hoisted(() => ({
  topics: ['Mindy'] as string[] | null,
  delivered: [] as string[],
  stored: [] as string[],
}));
vi.mock('../thread-manager.js', () => ({
  getOrCreateThread: async () => ({ id: 'thread-1' }),
  addMessage: async (_id: string, m: { content: string }) => void edge.stored.push(m.content),
}));
vi.mock('../../outreach/conversation-context-bridge.js', () => ({
  storeOutreachContext: async () => undefined,
}));
vi.mock('../../outreach/delivery/index.js', () => ({
  deliverOutreach: async (d: { message: string }) => (
    edge.delivered.push(d.message),
    { success: true }
  ),
}));
vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => edge.topics,
}));

const { teamCelebrationOutreach } = await import('../group-outreach.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');

const USER = 'member-group-forget';

beforeEach(() => {
  edge.topics = ['Mindy'];
  edge.delivered = [];
  edge.stored = [];
  resetForgetTopicsSource();
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('group outreach and a forgotten topic', () => {
  it('on: a team celebration about it is neither sent nor stored', async () => {
    const result = await teamCelebrationOutreach(USER, { achievement: "finishing Mindy's 5k" });
    expect(result.success).toBe(false);
    expect(edge.delivered).toEqual([]);
    expect(edge.stored).toEqual([]);
    expect(result.error).not.toContain('Mindy');
  });

  it('on: a celebration about something else goes out', async () => {
    const result = await teamCelebrationOutreach(USER, { achievement: 'finishing the 5k' });
    expect(result.success).toBe(true);
    expect(edge.delivered.join(' ')).toContain('finishing the 5k');
  });

  it('on: a forget list that cannot be read sends nothing (fails closed)', async () => {
    edge.topics = null;
    await teamCelebrationOutreach(USER, { achievement: 'finishing the 5k' });
    expect(edge.delivered).toEqual([]);
  });

  it('off: as before', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    await teamCelebrationOutreach(USER, { achievement: "finishing Mindy's 5k" });
    expect(edge.delivered.join(' ')).toContain('Mindy');
  });
});

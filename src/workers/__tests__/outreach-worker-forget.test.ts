/**
 * FORGET_EVERY_READER and the outreach worker: a queued trigger whose reason
 * names a topic the caller asked Ferni to forget goes out as the plain
 * check-in, and while the forget list can't be read nothing goes out at all.
 * The real processPendingTriggers; the queue, delivery and forget list are
 * stubs at their edges.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const edge = vi.hoisted(() => ({
  topics: ['Mindy'] as string[] | null,
  reason: 'Ask how Mindy is doing after the hospital',
  delivered: [] as string[],
}));

vi.mock('../../services/pubsub/pubsub-client.js', () => ({
  getPubSubClient: () => ({
    initialize: async () => undefined,
    isEnabled: () => false,
  }),
}));
vi.mock('../../services/outreach/decision-engine.js', () => ({
  getOutreachDecisionEngine: () => ({
    getUserState: () => ({
      outreachEnabled: true,
      counters: { outreachToday: 0 },
      preferences: { maxPerDay: 5, preferredChannel: 'sms' },
    }),
  }),
}));
vi.mock('../../services/outreach/quiet-hours.js', () => ({
  isQuietHoursUnified: () => true,
  userQuietHours: async () => ({ quiet: false }),
}));
vi.mock('../../services/outreach/firestore-persistence.js', () => ({
  loadPendingTriggersWithLimit: async () => [
    {
      id: 't1',
      userId: 'member-outreach-forget',
      trigger: { type: 'check_in', priority: 'normal', reason: edge.reason },
      createdAt: new Date(),
    },
  ],
  updateTriggerStatus: async () => undefined,
  storeScheduledDelivery: async () => undefined,
}));
vi.mock('../../services/outreach/delivery/index.js', () => ({
  deliverOutreach: async (d: { message: string }) => void edge.delivered.push(d.message),
}));
vi.mock('../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => edge.topics,
}));

const { processPendingTriggers } = await import('../outreach-worker.js');
const { PLAIN_CHECK_IN } = await import('../../services/automation/insight-messages.js');
const { resetForgetTopicsSource } = await import('../../memory/recall/forget-topics-source.js');

beforeEach(() => {
  edge.topics = ['Mindy'];
  edge.reason = 'Ask how Mindy is doing after the hospital';
  edge.delivered = [];
  resetForgetTopicsSource();
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('outreach worker and a forgotten topic', () => {
  it('on: a reason naming it goes out as the plain check-in', async () => {
    const result = await processPendingTriggers();
    expect(edge.delivered).toEqual([PLAIN_CHECK_IN]);
    expect(result.scheduled).toBe(1);
  });

  it("on: Maya's habit loop (its reason names the habit) goes out as the plain check-in", async () => {
    edge.reason = 'Protect 12-day streak on "walks with Mindy"'; // publishStreakProtectionAlert
    await processPendingTriggers();
    expect(edge.delivered).toEqual([PLAIN_CHECK_IN]);
  });

  it('on: a reason about something else goes out unchanged', async () => {
    edge.reason = 'Ask how the garden is coming along';
    await processPendingTriggers();
    expect(edge.delivered).toEqual(['Ask how the garden is coming along']);
  });

  it('on: a forget list that cannot be read sends nothing (fails closed)', async () => {
    edge.topics = null;
    edge.reason = 'Ask how the garden is coming along';
    const result = await processPendingTriggers();
    expect(edge.delivered).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it('off: as before', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    await processPendingTriggers();
    expect(edge.delivered).toEqual(['Ask how Mindy is doing after the hospital']);
  });
});

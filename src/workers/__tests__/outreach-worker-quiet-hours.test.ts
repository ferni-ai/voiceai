/**
 * The outreach worker's quiet hours with QUIET_HOURS_FROM_PREFS: its own check
 * (22:00 to 08:00 on the server clock) is unchanged, and inside the window
 * saved in the menu, read in that window's zone, it also holds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let userDoc: Record<string, unknown> | undefined;
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({ get: async () => ({ exists: !!userDoc, data: () => userDoc }) }),
    }),
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

const { evaluateTrigger } = await import('../outreach-worker.js');

const trigger = { id: 't1', userId: 'u1', type: 'thinking_of_you', reason: 'r' } as never;
// 11:00 in New York, 15:00 UTC: outside the worker's own 22:00 to 08:00 on either clock.
const NOW = new Date('2026-10-12T15:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  userDoc = {
    messagingPrefs: { quietStart: '10:00', quietEnd: '12:00', zone: 'America/New_York' },
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('outreach worker and the quiet hours saved in the menu', () => {
  it('on: holds inside the saved window', async () => {
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on');
    expect(await evaluateTrigger(trigger)).toMatchObject({
      shouldSend: false,
      reason: 'Quiet hours',
    });
  });

  it('on, outside the saved window: sends; off: sends, as before', async () => {
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on');
    vi.setSystemTime(new Date('2026-10-12T18:00:00Z')); // 14:00 New York
    expect((await evaluateTrigger(trigger)).shouldSend).toBe(true);
    vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'off');
    vi.setSystemTime(NOW);
    expect((await evaluateTrigger(trigger)).shouldSend).toBe(true);
  });
});

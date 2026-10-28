/**
 * The daily outreach run says why it sent nothing. Real path: runDailyOutreach
 * over an in-memory Firestore; channel status, engagement history and the
 * writer are stubbed at the boundary, and nothing is delivered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../proactive-channels/__tests__/path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const logged: Array<{ obj: unknown; msg: unknown }> = [];

vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../unified-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deliver: vi.fn(async () => ({ success: false, channel: 'sms', error: 'must not deliver' })),
  getChannelStatus: vi.fn(async () => ({
    email: { available: true },
    sms: { available: true },
    voice_call: { available: true },
    push: { available: false },
    in_app: { available: true },
  })),
}));
vi.mock('../engagement-tracking.js', () => ({
  getOptimalOutreachTime: vi.fn(),
  getPreferredChannel: vi.fn(async () => null),
}));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: Record<string, unknown>) =>
      bindings.module === 'AutomatedScheduler'
        ? {
            info: (obj: unknown, msg: unknown) => logged.push({ obj, msg }),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
          }
        : real.createLogger(bindings),
  };
});

const { runDailyOutreach } = await import('../automated-scheduler.js');
const { skipReasonCounts, OTHER_REASON } = await import('../scheduler-report.js');
const { deliver } = await import('../unified-delivery.js');

const DAY = 24 * 3600_000;
// 11:00 in New York: outside quiet hours.
const NOW = new Date('2026-10-14T15:00:00Z');

function seedUser(uid: string) {
  docs.set(`bogle_users/${uid}`, {
    createdAt: new Date(NOW.getTime() - 60 * DAY).toISOString(),
    email: `${uid}@example.com`,
    // Talked five days ago: a "momentum check" is due.
    lastContact: new Date(NOW.getTime() - 5 * DAY).toISOString(),
    contactInfo: { timezone: 'America/New_York' },
    outreachPreferences: { channels: ['email'] },
  });
}

const completion = () => logged.find((l) => l.msg === 'Daily outreach job complete')?.obj;

beforeEach(() => {
  docs.clear();
  logged.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  delete process.env.OUTREACH_GROUNDED_CHECKINS;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.OUTREACH_GROUNDED_CHECKINS;
});

describe('daily outreach skip report', () => {
  it('by default reports every skip as the grounded-check-in block, in the log too', async () => {
    seedUser('user-a');
    seedUser('user-b');

    const result = await runDailyOutreach();

    expect(result.sent).toBe(0);
    expect(result.genericCheckInsBlocked).toBe(true);
    expect(result.skipReasons).toEqual({ 'No grounded reason to reach out': 2 });
    expect(deliver).not.toHaveBeenCalled();
    expect(completion()).toEqual({
      processed: 2,
      sent: 0,
      skipped: 2,
      errors: 0,
      skipReasons: { 'No grounded reason to reach out': 2 },
      genericCheckInsBlocked: true,
    });
    // No user IDs or addresses in the completion line.
    expect(JSON.stringify(completion())).not.toMatch(/user-a|user-b|example\.com/);
  });

  it('with the kill switch off, says the block is off (dry run, nothing sent)', async () => {
    process.env.OUTREACH_GROUNDED_CHECKINS = 'off';
    seedUser('user-a');

    const result = await runDailyOutreach({ dryRun: true });

    expect(result.genericCheckInsBlocked).toBe(false);
    expect(result.skipReasons).toEqual({});
    expect(deliver).not.toHaveBeenCalled();
  });

  it('QUIET_HOURS_FROM_PREFS: inside the window saved in the menu it is quiet hours; off, as before', async () => {
    seedUser('user-a');
    const doc = docs.get('bogle_users/user-a') ?? {};
    // 11:00 New York, inside a saved 10:00 to 12:00 (the scheduler's own 21:00 to 08:00 is not).
    docs.set('bogle_users/user-a', {
      ...doc,
      messagingPrefs: { quietStart: '10:00', quietEnd: '12:00', zone: 'America/New_York' },
    });
    process.env.QUIET_HOURS_FROM_PREFS = 'on';
    try {
      expect((await runDailyOutreach()).skipReasons).toEqual({ 'In quiet hours': 1 });
    } finally {
      delete process.env.QUIET_HOURS_FROM_PREFS;
    }
    expect((await runDailyOutreach()).skipReasons).toEqual({
      'No grounded reason to reach out': 1,
    });
  });

  it('counts plain-phrase reasons and buckets free text as "other"', () => {
    expect(
      skipReasonCounts([
        { userId: 'a', status: 'skipped', reason: 'In quiet hours' },
        { userId: 'b', status: 'skipped', reason: 'In quiet hours' },
        { userId: 'c', status: 'skipped', reason: 'Primary channel (sms) failed: +15555550123' },
        { userId: 'd', status: 'skipped', reason: 'bounced: someone@example.com' },
        { userId: 'e', status: 'skipped' },
        { userId: 'f', status: 'sent', channel: 'in_app' },
        { userId: 'g', status: 'error', reason: 'Error: boom' },
      ])
    ).toEqual({ 'In quiet hours': 2, [OTHER_REASON]: 3 });
  });
});

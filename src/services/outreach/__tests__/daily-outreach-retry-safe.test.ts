/**
 * The daily outreach run is safe to run again the same day (a Cloud Scheduler
 * retry after a deploy cut it off): nobody is sent the same day's message twice,
 * and nobody whose message did not go out is skipped. Real path: runDailyOutreach
 * over an in-memory Firestore; the writer, engagement history and delivery are
 * stubbed at the boundary. Fictional users only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../proactive-channels/__tests__/path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
/** A claim write that fails with this error (Firestore down mid-run). */
let claimFault: Error | null = null;
const warned: unknown[] = [];

function db() {
  const real = pathFirestore(docs) as unknown as {
    collection: (name: string) => Record<string, unknown> & { doc: (id: string) => object };
  };
  return {
    ...real,
    collection: (name: string) => {
      const c = real.collection(name);
      if (name !== 'daily_outreach_locks' || !claimFault) return c;
      const fault = claimFault;
      return {
        ...c,
        doc: (id: string) => ({ ...c.doc(id), create: async () => Promise.reject(fault) }),
      };
    },
  };
}

vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => db(),
}));
vi.mock('../unified-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deliver: vi.fn(async () => ({ success: true, channel: 'in_app', messageId: 'note-1' })),
}));
vi.mock('../engagement-tracking.js', () => ({
  getOptimalOutreachTime: vi.fn(),
  getPreferredChannel: vi.fn(async () => null),
}));
vi.mock('../llm-content-generator.js', () => ({
  generatePersonalizedContent: vi.fn(async () => ({
    text: 'How did the pottery class go?',
    personaId: 'ferni',
    reason: 'daily',
  })),
}));
vi.mock('../in-app-push.js', () => ({ pushInAppIfOn: vi.fn(async () => false) }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: Record<string, unknown>) =>
      bindings.module === 'daily-send-claim'
        ? {
            info: vi.fn(),
            warn: (obj: unknown) => warned.push(obj),
            error: vi.fn(),
            debug: vi.fn(),
          }
        : real.createLogger(bindings),
  };
});

const { runDailyOutreach } = await import('../automated-scheduler.js');
const { deliver } = await import('../unified-delivery.js');
const { pushInAppIfOn } = await import('../in-app-push.js');

const AVERY = 'user-avery';
const DAY = 24 * 3600_000;
// 11:00 in New York: outside quiet hours.
const NOW = new Date('2026-10-14T15:00:00Z');
const LOCK = `daily_outreach_locks/${AVERY}_2026-10-14`;

function seedUser(uid: string) {
  docs.set(`bogle_users/${uid}`, {
    createdAt: new Date(NOW.getTime() - 60 * DAY).toISOString(),
    // Talked five days ago: a "momentum check" is due, in the app.
    lastContact: new Date(NOW.getTime() - 5 * DAY).toISOString(),
    contactInfo: { timezone: 'America/New_York' },
  });
}
const user = () => docs.get(`bogle_users/${AVERY}`) ?? {};
const locks = () => [...docs.keys()].filter((p) => p.startsWith('daily_outreach_locks/'));

beforeEach(() => {
  docs.clear();
  warned.length = 0;
  claimFault = null;
  vi.mocked(deliver).mockClear();
  vi.mocked(pushInAppIfOn).mockReset().mockResolvedValue(false);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  process.env.OUTREACH_GROUNDED_CHECKINS = 'off'; // reach the generic check-in
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.OUTREACH_GROUNDED_CHECKINS;
});

describe('daily outreach run is retry-safe', () => {
  it('a retry after a send skips that person, even when the send record was lost', async () => {
    seedUser(AVERY);
    expect((await runDailyOutreach()).details).toEqual([
      expect.objectContaining({ userId: AVERY, status: 'sent' }),
    ]);
    expect(locks()).toEqual([LOCK]);
    const { lastOutreachDate: _lost, ...rest } = user();
    docs.set(`bogle_users/${AVERY}`, rest);

    const retry = await runDailyOutreach();

    expect(retry.details).toEqual([
      expect.objectContaining({ userId: AVERY, status: 'skipped', reason: 'Already sent today' }),
    ]);
    expect(retry.skipReasons).toEqual({ 'Already sent today': 1 });
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('the claim names the person and expires two days on (account deletion, TTL)', async () => {
    seedUser(AVERY);
    expect((await runDailyOutreach()).sent).toBe(1);
    expect(docs.get(LOCK)).toEqual({
      at: NOW.toISOString(),
      userId: AVERY,
      expireAt: new Date(NOW.getTime() + 2 * DAY),
    });
  });

  it('a run killed right after delivery has recorded the send, and the retry sends nothing', async () => {
    seedUser(AVERY);
    // The instance is shut down at the first await after delivery: the run never resumes.
    vi.mocked(pushInAppIfOn).mockReturnValueOnce(
      new Promise<boolean>(() => {
        // never settles
      })
    );
    void runDailyOutreach();
    await vi.waitFor(() => expect(pushInAppIfOn).toHaveBeenCalledTimes(1));
    expect(user().lastOutreachDate).toEqual(expect.any(String));

    const retry = await runDailyOutreach();

    expect(retry.sent).toBe(0);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('two runs at once (a retry beside a resumed run) send once', async () => {
    seedUser(AVERY);
    const runs = await Promise.all([runDailyOutreach(), runDailyOutreach()]);
    expect(runs.map((r) => r.sent).sort()).toEqual([0, 1]);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('a dry run claims nothing, so the real run still sends', async () => {
    seedUser(AVERY);
    expect((await runDailyOutreach({ dryRun: true })).sent).toBe(1);
    expect(locks()).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();

    expect((await runDailyOutreach()).sent).toBe(1);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('a claim that cannot be written means no send, and the log carries no user id', async () => {
    seedUser(AVERY);
    claimFault = Object.assign(new Error(`14 UNAVAILABLE: ${LOCK}`), { code: 14 });

    const result = await runDailyOutreach();

    expect(result.details).toEqual([
      expect.objectContaining({ status: 'skipped', reason: 'Send claim failed' }),
    ]);
    expect(deliver).not.toHaveBeenCalled();
    expect(warned).toEqual([{ code: 14 }]);
  });

  it('a delivery that failed gives the day back, so the retry reaches them', async () => {
    seedUser(AVERY);
    vi.mocked(deliver).mockResolvedValueOnce({ success: false, channel: 'in_app', error: 'down' });
    expect((await runDailyOutreach()).sent).toBe(0);
    expect(locks()).toEqual([]);

    expect((await runDailyOutreach()).sent).toBe(1);
    expect(deliver).toHaveBeenCalledTimes(2);
  });
});

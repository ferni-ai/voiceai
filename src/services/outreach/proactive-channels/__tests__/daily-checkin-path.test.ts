/**
 * The daily outreach run for allowlisted users: its channel comes from the
 * proactive channel policy and it lands in the proactive outreach log. Real
 * path: runDailyOutreach → dailyCheckInChannel → unified deliver → in-app
 * note. Firestore is in memory; the LLM writer and credential lookup are
 * stubbed at the boundary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathFirestore } from './path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();

vi.mock('../../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => pathFirestore(docs),
}));
vi.mock('../../unified-delivery.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getChannelStatus: vi.fn(async () => ({
    email: { available: true },
    sms: { available: true },
    voice_call: { available: true },
    push: { available: false },
    in_app: { available: true },
  })),
}));
// Engagement history prefers email; for allowlisted users that must not matter.
vi.mock('../../engagement-tracking.js', () => ({
  getOptimalOutreachTime: vi.fn(),
  getPreferredChannel: vi.fn(async () => 'email'),
}));
vi.mock('../../llm-content-generator.js', () => ({
  generatePersonalizedContent: vi.fn(async () => ({
    text: 'How has the week been?',
    personaId: 'ferni',
    reason: 'daily',
  })),
}));

const { runDailyOutreach } = await import('../../automated-scheduler.js');

const SETH = 'seth-uid';
const OTHER = 'other-uid';
const DAY = 24 * 3600_000;
// 11:00 in New York.
const NOW = new Date('2026-10-12T15:00:00Z');

function seedUser(uid: string, extra: Record<string, unknown> = {}) {
  docs.set(`bogle_users/${uid}`, {
    createdAt: new Date(NOW.getTime() - 60 * DAY).toISOString(),
    email: `${uid}@example.com`,
    phone: '+15555550123',
    // Talked five days ago: a "momentum check" is due.
    lastContact: new Date(NOW.getTime() - 5 * DAY).toISOString(),
    contactInfo: { timezone: 'America/New_York' },
    outreachPreferences: { channels: ['sms', 'email', 'voice_call'] },
    ...extra,
  });
}
const notesOf = (uid: string) =>
  [...docs.entries()].filter(([p]) => p.startsWith(`bogle_users/${uid}/pending_messages/`));
const logOf = (uid: string) =>
  [...docs.entries()]
    .filter(([p]) => p.startsWith(`bogle_users/${uid}/proactive_outreach_log/`))
    .map(([, d]) => d);

beforeEach(() => {
  docs.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  process.env.PROACTIVE_CHANNELS = 'on';
  process.env.PROACTIVE_CHANNELS_USERS = SETH;
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.PROACTIVE_CHANNELS;
  delete process.env.PROACTIVE_CHANNELS_USERS;
});

describe('daily outreach for allowlisted users', () => {
  it('goes to the app (not email or a text), once a day, and is logged', async () => {
    seedUser(SETH);
    expect(logOf(SETH)).toHaveLength(0);

    const first = await runDailyOutreach();
    expect(first.details).toEqual([
      expect.objectContaining({ userId: SETH, status: 'sent', channel: 'in_app' }),
    ]);
    expect(notesOf(SETH)).toHaveLength(1);
    expect(logOf(SETH)).toEqual([
      expect.objectContaining({
        sourceId: 'daily:2026-10-12',
        kind: 'planned_checkin',
        channel: 'in_app',
        why: 'not time-sensitive',
        outcome: 'sent',
      }),
    ]);

    // The daily cadence already holds them after a send; without it the log does.
    expect((await runDailyOutreach()).details).toEqual([]);
    const {
      lastOutreachDate: _d,
      outreachUnanswered: _u,
      ...user
    } = docs.get(`bogle_users/${SETH}`) ?? {};
    docs.set(`bogle_users/${SETH}`, user);
    const second = await runDailyOutreach();
    expect(second.details).toEqual([
      expect.objectContaining({ status: 'skipped', reason: 'already checked in today' }),
    ]);
    expect(notesOf(SETH)).toHaveLength(1);
  });

  it('uses their own quiet hours and time zone, not the Los Angeles default', async () => {
    // 07:30 in New York (quiet), 04:30 in Los Angeles.
    vi.setSystemTime(new Date('2026-10-12T11:30:00Z'));
    seedUser(SETH);
    const result = await runDailyOutreach({ respectQuietHours: false });
    expect(result.details).toEqual([
      expect.objectContaining({ status: 'skipped', reason: 'quiet hours' }),
    ]);
    expect(notesOf(SETH)).toHaveLength(0);
  });

  it('counts toward the daily cap with the rest of their check-ins', async () => {
    seedUser(SETH);
    for (const id of ['a', 'b', 'c']) {
      docs.set(`bogle_users/${SETH}/proactive_outreach_log/${id}`, {
        sourceId: id,
        channel: 'in_app',
        at: new Date(NOW.getTime() - 3600_000).toISOString(),
        outcome: 'sent',
      });
    }
    const result = await runDailyOutreach();
    expect(result.details).toEqual([
      expect.objectContaining({ status: 'skipped', reason: 'daily limit reached' }),
    ]);
  });

  it('users off the allowlist are picked for as before (email), with no proactive log', async () => {
    seedUser(OTHER);
    const result = await runDailyOutreach({ dryRun: true });
    expect(result.details).toEqual([
      expect.objectContaining({ userId: OTHER, status: 'sent', channel: 'email' }),
    ]);
    expect(logOf(OTHER)).toHaveLength(0);
  });
});

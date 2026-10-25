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
// The opt-out stores (opt-outs.ts) import the canonical module.
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
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

// The push service under in-app-push.ts (web push / APNs), stubbed at its boundary.
const pushes: Array<{ userId: string; payload: Record<string, unknown> }> = [];
vi.mock('../../../push-notifications.js', () => ({
  getPushNotificationsService: () => ({
    sendNotification: vi.fn(async (userId: string, payload: Record<string, unknown>) => {
      pushes.push({ userId, payload });
      return true;
    }),
  }),
}));

let modelReply: string | null = null;
vi.mock('../../../llm-utils.js', () => ({ callLLM: vi.fn(async () => modelReply) }));

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
  // Phone-keyed opt-outs are read under this key; without it nothing is texted.
  process.env.LOG_HASH_SECRET = 'test-hash-secret';
  docs.clear();
  pushes.length = 0;
  modelReply = null;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  process.env.PROACTIVE_CHANNELS = 'on';
  process.env.PROACTIVE_CHANNELS_USERS = SETH;
  // These cases exercise the legacy daily check-in path, which only runs when
  // grounded check-ins are explicitly switched off.
  process.env.OUTREACH_GROUNDED_CHECKINS = 'off';
});
afterEach(() => {
  delete process.env.LOG_HASH_SECRET;
  vi.useRealTimers();
  delete process.env.PROACTIVE_CHANNELS;
  delete process.env.PROACTIVE_CHANNELS_USERS;
  delete process.env.OUTREACH_GROUNDED_CHECKINS;
  delete process.env.OUTREACH_IN_APP_PUSH;
});

describe('daily outreach for allowlisted users', () => {
  it('OUTREACH_IN_APP_PUSH on: the note in the app comes with one push saying it is there', async () => {
    process.env.OUTREACH_IN_APP_PUSH = 'on';
    seedUser(SETH);
    expect(pushes).toHaveLength(0);
    await runDailyOutreach();
    const [[, note]] = notesOf(SETH);
    expect(pushes).toEqual([
      {
        userId: SETH,
        payload: expect.objectContaining({
          title: 'Ferni',
          body: note.text,
          type: 'ferni_checkin',
          data: { kind: 'momentum_check', messageId: note.id },
        }),
      },
    ]);
  });

  it('OUTREACH_IN_APP_PUSH off (the default): the note is saved and no push goes out', async () => {
    seedUser(SETH);
    await runDailyOutreach();
    expect(notesOf(SETH)).toHaveLength(1);
    expect(pushes).toHaveLength(0);
  });

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

  it('by default (flag unset) sends nobody a generic daily note', async () => {
    delete process.env.OUTREACH_GROUNDED_CHECKINS;
    {
      seedUser(SETH);
      seedUser(OTHER);
      const result = await runDailyOutreach();
      expect(result.details).toEqual([
        expect.objectContaining({
          userId: OTHER,
          status: 'skipped',
          reason: 'No grounded reason to reach out',
        }),
        expect.objectContaining({
          userId: SETH,
          status: 'skipped',
          reason: 'No grounded reason to reach out',
        }),
      ]);
      expect(notesOf(SETH)).toHaveLength(0);
      expect(logOf(SETH)).toHaveLength(0);
    }
  });

  it('users off the allowlist are picked for as before (email), with no proactive log', async () => {
    seedUser(OTHER);
    const result = await runDailyOutreach({ dryRun: true });
    expect(result.details).toEqual([
      expect.objectContaining({ userId: OTHER, status: 'sent', channel: 'email' }),
    ]);
    expect(logOf(OTHER)).toHaveLength(0);
  });

  it("writes the daily words fresh and never repeats yesterday's line", async () => {
    seedUser(SETH);
    const yesterday = "Hey, it's Ferni. Been thinking about you. How's your day going?";
    docs.set(`bogle_users/${SETH}/proactive_outreach_log/daily:2026-10-11`, {
      sourceId: 'daily:2026-10-11',
      channel: 'in_app',
      at: new Date(NOW.getTime() - DAY).toISOString(),
      outcome: 'sent',
      text: yesterday,
    });
    modelReply = yesterday;
    await runDailyOutreach();
    const [today] = logOf(SETH).filter((e) => e.sourceId === 'daily:2026-10-12');
    expect(today.text).toEqual(expect.any(String));
    expect(today.text).not.toBe(yesterday);
    expect(today.textSource).toBe('fallback');
    const [note] = notesOf(SETH).map(([, d]) => d);
    expect(note.text).toBe(today.text);

    modelReply = "Hey, it's Ferni. How's your Monday shaping up?";
    docs.delete(`bogle_users/${SETH}/proactive_outreach_log/daily:2026-10-12`);
    const user = docs.get(`bogle_users/${SETH}`) ?? {};
    delete user.lastOutreachDate;
    await runDailyOutreach();
    const [again] = logOf(SETH).filter((e) => e.sourceId === 'daily:2026-10-12');
    expect(again).toMatchObject({ text: modelReply, textSource: 'llm' });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, type FakeDb } from './fake-firestore.js';

let db: FakeDb;
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

import {
  deliverDueDateReminders,
  getRemindersForSession,
  upsertImportantDate,
  importantDateIdFor,
} from '../index.js';
import { setUserPreferencesModuleForTests } from '../boundaries-adapter.js';
import { resetMigrationCacheForTests } from '../legacy-migration.js';
import {
  channelPlan,
  MAX_EXTERNAL_PER_DAY,
  sendWithFallback,
  type ChannelSender,
  type SendChannel,
} from '../reminder-delivery.js';
import { defaultReminderRule } from '../record.js';
import { DEFAULT_REMINDER_SETTINGS, type ImportantDateRecord } from '../types.js';

const U = 'user-1';
const ALL_UP = { push: true, sms: true, email: true };
const SAM = importantDateIdFor('birthday:sam');

function seedUser(
  over: Record<string, unknown> = {},
  settings: Record<string, unknown> = {}
): void {
  db.docs.set(`bogle_users/${U}`, {
    contactInfo: { phone: '+15555550123', email: 'sam@example.com' },
    fcmTokens: ['tok'],
    ...over,
  });
  db.docs.set(`bogle_users/${U}/reminder_settings/default`, {
    timeZone: 'America/New_York',
    ...settings,
  });
  db.docs.set(`bogle_users/${U}/reminder_settings/legacy_migration`, { migratedAt: 'x' });
}

async function addSam(): Promise<void> {
  const r = await upsertImportantDate(U, {
    key: 'birthday:sam',
    title: "Sam's birthday",
    date: '--06-12',
    recurring: true,
    kind: 'birthday',
    source: 'user',
    sourceConversationIds: [],
    confidence: 1,
  });
  if (!r.success) throw r.error;
}

function recordingSender(results: Partial<Record<SendChannel, boolean>> = {}) {
  const calls: Array<{ channel: SendChannel; text: string }> = [];
  const sender: ChannelSender = async (channel, args) => {
    calls.push({ channel, text: args.text });
    return results[channel] === false ? { ok: false, error: `${channel} down` } : { ok: true };
  };
  return { calls, sender };
}

const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  db = createFakeDb();
  resetMigrationCacheForTests();
  setUserPreferencesModuleForTests(null);
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-05-01T12:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
  setUserPreferencesModuleForTests(undefined);
});

describe('deliverDueDateReminders', () => {
  it('sends the 7-day reminder by push once, records the outcome, and plans the next one', async () => {
    seedUser();
    await addSam();
    const { calls, sender } = recordingSender();

    at('2026-06-05T12:59:00Z'); // 08:59 EDT: not yet
    let run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.due).toBe(0);

    at('2026-06-05T13:05:00Z');
    run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run).toMatchObject({ due: 1, delivered: 1 });
    expect(calls).toEqual([
      { channel: 'push', text: "Sam's birthday is in 7 days. Want help with a gift?" },
    ]);

    const delivery = db.read(`bogle_users/${U}/important_date_deliveries/${SAM}_2026_7`)!;
    expect(delivery).toMatchObject({ status: 'delivered', channel: 'push', offset: 7 });
    const rec = db.read(`bogle_users/${U}/important_dates/${SAM}`)!;
    expect(rec.nextReminderKey).toBe(`${SAM}_2026_1`);

    // Idempotent: running again sends nothing.
    run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.due).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('a duplicate claim (another run already took it) is skipped, not re-sent', async () => {
    seedUser();
    await addSam();
    at('2026-06-05T14:00:00Z');
    db.docs.set(`bogle_users/${U}/important_date_deliveries/${SAM}_2026_7`, { status: 'claimed' });
    const { calls, sender } = recordingSender();
    const run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.skipped).toBe(1);
    expect(calls).toHaveLength(0);
    expect(db.read(`bogle_users/${U}/important_dates/${SAM}`)!.nextReminderKey).toBe(
      `${SAM}_2026_1`
    );
  });

  it('plans around quiet hours, and defers a due reminder found during them', async () => {
    seedUser({}, { quietHours: { start: '08:00', end: '12:00' } });
    await addSam();
    // The 09:00 send falls in quiet hours, so it is planned for 12:00.
    expect(db.read(`bogle_users/${U}/important_dates/${SAM}`)!.nextReminderAt).toBe(
      '2026-06-05T16:00:00.000Z'
    );

    // A date added late at night is due at once, but it's 23:00: wait for morning.
    db = createFakeDb();
    resetMigrationCacheForTests();
    at('2026-06-09T03:00:00Z'); // June 8, 23:00 EDT; birthday in 4 days
    seedUser();
    await addSam();
    const { calls, sender } = recordingSender();
    const run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run).toMatchObject({ due: 1, deferred: 1, delivered: 0 });
    expect(calls).toHaveLength(0);
    // Quiet hours end at 08:00; the usual 09:00 send time that morning wins.
    expect(db.read(`bogle_users/${U}/important_dates/${SAM}`)!.nextReminderAt).toBe(
      '2026-06-09T13:00:00.000Z'
    );
    at('2026-06-09T13:01:00Z');
    expect((await deliverDueDateReminders({ sender, server: ALL_UP })).delivered).toBe(1);
    expect(calls[0].text).toBe("Sam's birthday is Friday. Want help with a gift?");
  });

  it('honours do-not-contact times and topic boundaries from user preferences', async () => {
    seedUser();
    await addSam();
    at('2026-06-05T14:00:00Z'); // 10:00 EDT
    setUserPreferencesModuleForTests({
      getProactiveBoundaries: async () => ({ doNotContact: [{ start: '09:30', end: '11:00' }] }),
      isTopicAllowedProactively: async () => true,
    });
    const { calls, sender } = recordingSender();
    let run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.deferred).toBe(1);

    setUserPreferencesModuleForTests({ isTopicAllowedProactively: async () => false });
    at('2026-06-05T15:30:00Z');
    run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.suppressed).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it('falls back push → sms → email → in-app, using only opted-in channels', async () => {
    seedUser({}, { channels: { sms: true, email: true } });
    await addSam();
    at('2026-06-05T14:00:00Z');
    const { calls, sender } = recordingSender({ push: false, sms: false });
    const run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.delivered).toBe(1);
    expect(calls.map((c) => c.channel)).toEqual(['push', 'sms', 'email']);
    const d = db.read(`bogle_users/${U}/important_date_deliveries/${SAM}_2026_7`)!;
    expect(d.channel).toBe('email');
    expect(d.attempts).toEqual([
      { channel: 'push', ok: false, error: 'push down' },
      { channel: 'sms', ok: false, error: 'sms down' },
      { channel: 'email', ok: true },
    ]);
  });

  it('never texts or emails without opt-in, and sends nothing when outreach is off', async () => {
    seedUser({ fcmTokens: [] }); // no push device; sms/email not opted in
    await addSam();
    at('2026-06-05T14:00:00Z');
    const { calls, sender } = recordingSender();
    await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(calls.map((c) => c.channel)).toEqual(['in_app']);

    db = createFakeDb();
    resetMigrationCacheForTests();
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'));
    seedUser({ outreachPreferences: { enabled: false } }, { channels: { sms: true } });
    await addSam();
    at('2026-06-05T14:00:00Z');
    const second = recordingSender();
    const run = await deliverDueDateReminders({ sender: second.sender, server: ALL_UP });
    expect(second.calls).toHaveLength(0);
    expect(run.failed).toBe(1);
    expect(db.read(`bogle_users/${U}/important_date_deliveries/${SAM}_2026_7`)!.status).toBe(
      'no_channel'
    );
  });
});

describe('channel planning', () => {
  const rec = (over: Partial<ImportantDateRecord> = {}): ImportantDateRecord => ({
    id: 'd',
    key: 'k',
    title: 't',
    date: '--06-12',
    recurring: true,
    kind: 'birthday',
    source: 'user',
    sourceConversationIds: [],
    confidence: 1,
    reminders: defaultReminderRule('birthday'),
    nextReminderAt: null,
    nextReminderKey: null,
    sentReminderKeys: [],
    createdAt: '',
    updatedAt: '',
    ...over,
  });
  const reach = {
    phone: '+15555550123',
    email: 'a@b.co',
    hasPushDevice: true,
    outreachEnabled: true,
  };
  const optedIn = {
    ...DEFAULT_REMINDER_SETTINGS,
    channels: { conversation: true, push: true, sms: true, email: true },
  };

  it('rate-limits texts/emails per day', () => {
    expect(channelPlan(rec(), optedIn, reach, ALL_UP, 0)).toEqual([
      'push',
      'sms',
      'email',
      'in_app',
    ]);
    expect(channelPlan(rec(), optedIn, reach, ALL_UP, MAX_EXTERNAL_PER_DAY)).toEqual([
      'push',
      'in_app',
    ]);
  });

  it('per-date channels narrow the list but cannot bypass the sms/email opt-in', () => {
    const settings = { ...DEFAULT_REMINDER_SETTINGS };
    expect(
      channelPlan(rec({ channels: ['sms', 'conversation'] }), settings, reach, ALL_UP, 0)
    ).toEqual(['in_app']);
    expect(channelPlan(rec({ channels: ['push'] }), settings, reach, ALL_UP, 0)).toEqual(['push']);
  });

  it('skips channels this server or user cannot use', () => {
    expect(
      channelPlan(
        rec(),
        optedIn,
        { ...reach, phone: 'n/a', hasPushDevice: false },
        { push: true, sms: true, email: false },
        0
      )
    ).toEqual(['in_app']);
  });

  it('records a channel that degraded to in-app inside the sender', async () => {
    const sender: ChannelSender = async () => ({ ok: true, channelUsed: 'in_app' });
    const out = await sendWithFallback(['push'], sender, {
      userId: U,
      text: 'x',
      personaId: 'ferni',
      reach,
      triggerId: 't',
    });
    expect(out).toEqual({
      delivered: true,
      channel: 'in_app',
      attempts: [
        { channel: 'push', ok: true },
        { channel: 'in_app', ok: true },
      ],
    });
  });
});

describe('getRemindersForSession', () => {
  it('surfaces near dates in context and claims a reminder due today so the job skips it', async () => {
    seedUser();
    await addSam();
    at('2026-06-05T11:00:00Z'); // 07:00 EDT, before the 09:00 send
    const s = await getRemindersForSession(U);
    expect(s.reminders).toHaveLength(1);
    expect(s.reminders[0]).toMatchObject({ title: "Sam's birthday", daysUntil: 7, dueToday: true });
    expect(s.context).toContain("Sam's birthday: in 7 days");
    expect(s.context).toContain('Want help with a gift?');
    expect(db.read(`bogle_users/${U}/important_date_deliveries/${SAM}_2026_7`)).toMatchObject({
      status: 'surfaced',
      channel: 'conversation',
    });

    at('2026-06-05T14:00:00Z');
    const { calls, sender } = recordingSender();
    await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(calls).toHaveLength(0);
  });

  it('respects the conversation channel switch and topic boundaries', async () => {
    seedUser({}, { channels: { conversation: false } });
    await addSam();
    at('2026-06-08T14:00:00Z');
    expect((await getRemindersForSession(U)).reminders).toHaveLength(0);

    db.docs.set(`bogle_users/${U}/reminder_settings/default`, { timeZone: 'America/New_York' });
    setUserPreferencesModuleForTests({ isTopicAllowedProactively: async () => false });
    expect((await getRemindersForSession(U)).context).toBe('');
  });

  it('returns nothing when storage is unavailable', async () => {
    db = null as unknown as FakeDb;
    expect(await getRemindersForSession(U)).toEqual({ reminders: [], context: '' });
  });
});

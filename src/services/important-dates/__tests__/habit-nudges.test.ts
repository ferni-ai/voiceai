import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, type FakeDb } from './fake-firestore.js';

let db: FakeDb;
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

import { deleteAspiration, upsertAspiration } from '../../aspirations/index.js';
import { resetMigrationCacheForTests as resetAspirationMigration } from '../../aspirations/legacy-migration.js';
import { deliverDueDateReminders } from '../index.js';
import { setUserPreferencesModuleForTests } from '../boundaries-adapter.js';
import { habitNudgeMessage } from '../copy.js';
import { resetMigrationCacheForTests } from '../legacy-migration.js';
import type { ChannelSender, SendChannel } from '../reminder-delivery.js';

const U = 'user-1';
const ALL_UP = { push: true, sms: true, email: true };
const user = (p: string) => `bogle_users/${U}/${p}`;

function seedUser(
  over: Record<string, unknown> = {},
  settings: Record<string, unknown> = {}
): void {
  db.docs.set(`bogle_users/${U}`, {
    contactInfo: { phone: '+15555550123', email: 'sam@example.com' },
    fcmTokens: ['tok'],
    ...over,
  });
  db.docs.set(user('reminder_settings/default'), { timeZone: 'America/New_York', ...settings });
  db.docs.set(user('reminder_settings/legacy_migration'), { migratedAt: 'x' });
}

async function addWalk(over: Record<string, unknown> = {}): Promise<string> {
  const out = await upsertAspiration(U, {
    level: 'habit',
    title: 'Evening walk',
    habit: { schedule: { frequency: 'daily', reminderTime: '18:00' } },
    source: 'explicit',
    confidence: 1,
    ...over,
  });
  if (!out.success) throw out.error;
  return out.data.id;
}

type HabitDoc = { habit: { nextNudgeAt: string | null; checkIns: unknown[]; streak: number } };
const habitDoc = (id: string) => db.read(user(`aspirations/${id}`)) as HabitDoc;

function recordingSender(results: Partial<Record<SendChannel, boolean>> = {}) {
  const calls: Array<{ channel: SendChannel; text: string; triggerId: string }> = [];
  const sender: ChannelSender = async (channel, args) => {
    calls.push({ channel, text: args.text, triggerId: args.triggerId });
    return results[channel] === false ? { ok: false, error: `${channel} down` } : { ok: true };
  };
  return { calls, sender };
}

const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  db = createFakeDb();
  resetMigrationCacheForTests();
  resetAspirationMigration();
  setUserPreferencesModuleForTests(null);
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-03T15:00:00Z') });
  db.docs.set(user('aspirations_meta/legacy_migration'), { migratedAt: 'x' });
});
afterEach(() => {
  vi.useRealTimers();
  setUserPreferencesModuleForTests(undefined);
});

describe('habit nudges in the reminder job', () => {
  it('sends a due nudge once, records it, and plans tomorrow', async () => {
    seedUser();
    const id = await addWalk();
    expect(habitDoc(id).habit.nextNudgeAt).toBe('2026-06-03T22:00:00.000Z'); // 18:00 EDT
    const { calls, sender } = recordingSender();

    at('2026-06-03T21:59:00Z');
    let run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits?.due).toBe(0);

    at('2026-06-03T22:05:00Z');
    run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits).toMatchObject({ due: 1, delivered: 1 });
    expect(calls).toEqual([
      {
        channel: 'push',
        text: 'Gentle nudge: Evening walk. Got a few minutes for it today?',
        triggerId: `${id}_2026-06-03`,
      },
    ]);
    const delivery = db.read(user(`important_date_deliveries/${id}_2026-06-03`))!;
    expect(delivery).toMatchObject({
      kind: 'habit_nudge',
      habitId: id,
      status: 'delivered',
      channel: 'push',
    });
    expect(delivery.text).toBeUndefined(); // ids and outcome only
    expect(habitDoc(id).habit.nextNudgeAt).toBe('2026-06-04T22:00:00.000Z');

    run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits?.due).toBe(0);
    expect(calls).toHaveLength(1);
  });

  it('never sends twice in a day, even if the time is edited after the nudge', async () => {
    seedUser();
    const id = await addWalk();
    at('2026-06-03T22:05:00Z');
    const { calls, sender } = recordingSender();
    await deliverDueDateReminders({ sender, server: ALL_UP });
    // Pretend the reminder time moved later today and the field was re-planned.
    const doc = habitDoc(id);
    db.docs.set(user(`aspirations/${id}`), {
      ...doc,
      habit: { ...doc.habit, nextNudgeAt: '2026-06-03T23:00:00.000Z' },
    });
    at('2026-06-03T23:01:00Z');
    const run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits).toMatchObject({ due: 1, skipped: 1, delivered: 0 });
    expect(calls).toHaveLength(1);
    expect(habitDoc(id).habit.nextNudgeAt).toBe('2026-06-04T22:00:00.000Z');
  });

  it("doesn't nudge a habit already done today, and drops a nudge that's hours stale", async () => {
    seedUser();
    const id = await addWalk();
    const doc = habitDoc(id);
    db.docs.set(user(`aspirations/${id}`), {
      ...doc,
      habit: { ...doc.habit, checkIns: [{ date: '2026-06-03', status: 'done' }] },
    });
    const { calls, sender } = recordingSender();
    at('2026-06-03T22:05:00Z');
    let run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits).toMatchObject({ due: 1, rescheduled: 1 });
    expect(habitDoc(id).habit.nextNudgeAt).toBe('2026-06-04T22:00:00.000Z');

    // Missed runs: at 05:00 the next morning yesterday's 18:00 nudge is too late.
    at('2026-06-05T05:00:00Z');
    run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits).toMatchObject({ due: 1, rescheduled: 1, delivered: 0 });
    expect(calls).toHaveLength(0);
    expect(habitDoc(id).habit.nextNudgeAt).toBe('2026-06-05T22:00:00.000Z');
  });

  it('honours topic boundaries and do-not-contact times', async () => {
    seedUser();
    const id = await addWalk();
    const { calls, sender } = recordingSender();
    at('2026-06-03T22:05:00Z');
    setUserPreferencesModuleForTests({
      getProactiveBoundaries: async () => ({ doNotContact: [{ start: '17:30', end: '18:30' }] }),
      isTopicAllowedProactively: async () => true,
    });
    let run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits?.deferred).toBe(1);
    expect(habitDoc(id).habit.nextNudgeAt).toBe('2026-06-03T23:05:00.000Z');

    at('2026-06-03T23:06:00Z'); // 19:06, outside the window
    run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits?.delivered).toBe(1);
    expect(calls).toHaveLength(1);

    setUserPreferencesModuleForTests({ isTopicAllowedProactively: async () => false });
    at('2026-06-04T22:01:00Z');
    run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits?.suppressed).toBe(1);
    expect(calls).toHaveLength(1);
    expect(habitDoc(id).habit.nextNudgeAt).toBe('2026-06-05T22:00:00.000Z');
  });

  it('defers through quiet hours turned on after planning, then sends when they end', async () => {
    seedUser();
    const id = await addWalk();
    db.docs.set(user('reminder_settings/default'), {
      timeZone: 'America/New_York',
      quietHours: { start: '17:00', end: '20:00' },
    });
    const { calls, sender } = recordingSender();
    at('2026-06-03T22:05:00Z');
    let run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits).toMatchObject({ due: 1, delivered: 0 });
    expect(calls).toHaveLength(0);
    expect(habitDoc(id).habit.nextNudgeAt).toBe('2026-06-04T00:00:00.000Z'); // 20:00 EDT
    at('2026-06-04T00:01:00Z');
    run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits?.delivered).toBe(1);
    expect(calls[0].triggerId).toBe(`${id}_2026-06-03`);
  });

  it('uses only channels the user turned on, and nothing when outreach is off', async () => {
    seedUser({ fcmTokens: [] });
    await addWalk();
    at('2026-06-03T22:05:00Z');
    const first = recordingSender();
    await deliverDueDateReminders({ sender: first.sender, server: ALL_UP });
    expect(first.calls.map((c) => c.channel)).toEqual(['in_app']);

    db = createFakeDb();
    resetMigrationCacheForTests();
    resetAspirationMigration();
    db.docs.set(user('aspirations_meta/legacy_migration'), { migratedAt: 'x' });
    at('2026-06-03T15:00:00Z');
    seedUser({ outreachPreferences: { enabled: false } }, { channels: { sms: true } });
    const id = await addWalk();
    at('2026-06-03T22:05:00Z');
    const second = recordingSender();
    const run = await deliverDueDateReminders({ sender: second.sender, server: ALL_UP });
    expect(second.calls).toHaveLength(0);
    expect(run.habits?.failed).toBe(1);
    expect(db.read(user(`important_date_deliveries/${id}_2026-06-03`))!.status).toBe('no_channel');
  });

  it('clears the nudge of a habit we only inferred, and dry runs change nothing', async () => {
    seedUser();
    const id = await addWalk({ source: 'inferred', confidence: 0.4 });
    const doc = habitDoc(id);
    db.docs.set(user(`aspirations/${id}`), {
      ...doc,
      habit: { ...doc.habit, nextNudgeAt: '2026-06-03T22:00:00.000Z' },
    });
    at('2026-06-03T22:05:00Z');
    const { calls, sender } = recordingSender();
    let run = await deliverDueDateReminders({ sender, server: ALL_UP, dryRun: true });
    expect(run.habits?.rescheduled).toBe(1);
    expect(habitDoc(id).habit.nextNudgeAt).toBe('2026-06-03T22:00:00.000Z');
    run = await deliverDueDateReminders({ sender, server: ALL_UP });
    expect(run.habits?.rescheduled).toBe(1);
    expect(habitDoc(id).habit.nextNudgeAt).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('deleting a habit', () => {
  it('removes its nudge delivery records', async () => {
    seedUser();
    const id = await addWalk();
    at('2026-06-03T22:05:00Z');
    await deliverDueDateReminders({ sender: recordingSender().sender, server: ALL_UP });
    expect(db.read(user(`important_date_deliveries/${id}_2026-06-03`))).toBeDefined();
    const out = await deleteAspiration(U, id, 'user_deleted');
    expect(out.success).toBe(true);
    expect(db.read(user(`important_date_deliveries/${id}_2026-06-03`))).toBeUndefined();
  });
});

describe('habitNudgeMessage', () => {
  it('is short and mentions a streak worth keeping', () => {
    expect(habitNudgeMessage('floss')).toBe('Gentle nudge: Floss. Got a few minutes for it today?');
    expect(habitNudgeMessage('Floss', 4)).toBe("Floss? You're on a 4-day streak. Keep it going?");
  });
});

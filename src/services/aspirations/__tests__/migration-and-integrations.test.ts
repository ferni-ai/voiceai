import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, type FakeDb } from '../../important-dates/__tests__/fake-firestore.js';

let db: FakeDb;
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => db }));

import {
  aspirationIdFor,
  deleteAspiration,
  editAspiration,
  getAspirationsForSession,
  listAspirations,
  recordCheckIn,
  upsertAspiration,
} from '../index.js';
import { resetMigrationCacheForTests } from '../legacy-migration.js';
import { SESSION_BLOCK_MAX_CHARS, fitBudget } from '../session-block.js';
import { setUserPreferencesModuleForTests } from '../../important-dates/boundaries-adapter.js';
import { importantDateIdFor, importantDateKey } from '../../important-dates/identity.js';
import { resetMigrationCacheForTests as resetDateMigration } from '../../important-dates/legacy-migration.js';

const U = 'user-1';
const user = (p: string) => `bogle_users/${U}/${p}`;
const put = (p: string, data: Record<string, unknown>) => db.docs.set(user(p), data);

beforeEach(() => {
  db = createFakeDb();
  resetMigrationCacheForTests();
  resetDateMigration();
  setUserPreferencesModuleForTests(null);
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-03T15:00:00Z') });
});
afterEach(() => vi.useRealTimers());

function seedLegacy(): void {
  put('dreams/dream_1', {
    statement: 'I want to write a novel',
    type: 'creative',
    status: 'dormant',
    confidence: 0.9,
    mentionCount: 3,
    firstMentioned: Date.parse('2025-01-01T00:00:00Z'),
    lastMentioned: Date.parse('2025-02-01T00:00:00Z'),
  });
  put('goals/goal_1', {
    title: 'Save for a trip',
    progress: 40,
    targetDate: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-01-02T00:00:00Z',
  });
  put('commitments/commit_1', { type: 'goal', summary: 'get my black belt', status: 'active' });
  put('commitments/commit_2', { type: 'promise', summary: 'call mom' });
  put('habits/habit_1', {
    name: 'Floss',
    isActive: true,
    glidepathLevel: 2,
    cue: 'after brushing',
  });
  put('habits/habit_1/logs/l1', { completedAt: '2026-06-01T14:00:00Z' });
  db.docs.set(`bogle_users/${U}`, {
    timezone: 'America/New_York',
    productivityData: {
      habits: [
        {
          id: 'habit_p',
          name: 'Drink water',
          frequency: 'daily',
          targetPerDay: 1,
          isActive: true,
          category: 'health',
        },
      ],
      habitLogs: [
        { id: 'l1', habitId: 'habit_p', date: '2026-06-01T23:30:00Z', completed: true, count: 1 },
        { id: 'l2', habitId: 'habit_p', date: '2026-06-02T13:00:00Z', completed: true, count: 1 },
      ],
      enhancedHabits: [],
    },
    lifeData: {
      goals: [
        { id: 'lg1', title: 'Run a half marathon', status: 'in-progress', progressPercent: 10 },
      ],
    },
    goals: [{ id: 'fg1', name: 'Retirement', status: 'active' }],
  });
}

describe('legacy migration', () => {
  it('copies every older store once, with check-ins on the user day', async () => {
    seedLegacy();
    const listed = await listAspirations(U);
    const items = listed.success ? listed.data : [];
    const titles = items.map((r) => `${r.level}:${r.title}`).sort();
    expect(titles).toEqual([
      'dream:I want to write a novel',
      'goal:Retirement',
      'goal:Run a half marathon',
      'goal:Save for a trip',
      'goal:get my black belt',
      'habit:Drink water',
      'habit:Floss',
    ]);
    const novel = items.find((r) => r.level === 'dream');
    expect(novel).toMatchObject({
      status: 'dormant',
      category: 'creative',
      source: 'explicit',
      legacyIds: ['dream_1'],
    });
    expect(novel?.lastMentionedAt).toBe('2025-02-01T00:00:00.000Z');
    const water = items.find((r) => r.title === 'Drink water');
    // 23:30Z on Jun 1 is still Jun 1 in New York.
    expect(water?.habit?.checkIns.map((c) => c.date)).toEqual(['2026-06-01', '2026-06-02']);
    expect(water?.habit?.streak).toBe(2);
    const floss = items.find((r) => r.title === 'Floss');
    expect(floss?.habit).toMatchObject({ glidepathLevel: 2, loop: { cue: 'after brushing' } });
    expect(items.find((r) => r.title === 'Save for a trip')).toMatchObject({
      progress: 40,
      targetDate: '2026-09-01',
    });
    expect(db.read(user('aspirations_meta/legacy_migration'))?.copied).toBe(7);
  });

  it('is idempotent and respects deletions', async () => {
    seedLegacy();
    await listAspirations(U);
    const flossId = aspirationIdFor('habit', 'Floss');
    await deleteAspiration(U, flossId);
    resetMigrationCacheForTests();
    const again = await listAspirations(U);
    expect(again.success && again.data).toHaveLength(6);
    // Even with the marker gone, the tombstone keeps it deleted.
    db.docs.delete(user('aspirations_meta/legacy_migration'));
    resetMigrationCacheForTests();
    const third = await listAspirations(U);
    expect(third.success && third.data.map((r) => r.id)).not.toContain(flossId);
    expect(third.success && third.data).toHaveLength(6);
  });
});

describe('goal deadlines through important dates', () => {
  it('schedules, moves and removes the deadline', async () => {
    const out = await upsertAspiration(U, {
      level: 'goal',
      title: 'Finish the thesis',
      targetDate: '2026-07-01',
      source: 'explicit',
      confidence: 1,
    });
    const id = out.success ? out.data.id : '';
    const dateId = importantDateIdFor(
      importantDateKey({ kind: 'deadline', title: 'Finish the thesis' })
    );
    expect(db.read(user(`important_dates/${dateId}`))).toMatchObject({
      kind: 'deadline',
      date: '2026-07-01',
      recurring: false,
      source: 'user',
      subtype: 'goal',
    });
    expect(db.read(user(`aspirations/${id}`))?.deadlineDateId).toBe(dateId);

    await editAspiration(U, id, { status: 'achieved' });
    expect(db.read(user(`important_dates/${dateId}`))).toBeUndefined();
    expect(db.read(user(`aspirations/${id}`))?.deadlineDateId).toBeNull();
  });

  it('does not schedule unconfirmed inferred goals', async () => {
    await upsertAspiration(U, {
      level: 'goal',
      title: 'Learn piano',
      targetDate: '2026-12-01',
      source: 'inferred',
      confidence: 0.65,
    });
    const dates = [...db.docs.keys()].filter((k) => k.includes('/important_dates/'));
    expect(dates).toEqual([]);
  });

  it('plans a habit nudge when it has a reminder time', async () => {
    const out = await upsertAspiration(U, {
      level: 'habit',
      title: 'Walk',
      habit: { schedule: { frequency: 'daily', reminderTime: '18:00' } },
      source: 'explicit',
      confidence: 1,
    });
    const doc = db.read(user(`aspirations/${out.success ? out.data.id : ''}`)) as {
      habit: { nextNudgeAt: string };
    };
    expect(doc.habit.nextNudgeAt).toBe('2026-06-03T22:00:00.000Z'); // 18:00 New York (default zone)
  });
});

describe('session block', () => {
  async function seed(): Promise<void> {
    const h = await upsertAspiration(U, {
      level: 'habit',
      title: 'Meditate',
      source: 'explicit',
      confidence: 1,
    });
    const hid = h.success ? h.data.id : '';
    await recordCheckIn(U, hid, { status: 'done', date: '2026-06-01' });
    await recordCheckIn(U, hid, { status: 'done', date: '2026-06-02' });
    await upsertAspiration(U, {
      level: 'goal',
      title: 'Run a half marathon',
      progress: 40,
      targetDate: '2026-10-01',
      source: 'explicit',
      confidence: 1,
    });
    await upsertAspiration(U, {
      level: 'goal',
      title: 'Quit sugar',
      source: 'inferred',
      confidence: 0.65,
    });
    const d = await upsertAspiration(U, {
      level: 'dream',
      title: 'Live by the sea',
      source: 'explicit',
      confidence: 1,
    });
    const did = d.success ? d.data.id : '';
    const doc = db.read(user(`aspirations/${did}`)) ?? {};
    db.docs.set(user(`aspirations/${did}`), {
      ...doc,
      lastMentionedAt: '2026-01-01T00:00:00.000Z',
    });
  }

  it('shows due habits, confirmed goals and one quiet dream, then rests the dream', async () => {
    await seed();
    const first = await getAspirationsForSession(U);
    expect(first.habitsDue).toEqual(['Meditate']);
    expect(first.goals).toEqual(['Run a half marathon']); // inferred goal not confirmed
    expect(first.dreamToResurface).toBe('Live by the sea');
    expect(first.context).toContain('## Goals & habits');
    expect(first.context).toContain('Meditate (2-day streak at risk)');
    expect(first.context).toContain('40%');
    expect(first.context.length).toBeLessThanOrEqual(SESSION_BLOCK_MAX_CHARS);
    const second = await getAspirationsForSession(U);
    expect(second.dreamToResurface).toBeNull();
  });

  it('leaves out topics the user asked not to raise', async () => {
    await seed();
    setUserPreferencesModuleForTests({
      isTopicAllowedProactively: async (_u, topic) => !/marathon|sea/i.test(topic),
    });
    const out = await getAspirationsForSession(U);
    expect(out.goals).toEqual([]);
    expect(out.dreamToResurface).toBeNull();
    expect(out.habitsDue).toEqual(['Meditate']);
  });

  it('keeps to the character budget', () => {
    const lines = Array.from(
      { length: 40 },
      (_, i) => `- Goal: something long enough to matter ${i}`
    );
    const text = fitBudget('## Goals & habits', lines, 'footer');
    expect(text.length).toBeLessThanOrEqual(SESSION_BLOCK_MAX_CHARS);
    expect(text).toContain('footer');
  });
});

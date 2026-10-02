import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, type FakeDb } from '../../important-dates/__tests__/fake-firestore.js';

let db: FakeDb;
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => db,
  cleanForFirestore: <T>(v: T) => v,
  recordDegradation: () => undefined,
}));
vi.mock('../../data-layer/integrations/index.js', () => ({ indexDream: () => undefined }));

import {
  aspirationIdFor,
  captureFromUtterance,
  listAspirations,
  upsertAspiration,
} from '../index.js';
import { detectInSummary, detectInUtterance, matchItems } from '../detection.js';
import { resetMigrationCacheForTests } from '../legacy-migration.js';
import { setUserPreferencesModuleForTests } from '../../important-dates/boundaries-adapter.js';
import { voiceAddGoal, voiceListHabits, voiceLogHabit, voiceUpdateGoal } from '../voice.js';
import {
  flushHabitSync,
  habitsForProductivityStore,
  syncLegacyHabit,
  syncLegacyHabitLog,
} from '../legacy-habit-sync.js';
import { loadUserDreams, recordDreamMention } from '../../superhuman/dream-keeper-storage.js';

const U = 'user-1';
const doc = (id: string) => db.read(`bogle_users/${U}/aspirations/${id}`);

beforeEach(() => {
  db = createFakeDb();
  resetMigrationCacheForTests();
  setUserPreferencesModuleForTests(null);
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-03T15:00:00Z') });
});
afterEach(() => vi.useRealTimers());

describe('detection', () => {
  it.each([
    ['Someday I want to live by the sea.', 'dream', 'live by the sea'],
    ["I've always wanted to visit Japan, but money's tight", 'dream', 'visit Japan'],
    ['My goal is to run a half marathon by October.', 'goal', 'run a half marathon by October'],
    ["I'm trying to meditate every morning", 'habit', 'meditate'],
  ])('%s', (text, level, title) => {
    const [e] = detectInUtterance(text);
    expect(e).toMatchObject({ kind: 'aspiration', item: { level, title } });
  });

  it('spots check-ins, misses and let-gos', () => {
    expect(detectInUtterance('I did my run today')).toContainEqual({
      kind: 'check-in',
      status: 'done',
      phrase: 'run',
      yesterday: false,
    });
    expect(detectInUtterance('I meditated this morning')[0]).toMatchObject({
      kind: 'check-in',
      status: 'done',
      phrase: 'meditated',
    });
    expect(detectInUtterance('I skipped my workout yesterday')[0]).toMatchObject({
      status: 'missed',
      yesterday: true,
    });
    expect(detectInUtterance("I'm letting go of that dream")[0]).toMatchObject({
      kind: 'let-go',
      level: 'dream',
    });
    expect(detectInUtterance('What a nice day')).toEqual([]);
  });

  it('reads third-person summaries as inferred candidates', () => {
    expect(
      detectInSummary('User is trying to journal every night. They plan to move to Lisbon.')
    ).toEqual([
      { level: 'habit', title: 'journal', confidence: 0.65, frequency: 'daily' },
      { level: 'goal', title: 'move to Lisbon', confidence: 0.65 },
    ]);
  });

  it('matches loose phrasings to habits', async () => {
    await upsertAspiration(U, {
      level: 'habit',
      title: 'go for a run every morning',
      source: 'explicit',
      confidence: 1,
    });
    await upsertAspiration(U, {
      level: 'habit',
      title: 'meditate',
      source: 'explicit',
      confidence: 1,
    });
    const listed = await listAspirations(U);
    const items = listed.success ? listed.data : [];
    expect(matchItems('ran', items)[0]?.title).toBe('go for a run every morning');
    expect(matchItems('meditated', items)[0]?.title).toBe('meditate');
    expect(matchItems('swimming', items)).toEqual([]);
  });
});

describe('live capture', () => {
  it('captures, checks in and lets go', async () => {
    await captureFromUtterance(U, "I'm trying to meditate every morning", { conversationId: 'c1' });
    const hid = aspirationIdFor('habit', 'meditate');
    expect(doc(hid)).toMatchObject({
      level: 'habit',
      source: 'explicit',
      sourceConversationIds: ['c1'],
    });
    const r = await captureFromUtterance(U, 'I meditated this morning', { conversationId: 'c1' });
    expect(r.checkIns).toEqual([hid]);
    expect(
      (doc(hid) as { habit: { checkIns: Array<{ date: string }> } }).habit.checkIns[0].date
    ).toBe('2026-06-03');

    await captureFromUtterance(U, 'Someday I want to live by the sea.', { conversationId: 'c1' });
    const did = aspirationIdFor('dream', 'live by the sea');
    expect(doc(did)?.status).toBe('active');
    const lg = await captureFromUtterance(U, "I'm letting go of that dream.", {
      conversationId: 'c2',
    });
    expect(lg.statusChanges).toEqual([did]);
    expect(doc(did)?.status).toBe('let-go');
  });

  it("doesn't guess which dream when several match", async () => {
    await upsertAspiration(U, {
      level: 'dream',
      title: 'live by the sea',
      source: 'explicit',
      confidence: 1,
    });
    await upsertAspiration(U, {
      level: 'dream',
      title: 'write a novel',
      source: 'explicit',
      confidence: 1,
    });
    const lg = await captureFromUtterance(U, "I'm letting go of that dream.");
    expect(lg.statusChanges).toEqual([]);
  });
});

describe('voice operations (tools and JSON executors)', () => {
  const ctx = { userId: U, conversationId: 'c1' };
  it('adds a goal with a spoken deadline and updates progress', async () => {
    const said = await voiceAddGoal(ctx, { title: 'run a half marathon', targetDate: 'October 4' });
    expect(said).toMatch(/2026-10-04/);
    const id = aspirationIdFor('goal', 'run a half marathon');
    expect(doc(id)).toMatchObject({ targetDate: '2026-10-04', source: 'explicit' });
    expect(await voiceUpdateGoal(ctx, { name: 'half marathon', progress: 50 })).toMatch(/50%/);
    expect(doc(id)?.progress).toBe(50);
    expect(await voiceUpdateGoal(ctx, { name: 'half marathon', status: 'achieved' })).toMatch(
      /You did it/
    );
  });

  it('logs habits by loose name and lists what is due', async () => {
    await upsertAspiration(U, {
      level: 'habit',
      title: 'stretch',
      source: 'explicit',
      confidence: 1,
    });
    await upsertAspiration(U, { level: 'habit', title: 'read', source: 'explicit', confidence: 1 });
    expect(await voiceLogHabit(ctx, { name: 'stretching' })).toMatch(/stretch" done/);
    expect(await voiceListHabits(ctx)).toMatch(/Still to do today: read/);
    expect(await voiceLogHabit(ctx, { name: 'pottery' })).toMatch(/don't have "pottery"/);
  });
});

describe('legacy readers and writers', () => {
  it('Dream Keeper is a view over the store', async () => {
    await recordDreamMention(U, {
      type: 'creative',
      statement: 'My dream is to open a bakery',
      confidence: 0.9,
    });
    await recordDreamMention(U, { type: 'creative', statement: 'open a bakery', confidence: 0.85 });
    const dreams = await loadUserDreams(U);
    expect(dreams).toHaveLength(1);
    expect(dreams[0]).toMatchObject({ type: 'creative', status: 'alive', mentionCount: 2 });
    expect(dreams[0].id).toBe(aspirationIdFor('dream', 'open a bakery'));
  });

  it('ProductivityStore habit writes land in the store and read back', async () => {
    await syncLegacyHabit(U, {
      id: 'habit_123',
      name: 'Drink water',
      category: 'health',
      frequency: 'daily',
      targetPerDay: 1,
      isActive: true,
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
    });
    await syncLegacyHabitLog(U, {
      id: 'log1',
      habitId: 'habit_123',
      date: '2026-06-03T14:00:00Z',
      completed: true,
      count: 1,
    });
    await flushHabitSync(U);
    const id = aspirationIdFor('habit', 'Drink water');
    expect(doc(id)).toMatchObject({ legacyIds: ['habit_123'], category: 'health' });
    const views = await habitsForProductivityStore(U);
    expect(views?.habits[0]).toMatchObject({ id, name: 'Drink water', isActive: true });
    expect(views?.logs[0]).toMatchObject({
      habitId: id,
      completed: true,
      date: '2026-06-03T12:00:00.000Z',
    });
  });
});

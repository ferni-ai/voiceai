/**
 * A score nobody measured stays missing; a real 0 stays 0.
 *
 * `?? 0` / `|| 0` on a user's score makes up the worst reading there is. The
 * semantic memory said "Mood 0/10, Energy 0/10" for a check-in with no mood,
 * every Apple Health activity day was filed as "Mood 5/10", a week with no
 * energy logged read "Energy: 0.0/10", contacts without a strength score
 * dragged the average strength down, and a reminder could tell a member their
 * "0-day streak" was at risk. Each site has a row for a missing input and a row
 * for a real 0.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as storeHooks from '../services/data-layer/store-hooks.js';

vi.mock('../services/data-layer/store-hooks.js', () => ({ onStoreChange: vi.fn() }));
vi.mock('../services/background-agents/unified-result-capture.js', () => ({
  captureBackgroundResult: vi.fn(async () => undefined),
}));
const fakeRef: Record<string, unknown> = {};
Object.assign(fakeRef, {
  collection: () => fakeRef,
  doc: () => fakeRef,
  set: async () => undefined,
  update: async () => undefined,
  get: async () => ({ data: () => undefined }),
});
vi.mock('../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => fakeRef,
  cleanForFirestore: (value: unknown) => value,
}));
const energyTrend = vi.fn();
vi.mock('../tools/domains/ceo-coaching/storage.js', () => ({
  getRecentWins: async () => [],
  getEnergyTrend: () => energyTrend(),
  getRecentEnergyEntries: async () => [],
  getActiveBlockers: async () => [],
  getPendingDecisions: async () => [],
  getRecentGratitude: async () => [],
  getPriorities: async () => [],
}));

const { onWellnessCheckinChange } = await import('../services/data-layer/hooks/index.js');
const { onHabitDNAChange } = await import('../services/data-layer/hooks/superhuman-hooks.js');
const { executeHabitReminder } =
  await import('../services/background-agents/executors/habit-reminder-executor.js');
const { buildRelationshipInsightsView } =
  await import('../services/contacts/relationship-insights-view.js');
const { generateWeeklyDigest, renderDigestEmail, renderDigestText } =
  await import('../services/ceo-coaching/weekly-digest.js');

const { processSyncPayload } = await import('../services/identity/apple-health-sync.js');

type Contact = Parameters<typeof buildRelationshipInsightsView>[0][number];

function indexed(): string {
  const calls = vi.mocked(storeHooks.onStoreChange).mock.calls;
  return (calls[calls.length - 1]![0] as { content: string }).content;
}

beforeEach(() => vi.clearAllMocks());

describe('wellness check-in memory text', () => {
  it.each([
    ['no mood', { energy: 6 }, 'Wellness check: Energy 6/10.', /Mood/],
    ['no energy', { mood: 7 }, 'Wellness check: Mood 7/10.', /Energy/],
    ['neither', {}, 'Wellness check.', /\/10/],
    ['a NaN mood', { mood: Number.NaN, energy: 6 }, 'Wellness check: Energy 6/10.', /Mood/],
  ])('leaves out a score it does not have: %s', (_label, scores, starts, absent) => {
    onWellnessCheckinChange('u1', 'c1', { ...scores, timestamp: '2026-10-18' }, 'create');
    expect(indexed().startsWith(starts)).toBe(true);
    expect(indexed()).not.toMatch(absent);
  });

  it('keeps a real 0', () => {
    onWellnessCheckinChange('u1', 'c1', { mood: 0, energy: 0, timestamp: '2026-10-18' }, 'create');
    expect(indexed()).toContain('Mood 0/10, Energy 0/10');
  });
});

describe('habit DNA memory text', () => {
  it('does not make up the streak it was not given', () => {
    onHabitDNAChange('u1', 'h1', { habitName: 'Run', longestStreak: 12 } as never, 'create');
    expect(indexed()).toContain('Longest streak: 12.');
    expect(indexed()).not.toContain('Current streak');
  });

  it('keeps a real 0-day streak', () => {
    onHabitDNAChange('u1', 'h1', { habitName: 'Run', currentStreak: 0 } as never, 'create');
    expect(indexed()).toContain('Current streak: 0.');
    expect(indexed()).not.toContain('Longest streak');
  });
});

describe('habit reminder sent to the member', () => {
  const request = {
    userId: 'u1',
    habitId: 'h1',
    habitName: 'Run',
    reminderType: 'streak_warning' as const,
  };

  it('names no number when the streak is unknown', async () => {
    const { message } = await executeHabitReminder(request);
    expect(message).toBe('Your streak for "Run" is at risk! Don\'t let it slip. 💪');
    const celebrated = await executeHabitReminder({ ...request, reminderType: 'celebration' });
    expect(celebrated.message).not.toMatch(/\d/);
  });

  it('keeps a real streak, 0 included', async () => {
    expect((await executeHabitReminder({ ...request, currentStreak: 5 })).message).toContain(
      'Your 5-day streak'
    );
    expect((await executeHabitReminder({ ...request, currentStreak: 0 })).message).toContain(
      'Your 0-day streak'
    );
  });
});

describe('relationship insights average strength', () => {
  const contact = (strengthScore: number | undefined): Contact =>
    ({ relationship: 'friend', lastInteraction: new Date('2026-10-01'), strengthScore }) as never;

  it('averages only the contacts that have a score', () => {
    const view = buildRelationshipInsightsView([contact(80), contact(undefined)], []);
    expect(view.stats.averageStrength).toBe(80);
  });

  it('is null, not 0, when no contact has a score', () => {
    expect(
      buildRelationshipInsightsView([contact(undefined)], []).stats.averageStrength
    ).toBeNull();
  });

  it('keeps a real 0', () => {
    expect(buildRelationshipInsightsView([contact(0), contact(60)], []).stats.averageStrength).toBe(
      30
    );
  });
});

describe('weekly digest energy', () => {
  it('a week with no energy logged says so', async () => {
    energyTrend.mockResolvedValue(null);
    const data = await generateWeeklyDigest('u1');
    expect(data.energy.average).toBeNull();
    expect(renderDigestText(data)).toContain('⚡ Energy: not logged (stable)');
    expect(renderDigestEmail(data)).not.toContain('0.0');
  });

  it('a trend without an average is still unknown', async () => {
    energyTrend.mockResolvedValue({ trend: 'up' });
    expect((await generateWeeklyDigest('u1')).energy.average).toBeNull();
  });

  it('a real average is shown, 0 included', async () => {
    energyTrend.mockResolvedValue({ trend: 'down', weekAverage: 0 });
    const data = await generateWeeklyDigest('u1');
    expect(data.energy.average).toBe(0);
    expect(renderDigestText(data)).toContain('⚡ Energy: 0.0/10 (down)');
  });
});

describe('Apple Health activity day', () => {
  const sync = (reading: Record<string, number>) =>
    processSyncPayload('u1', {
      userId: 'u1',
      deviceId: 'd1',
      syncedAt: '2026-10-18T08:00:00Z',
      data: { activity: [{ date: '2026-10-17', ...reading }] },
    } as never);
  const checkin = () =>
    vi
      .mocked(storeHooks.onStoreChange)
      .mock.calls.map(
        ([c]) => c as { entityType: string; content: string; metadata: Record<string, unknown> }
      )
      .find((c) => c.entityType === 'wellness_checkin')!;

  it('files no mood and no energy it did not measure', async () => {
    expect((await sync({})).success).toBe(true);
    expect(checkin().metadata.mood).toBeUndefined();
    expect(checkin().metadata.energy).toBeUndefined();
    expect(checkin().content).not.toMatch(/\/10|Active calories: 0/);
  });

  it('keeps a real 0 reading', async () => {
    await sync({ activeEnergyBurned: 0, appleExerciseTime: 0 });
    expect(checkin().metadata.mood).toBeUndefined();
    expect(checkin().metadata.energy).toBe(0);
    expect(checkin().content).toContain('Active calories: 0, Exercise: 0 min');
  });

  it('turns measured calories into energy', async () => {
    await sync({ activeEnergyBurned: 350, appleExerciseTime: 30 });
    expect(checkin().metadata.energy).toBe(7);
    expect(checkin().content).toContain('Energy 7/10');
  });
});

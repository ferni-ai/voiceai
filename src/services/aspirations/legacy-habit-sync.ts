/**
 * Bridge between the ProductivityStore's habit API (used by the habits tool
 * domain, habit coaching, voice habit tools, outreach and persona insights)
 * and the canonical aspirations store.
 *
 * - Reads: `habitsForProductivityStore(userId)` returns habit-level
 *   aspirations as HabitData / HabitLogData / EnhancedHabitData so every
 *   existing reader sees the canonical habits.
 * - Writes: `syncLegacyHabit*` mirror ProductivityStore writes into the
 *   canonical store (create/update, check-ins, enhanced coaching fields).
 *   Writes per user run in order (create before its first log).
 *
 * @module services/aspirations/legacy-habit-sync
 */

import { createLogger } from '../../utils/safe-logger.js';
import { resolveTimeZone } from '../important-dates/settings.js';
import type { EnhancedHabitData, HabitData, HabitLogData } from '../stores/productivity-types.js';
import { recordCheckIn } from './check-ins.js';
import { ASPIRATION_ID_PATTERN, aspirationIdFor } from './identity.js';
import { toDay } from './legacy-mappers.js';
import {
  findByLegacyId,
  getAspiration,
  listAspirations,
  saveAspiration,
  upsertAspiration,
} from './store.js';
import type { AspirationRecord, AspirationStatus, HabitFrequency } from './types.js';

const log = createLogger({ module: 'aspirations:habit-sync' });

const queues = new Map<string, Promise<unknown>>();

/** Run writes for one user in order; never rejects. */
function enqueue(userId: string, task: () => Promise<unknown>): Promise<void> {
  const prev = queues.get(userId) ?? Promise.resolve();
  const next = prev
    .then(task)
    .catch((error: unknown) => log.warn({ error: String(error), userId }, 'Habit sync failed'));
  queues.set(userId, next);
  void next.finally(() => {
    if (queues.get(userId) === next) queues.delete(userId);
  });
  return next.then(() => undefined);
}

/** Wait for queued writes (tests, shutdown). */
export async function flushHabitSync(userId?: string): Promise<void> {
  if (userId) await queues.get(userId);
  else await Promise.all([...queues.values()]);
}

const FREQS: readonly HabitFrequency[] = ['daily', 'weekdays', 'weekends', 'weekly', 'custom'];
const freq = (f: string): HabitFrequency =>
  FREQS.includes(f as HabitFrequency) ? (f as HabitFrequency) : 'daily';

export async function resolveHabit(
  userId: string,
  id: string,
  title?: string
): Promise<AspirationRecord | null> {
  if (ASPIRATION_ID_PATTERN.test(id)) {
    const got = await getAspiration(userId, id);
    if (got.success) return got.data;
  }
  const byLegacy = await findByLegacyId(userId, id);
  if (byLegacy) return byLegacy;
  if (title) {
    const got = await getAspiration(userId, aspirationIdFor('habit', title));
    if (got.success) return got.data;
  }
  return null;
}

function legacyStatus(isActive: boolean, isPaused = false): AspirationStatus {
  if (isPaused) return 'paused';
  return isActive ? 'active' : 'let-go';
}

async function applyStatus(
  userId: string,
  r: AspirationRecord,
  status: AspirationStatus
): Promise<void> {
  if (r.status === status || r.userEdited) return;
  const now = new Date().toISOString();
  await saveAspiration(userId, { ...r, status, statusChangedAt: now, updatedAt: now });
}

export function syncLegacyHabit(userId: string, habit: HabitData): Promise<void> {
  return enqueue(userId, async () => {
    const existing = await resolveHabit(userId, habit.id, habit.name);
    const status = legacyStatus(habit.isActive);
    if (existing) {
      await applyStatus(userId, existing, status);
      return;
    }
    await upsertAspiration(userId, {
      level: 'habit',
      title: habit.name,
      ...(habit.description ? { why: habit.description } : {}),
      ...(habit.category ? { category: habit.category } : {}),
      status,
      habit: {
        schedule: {
          frequency: freq(habit.frequency),
          ...(habit.customDays ? { days: habit.customDays } : {}),
          timesPerDay: habit.targetPerDay || 1,
          ...(habit.reminderTime ? { reminderTime: habit.reminderTime } : {}),
        },
      },
      source: 'explicit',
      confidence: 1,
      ...(ASPIRATION_ID_PATTERN.test(habit.id) ? {} : { legacyId: habit.id }),
    });
  });
}

export function syncLegacyHabitLog(userId: string, entry: HabitLogData): Promise<void> {
  return enqueue(userId, async () => {
    const habit = await resolveHabit(userId, entry.habitId);
    if (!habit) return;
    // A partial count (2 of 3 glasses) isn't a missed day; only record completions.
    if (!entry.completed) return;
    const tz = await resolveTimeZone(userId);
    const date = toDay(entry.date, tz);
    await recordCheckIn(userId, habit.id, {
      status: 'done',
      ...(date ? { date } : {}),
      ...(entry.notes ? { note: entry.notes } : {}),
    });
  });
}

export function syncEnhancedHabit(userId: string, h: EnhancedHabitData): Promise<void> {
  return enqueue(userId, async () => {
    const existing = await resolveHabit(userId, h.id, h.name);
    const input = {
      level: 'habit' as const,
      title: existing?.title ?? h.name,
      ...(h.description ? { why: h.description } : {}),
      category: h.domain,
      habit: {
        schedule: {
          frequency: freq(h.frequency),
          ...(h.customDays ? { days: h.customDays } : {}),
          timesPerDay: h.targetPerDay || 1,
          ...(h.reminderTime ? { reminderTime: h.reminderTime } : {}),
        },
        glidepathLevel: h.currentLevel,
        loop: {
          cue: h.habitLoop?.cue?.description,
          routine: h.habitLoop?.routine?.behavior,
          reward: h.habitLoop?.reward?.intrinsic,
        },
        ...(h.stackedOnto ? { stackAnchor: h.stackedOnto } : {}),
      },
      source: 'explicit' as const,
      confidence: 1,
      ...(ASPIRATION_ID_PATTERN.test(h.id) ? {} : { legacyId: h.id }),
    };
    const out = await upsertAspiration(userId, input);
    if (out.success && out.data.record) {
      await applyStatus(userId, out.data.record, legacyStatus(h.isActive, h.isPaused));
    }
  });
}

// ============================================================================
// READS
// ============================================================================

export interface LegacyHabitViews {
  habits: HabitData[];
  logs: HabitLogData[];
  enhanced: EnhancedHabitData[];
}

function toHabitData(r: AspirationRecord): HabitData {
  const s = r.habit!.schedule;
  return {
    id: r.id,
    name: r.title,
    ...(r.why ? { description: r.why } : {}),
    category: r.category ?? 'other',
    frequency: s.frequency,
    ...(s.days ? { customDays: s.days } : {}),
    targetPerDay: s.timesPerDay,
    ...(s.reminderTime ? { reminderTime: s.reminderTime } : {}),
    isActive: r.status === 'active' || r.status === 'paused' || r.status === 'dormant',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toEnhanced(r: AspirationRecord): EnhancedHabitData {
  const h = r.habit!;
  const done = h.checkIns.filter((c) => c.status === 'done').length;
  return {
    id: r.id,
    name: r.title,
    ...(r.why ? { description: r.why } : {}),
    domain: r.category ?? 'selfCare',
    currentLevel: h.glidepathLevel ?? 1,
    targetLevel: 5,
    levelStartDate: r.statusChangedAt ?? r.createdAt,
    levelHistory: [],
    habitLoop: {
      cue: { type: 'custom', description: h.loop?.cue ?? '', specificity: 'medium' },
      routine: { behavior: h.loop?.routine ?? r.title, duration: 2, difficulty: 'easy' },
      reward: { intrinsic: h.loop?.reward ?? '', celebration: '' },
    },
    ...(h.stackAnchor ? { stackedOnto: h.stackAnchor } : {}),
    isKeystone: false,
    frequency: h.schedule.frequency,
    ...(h.schedule.days ? { customDays: h.schedule.days } : {}),
    targetPerDay: h.schedule.timesPerDay,
    currentStreak: h.streak,
    longestStreak: h.longestStreak,
    totalCompletions: done,
    successRate: h.checkIns.length ? Math.round((done / h.checkIns.length) * 100) : 0,
    ...(h.schedule.reminderTime ? { reminderTime: h.schedule.reminderTime } : {}),
    isActive: r.status !== 'let-go' && r.status !== 'achieved',
    isPaused: r.status === 'paused',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    tags: [],
  };
}

/** Canonical habits in the ProductivityStore's shapes; null when unavailable. */
export async function habitsForProductivityStore(userId: string): Promise<LegacyHabitViews | null> {
  const listed = await listAspirations(userId, { level: 'habit' });
  if (!listed.success) return null;
  const records = listed.data.filter((r) => r.habit);
  return {
    habits: records.map(toHabitData),
    logs: records.flatMap((r) =>
      r.habit!.checkIns.map((c) => ({
        id: `${r.id}_${c.date}`,
        habitId: r.id,
        // Noon UTC keeps the civil day stable for readers in any zone.
        date: `${c.date}T12:00:00.000Z`,
        completed: c.status === 'done',
        count: c.status === 'done' ? r.habit!.schedule.timesPerDay : 0,
        ...(c.note ? { notes: c.note } : {}),
      }))
    ),
    enhanced: records
      .filter((r) => r.habit!.glidepathLevel || r.habit!.loop || r.habit!.stackAnchor)
      .map(toEnhanced),
  };
}

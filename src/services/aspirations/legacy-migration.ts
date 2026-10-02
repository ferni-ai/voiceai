/**
 * One-time, per-user copy of dreams, goals and habits held by older stores
 * into the canonical aspirations store (sources listed in legacy-mappers.ts).
 * Runs lazily the first time a user's aspirations are listed and records
 * `aspirations_meta/legacy_migration` so it never runs twice. Sources are
 * left in place, read-only from now on. Tombstoned items are not re-added.
 *
 * @module services/aspirations/legacy-migration
 */

import type { Firestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { localToday } from '../important-dates/date-math.js';
import { resolveTimeZone } from '../important-dates/settings.js';
import { aspirationIdFor } from './identity.js';
import { mergeCheckIn, withStreaks } from './habit-math.js';
import {
  asData,
  checkInsFromLogs,
  fromCommitmentGoal,
  fromDream,
  fromFinancialGoal,
  fromGoalDoc,
  fromHabitDoc,
  str,
  type Data,
  type MigrationCandidate,
} from './legacy-mappers.js';
import { recordFromDoc, toDoc } from './record.js';
import {
  META_COLLECTION,
  aspirationRef,
  tombstoneRef,
  upsertAspiration,
  userRef,
} from './store.js';

const log = createLogger({ module: 'aspirations:migration' });

export const MIGRATION_DOC = 'legacy_migration';
export const MIGRATION_VERSION = 1;

const migrated = new Set<string>();
const inFlight = new Map<string, Promise<void>>();

export function resetMigrationCacheForTests(): void {
  migrated.clear();
  inFlight.clear();
}

async function docs(
  db: Firestore,
  userId: string,
  name: string
): Promise<Array<{ id: string; data: Data }>> {
  try {
    const snap = await userRef(db, userId).collection(name).get();
    return snap.docs.map((d) => ({ id: d.id, data: asData(d.data()) }));
  } catch (error) {
    log.warn({ error: String(error), userId, collection: name }, 'Legacy collection unreadable');
    return [];
  }
}

async function habitLogs(db: Firestore, userId: string, habitId: string): Promise<Data[]> {
  try {
    const snap = await userRef(db, userId)
      .collection('habits')
      .doc(habitId)
      .collection('logs')
      .get();
    return snap.docs.map((d) => asData(d.data()));
  } catch {
    return [];
  }
}

/** Gather candidates from every legacy source. */
export async function collectCandidates(
  db: Firestore,
  userId: string,
  timeZone: string
): Promise<MigrationCandidate[]> {
  const out: MigrationCandidate[] = [];
  const push = (c: MigrationCandidate | null) => {
    if (c) out.push(c);
  };

  for (const d of await docs(db, userId, 'dreams')) push(fromDream(d.id, d.data));
  for (const d of await docs(db, userId, 'goals')) push(fromGoalDoc(d.id, d.data, timeZone));
  for (const d of await docs(db, userId, 'commitments')) push(fromCommitmentGoal(d.id, d.data));

  const completions = await docs(db, userId, 'habit_completions');
  for (const d of await docs(db, userId, 'habits')) {
    const c = fromHabitDoc(d.id, d.data);
    if (!c) continue;
    const logs = await habitLogs(db, userId, d.id);
    const extra = completions.filter((x) => x.data.habitId === d.id).map((x) => x.data);
    c.checkIns = [
      ...checkInsFromLogs(logs, timeZone, 'completedAt'),
      ...checkInsFromLogs(extra, timeZone, 'completedAt'),
    ];
    out.push(c);
  }

  const profileSnap = await userRef(db, userId).get();
  const profile = asData(profileSnap.exists ? profileSnap.data() : undefined);
  const prod = asData(profile.productivityData);
  const logs = Array.isArray(prod.habitLogs) ? prod.habitLogs.map(asData) : [];
  const habits = [
    ...(Array.isArray(prod.habits) ? prod.habits : []),
    ...(Array.isArray(prod.enhancedHabits) ? prod.enhancedHabits : []),
  ].map(asData);
  for (const h of habits) {
    const id = str(h.id) ?? '';
    const c = fromHabitDoc(id, h);
    if (!c) continue;
    c.checkIns = checkInsFromLogs(
      logs.filter((l) => l.habitId === id),
      timeZone
    );
    out.push(c);
  }
  const lifeGoals = asData(profile.lifeData).goals;
  if (Array.isArray(lifeGoals)) {
    for (const g of lifeGoals.map(asData)) push(fromGoalDoc(str(g.id) ?? '', g, timeZone));
  }
  if (Array.isArray(profile.goals)) {
    for (const g of profile.goals.map(asData)) push(fromFinancialGoal(g, timeZone));
  }
  return out;
}

/** Upsert one candidate, then fold in its legacy check-ins / timestamps. */
async function applyCandidate(
  db: Firestore,
  userId: string,
  c: MigrationCandidate,
  timeZone: string
): Promise<boolean> {
  const id = aspirationIdFor(c.input.level, c.input.title);
  if ((await tombstoneRef(db, userId, id).get()).exists) return false;
  const outcome = await upsertAspiration(userId, c.input);
  if (!outcome.success || outcome.data.status === 'skipped_tombstoned') return false;
  if (!c.checkIns?.length && !c.lastMentionedAt) return true;
  const ref = aspirationRef(db, userId, id);
  const snap = await ref.get();
  const record = snap.exists ? recordFromDoc(id, asData(snap.data())) : null;
  if (!record) return true;
  let next = record;
  if (c.lastMentionedAt) next = { ...next, lastMentionedAt: c.lastMentionedAt };
  if (next.habit && c.checkIns?.length) {
    let checkIns = next.habit.checkIns;
    for (const ci of c.checkIns) {
      // Never overwrite a check-in the canonical store already has for that day.
      if (checkIns.some((x) => x.date === ci.date)) continue;
      checkIns = mergeCheckIn(checkIns, { ...ci, recordedAt: `${ci.date}T12:00:00.000Z` });
    }
    next = {
      ...next,
      habit: withStreaks({ ...next.habit, checkIns }, localToday(new Date(), timeZone)),
    };
  }
  await ref.set(toDoc(next));
  return true;
}

async function run(db: Firestore, userId: string): Promise<void> {
  const marker = userRef(db, userId).collection(META_COLLECTION).doc(MIGRATION_DOC);
  const snap = await marker.get();
  if (snap.exists && Number(asData(snap.data()).version) >= MIGRATION_VERSION) return;
  const timeZone = await resolveTimeZone(userId);
  const candidates = await collectCandidates(db, userId, timeZone);
  let copied = 0;
  for (const c of candidates) {
    try {
      if (await applyCandidate(db, userId, c, timeZone)) copied++;
    } catch (error) {
      log.warn({ error: String(error), userId, level: c.input.level }, 'Legacy item not copied');
    }
  }
  await marker.set({
    version: MIGRATION_VERSION,
    migratedAt: new Date().toISOString(),
    candidates: candidates.length,
    copied,
  });
  if (candidates.length > 0)
    log.info({ userId, candidates: candidates.length, copied }, 'Legacy aspirations migrated');
}

/** Idempotent; concurrent callers share one run. Never throws. */
export async function migrateLegacyAspirations(userId: string): Promise<void> {
  if (!userId || migrated.has(userId)) return;
  const db = getFirestoreDb();
  if (!db) return;
  let p = inFlight.get(userId);
  if (!p) {
    p = run(db, userId)
      .then(() => {
        if (migrated.size > 10_000) migrated.clear();
        migrated.add(userId);
      })
      .catch((error: unknown) =>
        log.warn({ error: String(error), userId }, 'Legacy aspiration migration failed')
      )
      .finally(() => inFlight.delete(userId));
    inFlight.set(userId, p);
  }
  await p;
}

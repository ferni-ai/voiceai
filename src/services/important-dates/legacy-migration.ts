/**
 * One-time, per-user copy of dates held by older stores into the canonical
 * important-dates store. Runs lazily the first time a user's dates are listed
 * and records `reminder_settings/legacy_migration` so it never runs twice.
 *
 * Sources (left in place, read-only from now on):
 * - `special_dates/*`                    (old rememberSpecialDate tool) → user
 * - `milestone_detector/profile.trackedDates` (trackImportantDate tool)  → user
 * - `human_signals/important_dates.items` (signal extraction)           → detected
 *
 * @module services/important-dates/legacy-migration
 */

import type { Firestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { formatStoredDate, isValidCivil, isValidMonthDay, parseStoredDate } from './date-math.js';
import { importantDateKey } from './identity.js';
import { SETTINGS_COLLECTION } from './settings.js';
import { saveImportantDate, upsertImportantDate } from './store.js';
import type { ImportantDateInput, ImportantDateKind } from './types.js';

const log = createLogger({ module: 'important-dates:migration' });

export const MIGRATION_DOC = 'legacy_migration';
const MIGRATION_VERSION = 1;

const migrated = new Set<string>();
const MAX_REMEMBERED = 10_000;

type Candidate = { input: ImportantDateInput; remindersEnabled: boolean };

function md(month: unknown, day: unknown, year?: unknown): string | null {
  const m = Number(month);
  const d = Number(day);
  if (!isValidMonthDay(m, d)) return null;
  const y = Number(year);
  if (Number.isInteger(y) && y > 0 && isValidCivil({ year: y, month: m, day: d })) {
    return formatStoredDate({ year: y, month: m, day: d });
  }
  return formatStoredDate({ month: m, day: d });
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/** `special_dates` docs: { contactName, dateType, date: 'MM-DD', year?, label? }. */
export function fromSpecialDate(data: Record<string, unknown>): Candidate | null {
  const name = str(data.contactName);
  const raw = str(data.date);
  const m = raw ? /^(\d{1,2})-(\d{1,2})$/.exec(raw) : null;
  if (!name || !m) return null;
  const type = str(data.dateType) ?? 'birthday';
  const kind: ImportantDateKind = type === 'birthday' || type === 'anniversary' ? type : 'other';
  const date = md(m[1], m[2], type === 'birthday' ? data.year : undefined);
  if (!date) return null;
  const title =
    str(data.label) ??
    (type === 'memorial'
      ? `${name} memorial day`
      : `${name}'s ${type === 'custom' ? 'day' : type}`);
  return {
    input: {
      key: importantDateKey({ kind, person: name, title }),
      title,
      date,
      recurring: true,
      kind,
      ...(type === 'memorial' ? { subtype: 'memorial' } : {}),
      source: 'user',
      sourceConversationIds: [],
      confidence: 1,
    },
    remindersEnabled: true,
  };
}

/** `milestone_detector` tracked dates: { label, date: ISO, type, recurring }. */
export function fromTrackedDate(t: Record<string, unknown>): Candidate | null {
  const label = str(t.label);
  const iso = str(t.date)?.slice(0, 10);
  if (!label || !iso || !parseStoredDate(iso)) return null;
  const type = str(t.type) ?? 'custom';
  const kind: ImportantDateKind =
    type === 'anniversary' || type === 'friendship' ? 'anniversary' : 'event';
  const recurring = t.recurring !== false;
  return {
    input: {
      key: importantDateKey({ kind, person: str(t.associatedWith), title: label }),
      title: label,
      date: iso,
      recurring,
      kind,
      subtype: type,
      source: 'user',
      sourceConversationIds: [],
      confidence: 1,
    },
    remindersEnabled: true,
  };
}

const SIGNAL_KINDS: Record<string, { kind: ImportantDateKind; subtype?: string }> = {
  birthday: { kind: 'birthday' },
  anniversary: { kind: 'anniversary' },
  loss_anniversary: { kind: 'other', subtype: 'memorial' },
  milestone: { kind: 'anniversary', subtype: 'milestone' },
  celebration: { kind: 'anniversary', subtype: 'celebration' },
  recurring: { kind: 'event' },
  custom: { kind: 'other' },
};

/** Extracted human-signal dates: { type, label, month, day, year?, relatedPerson? }. */
export function fromHumanSignal(s: Record<string, unknown>): Candidate | null {
  const label = str(s.label);
  const map = SIGNAL_KINDS[str(s.type) ?? 'custom'] ?? SIGNAL_KINDS.custom;
  const date = md(s.month, s.day, s.year);
  if (!label || !date) return null;
  const sensitive = s.sentiment === 'sensitive' || s.wantsAcknowledgment === false;
  return {
    input: {
      key: importantDateKey({ kind: map.kind, person: str(s.relatedPerson), title: label }),
      title: label,
      date,
      recurring: true,
      kind: map.kind,
      ...(map.subtype ? { subtype: map.subtype } : {}),
      source: 'detected',
      sourceConversationIds: [],
      confidence: 0.6,
    },
    remindersEnabled: !sensitive,
  };
}

async function collectCandidates(db: Firestore, userId: string): Promise<Candidate[]> {
  const user = db.collection('bogle_users').doc(userId);
  const [special, detector, signals] = await Promise.all([
    user.collection('special_dates').get(),
    user.collection('milestone_detector').doc('profile').get(),
    user.collection('human_signals').doc('important_dates').get(),
  ]);
  const out: Candidate[] = [];
  for (const d of special.docs) {
    const c = fromSpecialDate(d.data());
    if (c) out.push(c);
  }
  const tracked = detector.exists ? detector.data()?.trackedDates : undefined;
  for (const t of Array.isArray(tracked) ? tracked : []) {
    const c = fromTrackedDate(t as Record<string, unknown>);
    if (c) out.push(c);
  }
  const items = signals.exists ? signals.data()?.items : undefined;
  for (const s of Array.isArray(items) ? items : []) {
    const c = fromHumanSignal(s as Record<string, unknown>);
    if (c) out.push(c);
  }
  return out;
}

/** Copy legacy dates once per user; returns how many were copied. Never throws. */
export async function migrateLegacyDates(userId: string): Promise<number> {
  if (migrated.has(userId)) return 0;
  const db = getFirestoreDb();
  if (!db) return 0;
  try {
    const marker = db
      .collection('bogle_users')
      .doc(userId)
      .collection(SETTINGS_COLLECTION)
      .doc(MIGRATION_DOC);
    const snap = await marker.get();
    let copied = 0;
    if (!snap.exists) {
      for (const c of await collectCandidates(db, userId)) {
        const r = await upsertImportantDate(userId, c.input);
        if (!r.success || !r.data.record) continue;
        copied++;
        if (!c.remindersEnabled && r.data.status === 'created') {
          await saveImportantDate(userId, {
            ...r.data.record,
            reminders: { ...r.data.record.reminders, enabled: false },
            nextReminderAt: null,
            nextReminderKey: null,
          });
        }
      }
      await marker.set({
        migratedAt: new Date().toISOString(),
        version: MIGRATION_VERSION,
        copied,
      });
      if (copied > 0) log.info({ userId, copied }, 'Legacy important dates migrated');
    }
    if (migrated.size >= MAX_REMEMBERED) migrated.clear();
    migrated.add(userId);
    return copied;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Legacy date migration failed; will retry');
    return 0;
  }
}

/** Test hook: forget which users were migrated in this process. */
export function resetMigrationCacheForTests(): void {
  migrated.clear();
}

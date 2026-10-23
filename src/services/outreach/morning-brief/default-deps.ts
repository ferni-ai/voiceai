/**
 * The real readers and senders behind the morning brief (brief-job.ts).
 * Calendar: getEventsForDay, as the voice tools read it; it takes the server's
 * (UTC) day, so the days either side are read and kept to the person's local
 * date. Reminders: pending, due today, not meant for a contact. Tasks:
 * productivityData.tasks on the user doc, where getTasks' store saves them (its
 * loader caches a person for the life of the process, too stale for this
 * long-running server). Commitments: open ones, less forgotten topics, none
 * when that list can't be read.
 *
 * @module services/outreach/morning-brief/default-deps
 */

import { flagOn } from '../../../config/env-flag.js';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { wallTimeIn } from '../../../utils/time-zone.js';
import { getEventsForDay } from '../../calendar/calendar-service.js';
import { reminderFromDoc } from '../../scheduling/reminder-scheduler.js';
import {
  firestoreCommitmentStore,
  toOpenCommitment,
} from '../../superhuman/commitment-follow-up.js';
import { forgottenTopicsOrNull } from '../../../memory/recall/forget.js';
import { isForgotten } from '../../../memory/recall/session-recall.js';
import { usersWithFlag } from '../../platform/cohort-flags.js';
import { resolveClaimStore } from '../../../tasks/scheduled/calendar-briefing-job.js';
import { pushUnlessFocusHeld } from '../focus-send-hold.js';
import { firestoreTextStore, sendGuardedText } from '../guarded-text.js';
import type { BriefEvent } from './compose.js';
import type { DayItems, MorningBriefDeps } from './brief-job.js';

const log = createLogger({ module: 'MorningBriefDeps' });

const DAY_MS = 24 * 60 * 60 * 1000;
const TASKS = 3;
const COMMITMENTS = 2;

const sameLocalDay = (a: Date, b: Date, zone: string): boolean => {
  const [x, y] = [wallTimeIn(a, zone), wallTimeIn(b, zone)];
  return x.year === y.year && x.month === y.month && x.day === y.day;
};

/** A reader that fails gives nothing, so one bad store doesn't stop the brief. */
async function orNone<T>(what: string, userId: string, read: () => Promise<T[]>): Promise<T[]> {
  return read().catch((error: unknown) => {
    log.warn({ userId, what, error: String(error) }, 'Morning brief source not read');
    return [];
  });
}

async function todaysEvents(userId: string, zone: string, now: Date): Promise<BriefEvent[]> {
  const days = await Promise.all(
    [-DAY_MS, 0, DAY_MS].map((d) => getEventsForDay(userId, new Date(now.getTime() + d)))
  );
  const byId = new Map(days.flat().map((e) => [e.id, e]));
  // Only their own events (Ferni's calendar, ones they organized) and invites they
  // accepted go in by title. Anything else, including unknown, goes by time only:
  // anyone can send an invite, and its title would reach them as a Ferni text.
  return [...byId.values()]
    .filter((e) => e.status !== 'cancelled' && e.ownerResponse !== 'declined')
    .filter((e) => sameLocalDay(e.startTime, now, zone))
    .map((e) => ({
      title: e.title,
      start: e.startTime,
      allDay: e.isAllDay,
      invite: e.ownerResponse !== 'organizer' && e.ownerResponse !== 'accepted',
    }));
}

async function remindersDueToday(userId: string, zone: string, now: Date): Promise<string[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  const snap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('reminders')
    .where('status', '==', 'pending')
    .limit(50)
    .get();
  return snap.docs
    .map((d) => reminderFromDoc(d.id, d.data()))
    .filter(
      (r) => !r.isDirectToContact && r.message.trim() && sameLocalDay(r.scheduledFor, now, zone)
    )
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
    .map((r) => r.message);
}

/** Open tasks, soonest due first, undated last. */
export function openTasks(user: Record<string, unknown>): string[] {
  const data = user.productivityData as { tasks?: unknown } | undefined;
  const tasks = Array.isArray(data?.tasks) ? (data.tasks as Array<Record<string, unknown>>) : [];
  const due = (t: Record<string, unknown>): number => {
    const ms = typeof t.dueDate === 'string' ? Date.parse(t.dueDate) : NaN;
    return Number.isNaN(ms) ? Infinity : ms;
  };
  return tasks
    .filter(
      (t) => (t.status === 'pending' || t.status === 'in_progress') && typeof t.title === 'string'
    )
    .sort((a, b) => due(a) - due(b))
    .slice(0, TASKS)
    .map((t) => t.title as string);
}

async function openCommitments(userId: string): Promise<string[]> {
  const forgotten = await forgottenTopicsOrNull(userId);
  if (!forgotten) return [];
  const docs = await firestoreCommitmentStore.active(userId);
  return docs
    .flatMap((d) => {
      const c = toOpenCommitment(d.id, d.data);
      return c && !isForgotten(c.statement, forgotten) ? [c.statement] : [];
    })
    .slice(0, COMMITMENTS);
}

/**
 * Commitments stay out of the text unless MORNING_BRIEF_COMMITMENTS=on: the
 * turn-path capture stored goodbyes and unresolved pronouns ("catch you
 * later", "call her tomorrow") as commitments, and a text read alone can't
 * recover who "her" is. On once the after-call writer is the only source.
 */
export async function readDay(
  userId: string,
  user: Record<string, unknown>,
  zone: string,
  now: Date,
  env: Record<string, string | undefined> = process.env
): Promise<DayItems> {
  const withCommitments = flagOn('MORNING_BRIEF_COMMITMENTS', env);
  const [events, reminders, commitments] = await Promise.all([
    orNone('calendar', userId, () => todaysEvents(userId, zone, now)),
    orNone('reminders', userId, () => remindersDueToday(userId, zone, now)),
    withCommitments ? orNone('commitments', userId, () => openCommitments(userId)) : [],
  ]);
  return { events, reminders, tasks: openTasks(user), commitments };
}

export async function defaultMorningBriefDeps(): Promise<MorningBriefDeps> {
  return {
    env: process.env,
    cohortUsers: () => usersWithFlag('MORNING_BRIEF'),
    userDoc: (userId) => firestoreTextStore.userDoc(userId),
    readDay,
    claims: await resolveClaimStore(),
    sendText: (t) => sendGuardedText(t),
    // Ferni's own: waits out a Focus hold (focus-send-hold.ts), as the text does.
    sendPush: (userId, push) => pushUnlessFocusHeld(userId, { ...push, type: 'general' }, 'ferni'),
  };
}

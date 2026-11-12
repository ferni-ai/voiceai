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
import { storedTextForOwner } from '../../../tools/domains/proactive/outreach/index.js';
import { judgedRowText, singleWriterFor } from '../../superhuman/commitment-single-writer.js';
import { resolveClaimStore } from '../../../tasks/scheduled/calendar-briefing-job.js';
import { pushUnlessFocusHeld } from '../focus-send-hold.js';
import { firestoreTextStore, sendGuardedText } from '../guarded-text.js';
import { firestoreFollowUpStore } from '../../stores/follow-through-store.js';
import { firestoreItemMentionStore } from '../../stores/item-mentions.js';
import type { BriefEvent } from './compose.js';
import type { DayItems, MorningBriefDeps } from './brief-job.js';
import { keyOf, type BriefRef, type FreshnessReads } from './freshness.js';

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

/** One todo the brief can list: its words and where it lives. */
interface BriefItem {
  readonly text: string;
  readonly ref: BriefRef;
  readonly dueAt?: Date;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

// Each type field set on an item (reminders: kind, type; tasks: category), read on its own:
// a safety value in any of them keeps the item in the brief (freshness.ts).
const kindsOf = (d: Record<string, unknown>): { kinds?: string[] } => {
  const kinds = ['kind', 'type', 'category'].flatMap((field) => str(d[field]) ?? []);
  return kinds.length ? { kinds } : {};
};

// For them, with words, due at a time that parses: one bad due time threw and lost all of Due.
const listable = (r: ReturnType<typeof reminderFromDoc>): boolean =>
  !r.isDirectToContact && r.message.trim() !== '' && !Number.isNaN(r.scheduledFor.getTime());

/** Their pending reminders meant for them (not a contact), soonest first; null with no store. */
async function pendingReminderItems(userId: string): Promise<BriefItem[] | null> {
  const db = getFirestoreDb();
  if (!db) return null;
  const snap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('reminders')
    .where('status', '==', 'pending')
    .limit(50)
    .get();
  return snap.docs
    .map((d) => ({ r: reminderFromDoc(d.id, d.data()), kinds: kindsOf(d.data()) }))
    .filter(({ r }) => listable(r))
    .sort((a, b) => a.r.scheduledFor.getTime() - b.r.scheduledFor.getTime())
    .map(({ r, kinds }) => ({
      text: r.message,
      dueAt: r.scheduledFor,
      ref: { store: 'reminders', ref: r.id, version: r.scheduledFor.toISOString(), ...kinds },
    }));
}

/** Open tasks, soonest due first, undated last. */
function openTaskItems(user: Record<string, unknown>): BriefItem[] {
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
    .map((t) => ({
      text: t.title as string,
      ref: { store: 'tasks', ref: String(t.id), version: str(t.updatedAt) ?? '', ...kindsOf(t) },
    }));
}

/** Open task titles, soonest due first, undated last. */
export function openTasks(user: Record<string, unknown>): string[] {
  return openTaskItems(user)
    .slice(0, TASKS)
    .map((t) => t.text);
}

/** Open commitments, less forgotten topics; null when the forget list can't be read. */
async function openCommitments(userId: string): Promise<BriefItem[] | null> {
  const forgotten = await forgottenTopicsOrNull(userId);
  if (!forgotten) return null;
  // COMMITMENT_SINGLE_WRITER (per person, this server serves many): only judged rows,
  // checked against forget requests on every field, person included (judged-commitments.ts).
  const judgedOnly = await singleWriterFor(userId);
  const docs = await firestoreCommitmentStore.active(userId);
  return docs
    .flatMap((d) => {
      const c = toOpenCommitment(d.id, d.data, { judgedOnly });
      const about = judgedOnly ? judgedRowText(d.data) : (c?.statement ?? '');
      // A money or credential item is raised only on a call, never in the brief.
      const ref = { store: 'commitments' as const, ref: d.id, version: '' };
      return c && !c.sensitive && !isForgotten(about, forgotten)
        ? [{ text: c.statement, ref }]
        : [];
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
    orNone('reminders', userId, async () =>
      ((await pendingReminderItems(userId)) ?? []).filter(
        (r) => r.dueAt && sameLocalDay(r.dueAt, now, zone)
      )
    ),
    // No forget list, no commitments: the privacy-safe side, as on main.
    withCommitments
      ? orNone('commitments', userId, async () => (await openCommitments(userId)) ?? [])
      : [],
  ]);
  // OWNER_OUTREACH_STORED_TEXT_SCREEN: what calls stored goes in only if it passes the screen
  const screened = (items: BriefItem[]): BriefItem[] =>
    items.filter((t) => storedTextForOwner([t.text], { site: 'morning-brief', userId }, env));
  const lists = {
    reminders: screened(reminders),
    tasks: screened(openTaskItems(user).slice(0, TASKS)),
    commitments: screened(commitments),
  };
  // A title shown by name is screened too: a call can put an event on Ferni's own calendar
  // (smart-calendar-tools.ts createEvent, commitments synced to it). One that fails goes by time only.
  const titled = (e: DayItems['events'][number]) =>
    e.invite || storedTextForOwner([e.title], { site: 'morning-brief', userId }, env) ? e : { ...e, invite: true }; // prettier-ignore
  return {
    events: events.map(titled),
    reminders: lists.reminders.map((i) => i.text),
    tasks: lists.tasks.map((i) => i.text),
    commitments: lists.commitments.map((i) => i.text),
    refs: {
      reminders: lists.reminders.map((i) => i.ref),
      tasks: lists.tasks.map((i) => i.ref),
      commitments: lists.commitments.map((i) => i.ref),
    },
  };
}

// Open items' current versions by keyOf, read at send time. Null if any store is unread:
// an unread store must not look like every item in it was closed.
async function currentVersions(
  userId: string,
  refs: readonly BriefRef[]
): Promise<Map<string, string> | null> {
  const wanted = new Set(refs.map((r) => r.store));
  const reads: Array<Promise<BriefItem[] | null>> = [];
  if (wanted.has('reminders')) reads.push(pendingReminderItems(userId));
  if (wanted.has('tasks'))
    reads.push(firestoreTextStore.userDoc(userId).then((u) => (u ? openTaskItems(u) : null)));
  if (wanted.has('commitments')) reads.push(openCommitments(userId));
  const lists = await Promise.all(reads);
  const known = lists.filter((l): l is BriefItem[] => l !== null);
  if (known.length < lists.length) return null;
  return new Map(known.flat().map((i) => [keyOf(i.ref), i.ref.version ?? '']));
}

// The whole ledger. changedBetween compares ISO strings: the largest Date prints '+275760-…',
// which sorts before '2026-…', so with it as the end no follow-up was ever in range.
const LEDGER_FROM = new Date(0);
const LEDGER_TO = new Date('9999-12-31T23:59:59.999Z');

/** The freshness gate's reads (freshness.ts); each failure is that rule not applying. */
function freshnessReads(): FreshnessReads {
  const mentions = firestoreItemMentionStore();
  return {
    current: (userId, refs) => currentVersions(userId, refs),
    // Everything they have, closed included: a follow-up closed in a call keeps its todo out.
    ledger: async (userId) =>
      (await firestoreFollowUpStore()?.changedBetween(userId, LEDGER_FROM, LEDGER_TO)) ?? null,
    mentions: async (userId, since) => (await mentions?.recent(userId, since)) ?? null,
    consume: async (userId, sources) => mentions?.consume(userId, sources),
  };
}

export async function defaultMorningBriefDeps(): Promise<MorningBriefDeps> {
  return {
    env: process.env,
    cohortUsers: () => usersWithFlag('MORNING_BRIEF'),
    userDoc: (userId) => firestoreTextStore.userDoc(userId),
    readDay,
    claims: await resolveClaimStore(),
    freshness: freshnessReads(),
    sendText: (t) => sendGuardedText(t),
    // Ferni's own: waits out a Focus hold (focus-send-hold.ts), as the text does.
    sendPush: (userId, push) => pushUnlessFocusHeld(userId, { ...push, type: 'general' }, 'ferni'),
  };
}

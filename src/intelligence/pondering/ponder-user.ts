/**
 * Runs the pondering pass for one user: reads their recent call summaries
 * (bogle_users/{uid}/summaries, what calls actually save), ponders, and
 * stores the result for the next call. Reads and writes nothing when
 * PONDERING is off.
 *
 * @module intelligence/pondering/ponder-user
 */
import type { Firestore } from 'firebase-admin/firestore';
import { CALLER_PROVENANCE, isForgotten } from '../../memory/index.js';
import {
  isPonderingOn,
  ponder,
  type PonderLlm,
  type Pondering,
  type PonderSummary,
} from './pondering.js';

const SUMMARY_FIELDS = [
  'timestamp',
  'mainTopics',
  'keyPoints',
  'questionsRemaining',
  'followUpItems',
  'callerProvenance',
] as const;
export const SUMMARIES_READ = 8;

function strings(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [];
}

/** The instant of a stored timestamp (ISO string or Firestore Timestamp). */
function instant(ts: unknown): Date | undefined {
  if (typeof ts === 'string') return Number.isNaN(Date.parse(ts)) ? undefined : new Date(ts);
  const toDate = (ts as { toDate?: () => Date } | null)?.toDate;
  return typeof toDate === 'function' ? toDate.call(ts) : undefined;
}

/** YYYY-MM-DD for a stored timestamp, else ''. */
function dayOf(ts: unknown): string {
  return instant(ts)?.toISOString().slice(0, 10) ?? '';
}

export function toPonderSummary(id: string, data: Record<string, unknown>): PonderSummary {
  // Threads only from a summary that checked them against the caller's lines (caller-assertions.ts)
  const theirs = data.callerProvenance === CALLER_PROVENANCE;
  return {
    id,
    date: dayOf(data.timestamp),
    topics: strings(data.mainTopics),
    keyPoints: strings(data.keyPoints),
    openThreads: theirs ? strings(data.questionsRemaining) : [],
    followUps: theirs ? strings(data.followUpItems) : [],
  };
}

/**
 * Leaves out what the caller has put down: items from a call they dismissed
 * a pondering item from (memory-view/actions.ts), and anything about a topic
 * they asked Ferni to forget.
 */
export function withoutDismissed(
  p: Pondering,
  dismissed: ReadonlySet<string>,
  topics: readonly string[]
): Pondering {
  const keep = (i: { text: string; basis: string }): boolean =>
    !dismissed.has(i.basis) && !isForgotten(i.text, topics);
  return { followUps: p.followUps.filter(keep), thinkingOf: p.thinkingOf.filter(keep) };
}

export interface PonderOutcome {
  status: 'off' | 'nothing' | 'stored' | 'dry-run';
  pondering?: Pondering;
}

/** The caller's recent calls, newest first, and when each ended. */
export interface RecentCalls {
  summaries: PonderSummary[];
  callEnds: Date[];
}

export async function readRecentCalls(db: Firestore, userId: string): Promise<RecentCalls> {
  const snap = await db
    .collection('bogle_users')
    .doc(userId)
    .collection('summaries')
    .select(...SUMMARY_FIELDS)
    .orderBy('timestamp', 'desc')
    .limit(SUMMARIES_READ)
    .get();
  return {
    summaries: snap.docs.map((d) => toPonderSummary(d.id, d.data())),
    callEnds: snap.docs.flatMap((d) => instant(d.data().timestamp) ?? []),
  };
}

export interface PonderUserOptions {
  now?: Date;
  env?: Record<string, string | undefined>;
  /** Topics the caller asked to forget or avoid; lines about them are never read. */
  avoid?: readonly string[];
  /** Calls already read by the caller of this function. */
  recent?: RecentCalls;
  /** Ponder and return the result, writing nothing. */
  dryRun?: boolean;
}

/**
 * Ponders one caller and stores the result. Every pass also records
 * ponderedAt, so a caller with nothing worth saying is not pondered again
 * until they call again. Writes merge, keeping the record of items already
 * raised so a regenerated item is never raised twice.
 */
export async function ponderUser(
  db: Firestore,
  userId: string,
  llm: PonderLlm,
  {
    now = new Date(),
    env = process.env,
    avoid = [],
    recent,
    dryRun = false,
  }: PonderUserOptions = {}
): Promise<PonderOutcome> {
  if (!isPonderingOn(env)) return { status: 'off' };
  const { summaries } = recent ?? (await readRecentCalls(db, userId));
  const today = now.toISOString().slice(0, 10);
  const user = db.collection('bogle_users').doc(userId);
  const doc = user.collection('predictive_intelligence').doc('pondering');
  // Writes merge, so a dismissal (memory-view/actions.ts) stays recorded across passes.
  const [previous, forgotten] = await Promise.all([
    doc.get(),
    user.collection('memory_state').doc('forgotten').get(),
  ]);
  const dismissed = new Set(strings(previous.exists ? previous.data()?.dismissed : undefined));
  // The nightly job already passes forgotten topics in `avoid`; other callers may not.
  const topics = [
    ...new Set([...avoid, ...strings(forgotten.exists ? forgotten.data()?.topics : undefined)]),
  ];
  const pondering = withoutDismissed(
    await ponder(summaries, today, llm, topics),
    dismissed,
    topics
  );
  if (dryRun) return { status: 'dry-run', pondering };
  const ponderedAt = now.toISOString();
  if (pondering.followUps.length === 0 && pondering.thinkingOf.length === 0) {
    await doc.set({ ponderedAt }, { merge: true });
    return { status: 'nothing' };
  }
  await doc.set(
    { ...pondering, generatedAt: ponderedAt, ponderedAt, basedOn: summaries.map((s) => s.id) },
    { merge: true }
  );
  return { status: 'stored', pondering };
}

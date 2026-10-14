/**
 * Runs the pondering pass for one user: reads their recent call summaries
 * (bogle_users/{uid}/summaries, what calls actually save), ponders, and
 * stores the result for the next call. Reads and writes nothing when
 * PONDERING is off.
 *
 * @module intelligence/pondering/ponder-user
 */
import type { Firestore } from 'firebase-admin/firestore';
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
  return {
    id,
    date: dayOf(data.timestamp),
    topics: strings(data.mainTopics),
    keyPoints: strings(data.keyPoints),
    openThreads: strings(data.questionsRemaining),
    followUps: strings(data.followUpItems),
  };
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
  const pondering = await ponder(summaries, today, llm, avoid);
  if (dryRun) return { status: 'dry-run', pondering };
  const doc = db
    .collection('bogle_users')
    .doc(userId)
    .collection('predictive_intelligence')
    .doc('pondering');
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

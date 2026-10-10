/**
 * Runs the pondering pass for one user: reads their recent call summaries
 * (bogle_users/{uid}/summaries, what calls actually save), ponders, and
 * stores the result for the next call. Writes nothing when PONDERING is off
 * or there is nothing worth saying.
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

/** YYYY-MM-DD for a stored timestamp (ISO string or Firestore Timestamp), else ''. */
function dayOf(ts: unknown): string {
  if (typeof ts === 'string')
    return Number.isNaN(Date.parse(ts)) ? '' : new Date(ts).toISOString().slice(0, 10);
  const toDate = (ts as { toDate?: () => Date } | null)?.toDate;
  return typeof toDate === 'function' ? toDate.call(ts).toISOString().slice(0, 10) : '';
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
  status: 'off' | 'nothing' | 'stored';
  pondering?: Pondering;
}

export async function ponderUser(
  db: Firestore,
  userId: string,
  llm: PonderLlm,
  {
    now = new Date(),
    env = process.env,
  }: { now?: Date; env?: Record<string, string | undefined> } = {}
): Promise<PonderOutcome> {
  if (!isPonderingOn(env)) return { status: 'off' };
  const user = db.collection('bogle_users').doc(userId);
  const snap = await user
    .collection('summaries')
    .select(...SUMMARY_FIELDS)
    .orderBy('timestamp', 'desc')
    .limit(SUMMARIES_READ)
    .get();
  const summaries = snap.docs.map((d) => toPonderSummary(d.id, d.data()));
  const today = now.toISOString().slice(0, 10);
  const pondering = await ponder(summaries, today, llm);
  if (pondering.followUps.length === 0 && pondering.thinkingOf.length === 0)
    return { status: 'nothing' };
  await user
    .collection('predictive_intelligence')
    .doc('pondering')
    .set({
      ...pondering,
      generatedAt: now.toISOString(),
      basedOn: summaries.map((s) => s.id),
    });
  return { status: 'stored', pondering };
}

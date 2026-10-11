/**
 * Read a user's recent call summaries for background jobs.
 *
 * Calls save their summary to bogle_users/{uid}/summaries (session-manager
 * endSession → saveSummary). Several background features read
 * bogle_users/{uid}/conversation_summaries instead, which nothing on the live
 * path writes: on prod (2026-10-10) the one real returning user had 315
 * summaries and no conversation_summaries at all, so weekly deep analysis,
 * life trajectory, cross-domain synthesis and the summary indexer had never
 * seen a single call.
 *
 * With LIVE_SUMMARIES=on this reads the live summaries and adds the old field
 * names those readers use (topics, keyMoments, unresolvedThreads, summary),
 * falling back to conversation_summaries if a user has none. Off, it reads
 * conversation_summaries exactly as before. Background jobs only: never call
 * it per turn.
 *
 * @module memory/storage/call-summaries
 */
import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';

export function isLiveSummariesOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.LIVE_SUMMARIES === 'on';
}

/** The subset of a Firestore document the readers use. */
export interface SummaryDoc {
  id: string;
  data: () => DocumentData;
}

/** Shaped like a query snapshot so readers swap one line: `.docs.map((d) => d.data())`. */
export interface SummariesRead {
  docs: SummaryDoc[];
}

export interface ReadSummariesOptions {
  limit: number;
  direction?: 'asc' | 'desc';
}

/** Only what the readers use, so a background job doesn't pull embeddings. */
const LIVE_FIELDS = [
  'timestamp',
  'sessionId',
  'duration',
  'turnCount',
  'mainTopics',
  'keyPoints',
  'emotionalArc',
  'decisionsReached',
  'questionsRemaining',
  'followUpItems',
] as const;

function strings(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [];
}

/**
 * Live summaries store the timestamp as an ISO string; the readers were written
 * for conversation_summaries' Firestore Timestamp (deep analysis calls
 * .toDate(), and a string made every call look like it happened "now").
 */
function asTimestamp(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : Timestamp.fromDate(new Date(ms));
}

/** A live summary with the old conversation_summaries names and timestamp type added. */
export function withLegacyNames(live: Record<string, unknown>): Record<string, unknown> {
  const keyPoints = strings(live.keyPoints);
  return {
    ...live,
    timestamp: asTimestamp(live.timestamp),
    topics: strings(live.mainTopics),
    keyMoments: keyPoints,
    unresolvedThreads: strings(live.questionsRemaining),
    emotionalArc:
      typeof live.emotionalArc === 'string' && live.emotionalArc ? live.emotionalArc : 'neutral',
    summary: keyPoints.join(' '),
  };
}

/** The user's most recent call summaries, newest first unless asked otherwise. */
export async function readCallSummaries(
  db: Firestore,
  userId: string,
  { limit, direction = 'desc' }: ReadSummariesOptions,
  env: Record<string, string | undefined> = process.env
): Promise<SummariesRead> {
  const user = db.collection('bogle_users').doc(userId);
  const legacy = async (): Promise<SummariesRead> => ({
    docs: (
      await user
        .collection('conversation_summaries')
        .orderBy('timestamp', direction)
        .limit(limit)
        .get()
    ).docs,
  });
  if (!isLiveSummariesOn(env)) return legacy();

  const live = await user
    .collection('summaries')
    .select(...LIVE_FIELDS)
    .orderBy('timestamp', direction)
    .limit(limit)
    .get();
  if (live.empty) return legacy();
  return {
    docs: live.docs.map((d) => {
      const data = withLegacyNames(d.data());
      return { id: d.id, data: () => data };
    }),
  };
}

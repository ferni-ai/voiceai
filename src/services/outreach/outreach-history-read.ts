/**
 * The outreach a person has actually received, read back from where it is recorded.
 *
 * Every text, call and push Ferni sends is recorded by `recordOutreachAttempt` in
 * `bogle_users/{uid}/outreach_attempts` (outreach-orchestrator.ts). The "When I'll
 * Reach Out" history tab used to read the decision engine's in-process memory, which
 * nothing persistent feeds, so it always said there was no history. This reads the
 * real store, newest first, for one user only.
 *
 * A failed read throws: the caller must show an error, never "no history".
 *
 * @module services/outreach/outreach-history-read
 */
import { getFirestore } from 'firebase-admin/firestore';
import type { OutreachAttemptEntity } from '../data-layer/types.js';

/** One sent outreach, in the words the history tab shows. */
export interface OutreachHistoryEntry {
  id: string;
  type: OutreachAttemptEntity['type'];
  personaId: string;
  channel: 'call' | 'sms' | 'push' | 'email';
  sentAt: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  /** What was sent, when the writer recorded it; otherwise absent. */
  message?: string;
}

export const DEFAULT_HISTORY_LIMIT = 20;
export const MAX_HISTORY_LIMIT = 50;

// 'unknown' (attempts from before deliver-and-record) still shows as sent: it was recorded.
type Status = OutreachHistoryEntry['status'];
const STATUSES: ReadonlySet<string> = new Set(['pending', 'sent', 'delivered', 'failed']);
const CHANNELS: Record<OutreachAttemptEntity['channel'], OutreachHistoryEntry['channel']> = {
  voice: 'call',
  sms: 'sms',
  push: 'push',
  email: 'email',
};

/** A `?limit=` value as a whole number from 1 to MAX_HISTORY_LIMIT. */
export function clampHistoryLimit(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_HISTORY_LIMIT;
  return Math.min(Math.max(n, 1), MAX_HISTORY_LIMIT);
}

function toEntry(id: string, data: Partial<OutreachAttemptEntity>): OutreachHistoryEntry {
  const message =
    typeof data.message === 'string' && data.message.trim() ? data.message : undefined;
  return {
    id,
    type: data.type ?? 'check_in',
    personaId: data.personaId ?? 'ferni',
    channel: (data.channel && CHANNELS[data.channel]) || 'sms',
    sentAt: data.sentAt ?? '',
    // The attempt was recorded, so at least it was sent.
    status: data.status && STATUSES.has(data.status) ? (data.status as Status) : 'sent',
    ...(message ? { message } : {}),
  };
}

/** The user's most recent outreach, newest first. Throws when the store can't be read. */
export async function listOutreachHistory(
  userId: string,
  limit = DEFAULT_HISTORY_LIMIT
): Promise<OutreachHistoryEntry[]> {
  const snapshot = await getFirestore()
    .collection(`bogle_users/${userId}/outreach_attempts`)
    .orderBy('sentAt', 'desc')
    .limit(Math.min(Math.max(limit, 1), MAX_HISTORY_LIMIT))
    .get();
  return snapshot.docs.map((doc) => toEntry(doc.id, doc.data() as Partial<OutreachAttemptEntity>));
}

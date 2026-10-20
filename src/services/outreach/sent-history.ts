/**
 * One row in the "How I reach you" history for a send made outside the
 * outreach orchestrator: guarded texts (guarded-text.ts) and proactive
 * check-in notes and calls (proactive-channels/default-deps.ts).
 *
 * The panel reads `bogle_users/{uid}/outreach_attempts` (outreach-history-read.ts),
 * which only the orchestrator wrote, so texts, reminders and check-ins never
 * showed up there (loops scorecard, 2026-10-18). The row carries only what the
 * panel shows without a message: kind, channel, status. Never the words, never
 * the number, and a fixed reason (the reason is indexed into semantic memory).
 *
 * @module services/outreach/sent-history
 */
import { createLogger } from '../../utils/safe-logger.js';
import type { OutreachAttemptEntity } from '../data-layer/types.js';
import type { TextKind } from './checkin-replies.js';

const log = createLogger({ module: 'sent-history' });

export interface SentAttempt {
  type: OutreachAttemptEntity['type'];
  /** The panel's channels: 'push' is a note in the app, 'voice' a call. */
  channel: OutreachAttemptEntity['channel'];
  status: 'sent' | 'delivered' | 'failed';
  /** Which sender wrote it, e.g. 'guarded-text:reminder'. */
  source: string;
}

export type RecordAttempt = (
  userId: string,
  attempt: Omit<OutreachAttemptEntity, 'sentAt'>
) => Promise<unknown>;

const recordOutreachAttempt: RecordAttempt = async (userId, attempt) =>
  (await import('./outreach-history.js')).recordOutreachAttempt(userId, attempt);

/**
 * Writes the row; never throws (a send that went out must not look failed).
 * Only real accounts: a `phone:` id is the caller's number and a `sponsored_`
 * id has no account to show it on.
 */
export async function recordSent(
  userId: string,
  a: SentAttempt,
  record: RecordAttempt = recordOutreachAttempt
): Promise<void> {
  if (!userId || userId.startsWith('phone:') || userId.startsWith('sponsored_')) return;
  try {
    await record(userId, {
      type: a.type,
      channel: a.channel,
      status: a.status,
      personaId: 'ferni',
      reason: `${a.type} by ${a.channel}`,
      triggeredBy: a.source,
    });
  } catch (error) {
    log.warn({ error: String(error), source: a.source }, 'Send not added to outreach history');
  }
}

const TEXT_TYPE: Record<TextKind, SentAttempt['type']> = {
  checkin: 'check_in',
  'follow-up': 'follow_up',
  reminder: 'reminder',
  message: 'check_in',
  'on-behalf': 'check_in',
  'morning-brief': 'check_in',
  'call-result': 'follow_up',
  proactive: 'check_in',
};

/** A text to a member (guarded-text.ts GuardedText) as the history needs it. */
export interface TextSent {
  readonly userId: string;
  readonly kind: TextKind;
  /** What the history panel calls it; by default from `kind`. */
  readonly historyType?: SentAttempt['type'];
}

/** One history row for a guarded text that was sent, or that Twilio refused. */
export async function recordText(
  t: TextSent,
  sent: boolean,
  record: RecordAttempt = recordOutreachAttempt
): Promise<void> {
  const type = t.historyType ?? TEXT_TYPE[t.kind];
  const status = sent ? 'sent' : 'failed';
  await recordSent(
    t.userId,
    { type, channel: 'sms', status, source: `guarded-text:${t.kind}` },
    record
  );
}

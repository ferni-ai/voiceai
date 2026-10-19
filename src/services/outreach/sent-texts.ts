/**
 * What went out to a member, counted from the records sendGuardedText writes
 * (feature_checkins): the last text of a kind (the per-kind gap), and the
 * interim daily cap (flag DAILY_TEXT_CAP): DAILY_TEXT_CAP texts Ferni starts
 * per owner per rolling DAILY_TEXT_WINDOW_MS, across every kind and persona.
 * A text over the cap is held until a slot frees, never dropped (held-texts.ts).
 *
 * @module services/outreach/sent-texts
 */
import { DAILY_TEXT_CAP, DAILY_TEXT_WINDOW_MS } from '../messaging/types.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { CheckinRecord, TextKind } from './checkin-replies.js';
import type { GuardedText, TextDeps } from './guarded-text.js';

const log = createLogger({ module: 'sent-texts' });
/** An unreadable count holds the text this long, then it is tried again (fail closed). */
export const CAP_RETRY_MS = 15 * 60 * 1000;

/** The most recent text of `kind` actually sent, if any. Records from before kinds existed are check-ins. */
export function lastSentAt(
  records: readonly CheckinRecord[],
  kind: TextKind = 'checkin'
): Date | null {
  let latest: number | null = null;
  for (const r of records) {
    const t = Date.parse(r.sentAt);
    if ((r.kind ?? 'checkin') !== kind || r.status !== 'sent' || Number.isNaN(t)) continue;
    if (latest === null || t > latest) latest = t;
  }
  return latest === null ? null : new Date(latest);
}

export const sentWithin = (at: Date | null, now: Date, gapMs: number): boolean =>
  at !== null && now.getTime() - at.getTime() < gapMs;

/**
 * Not counted or held by the cap: a text the member asked for (a live reply on
 * their own call, their own reminder), each bounded by its kind's gap. Codes
 * never come through sendGuardedText, so the cap never sees them.
 */
export const capExempt = (t: { requested?: boolean }): boolean => t.requested === true;

/** When the cap frees a slot for the next text, or null while under budget. */
export function capReleaseAt(records: readonly CheckinRecord[], now: Date): Date | null {
  const from = now.getTime() - DAILY_TEXT_WINDOW_MS;
  const counted = records
    // Texts to someone else (on-behalf) and ones the member asked for don't count.
    .filter((r) => r.status === 'sent' && r.kind !== 'on-behalf' && r.capExempt !== true)
    .map((r) => Date.parse(r.sentAt))
    .filter((at) => at > from)
    .sort((a, b) => a - b);
  if (counted.length < DAILY_TEXT_CAP) return null;
  return new Date(counted[counted.length - DAILY_TEXT_CAP] + DAILY_TEXT_WINDOW_MS);
}

/**
 * A text the cap holds: logged (hold-until-window) and queued to go at `until`,
 * unless the caller holds it itself (onHold 'return'). It is never sent now. A
 * hold that can't be saved is logged as dropped (drop-with-reason), not sent.
 */
export async function holdCapped(
  t: GuardedText,
  until: Date,
  reason: 'daily-cap' | 'count-unreadable',
  hold: TextDeps['hold']
): Promise<{ sent: false; reason: 'held'; until: Date }> {
  const ctx = { kind: t.kind, refId: t.refId, reason, until };
  log.info(ctx, 'Text held: hold-until-window');
  if (t.onHold !== 'return') {
    await Promise.resolve(hold?.(t, until, reason)).catch((error: unknown) => {
      log.error(
        { ...ctx, outcome: 'drop-with-reason', error: String(error) },
        'Held text not saved'
      );
    });
  }
  return { sent: false, reason: 'held', until };
}

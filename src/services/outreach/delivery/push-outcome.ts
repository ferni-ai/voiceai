/**
 * Log what a push send actually did. sendPushNotification never throws for "no
 * device": it returns [{ success: false, error: 'No push tokens registered for
 * user' }]. Its callers ignored the result and logged "Push notification sent"
 * (phone-calls audit 2026-10-25, row 11: prod logged "sent" for a call result
 * while the owner had no token and nothing arrived).
 *
 * @module services/outreach/delivery/push-outcome
 */
import type { PushDeliveryResult } from './push-notifications.js';

interface OutcomeLog {
  info: (fields: Record<string, unknown>, msg: string) => void;
  warn: (fields: Record<string, unknown>, msg: string) => void;
}

/** True when at least one device took it. Logs "sent" only then; otherwise why it wasn't. */
export function notePushOutcome(
  log: OutcomeLog,
  results: readonly PushDeliveryResult[] | undefined,
  fields: Record<string, unknown>
): boolean {
  const delivered = (results ?? []).filter((r) => r.success).length;
  if (delivered > 0) {
    log.info({ ...fields, delivered }, 'Push notification sent');
    return true;
  }
  const error = results?.find((r) => r.error)?.error ?? 'no delivery result';
  log.warn({ ...fields, error }, 'Push notification NOT sent');
  return false;
}

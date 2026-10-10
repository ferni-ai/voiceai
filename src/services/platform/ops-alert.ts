/**
 * Operator alerts that reach a person.
 *
 * Health checks, critical security events and failure notices used to end in a log line
 * or a webhook that was never configured, so nobody heard about them. opsAlert() writes
 * one structured error line carrying `opsAlert: <key>`; the Cloud Monitoring policy
 * "Ferni ops alert" matches that field (in Cloud Run JSON logs and in the voice agent's
 * text logs alike) and emails the operator, rate-limited. No webhook or secret needed.
 *
 * The error line is always written; the `opsAlert` field is attached at most once per key
 * per cooldown per process, so a storm still logs every occurrence but alerts once.
 *
 * @module services/platform/ops-alert
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'OpsAlert' });

export const OPS_ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_KEYS = 500;
const lastAlertAt = new Map<string, number>();

/**
 * Log an error and alert the operator. `key` groups repeats (e.g. 'memory-health',
 * 'security:auth_lockout'); returns false when that key already alerted within the cooldown.
 */
export function opsAlert(
  key: string,
  summary: string,
  details: Record<string, unknown> = {},
  now: number = Date.now()
): boolean {
  const last = lastAlertAt.get(key);
  if (last !== undefined && now - last < OPS_ALERT_COOLDOWN_MS) {
    log.error(details, summary);
    return false;
  }
  if (!lastAlertAt.has(key) && lastAlertAt.size >= MAX_KEYS) {
    const oldest = lastAlertAt.keys().next().value;
    if (oldest !== undefined) lastAlertAt.delete(oldest);
  }
  lastAlertAt.set(key, now);
  log.error({ ...details, opsAlert: key }, summary);
  return true;
}

/** Test seam: forget cooldowns. */
export function resetOpsAlerts(): void {
  lastAlertAt.clear();
}

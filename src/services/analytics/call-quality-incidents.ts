/**
 * One page per call-quality incident, and only once someone was actually told.
 *
 * The monitor checks every minute over a one-hour window, and a 5-minute cooldown was
 * its only limit, so one breach re-sent the same alert every 5 minutes for up to an
 * hour ("Response Time Critical" 23 times from 2026-10-22 to 10-25).
 *
 * Each alert key has its own incident. An incident opens only when the alert is
 * `delivered` (by Slack, or by opsAlert for a critical alert with no webhook). While
 * every check still fires that alert nothing is re-sent, except a reminder after
 * `ALERT_REPEAT_MS`. A check where it doesn't fire clears it, and the next breach
 * alerts again (no sooner than `alertCooldownMs` after the last send, so a flapping
 * metric can't page every minute).
 *
 * Never silent: a `failed` send (429, 5xx, fetch error, timeout) opens nothing, so the
 * next check retries it. `not_configured` (no webhook, nothing else raised it) also
 * opens nothing; it is logged once per incident so nobody believes it went out, and
 * retried after `alertCooldownMs`, not every minute (no webhook won't appear in a
 * minute, and each attempt logs a line).
 *
 * @module services/analytics/call-quality-incidents
 */
import type { NotificationContext, SlackDelivery } from '../slack-notifications.js';

/** An open incident's alert is sent again after this long. */
export const ALERT_REPEAT_MS = 3 * 60 * 60 * 1000;

interface Notifier {
  notifyWithResult: (context: NotificationContext) => Promise<SlackDelivery>;
}
interface Log {
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

/** Send through `notifier`; no notifier is `not_configured`, a throw is `failed`. */
export async function deliverAlert(
  notifier: Notifier | null,
  context: NotificationContext
): Promise<SlackDelivery> {
  if (!notifier) return { status: 'not_configured' };
  try {
    return await notifier.notifyWithResult(context);
  } catch (error) {
    return { status: 'failed', reason: String(error) };
  }
}

export class AlertIncidents {
  private readonly lastSent = new Map<string, number>();
  private readonly open = new Set<string>();
  private readonly firing = new Set<string>();
  private readonly unsentLogged = new Set<string>();
  /** When `key` last came back `not_configured`; it waits `cooldownMs` before a retry. */
  private readonly lastUnconfigured = new Map<string, number>();

  /** Start a check; the alerts seen before endCheck() are the ones still firing. */
  beginCheck(): void {
    this.firing.clear();
  }

  /** Whether alert `key`, firing at `now`, is due. Report the outcome with record(). */
  shouldSend(key: string, now: number, cooldownMs: number): boolean {
    this.firing.add(key);
    const unconfigured = this.lastUnconfigured.get(key);
    if (unconfigured !== undefined && now - unconfigured < cooldownMs) return false;
    const last = this.lastSent.get(key);
    const wait = this.open.has(key) ? ALERT_REPEAT_MS : cooldownMs;
    return last === undefined || now - last > wait;
  }

  /** The send for `key` at `now` ended in `result`; only a delivery opens the incident. */
  record(key: string, now: number, result: SlackDelivery, log: Log): void {
    if (result.status === 'not_configured') this.lastUnconfigured.set(key, now); // not `failed`
    if (result.status === 'delivered') {
      this.lastSent.set(key, now);
      this.open.add(key);
      this.unsentLogged.delete(key);
    } else if (result.status === 'failed') {
      log.warn({ alertKey: key, reason: result.reason }, 'Slack alert failed; retrying next check');
    } else if (!this.unsentLogged.has(key)) {
      this.unsentLogged.add(key);
      log.warn({ alertKey: key }, 'alert not delivered: no Slack webhook');
    }
  }

  /** End a check: an incident whose alert did not fire in it has cleared. */
  endCheck(): void {
    for (const key of this.open) if (!this.firing.has(key)) this.open.delete(key);
    for (const key of this.unsentLogged) if (!this.firing.has(key)) this.unsentLogged.delete(key);
  }

  reset(): void {
    this.lastSent.clear();
    this.open.clear();
    this.firing.clear();
    this.unsentLogged.clear();
    this.lastUnconfigured.clear();
  }
}

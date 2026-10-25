/**
 * One Slack alert per call-quality incident.
 *
 * The monitor checks every minute over a one-hour window, and a 5-minute
 * cooldown was its only limit. One bad call kept a condition true for up to an
 * hour, so the same alert went out every 5 minutes until the call aged out of
 * the window ("Response Time Critical" 23 times from 2026-10-22 to 10-25).
 *
 * Now a sent alert opens an incident. While every check still fires that alert
 * the incident stays open and nothing is re-sent, except a reminder once
 * `alertRepeatMs` has passed. A check where it does not fire closes it, and the
 * next breach alerts again (no sooner than `alertCooldownMs` after the last
 * send, so a flapping metric can't page every minute).
 *
 * @module services/analytics/call-quality-incidents
 */

export interface IncidentTiming {
  /** Least time between two sends of one alert. */
  alertCooldownMs: number;
  /** Time before an open incident's alert is sent again as a reminder. */
  alertRepeatMs: number;
}

export class AlertIncidents {
  private readonly lastSent = new Map<string, number>();
  private readonly open = new Set<string>();
  private readonly firing = new Set<string>();

  /** Start a check; the alerts seen before endCheck() are the ones still firing. */
  beginCheck(): void {
    this.firing.clear();
  }

  /** Whether alert `key`, firing at `now`, should be sent. A send opens its incident. */
  shouldSend(key: string, now: number, timing: IncidentTiming): boolean {
    this.firing.add(key);
    const last = this.lastSent.get(key);
    const wait = this.open.has(key) ? timing.alertRepeatMs : timing.alertCooldownMs;
    if (last !== undefined && now - last <= wait) return false;
    this.lastSent.set(key, now);
    this.open.add(key);
    return true;
  }

  /** End a check: an incident whose alert did not fire in it has cleared. */
  endCheck(): void {
    for (const key of this.open) if (!this.firing.has(key)) this.open.delete(key);
  }

  reset(): void {
    this.lastSent.clear();
    this.open.clear();
    this.firing.clear();
  }
}

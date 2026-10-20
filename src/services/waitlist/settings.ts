/**
 * Wave settings, from the Firestore doc `waitlist_settings/current`, so the
 * size, days and ceilings change without a deploy. Missing or malformed
 * fields fall back to the founder's defaults (2026-10-18): 100 people, Monday
 * and Thursday at 17:00 UTC, pause over $50 of GCP cost or 5% call errors.
 *
 * @module services/waitlist/settings
 */
export interface WaitlistSettings {
  waveSize: number;
  /** Comma-separated weekdays, e.g. 'Mon,Thu'. */
  cadence: string;
  paused: boolean;
  costCeilingUsd: number;
  errorRateCeiling: number;
}

export const SETTINGS_DOC = { collection: 'waitlist_settings', id: 'current' } as const;
export const WAVE_HOUR_UTC = 17;
export const SEAT_DAYS = 7;

export const DEFAULT_SETTINGS: Readonly<WaitlistSettings> = {
  waveSize: 100,
  cadence: 'Mon,Thu',
  paused: false,
  costCeilingUsd: 50,
  errorRateCeiling: 0.05,
};

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Weekday numbers (0 = Sunday) in a cadence; empty when nothing in it is a day. */
export function cadenceDays(cadence: string): number[] {
  return cadence
    .split(',')
    .map((d) => DAYS.indexOf(d.trim().slice(0, 3).toLowerCase()))
    .filter((d) => d >= 0);
}

const positive = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;

export function readSettings(data: Record<string, unknown> | undefined): WaitlistSettings {
  const d = data ?? {};
  const cadence = typeof d.cadence === 'string' && cadenceDays(d.cadence).length > 0;
  return {
    waveSize: Math.floor(positive(d.waveSize, DEFAULT_SETTINGS.waveSize)),
    cadence: cadence ? (d.cadence as string) : DEFAULT_SETTINGS.cadence,
    paused: d.paused === true,
    costCeilingUsd: positive(d.costCeilingUsd, DEFAULT_SETTINGS.costCeilingUsd),
    errorRateCeiling: positive(d.errorRateCeiling, DEFAULT_SETTINGS.errorRateCeiling),
  };
}

/** The next wave after `now`: the first cadence day at WAVE_HOUR_UTC still ahead. */
export function nextWaveAt(cadence: string, now: Date): Date {
  const days = cadenceDays(cadence);
  const valid = days.length > 0 ? days : cadenceDays(DEFAULT_SETTINGS.cadence);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const at = new Date(now);
    at.setUTCDate(now.getUTCDate() + ahead);
    at.setUTCHours(WAVE_HOUR_UTC, 0, 0, 0);
    if (at > now && valid.includes(at.getUTCDay())) return at;
  }
  throw new Error('unreachable: a cadence day falls within a week');
}

/**
 * One wave: let the next N verified people in, in queue order.
 *
 * 1. Seats unclaimed after SEAT_DAYS go back to the pool first (status
 *    'lapsed', keeping their original place), so this wave can refill them.
 * 2. Paused in settings, or the capacity guard over a ceiling: skip, and say why.
 *    A guard signal that can't be read: run anyway and alert the operator.
 * 3. The wave doc `waitlist_waves/{id}` is claimed once and numbered; a re-run
 *    of the same id tops up to N (a crash mid-wave) or does nothing (done).
 * 4. Each admitted person: status 'admitted', a seat for SEAT_DAYS, and this
 *    wave's founding-member perk (on their profile too, if any). Counts only; no email.
 *
 * @module services/waitlist/wave
 */
import { opsAlert } from '../platform/ops-alert.js';
import type { GuardReading } from './capacity-guard.js';
import type { QueueEntry } from './queue.js';
import type { WaitlistSettings } from './settings.js';

export interface WaveRecord {
  id: string;
  number: number;
  status: 'running' | 'done';
}

export interface WaveStore {
  settings: () => Promise<WaitlistSettings>;
  /** Creates the wave doc with the next number (or `number`), or returns the existing one. */
  claimWave: (id: string, at: Date, number?: number) => Promise<WaveRecord>;
  finishWave: (id: string, summary: Record<string, unknown>) => Promise<void>;
  recordSkip: (id: string, summary: Record<string, unknown>) => Promise<void>;
  /** How many people this wave already let in. */
  admittedIn: (waveId: string) => Promise<number>;
  /** The first `limit` people in line: inQueue, by laneRank then priorityKey. */
  nextInLine: (limit: number) => Promise<QueueEntry[]>;
  /** Admitted, never signed in, seat past its expiry. */
  lapsedSeats: (now: Date) => Promise<QueueEntry[]>;
  admit: (e: QueueEntry, wave: WaveRecord, now: Date) => Promise<void>;
  lapse: (e: QueueEntry, now: Date) => Promise<void>;
}

export interface WaveDeps {
  store: WaveStore;
  guard: (settings: WaitlistSettings) => Promise<GuardReading>;
  now: Date;
  dryRun: boolean;
}

export interface WaveReport {
  waveId: string;
  dryRun: boolean;
  wave?: number;
  admitted: number;
  lapsed: number;
  skipped?: 'paused' | 'guard' | 'already-ran';
  guard?: GuardReading;
}

/** A scheduled wave's id: its UTC date, so one run per day and a retry is the same wave. */
export const scheduledWaveId = (now: Date): string => now.toISOString().slice(0, 10);

export async function runWave(deps: WaveDeps, waveId: string): Promise<WaveReport> {
  const { store, now, dryRun } = deps;
  const settings = await store.settings();
  const lapsing = await store.lapsedSeats(now);
  if (!dryRun) for (const e of lapsing) await store.lapse(e, now); // eslint-disable-line no-await-in-loop
  const base = { waveId, dryRun, admitted: 0, lapsed: lapsing.length };

  if (settings.paused) return skip(deps, { ...base, skipped: 'paused' });
  const guard = await deps.guard(settings);
  if (guard.state === 'tripped') return skip(deps, { ...base, skipped: 'guard', guard });
  if (guard.state === 'unmeasured') {
    opsAlert('waitlist-wave-guard', 'Waitlist wave ran without a full capacity reading', { waveId, reasons: guard.reasons }); // prettier-ignore
  }

  if (dryRun) {
    const would = await store.nextInLine(settings.waveSize);
    return { ...base, admitted: would.length, guard };
  }
  const wave = await store.claimWave(waveId, now);
  if (wave.status === 'done') return { ...base, wave: wave.number, skipped: 'already-ran', guard };
  const already = await store.admittedIn(waveId);
  const people = await store.nextInLine(Math.max(settings.waveSize - already, 0));
  for (const e of people) await store.admit(e, wave, now); // eslint-disable-line no-await-in-loop
  const report = { ...base, wave: wave.number, admitted: already + people.length, guard };
  await store.finishWave(waveId, { admitted: report.admitted, lapsed: report.lapsed, guard: guard.state, guardReasons: guard.reasons }); // prettier-ignore
  return report;
}

async function skip(deps: WaveDeps, report: WaveReport): Promise<WaveReport> {
  if (!deps.dryRun) {
    await deps.store.recordSkip(report.waveId, { skippedReason: report.skipped, guard: report.guard?.state ?? null, guardReasons: report.guard?.reasons ?? [] }); // prettier-ignore
  }
  return report;
}

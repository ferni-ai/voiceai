/**
 * One wave: let the next N verified people in, in queue order.
 *
 * 1. Seats unclaimed after SEAT_DAYS go back to the pool first (status 'lapsed',
 *    at the back of the line). A member with an active profile is never lapsed:
 *    their seat is marked joined instead.
 * 2. Paused in settings, or the capacity guard over a ceiling: skip, and say why.
 *    A guard signal that can't be read: run anyway and alert the operator.
 * 3. The wave doc `waitlist_waves/{id}` is claimed under a lease: a second run
 *    while the lease is live is 'busy'; after it expires (a crash) a run may
 *    re-claim and top up. A finished wave is never re-run.
 * 4. Each admission is its own transaction that re-reads the wave's admitted
 *    count and the person's place in line, so overlapping runs can't pass N.
 *    Someone with an active profile is marked joined, not given a seat. Counts
 *    only; no email.
 *
 * @module services/waitlist/wave
 */
import { opsAlert } from '../platform/ops-alert.js';
import type { GuardReading } from './capacity-guard.js';
import type { QueueEntry } from './queue.js';
import type { WaitlistSettings } from './settings.js';

export const WAVE_LEASE_MS = 10 * 60_000;
/** Extra people read past the remaining seats, for anyone skipped as already in. */
const SLACK = 20;

export interface WaveRecord {
  id: string;
  number: number;
  status: 'running' | 'done' | 'busy';
  /** Admitted so far in this wave (a re-claimed wave carries its count). */
  admitted: number;
}

export type AdmitResult = 'admitted' | 'full' | 'skipped' | 'member';
export type LapseResult = 'lapsed' | 'member' | 'skipped';

export interface WaveStore {
  settings: () => Promise<WaitlistSettings>;
  /** Claims the wave under a lease until `leaseUntil`; 'busy' while another run holds it, 'done' once finished. */
  claimWave: (id: string, now: Date, leaseUntil: Date, number?: number) => Promise<WaveRecord>;
  finishWave: (id: string, summary: Record<string, unknown>) => Promise<void>;
  recordSkip: (id: string, summary: Record<string, unknown>) => Promise<void>;
  /** The first `limit` people in line: inQueue, by laneRank then priorityKey. */
  nextInLine: (limit: number) => Promise<QueueEntry[]>;
  /** Admitted, never signed in, seat past its expiry. */
  lapsedSeats: (now: Date) => Promise<QueueEntry[]>;
  /** One person, in a transaction: re-reads the wave's count (stops at `size`) and their inQueue. */
  admitOne: (e: QueueEntry, wave: WaveRecord, size: number, now: Date) => Promise<AdmitResult>;
  /** One seat, in a transaction: re-reads it; a member with an active profile is marked joined. */
  lapse: (e: QueueEntry, now: Date) => Promise<LapseResult>;
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
  members?: number;
  skipped?: 'paused' | 'guard' | 'already-ran' | 'busy';
  guard?: GuardReading;
}

/** A scheduled wave's id: its UTC date, so one run per day and a retry is the same wave. */
export const scheduledWaveId = (now: Date): string => now.toISOString().slice(0, 10);

export async function runWave(deps: WaveDeps, waveId: string): Promise<WaveReport> {
  const { store, now, dryRun } = deps;
  const settings = await store.settings();
  const lapsing = await store.lapsedSeats(now);
  let lapsed = dryRun ? lapsing.length : 0;
  let members = 0;
  for (const e of dryRun ? [] : lapsing) {
    const r = await store.lapse(e, now); // eslint-disable-line no-await-in-loop
    if (r === 'lapsed') lapsed++;
    if (r === 'member') members++;
  }
  const base = { waveId, dryRun, admitted: 0, lapsed, members };

  if (settings.paused) return skip(deps, { ...base, skipped: 'paused' });
  const guard = await deps.guard(settings);
  if (guard.state === 'tripped') return skip(deps, { ...base, skipped: 'guard', guard });
  if (guard.state === 'unmeasured') {
    opsAlert('waitlist-wave-guard', 'Waitlist wave ran without a full capacity reading', { waveId, reasons: guard.reasons }); // prettier-ignore
  }
  if (dryRun) return { ...base, admitted: (await store.nextInLine(settings.waveSize)).length, guard }; // prettier-ignore

  const wave = await store.claimWave(waveId, now, new Date(now.getTime() + WAVE_LEASE_MS));
  if (wave.status === 'done') return { ...base, wave: wave.number, skipped: 'already-ran', guard };
  if (wave.status === 'busy') return { ...base, wave: wave.number, skipped: 'busy', guard };
  let admitted = wave.admitted;
  const people = await store.nextInLine(Math.max(settings.waveSize - admitted, 0) + SLACK);
  for (const e of people) {
    if (admitted >= settings.waveSize) break;
    const r = await store.admitOne(e, wave, settings.waveSize, now); // eslint-disable-line no-await-in-loop
    if (r === 'full') break;
    if (r === 'admitted') admitted++;
    if (r === 'member') members++;
  }
  const report = { ...base, members, wave: wave.number, admitted, guard };
  await store.finishWave(waveId, {
    lapsed,
    members,
    guard: guard.state,
    guardReasons: guard.reasons,
  }); // the admitted counter is the transactions' own
  return report;
}

async function skip(deps: WaveDeps, report: WaveReport): Promise<WaveReport> {
  if (!deps.dryRun) {
    await deps.store.recordSkip(report.waveId, { skippedReason: report.skipped, guard: report.guard?.state ?? null, guardReasons: report.guard?.reasons ?? [] }); // prettier-ignore
  }
  return report;
}

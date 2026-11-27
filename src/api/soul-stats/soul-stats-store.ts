/**
 * SOUL_STATS (off by default) and the store behind it: one admin-only doc per UTC
 * hour, `soul_stats_hourly/{YYYY-MM-DDTHH}`, each count added with
 * FieldValue.increment. No uid or anything else about a person is kept; the
 * `expireAt` field (8 days out) is the TTL field the owner enables in prod.
 *
 * @module api/soul-stats/soul-stats-store
 */
import { FieldValue, Timestamp, type Firestore } from '@google-cloud/firestore';
import { flagOn, type Env } from '../../config/env-flag.js';
import { withTimeout } from '../../utils/async.js';
import { safeSet } from '../../utils/safe-firestore.js';
import { SOUL_COUNT_KEYS, type SoulCounts } from './soul-stats-input.js';

const COLLECTION = 'soul_stats_hourly';
const KEEP_MS = 8 * 24 * 60 * 60 * 1000;
const WINDOW_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
/** Every Firestore call here gives up after this (it can hang for minutes otherwise). */
const DEADLINE_MS = 5_000;
export const FIRESTORE_SLOW = 'Firestore did not answer within 5s';

export function soulStatsOn(env: Env = process.env): boolean {
  return flagOn('SOUL_STATS', env);
}

/** The doc id for the UTC hour holding `ms`, e.g. 2026-11-19T07. */
function hourId(ms: number): string {
  return new Date(ms).toISOString().slice(0, 13);
}

/** Adds each non-zero count into this hour's doc; false when every count was 0. */
export async function addSoulCounts(
  db: Firestore,
  counts: SoulCounts,
  now: number
): Promise<boolean> {
  const added = SOUL_COUNT_KEYS.filter((k) => counts[k] > 0);
  if (added.length === 0) return false;
  const increments = Object.fromEntries(added.map((k) => [k, FieldValue.increment(counts[k])]));
  // Timestamps, not Dates: safeSet's cleaner turns a Date into an ISO string, and
  // a TTL policy never expires a string field.
  const doc = {
    ...increments,
    updatedAt: Timestamp.fromMillis(now),
    expireAt: Timestamp.fromMillis(now + KEEP_MS),
  };
  const write = safeSet(db.collection(COLLECTION).doc(hourId(now)), doc, { merge: true });
  await withTimeout(write, DEADLINE_MS, 'soul_stats_hourly write');
  return true;
}

/** What GET /api/v1/admin/soul/stats answers when it has the numbers. */
export interface SoulStatsTotals {
  measured: true;
  windowHours: number;
  /** Every key, summed over the window; a doc written before a key existed adds 0 to it. */
  counts: SoulCounts;
  /** The newest write in the window; null when nothing was reported in it. */
  lastUpdated: string | null;
}

const asCount = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function asMs(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  const toDate = (v as { toDate?: unknown } | null)?.toDate;
  return typeof toDate === 'function' ? (toDate.call(v) as Date).getTime() : null;
}

/** Sums the last 24 hourly docs (this hour and the 23 before it), read by id. */
export async function readSoulTotals(db: Firestore, now: number): Promise<SoulStatsTotals> {
  const col = db.collection(COLLECTION);
  const refs = Array.from({ length: WINDOW_HOURS }, (_, i) => col.doc(hourId(now - i * HOUR_MS)));
  const snaps = await withTimeout(db.getAll(...refs), DEADLINE_MS, 'soul_stats_hourly read');
  const sum = Object.fromEntries(SOUL_COUNT_KEYS.map((k) => [k, 0])) as SoulCounts;
  let newest: number | null = null;
  for (const snap of snaps) {
    const data = snap.data();
    if (!data) continue;
    for (const k of SOUL_COUNT_KEYS) sum[k] += asCount(data[k]);
    const at = asMs(data.updatedAt);
    if (at !== null && (newest === null || at > newest)) newest = at;
  }
  return {
    measured: true,
    windowHours: WINDOW_HOURS,
    counts: sum,
    lastUpdated: newest === null ? null : new Date(newest).toISOString(),
  };
}

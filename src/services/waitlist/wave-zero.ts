/**
 * Wave 0, once, before WAITLIST_GATE turns on (decided 2026-10-18): everyone
 * already signed in, the people left pending on the list, and the
 * friends-and-family cohort come in together as founding members of wave 0.
 *
 * - Signed in already (an enabled Auth account with a verified email, which
 *   includes every friends-and-family member): status 'joined', no seat to
 *   lapse, and their profile tier is never touched; only foundingWaveMember/
 *   foundingWave are added, and only to a profile that already exists.
 * - Pending, never signed in: status 'admitted' with a 7-day seat, like any
 *   wave; a seat is claimed only by signing in with that exact verified address.
 *   Newsletter-only rows, throwaway domains and repeats of one address are skipped.
 * - A waiting Gmail alias of someone signed in is retired (status 'merged').
 *
 * It runs once: `waitlist_waves/wave-0` is created first (create(), never a
 * merge), and an existing one refuses the run. Sends nothing: the "doors open"
 * note is a separate step.
 *
 * @module services/waitlist/wave-zero
 */
import { canonicalEmail, isDisposableEmail, isValidEmail, readEntry, WAITING_STATUSES, type QueueEntry } from './queue.js'; // prettier-ignore
import { waitlistDocId } from './join.js';
import { SEAT_DAYS } from './settings.js';

export const WAVE_ZERO_ID = 'wave-0';
export const WAVE_ZERO_SOURCES = ['signed-in', 'pending', 'friends-and-family'] as const;
export type WaveZeroSource = (typeof WAVE_ZERO_SOURCES)[number];

export interface WaveZeroReader {
  /** Verified emails of every enabled, non-anonymous Auth account. */
  signedInEmails: () => Promise<string[]>;
  /** Verified emails of the friends-and-family cohort's enabled members. */
  cohortEmails: () => Promise<string[]>;
  /** Every waitlist doc, as stored. */
  waitlistDocs: () => Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  profileExists: (id: string) => Promise<boolean>;
  /** Wave 0 has already run (or is running). */
  waveZeroExists: () => Promise<boolean>;
}

export interface WaveZeroWriter {
  /** create() waitlist_waves/wave-0; false when it already exists. */
  claimWaveZero: (data: Record<string, unknown>) => Promise<boolean>;
  finishWaveZero: (data: Record<string, unknown>) => Promise<void>;
  mergeWaitlist: (id: string, data: Record<string, unknown>) => Promise<void>;
  mergeProfile: (id: string, data: Record<string, unknown>) => Promise<void>;
}

export interface WaveZeroPlan {
  /** Wave 0 already ran: nothing to do. */
  alreadyRan: boolean;
  /** Signed in already: marked joined. */
  joined: Array<{ id: string; email: string; profile: boolean }>;
  /** Pending: a seat each. */
  seats: Array<{ id: string; email: string }>;
  /** Waiting Gmail aliases of someone signed in: retired, pointing at their entry. */
  retired: Array<{ id: string; into: string }>;
  /** Waiting rows left out: newsletter-only, throwaway or invalid addresses, repeats of one address. */
  skipped: number;
}

const seatable = (e: QueueEntry, source: unknown): boolean =>
  source !== 'newsletter' && isValidEmail(e.email) && !isDisposableEmail(e.email);

export async function planWaveZero(
  reader: WaveZeroReader,
  include: ReadonlySet<WaveZeroSource>
): Promise<WaveZeroPlan> {
  // prettier-ignore
  const empty = { joined: [], seats: [], retired: [], skipped: 0 };
  if (await reader.waveZeroExists()) return { alreadyRan: true, ...empty };
  const docs = await reader.waitlistDocs();
  const sources = new Map(docs.map((d) => [d.id, d.data.source]));
  const entries = docs.map((d) => readEntry(d.id, d.data)).sort((a, b) => a.joinedAtMs - b.joinedAtMs || a.id.localeCompare(b.id)); // prettier-ignore
  const signedIn = new Map<string, string>(); // canonical -> verified email
  const add = (emails: string[]) => emails.forEach((e) => signedIn.set(canonicalEmail(e), e.toLowerCase())); // prettier-ignore
  if (include.has('signed-in')) add(await reader.signedInEmails());
  if (include.has('friends-and-family')) add(await reader.cohortEmails());

  const joined = await Promise.all(
    [...signedIn.values()].map(async (email) => {
      const id = waitlistDocId(email);
      return { id, email, profile: await reader.profileExists(id) };
    })
  );
  const joinedIds = new Set(joined.map((j) => j.id));
  const waiting = entries.filter((e) => e.email && WAITING_STATUSES.has(e.status) && !joinedIds.has(e.id)); // prettier-ignore
  const owner = (e: QueueEntry) => (e.emailCanonical.endsWith('@gmail.com') ? signedIn.get(e.emailCanonical) : undefined); // prettier-ignore
  const retired = waiting.flatMap((e) => { const o = owner(e); return o ? [{ id: e.id, into: waitlistDocId(o) }] : []; }); // prettier-ignore
  const seen = new Set<string>();
  const seats: WaveZeroPlan['seats'] = [];
  let skipped = 0;
  for (const e of include.has('pending') ? waiting.filter((w) => !owner(w)) : []) {
    const address = e.email.trim().toLowerCase(); // one seat per exact address, the oldest row
    if (!seatable(e, sources.get(e.id)) || seen.has(address)) skipped++;
    else seats.push({ id: e.id, email: e.email });
    seen.add(address);
  }
  return { alreadyRan: false, joined, seats, retired, skipped };
}

/** Writes the plan; returns false (writing nothing) when wave 0 already exists. */
export async function applyWaveZero(
  plan: WaveZeroPlan,
  writer: WaveZeroWriter,
  now: Date
): Promise<boolean> {
  // prettier-ignore
  if (plan.alreadyRan || !(await writer.claimWaveZero({ number: 0, status: 'running', startedAt: now }))) return false; // prettier-ignore
  const founding = { foundingWaveMember: true, foundingWave: 0 };
  const entry = { ...founding, waveId: WAVE_ZERO_ID, inQueue: false };
  for (const p of plan.joined) {
    // eslint-disable-next-line no-await-in-loop
    await writer.mergeWaitlist(p.id, { email: p.email, emailCanonical: canonicalEmail(p.email), status: 'joined', admittedAt: now, ...entry }); // prettier-ignore
    if (p.profile) await writer.mergeProfile(p.id, founding); // eslint-disable-line no-await-in-loop
  }
  const seatExpiresAt = new Date(now.getTime() + SEAT_DAYS * 86_400_000);
  for (const s of plan.seats) {
    // eslint-disable-next-line no-await-in-loop
    await writer.mergeWaitlist(s.id, { emailCanonical: canonicalEmail(s.email), status: 'admitted', admittedAt: now, seatExpiresAt, ...entry }); // prettier-ignore
  }
  for (const r of plan.retired) {
    await writer.mergeWaitlist(r.id, { status: 'merged', mergedInto: r.into, inQueue: false }); // eslint-disable-line no-await-in-loop
  }
  await writer.finishWaveZero({ status: 'done', joined: plan.joined.length, admitted: plan.seats.length, finishedAt: now }); // prettier-ignore
  return true;
}

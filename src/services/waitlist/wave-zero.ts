/**
 * Wave 0, once, before WAITLIST_GATE turns on (decided 2026-10-18): everyone
 * already signed in, the people left pending on the list, and the
 * friends-and-family cohort come in together as founding members of wave 0.
 *
 * - Signed in already (an Auth account with a verified email, which includes
 *   every friends-and-family member): status 'joined', no seat to lapse, and
 *   their profile tier is never touched; only foundingMember/foundingWave are
 *   added, and only to a profile that already exists.
 * - Pending, never signed in: status 'admitted' with a 7-day seat, like any wave.
 *
 * Identity stays bound to the verified address (as in join.ts): a signed-in
 * person's entry is the doc keyed by their own email; a waiting Gmail alias of
 * it is retired (status 'merged') instead of being given a seat. Sends
 * nothing: the "doors open" note is a separate step.
 *
 * @module services/waitlist/wave-zero
 */
import { canonicalEmail, readEntry, WAITING_STATUSES, type QueueEntry } from './queue.js';
import { waitlistDocId } from './join.js';
import { SEAT_DAYS } from './settings.js';

export const WAVE_ZERO_ID = 'wave-0';
export const WAVE_ZERO_SOURCES = ['signed-in', 'pending', 'friends-and-family'] as const;
export type WaveZeroSource = (typeof WAVE_ZERO_SOURCES)[number];

export interface WaveZeroReader {
  /** Verified emails of every non-anonymous Auth account. */
  signedInEmails: () => Promise<string[]>;
  /** Verified emails of the friends-and-family cohort's members. */
  cohortEmails: () => Promise<string[]>;
  /** Every waitlist doc, as stored. */
  waitlistDocs: () => Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  profileExists: (id: string) => Promise<boolean>;
}

export interface WaveZeroWriter {
  mergeWaitlist: (id: string, data: Record<string, unknown>) => Promise<void>;
  mergeProfile: (id: string, data: Record<string, unknown>) => Promise<void>;
  recordWave: (id: string, data: Record<string, unknown>) => Promise<void>;
}

export interface WaveZeroPlan {
  /** Signed in already: marked joined. */
  joined: Array<{ id: string; email: string; profile: boolean }>;
  /** Pending: a seat each. */
  seats: Array<{ id: string; email: string }>;
  /** Waiting Gmail aliases of someone signed in: retired, pointing at their entry. */
  retired: Array<{ id: string; into: string }>;
}

export async function planWaveZero(
  reader: WaveZeroReader,
  include: ReadonlySet<WaveZeroSource>
): Promise<WaveZeroPlan> {
  const entries = (await reader.waitlistDocs()).map((d) => readEntry(d.id, d.data));
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
  const seats = include.has('pending')
    ? waiting.filter((e) => !owner(e)).map((e) => ({ id: e.id, email: e.email }))
    : [];
  return { joined, seats, retired };
}

export async function applyWaveZero(
  plan: WaveZeroPlan,
  writer: WaveZeroWriter,
  now: Date
): Promise<void> {
  // prettier-ignore
  const founding = { foundingMember: true, foundingWave: 0, waveId: WAVE_ZERO_ID, inQueue: false };
  for (const p of plan.joined) {
    // eslint-disable-next-line no-await-in-loop
    await writer.mergeWaitlist(p.id, { email: p.email, emailCanonical: canonicalEmail(p.email), status: 'joined', admittedAt: now, ...founding }); // prettier-ignore
    if (p.profile) await writer.mergeProfile(p.id, { foundingMember: true, foundingWave: 0 }); // eslint-disable-line no-await-in-loop
  }
  const seatExpiresAt = new Date(now.getTime() + SEAT_DAYS * 86_400_000);
  for (const s of plan.seats) {
    // eslint-disable-next-line no-await-in-loop
    await writer.mergeWaitlist(s.id, { emailCanonical: canonicalEmail(s.email), status: 'admitted', admittedAt: now, seatExpiresAt, ...founding }); // prettier-ignore
  }
  for (const r of plan.retired) {
    await writer.mergeWaitlist(r.id, { status: 'merged', mergedInto: r.into, inQueue: false }); // eslint-disable-line no-await-in-loop
  }
  await writer.recordWave(WAVE_ZERO_ID, { number: 0, status: 'done', joined: plan.joined.length, admitted: plan.seats.length, finishedAt: now }); // prettier-ignore
}

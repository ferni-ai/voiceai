/**
 * What Ferni has actually set up to reach this person, read from the stores the
 * senders read ("When I'll Reach Out", GET /api/outreach/upcoming).
 *
 * The panel used to read the outreach engine's in-process trigger map, which
 * nothing fills on the servers that answer it (initializeOutreachSystem never
 * runs there, global-services.ts), so it was always empty. Two things really go
 * out to the person on a schedule today:
 *
 * - a call the call-hours guard held for their hours, in
 *   bogle_users/{uid}/deferred_calls (kind 'proactive', status 'pending'), which
 *   the per-minute job places (deferred-calls.ts);
 * - a follow-up due later than now, in bogle_users/{uid}/follow_through, which the
 *   follow-up job texts, but only when FOLLOW_THROUGH_JOB=on and their
 *   FOLLOW_THROUGH_TEXTS cohort flag is on (follow-up-texts.ts). Otherwise it
 *   is raised on their next call, not sent, so it is not listed.
 *
 * Neither can be moved or cancelled from the panel yet, so each says so. A
 * failed read throws: the panel must show an error, never "nothing planned".
 *
 * @module services/outreach/upcoming-outreach
 */
import type { FollowUp } from '../follow-through/index.js';

export interface UpcomingOutreach {
  id: string;
  type: 'held_call' | 'follow_up';
  personaId: string;
  channel: 'call' | 'sms';
  /** UTC ISO instant. */
  scheduledFor: string;
  preview: { body: string };
  reason: string;
  priority: 'medium';
  canReschedule: false;
  canCancel: false;
}

export interface UpcomingDeps {
  /** The user's deferred_calls documents still pending. */
  heldCalls: (userId: string) => Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  /** Their open or surfaced follow-ups (follow-through-store live()). */
  followUps: (userId: string) => Promise<FollowUp[]>;
  /** Whether the follow-up job would text this person. */
  followUpTextsOn: (userId: string) => Promise<boolean>;
}

/** Calls this late are dropped by the job, not placed (deferred-calls.ts LATE_AFTER_MS). */
const LATE_AFTER_MS = 12 * 60 * 60 * 1000;
export const MAX_UPCOMING = 20;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const validIso = (v: unknown): string | null => {
  const t = Date.parse(str(v));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

function heldCall(id: string, d: Record<string, unknown>, now: Date): UpcomingOutreach | null {
  const at = validIso(d.scheduledFor);
  if (d.kind !== 'proactive' || d.status !== 'pending' || !at) return null;
  if (now.getTime() - Date.parse(at) > LATE_AFTER_MS) return null;
  const req = (d.request ?? {}) as Record<string, unknown>;
  return {
    id,
    type: 'held_call',
    personaId: str(req.personaId) || 'ferni',
    channel: 'call',
    scheduledFor: at,
    preview: { body: str(req.message) },
    reason: str(req.reason) || 'A call held for your hours',
    priority: 'medium',
    canReschedule: false,
    canCancel: false,
  };
}

/** Only a follow-up still ahead is upcoming: one due already was texted or is about to be. */
function followUp(f: FollowUp, now: Date): UpcomingOutreach | null {
  const at = validIso(f.dueAt);
  if (!at || Date.parse(at) <= now.getTime()) return null;
  return {
    id: f.id,
    type: 'follow_up',
    personaId: 'ferni',
    channel: 'sms',
    scheduledFor: at,
    preview: { body: f.text },
    reason: f.kind === 'commitment' ? 'Checking how it went' : 'A reminder you asked for',
    priority: 'medium',
    canReschedule: false,
    canCancel: false,
  };
}

/** Everything set to go out to them, soonest first. Throws when a store can't be read. */
export async function listUpcomingOutreach(
  userId: string,
  deps: UpcomingDeps,
  opts: { now?: Date; limit?: number } = {}
): Promise<UpcomingOutreach[]> {
  const now = opts.now ?? new Date();
  const [calls, textsOn] = await Promise.all([
    deps.heldCalls(userId),
    deps.followUpTextsOn(userId),
  ]);
  const items = calls.map((c) => heldCall(c.id, c.data, now));
  if (textsOn) items.push(...(await deps.followUps(userId)).map((f) => followUp(f, now)));
  return items
    .filter((i): i is UpcomingOutreach => i !== null)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    .slice(0, Math.min(Math.max(opts.limit ?? MAX_UPCOMING, 1), MAX_UPCOMING));
}

/** The real stores: Firestore deferred_calls and follow_through, and the cohort flag. */
export async function firestoreUpcomingDeps(): Promise<UpcomingDeps> {
  const [{ getFirestoreDb }, { firestoreFollowUpStore }, { followUpJobOn }, { flagForUser }] =
    await Promise.all([
      import('../../utils/firestore-utils.js'),
      import('../stores/follow-through-store.js'),
      import('./follow-up-texts.js'),
      import('../platform/cohort-flags.js'),
    ]);
  const db = getFirestoreDb();
  const store = firestoreFollowUpStore();
  if (!db || !store) throw new Error('Firestore not available');
  return {
    heldCalls: async (userId) => {
      const snap = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('deferred_calls')
        .where('status', '==', 'pending')
        .get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
    followUps: async (userId) => store.live(userId),
    followUpTextsOn: async (userId) =>
      followUpJobOn() && (await flagForUser(userId, 'FOLLOW_THROUGH_TEXTS')) === 'on',
  };
}

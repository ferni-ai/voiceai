/**
 * Cancel or move one item of "When I'll Reach Out" (GET /api/outreach/upcoming),
 * in the store its sender reads, for its owner only. Off unless REACH_OUT_ACTIONS=on.
 *
 * - held_call: bogle_users/{uid}/deferred_calls/{id}, kind 'proactive'. The
 *   per-minute job claims only pending calls (scheduling/due-items.ts), so a
 *   cancelled one is never placed. A move changes scheduledFor, only to a time the
 *   call-hours guard allows: the job checks the guard again on the way out and
 *   would just hold the call once more.
 * - follow_up: bogle_users/{uid}/follow_through/{id}. Never cancelled here yet
 *   (#3303: a cancel has to tell a text already sent from one still to come). A
 *   move replans the dueAt of an open one; the follow-up job texts only live ones
 *   and holds a text inside saved quiet hours (unless the caller set the time), so
 *   a new time inside them is refused. One made from a reminder is texted by the
 *   reminder job instead: not actionable.
 *
 * Every read is under the caller's own bogle_users/{uid}, so another person's id
 * is "not found". Both writes are compare-and-set (a transaction, or the store's
 * updatedAt check): when the sender took the item a moment earlier the answer is
 * "gone", never "cancelled".
 *
 * @module services/outreach/upcoming-outreach-actions
 */
import type { Firestore } from '@google-cloud/firestore';
import { flagOn } from '../../config/env-flag.js';
import {
  apply,
  isCallerTimed,
  type FollowUp,
  type FollowUpStore,
} from '../follow-through/index.js';
import { followUpMovable, type UpcomingOutreach } from './upcoming-outreach.js';

export type UpcomingKind = UpcomingOutreach['type'];
/** Which item: its kind picks the store, its id the document under the caller's own. */
export interface UpcomingRef {
  kind: UpcomingKind;
  id: string;
}
export type ActionRefusal = 'not-found' | 'gone' | 'not-actionable' | 'bad-time' | 'quiet';
export type ActionOutcome =
  { ok: true; scheduledFor?: string } | { ok: false; reason: ActionRefusal };

export interface UpcomingActionDeps {
  db: Firestore;
  followUps: Pick<FollowUpStore, 'live' | 'save'>;
  /** Whether the call-hours guard lets this held call ring at `at`. */
  callAllowedAt: (userId: string, at: Date, call: Record<string, unknown>) => Promise<boolean>;
  /** Whether `at` is inside the quiet hours they saved in the menu. */
  savedQuietAt: (userId: string, at: Date) => Promise<boolean>;
}

/** The furthest a move may go: past this it is a new plan, not a later time for this one. */
export const MOVE_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

export const reachOutActionsOn = (): boolean => flagOn('REACH_OUT_ACTIONS');

const refuse = (reason: ActionRefusal): ActionOutcome => ({ ok: false, reason });

/** A new time in the future and within MOVE_HORIZON_MS, else null. */
function validMoveTime(raw: unknown, now: Date): Date | null {
  const at = new Date(typeof raw === 'string' ? raw : Number.NaN);
  const ahead = at.getTime() - now.getTime();
  return ahead > 0 && ahead <= MOVE_HORIZON_MS ? at : null;
}

/** The caller's held call, changed in a transaction only while it is still pending. */
async function changeHeldCall(
  db: Firestore,
  userId: string,
  id: string,
  patch: (
    data: Record<string, unknown>
  ) => Promise<Record<string, unknown> | ActionRefusal> | Record<string, unknown>
): Promise<ActionOutcome> {
  const ref = db.collection('bogle_users').doc(userId).collection('deferred_calls').doc(id);
  const before = await ref.get();
  const data = before.exists ? before.data() : undefined;
  // Only the proactive calls the panel lists; an on-behalf call to someone else isn't one.
  if (!data || data.kind !== 'proactive') return refuse('not-found');
  if (data.status !== 'pending') return refuse('gone');
  const change = await patch(data);
  if (typeof change === 'string') return refuse(change);
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (fresh.data()?.status !== 'pending') return refuse('gone');
    tx.update(ref, change);
    return { ok: true };
  });
}

/** The caller's live follow-up after `next`, saved only if nobody changed it since it was read. */
async function changeFollowUp(
  store: UpcomingActionDeps['followUps'],
  userId: string,
  id: string,
  next: (f: FollowUp) => Promise<FollowUp | ActionRefusal> | FollowUp | ActionRefusal
): Promise<ActionOutcome> {
  const f = (await store.live(userId)).find((x) => x.id === id && x.userId === userId);
  if (!f) return refuse('not-found');
  const changed = await next(f);
  if (typeof changed === 'string') return refuse(changed);
  if (!(await store.save(changed, f.updatedAt))) return refuse('gone');
  return { ok: true };
}

/** An event applied to a follow-up, or 'gone' when its life refuses it (already closed). */
const applied = (f: FollowUp, event: Parameters<typeof apply>[1], now: Date): FollowUp | 'gone' => {
  const next = apply(f, event, now);
  return next.success ? next.data : ('gone' as const);
};

/** Cancel the caller's own item: the sender never sends it. */
export async function cancelUpcoming(
  deps: UpcomingActionDeps,
  userId: string,
  { kind, id }: UpcomingRef,
  now = new Date()
): Promise<ActionOutcome> {
  if (kind === 'held_call') {
    return changeHeldCall(deps.db, userId, id, () => ({
      status: 'cancelled',
      cancelledAt: now.toISOString(),
    }));
  }
  // Follow-up cancel is #3303. Refused before any read, so nothing about it changes.
  return refuse('not-actionable');
}

/** Move the caller's own item to `rawAt`, when the sender would really send then. */
export async function rescheduleUpcoming(
  deps: UpcomingActionDeps,
  userId: string,
  { kind, id }: UpcomingRef,
  rawAt: unknown,
  now = new Date()
): Promise<ActionOutcome> {
  const at = validMoveTime(rawAt, now);
  if (!at) return refuse('bad-time');
  const iso = at.toISOString();
  const out =
    kind === 'held_call'
      ? await changeHeldCall(deps.db, userId, id, async (call) =>
          (await deps.callAllowedAt(userId, at, call)) ? { scheduledFor: iso } : 'quiet'
        )
      : await changeFollowUp(deps.followUps, userId, id, async (f) => {
          if (!followUpMovable(f)) return 'not-actionable';
          if (!isCallerTimed(f) && (await deps.savedQuietAt(userId, at))) return 'quiet';
          return applied(f, { type: 'replan', dueAt: iso }, now);
        });
  return out.ok ? { ok: true, scheduledFor: iso } : out;
}

/** The real stores and checks: Firestore, the follow-through store and the senders' own guards. */
export async function firestoreActionDeps(): Promise<UpcomingActionDeps> {
  const [{ getFirestoreDb }, { firestoreFollowUpStore }, guard, quiet, { USER_REQUESTED_CALL }] =
    await Promise.all([
      import('../../utils/firestore-utils.js'),
      import('../stores/follow-through-store.js'),
      import('./call-hours-guard.js'),
      import('./quiet-hours.js'),
      import('./live-agent-call.js'),
    ]);
  const db = getFirestoreDb();
  const followUps = firestoreFollowUpStore();
  if (!db || !followUps) throw new Error('Firestore not available');
  return {
    db,
    followUps,
    // The same input conversational-calls.ts holds the call with: the caller is the recipient.
    callAllowedAt: async (userId, at, call) => {
      const request = (call.request ?? {}) as Record<string, unknown>;
      const decision = await guard.checkCallHours({
        now: at,
        recipientUserId: userId,
        ...(typeof request.phoneNumber === 'string' && { recipientPhone: request.phoneNumber }),
        ...(request.reason === USER_REQUESTED_CALL && { userAsked: true }),
      });
      return decision.allowed;
    },
    savedQuietAt: async (userId, at) => quiet.isSavedQuietNow(userId, at),
  };
}

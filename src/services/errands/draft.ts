/**
 * The working copy a step builds, and the moves every rules version shares:
 * asking the owner (one open question, the rest queued), the owner-approval
 * guard on outward effects, and the errand's next wake time.
 *
 * Pure: no clock, no storage.
 *
 * @module services/errands/draft
 */

import {
  CLOSED_STATES,
  describeApproval,
  sameApproval,
  type Approval,
  type ApprovalVerb,
  type Candidate,
  type Effect,
  type EffectBody,
  type Errand,
  type ErrandEvent,
  type ErrandState,
  type OutwardKind,
  type Question,
} from './errand.js';
import { DAY_MS, type ErrandPolicy, type ErrandPrefs } from './policy.js';
import { RETRY_POLICY } from './retry-policy.js';

export interface StepContext {
  readonly now: Date;
  readonly prefs?: ErrandPrefs;
  readonly policy: ErrandPolicy;
}
export interface StepResult {
  readonly next: Errand;
  readonly effects: readonly Effect[];
  readonly events: readonly ErrandEvent[];
}
export interface Draft {
  e: Errand;
  readonly effects: Effect[];
  readonly events: ErrandEvent[];
  readonly at: string;
  readonly ctx: StepContext;
}

export const approval = (verb: ApprovalVerb, ...placeIds: string[]): Approval => ({
  verb,
  placeIds,
});

/** Which owner yeses cover each outward kind: hanging up our own call rides on the yes to it. */
export const COVERS: Readonly<Record<OutwardKind, readonly ApprovalVerb[]>> = {
  call: ['call', 'book'],
  text: ['text'],
  cancel_call: ['call', 'book'],
  release_hold: ['release'],
  calendar: ['schedule'],
  reminder: ['schedule'],
};

export const cand = (e: Errand, placeId: string): Candidate | undefined =>
  e.candidates.find((c) => c.placeId === placeId);
export const inFlight = (e: Errand): boolean => e.candidates.some((c) => c.status === 'calling');

export const set = (d: Draft, patch: Partial<Errand>): void => void (d.e = { ...d.e, ...patch });
export const note = (d: Draft, text: string): void =>
  void d.events.push({ type: 'decision', at: d.at, note: text });
export function setCandidate(d: Draft, placeId: string, patch: Partial<Candidate>): void {
  const candidates = d.e.candidates.map((c) => (c.placeId === placeId ? { ...c, ...patch } : c));
  set(d, { candidates });
}
/** `ms` after now, as an ISO time. */
export const inMs = (d: Draft, ms: number): string =>
  new Date(d.ctx.now.getTime() + ms).toISOString();

export function emit(d: Draft, body: EffectBody, step: string, attempt = 1): void {
  const idemKey = `${d.e.id}:${step}:${attempt}`;
  d.effects.push({ ...body, idemKey, retry: RETRY_POLICY[body.kind] });
}

/** Closes the errand: no open or queued question survives it. */
export const close = (d: Draft, state: ErrandState, step: string): void =>
  set(d, { state, step, pending: null, queue: [] });

const holdsState = (s: ErrandState): boolean => s === 'scheduled' || CLOSED_STATES.has(s);

/** Asks `q` now. A text offer says why it's a text; anything else is an ask_owner. */
function put(d: Draft, q: Question, state?: ErrandState): void {
  const to = state ?? (holdsState(d.e.state) ? d.e.state : 'awaiting_owner');
  set(d, { state: to, pending: q, step: `confirm:${describeApproval(q.action)}` });
  const body: EffectBody =
    q.action.verb === 'text'
      ? {
          kind: 'offer_text_instead',
          action: q.action,
          placeId: q.action.placeIds[0],
          reason: q.reason ?? '',
        }
      : { kind: 'ask_owner', action: q.action, ...(q.reason ? { reason: q.reason } : {}) };
  d.effects.push({ ...body, idemKey: q.id, retry: RETRY_POLICY[body.kind] });
}

/**
 * Puts a question to the owner, or queues it behind the open one: an open
 * question is never overwritten. Its id is its ask's idemKey, numbered by the
 * errand's ask counter so a repeated ask is a new question.
 */
export function ask(d: Draft, action: Approval, reason?: string, state?: ErrandState): void {
  const asks = d.e.asks + 1;
  const said = describeApproval(action);
  const q: Question = {
    id: `${d.e.id}:ask:${said}:${asks}`,
    action,
    ...(reason ? { reason } : {}),
  };
  set(d, { asks });
  if (!d.e.pending) return put(d, q, state);
  set(d, { queue: [...d.e.queue, q] });
  note(d, `queued question ${said}`);
}

/** The open question `questionId` answers, logged and cleared, the next one asked; else why not. */
export function answered(
  d: Draft,
  questionId: string,
  type: 'owner_confirmed' | 'owner_declined'
): Question | string {
  const q = d.e.pending?.id === questionId ? d.e.pending : null;
  if (!q) return `no open question ${questionId}`;
  d.events.push({ type, at: d.at, action: q.action });
  const next: Question | undefined = d.e.queue[0];
  set(d, { pending: null, queue: d.e.queue.slice(1) });
  if (next !== undefined) put(d, next);
  return q;
}

/**
 * Drops the open and queued questions `moot` picks (once a place has booked,
 * "book the other place?" must not be answerable), asking the next survivor.
 */
export function withdraw(d: Draft, moot: (q: Question) => boolean): void {
  const queue = d.e.queue.filter((q) => !moot(q));
  const dropOpen = d.e.pending !== null && moot(d.e.pending);
  if (!dropOpen && queue.length === d.e.queue.length) return;
  note(d, 'withdrew questions that no longer apply');
  if (!dropOpen) return set(d, { queue });
  const next: Question | undefined = queue[0];
  set(d, { pending: null, queue: queue.slice(1) });
  if (next !== undefined) put(d, next);
}

type Outward = Extract<EffectBody, { approval: Approval }>;

/**
 * Emits an outward effect only when the owner said yes to exactly this
 * approval, it names this place, and its verb covers this kind; otherwise the
 * effect is dropped and the owner is asked about this one place.
 */
export function outward(d: Draft, body: Outward, step: string, attempt = 1): boolean {
  const a = body.approval;
  const covered =
    d.e.approvals.some((x) => sameApproval(x, a)) &&
    a.placeIds.includes(body.placeId) &&
    COVERS[body.kind].includes(a.verb);
  if (covered) {
    emit(d, body, step, attempt);
    return true;
  }
  note(d, `blocked ${body.kind} to ${body.placeId}: no owner yes covers it`);
  ask(d, approval(COVERS[body.kind][0], body.placeId));
  return false;
}

/** Statuses whose `due` is a live timer. */
const TIMED: ReadonlySet<Candidate['status']> = new Set(['lookup', 'calling', 'retry', 'texted']);

/** The soonest timer: a place's due, or the follow-up a day after a scheduled slot. */
export function wakeAt(e: Errand): string | null {
  if (CLOSED_STATES.has(e.state)) return null;
  const times = e.candidates.flatMap((c) =>
    c.due && TIMED.has(c.status) ? [Date.parse(c.due)] : []
  );
  const when = e.state === 'scheduled' && e.outcome?.when ? Date.parse(e.outcome.when) : NaN;
  if (!Number.isNaN(when)) times.push(when + DAY_MS);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

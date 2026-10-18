/**
 * Version 1 of the errand rules: the slice-1 appointment flow (errands design,
 * section 3). Find places, ask the owner, call, verify, put it on the
 * calendar, follow up.
 *
 * - `booked` needs a confirmation or a read-back; anything less is an offer
 *   that goes back to the owner.
 * - Voicemail or no answer: try again 2 hours on, inside business hours, at
 *   most twice, then the next place, then fail with the reason.
 * - Every outward effect needs the owner's yes to that exact action
 *   (`approvals`); without it the effect is dropped and the owner is asked.
 * - One place at a time, unless the policy allows parallel AND the errand is
 *   urgency 'any-slot'; then up to 3, and the first booking cancels the rest.
 * - A mobile line is offered a text, not an AI-voice call; an unchecked line
 *   is looked up first. A place that wants a card goes back to the owner.
 *
 * Pure: no clock, no storage. The caller passes `now`.
 *
 * @module services/errands/step-v1
 */

import {
  isClosed,
  type Candidate,
  type Effect,
  type EffectBody,
  type Errand,
  type ErrandEvent,
  type ErrandState,
  type Outcome,
  type Signal,
} from './errand.js';
import { parallelAllowed, withinHours, type ErrandPolicy, type ErrandPrefs } from './policy.js';
import { RETRY_POLICY } from './retry-policy.js';

const HOUR_MS = 3_600_000;

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

interface Draft {
  e: Errand;
  readonly effects: Effect[];
  readonly events: ErrandEvent[];
  readonly at: string;
  readonly ctx: StepContext;
}

const cand = (e: Errand, placeId: string): Candidate | undefined =>
  e.candidates.find((c) => c.placeId === placeId);
const inFlight = (e: Errand): boolean => e.candidates.some((c) => c.status === 'calling');

const set = (d: Draft, patch: Partial<Errand>): void => void (d.e = { ...d.e, ...patch });
const note = (d: Draft, text: string): void =>
  void d.events.push({ type: 'decision', at: d.at, note: text });
function setCandidate(d: Draft, placeId: string, patch: Partial<Candidate>): void {
  set(d, {
    candidates: d.e.candidates.map((c) => (c.placeId === placeId ? { ...c, ...patch } : c)),
  });
}

function emit(d: Draft, body: EffectBody, step: string, attempt = 1): void {
  d.effects.push({
    ...body,
    idemKey: `${d.e.id}:${step}:${attempt}`,
    retry: RETRY_POLICY[body.kind],
  });
}

function ask(
  d: Draft,
  action: string,
  reason?: string,
  state: ErrandState = 'awaiting_owner'
): void {
  set(d, { state, pending: action, step: `confirm:${action}`, nextWakeAt: null });
  emit(d, { kind: 'ask_owner', action, ...(reason ? { reason } : {}) }, `ask:${action}`);
}

/** Emits an outward effect only when the owner said yes to its action; otherwise asks. */
function outward(
  d: Draft,
  body: Extract<EffectBody, { approval: string }>,
  step: string,
  attempt = 1
): boolean {
  if (d.e.approvals.includes(body.approval)) {
    emit(d, body, step, attempt);
    return true;
  }
  note(d, `blocked ${body.kind} to ${body.placeId}: no owner yes for ${body.approval}`);
  ask(d, body.approval);
  return false;
}

function dial(d: Draft, placeId: string, purpose: 'ask' | 'accept', approval: string): void {
  const c = cand(d.e, placeId);
  if (!c) return;
  const attempts = c.attempts + 1;
  if (!outward(d, { kind: 'call', placeId, purpose, approval }, `call:${placeId}`, attempts))
    return;
  setCandidate(d, placeId, { status: 'calling', attempts, approval });
  set(d, { state: 'acting', step: `call:${placeId}`, nextWakeAt: null });
}

function fail(d: Draft, reason: string): void {
  set(d, {
    state: 'failed',
    failedReason: reason,
    pending: null,
    nextWakeAt: null,
    step: 'failed',
  });
  emit(d, { kind: 'notify_owner', about: 'failed', reason }, 'notify:failed');
}

const needsLookup = (c: Candidate): boolean =>
  c.lineType === undefined || (c.lineType === 'unknown' && !c.lineChecked);

/** The next thing to do with the places not tried yet. */
function plan(d: Draft): void {
  const fresh = d.e.candidates.filter((c) => c.status === 'new');
  if (!fresh.length) return fail(d, 'no place could book it');
  const head = fresh.slice(0, parallelAllowed(d.e, d.ctx.policy) ? d.ctx.policy.maxParallel : 1);
  const unknown = head.filter(needsLookup);
  if (unknown.length) {
    set(d, { state: 'planning', step: 'lookup', pending: null, nextWakeAt: null });
    for (const c of unknown)
      emit(d, { kind: 'lookup_line_type', placeId: c.placeId }, `lookup:${c.placeId}`);
    return;
  }
  const callable = head.filter((c) => c.lineType === 'landline' || c.lineType === 'voip');
  if (callable.length) return ask(d, `call:${callable.map((c) => c.placeId).join('+')}`);
  const { placeId } = head[0];
  const action = `text:${placeId}`;
  set(d, { state: 'awaiting_owner', pending: action, step: `confirm:${action}`, nextWakeAt: null });
  emit(d, { kind: 'offer_text_instead', action, placeId }, `ask:${action}`);
}

/** After a place is done with: wait on an open question or calls in flight, else plan. */
function settle(d: Draft): void {
  if (d.e.pending) return;
  if (inFlight(d.e)) return set(d, { state: 'acting' });
  plan(d);
}

function splitAction(action: string): [string, string[]] {
  const i = action.indexOf(':');
  return [action.slice(0, i), action.slice(i + 1).split('+')];
}

function onConfirmed(d: Draft, action: string): string | void {
  if (d.e.pending !== action) return `no pending action ${action}`;
  d.events.push({ type: 'owner_confirmed', at: d.at, action });
  set(d, { approvals: [...d.e.approvals, action], pending: null });
  const [verb, ids] = splitAction(action);
  const [placeId] = ids;
  if (verb === 'call' || verb === 'book') {
    for (const id of ids) dial(d, id, verb === 'call' ? 'ask' : 'accept', action);
  } else if (verb === 'text') {
    outward(d, { kind: 'text', placeId, approval: action }, `text:${placeId}`);
    setCandidate(d, placeId, { status: 'texted', approval: action });
    const wake = new Date(d.ctx.now.getTime() + d.ctx.policy.textReplyWaitMs).toISOString();
    set(d, { state: 'waiting', step: `text:${placeId}`, nextWakeAt: wake });
  } else if (verb === 'schedule') {
    const when = d.e.outcome?.when;
    if (when && !Number.isNaN(Date.parse(when))) {
      outward(d, { kind: 'calendar', placeId, at: when, approval: action }, `calendar:${placeId}`);
      const remindAt = Date.parse(when) - 24 * HOUR_MS;
      if (remindAt > d.ctx.now.getTime()) {
        const at = new Date(remindAt).toISOString();
        outward(d, { kind: 'reminder', placeId, at, approval: action }, `reminder:${placeId}`);
      }
    }
    set(d, { step: 'scheduled' });
  } else if (verb === 'next') {
    setCandidate(d, placeId, { status: 'declined' });
    settle(d);
  }
}

function onDeclined(d: Draft, action: string): string | void {
  if (d.e.pending !== action) return `no pending action ${action}`;
  d.events.push({ type: 'owner_declined', at: d.at, action });
  set(d, { pending: null });
  const [verb, ids] = splitAction(action);
  if (verb === 'schedule') return set(d, { step: 'scheduled' });
  if (verb === 'next') {
    note(d, 'the owner books it himself');
    return set(d, { state: 'cancelled', step: 'cancelled', nextWakeAt: null });
  }
  for (const id of ids) setCandidate(d, id, { status: 'declined' });
  settle(d);
}

function booked(d: Draft, c: Candidate, outcome: Outcome): void {
  for (const o of d.e.candidates) {
    if (o.placeId === c.placeId || (o.status !== 'calling' && o.status !== 'offered')) continue;
    setCandidate(d, o.placeId, { status: 'cancelled' });
    const approval = o.approval ?? `call:${o.placeId}`;
    outward(d, { kind: 'cancel_call', placeId: o.placeId, approval }, `cancel:${o.placeId}`);
  }
  setCandidate(d, c.placeId, { status: 'booked' });
  set(d, { outcome });
  ask(d, `schedule:${c.placeId}`, undefined, 'scheduled');
  const when = outcome.when ? Date.parse(outcome.when) : NaN;
  if (!Number.isNaN(when)) set(d, { nextWakeAt: new Date(when + 24 * HOUR_MS).toISOString() });
}

type CallOutcome = Extract<Signal, { type: 'call_outcome' }>;

/** What the call settled, minus its status; a blank confirmation counts as none. */
function agreed(s: CallOutcome): Omit<Outcome, 'status'> {
  return {
    placeId: s.placeId,
    ...(s.when ? { when: s.when } : {}),
    ...(s.confirmation?.trim() ? { confirmation: s.confirmation.trim() } : {}),
    ...(s.contactName ? { contactName: s.contactName } : {}),
    ...(s.readBack !== undefined ? { readBack: s.readBack } : {}),
    ...(s.callId ? { evidence: s.callId } : {}),
  };
}

function onOutcome(d: Draft, s: CallOutcome): string | void {
  const c = cand(d.e, s.placeId);
  if (!c || c.status !== 'calling') return `no call in flight to ${s.placeId}`;
  const base = agreed(s);
  if (s.requiresPayment) {
    const reason = 'the place wants a card or a deposit';
    setCandidate(d, s.placeId, { status: 'needs_owner' });
    set(d, { outcome: { ...base, status: 'needs_owner', reason } });
    if (inFlight(d.e))
      return emit(d, { kind: 'notify_owner', about: 'needs_owner', reason }, `notify:${s.placeId}`);
    return ask(d, `next:${s.placeId}`, reason);
  }
  if (s.status === 'booked' && (base.confirmation || s.readBack === true)) {
    return booked(d, c, { ...base, status: 'booked' });
  }
  if (s.status === 'booked' || s.status === 'offered') {
    if (s.status === 'booked')
      note(d, 'booked without a confirmation or read-back: treated as offered');
    setCandidate(d, s.placeId, { status: 'offered' });
    set(d, { outcome: { ...base, status: 'offered' } });
    return ask(d, `book:${s.placeId}`);
  }
  set(d, { outcome: { ...base, status: s.status } });
  if (s.status === 'declined') {
    setCandidate(d, s.placeId, { status: 'declined' });
    return settle(d);
  }
  if (parallelAllowed(d.e, d.ctx.policy) || c.attempts > d.ctx.policy.maxRetries) {
    setCandidate(d, s.placeId, { status: 'exhausted' });
    return settle(d);
  }
  setCandidate(d, s.placeId, { status: 'retry' });
  const later = new Date(d.ctx.now.getTime() + d.ctx.policy.retryAfterMs);
  const wake = withinHours(later, c.hours, d.e.zone).toISOString();
  set(d, { state: 'waiting', step: `retry:${s.placeId}`, nextWakeAt: wake });
}

function passed(d: Draft): string | void {
  if (d.e.state !== 'scheduled') return `not scheduled (${d.e.state})`;
  set(d, { state: 'done', step: 'follow_up', pending: null, nextWakeAt: null });
  emit(d, { kind: 'notify_owner', about: 'follow_up' }, 'notify:follow_up');
}

function onWake(d: Draft): string | void {
  if (!d.e.nextWakeAt || Date.parse(d.e.nextWakeAt) > d.ctx.now.getTime()) return 'not due yet';
  if (d.e.state === 'scheduled') return passed(d);
  if (d.e.state !== 'waiting') return `nothing to wake in ${d.e.state}`;
  const retry = d.e.candidates.find((c) => c.status === 'retry');
  if (retry) {
    const purpose = retry.approval?.startsWith('book:') ? 'accept' : 'ask';
    return dial(d, retry.placeId, purpose, retry.approval ?? `call:${retry.placeId}`);
  }
  const texted = d.e.candidates.find((c) => c.status === 'texted');
  if (!texted) return 'nothing waiting';
  note(d, `no reply to the text to ${texted.placeId}`);
  setCandidate(d, texted.placeId, { status: 'exhausted' });
  plan(d);
}

function route(d: Draft, s: Signal): string | void {
  switch (s.type) {
    case 'owner_cancelled':
      set(d, { state: 'cancelled', step: 'cancelled', pending: null, nextWakeAt: null });
      return emit(d, { kind: 'notify_owner', about: 'cancelled' }, 'notify:cancelled');
    case 'candidates_found': {
      if (d.e.state !== 'planning') return `not planning (${d.e.state})`;
      const known = new Set(d.e.candidates.map((c) => c.placeId));
      const added = s.candidates
        .filter((c) => !known.has(c.placeId))
        .map((c): Candidate => ({ ...c, status: 'new', attempts: 0 }));
      set(d, { candidates: [...d.e.candidates, ...added] });
      return plan(d);
    }
    case 'line_type_found':
      if (d.e.state !== 'planning' || !cand(d.e, s.placeId)) return `no lookup for ${s.placeId}`;
      setCandidate(d, s.placeId, { lineType: s.lineType, lineChecked: true });
      return plan(d);
    case 'owner_confirmed':
      return onConfirmed(d, s.action);
    case 'owner_declined':
      return onDeclined(d, s.action);
    case 'call_outcome':
      return onOutcome(d, s);
    case 'wake':
      return onWake(d);
    case 'event_passed':
      return passed(d);
  }
}

export function stepV1(e: Errand, signal: Signal, ctx: StepContext): StepResult {
  const at = ctx.now.toISOString();
  const heard: ErrandEvent = { type: 'signal', at, signal: signal.type };
  const d: Draft = { e, effects: [], events: [heard], at, ctx };
  const why = isClosed(e) ? `errand is ${e.state}` : route(d, signal);
  if (typeof why === 'string') {
    return {
      next: e,
      effects: [],
      events: [heard, { type: 'decision', at, note: `ignored: ${why}` }],
    };
  }
  let next: Errand = { ...d.e, updatedAt: at };
  if (isClosed(next)) next = { ...next, closedAt: at };
  if (e.state !== next.state || e.step !== next.step) {
    d.events.push({ type: 'transition', at, from: e.state, to: next.state, step: next.step });
  }
  for (const f of d.effects)
    d.events.push({ type: 'effect', at, kind: f.kind, idemKey: f.idemKey });
  return { next, effects: d.effects, events: d.events };
}

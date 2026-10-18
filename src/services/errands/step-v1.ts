/**
 * Version 1 of the errand rules: the slice-1 appointment flow (errands design,
 * section 3). booked needs proof; voicemail retries twice inside business
 * hours; every outward effect needs the owner's yes to exactly that action;
 * parallel calls only for any-slot errands; mobile lines get a text offer; no
 * money. Pure: no clock, no storage. The caller passes `now`.
 *
 * @module services/errands/step-v1
 */

import {
  describeApproval,
  isClosed,
  isSafePlaceId,
  sameApproval,
  type Approval,
  type ApprovalVerb,
  type Candidate,
  type Effect,
  type EffectBody,
  type Errand,
  type ErrandEvent,
  type ErrandState,
  type NewCandidate,
  type Outcome,
  type OutwardKind,
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

const approval = (verb: ApprovalVerb, ...placeIds: string[]): Approval => ({ verb, placeIds });

/** Which owner yeses can cover each outward kind: a cancel rides on the yes to the call. */
const COVERS: Readonly<Record<OutwardKind, readonly ApprovalVerb[]>> = {
  call: ['call', 'book'],
  text: ['text'],
  cancel_call: ['call', 'book'],
  calendar: ['schedule'],
  reminder: ['schedule'],
};

const cand = (e: Errand, placeId: string): Candidate | undefined =>
  e.candidates.find((c) => c.placeId === placeId);
const inFlight = (e: Errand): boolean => e.candidates.some((c) => c.status === 'calling');

const set = (d: Draft, patch: Partial<Errand>): void => void (d.e = { ...d.e, ...patch });
const note = (d: Draft, text: string): void =>
  void d.events.push({ type: 'decision', at: d.at, note: text });
function setCandidate(d: Draft, placeId: string, patch: Partial<Candidate>): void {
  const candidates = d.e.candidates.map((c) => (c.placeId === placeId ? { ...c, ...patch } : c));
  set(d, { candidates });
}

function emit(d: Draft, body: EffectBody, step: string, attempt = 1): void {
  const idemKey = `${d.e.id}:${step}:${attempt}`;
  d.effects.push({ ...body, idemKey, retry: RETRY_POLICY[body.kind] });
}

/** Moves to `state`, clearing the open question and the timer. */
const move = (d: Draft, state: ErrandState, step: string): void =>
  set(d, { state, step, pending: null, nextWakeAt: null });

function ask(
  d: Draft,
  action: Approval,
  reason?: string,
  state: ErrandState = 'awaiting_owner'
): void {
  const said = describeApproval(action);
  set(d, { state, pending: action, step: `confirm:${said}`, nextWakeAt: null });
  emit(d, { kind: 'ask_owner', action, ...(reason ? { reason } : {}) }, `ask:${said}`);
}

/**
 * Emits an outward effect only when the owner said yes to exactly this
 * approval, it names this place, and its verb covers this kind; otherwise the
 * effect is dropped and the owner is asked about this one place.
 */
type Outward = Extract<EffectBody, { approval: Approval }>;
function outward(d: Draft, body: Outward, step: string, attempt = 1): boolean {
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

function dial(d: Draft, placeId: string, purpose: 'ask' | 'accept', yes: Approval): void {
  const c = cand(d.e, placeId);
  if (!c) return;
  const attempts = c.attempts + 1;
  const body = { kind: 'call', placeId, purpose, approval: yes } as const;
  if (!outward(d, body, `call:${placeId}`, attempts)) return;
  setCandidate(d, placeId, { status: 'calling', attempts, approval: yes });
  set(d, { state: 'acting', step: `call:${placeId}`, nextWakeAt: null });
}

function fail(d: Draft, reason: string): void {
  move(d, 'failed', 'failed');
  set(d, { failedReason: reason });
  emit(d, { kind: 'notify_owner', about: 'failed', reason }, 'notify:failed');
}

/** Line type is trusted only from a lookup. */
const needsLookup = (c: Candidate): boolean => c.lineChecked !== true;
const callable = (c: Candidate): boolean =>
  c.lineChecked === true && (c.lineType === 'landline' || c.lineType === 'voip');

/** The next thing to do with the places not tried yet. */
function plan(d: Draft): void {
  const fresh = d.e.candidates.filter((c) => c.status === 'new');
  if (!fresh.length) {
    const card = d.e.candidates.some((c) => c.status === 'needs_owner');
    return fail(d, card ? 'only a place that wants a card or a deposit' : 'no place could book it');
  }
  const head = fresh.slice(0, parallelAllowed(d.e, d.ctx.policy) ? d.ctx.policy.maxParallel : 1);
  const unknown = head.filter(needsLookup);
  if (unknown.length) {
    move(d, 'planning', 'lookup');
    for (const c of unknown)
      emit(d, { kind: 'lookup_line_type', placeId: c.placeId }, `lookup:${c.placeId}`);
    return;
  }
  const lines = head.filter(callable);
  if (lines.length) return ask(d, approval('call', ...lines.map((c) => c.placeId)));
  const { placeId } = head[0];
  const action = approval('text', placeId);
  const said = describeApproval(action);
  set(d, { state: 'awaiting_owner', pending: action, step: `confirm:${said}`, nextWakeAt: null });
  emit(d, { kind: 'offer_text_instead', action, placeId }, `ask:${said}`);
}

/** After a place is done with: wait on an open question or calls in flight, else plan. */
function settle(d: Draft): void {
  if (d.e.pending) return;
  if (inFlight(d.e)) return set(d, { state: 'acting' });
  plan(d);
}

type Answer = 'owner_confirmed' | 'owner_declined';
/** The open question, if `answer` is to it, logged and cleared. An answer only settles what was asked. */
function answered(d: Draft, answer: Approval, type: Answer): Approval | string {
  const action = d.e.pending && sameApproval(d.e.pending, answer) ? d.e.pending : null;
  if (!action) return `no pending action ${describeApproval(answer)}`;
  d.events.push({ type, at: d.at, action });
  set(d, { pending: null });
  return action;
}

/** Stops every live, offered or retrying call (but `keep`), each under the yes that covered it. */
function cancelActive(d: Draft, keep?: string): void {
  for (const o of d.e.candidates) {
    if (o.placeId === keep || !['calling', 'offered', 'retry'].includes(o.status)) continue;
    const { placeId, approval: yes } = o;
    setCandidate(d, placeId, { status: 'cancelled' });
    if (yes) outward(d, { kind: 'cancel_call', placeId, approval: yes }, `cancel:${placeId}`);
    else note(d, `no call to cancel at ${placeId}`);
  }
}

function onConfirmed(d: Draft, answer: Approval): string | void {
  const action = answered(d, answer, 'owner_confirmed');
  if (typeof action === 'string') return action;
  set(d, { approvals: [...d.e.approvals, action] });
  const { verb, placeIds: ids } = action;
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

function onDeclined(d: Draft, answer: Approval): string | void {
  const action = answered(d, answer, 'owner_declined');
  if (typeof action === 'string') return action;
  if (action.verb === 'schedule') return set(d, { step: 'scheduled' });
  if (action.verb === 'next') {
    note(d, 'the owner books it himself');
    cancelActive(d);
    return move(d, 'cancelled', 'cancelled');
  }
  for (const id of action.placeIds) setCandidate(d, id, { status: 'declined' });
  settle(d);
}

function booked(d: Draft, c: Candidate, outcome: Outcome): void {
  cancelActive(d, c.placeId);
  setCandidate(d, c.placeId, { status: 'booked' });
  set(d, { outcome });
  ask(d, approval('schedule', c.placeId), undefined, 'scheduled');
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
    if (inFlight(d.e) || d.e.pending)
      return emit(d, { kind: 'notify_owner', about: 'needs_owner', reason }, `notify:${s.placeId}`);
    return ask(d, approval('next', s.placeId), reason);
  }
  const proven = Boolean(base.confirmation) || s.readBack === true;
  if (s.status === 'booked' && proven) return booked(d, c, { ...base, status: 'booked' });
  if (s.status === 'booked' || s.status === 'offered') {
    if (s.status === 'booked')
      note(d, 'booked without a confirmation or read-back: treated as offered');
    setCandidate(d, s.placeId, { status: 'offered' });
    set(d, { outcome: { ...base, status: 'offered' } });
    return ask(d, approval('book', s.placeId));
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
  move(d, 'done', 'follow_up');
  emit(d, { kind: 'notify_owner', about: 'follow_up' }, 'notify:follow_up');
}

function onWake(d: Draft): string | void {
  if (!d.e.nextWakeAt || Date.parse(d.e.nextWakeAt) > d.ctx.now.getTime()) return 'not due yet';
  if (d.e.state === 'scheduled') return passed(d);
  if (d.e.state !== 'waiting') return `nothing to wake in ${d.e.state}`;
  const retry = d.e.candidates.find((c) => c.status === 'retry');
  if (retry) {
    const purpose = retry.approval?.verb === 'book' ? 'accept' : 'ask';
    return dial(d, retry.placeId, purpose, retry.approval ?? approval('call', retry.placeId));
  }
  const texted = d.e.candidates.find((c) => c.status === 'texted');
  if (!texted) return 'nothing waiting';
  note(d, `no reply to the text to ${texted.placeId}`);
  setCandidate(d, texted.placeId, { status: 'exhausted' });
  plan(d);
}

/** New places from a search. Unsafe place ids are dropped, and so is any line type the search claims. */
function shortlist(d: Draft, found: readonly NewCandidate[]): Candidate[] {
  const known = new Set(d.e.candidates.map((c) => c.placeId));
  const added: Candidate[] = [];
  for (const { placeId, name, phone, why, hours } of found) {
    if (!isSafePlaceId(placeId)) {
      note(d, 'dropped a candidate whose place id is not safe');
      continue;
    }
    if (known.has(placeId)) continue;
    known.add(placeId);
    const fresh = { placeId, name, phone, why, ...(hours ? { hours } : {}) };
    added.push({ ...fresh, status: 'new', attempts: 0, lineChecked: false });
  }
  return added;
}

function route(d: Draft, s: Signal): string | void {
  switch (s.type) {
    case 'owner_cancelled':
      cancelActive(d);
      move(d, 'cancelled', 'cancelled');
      return emit(d, { kind: 'notify_owner', about: 'cancelled' }, 'notify:cancelled');
    case 'candidates_found': {
      if (d.e.state !== 'planning') return `not planning (${d.e.state})`;
      set(d, { candidates: [...d.e.candidates, ...shortlist(d, s.candidates)] });
      return plan(d);
    }
    case 'line_type_found':
      if (!cand(d.e, s.placeId)) return `no candidate ${s.placeId}`;
      setCandidate(d, s.placeId, { lineType: s.lineType, lineChecked: true });
      return d.e.state === 'planning' ? plan(d) : undefined;
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
  const ignored: ErrandEvent = { type: 'decision', at, note: `ignored: ${why}` };
  if (typeof why === 'string') return { next: e, effects: [], events: [heard, ignored] };
  let next: Errand = { ...d.e, updatedAt: at };
  if (isClosed(next)) next = { ...next, closedAt: at };
  if (e.state !== next.state || e.step !== next.step) {
    d.events.push({ type: 'transition', at, from: e.state, to: next.state, step: next.step });
  }
  for (const f of d.effects)
    d.events.push({ type: 'effect', at, kind: f.kind, idemKey: f.idemKey });
  return { next, effects: d.effects, events: d.events };
}

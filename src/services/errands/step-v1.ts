/**
 * Version 1 of the errand rules: the slice-1 appointment flow (errands design,
 * section 3). Frozen once an errand runs on it, and so is every shared helper
 * it calls (draft.ts, candidates.ts, policy.ts). Pure: the caller passes `now`.
 *
 * @module services/errands/step-v1
 */

import {
  describeApproval,
  isClosed,
  type Approval,
  type Candidate,
  type Errand,
  type ErrandEvent,
  type ErrandState,
  type Outcome,
  type Question,
  type Signal,
} from './errand.js';
import {
  answered,
  approval,
  ask,
  cand,
  close,
  emit,
  inMs,
  note,
  outward,
  set,
  setCandidate,
  wakeAt,
  withdraw,
  type Draft,
  type StepContext,
  type StepResult,
} from './draft.js';
import { agreed, callable, dialsTo, shortlist } from './candidates.js';
import { DAY_MS, inWindow, nextDialAt, parallelAllowed, textWaitMs } from './policy.js';

const MOBILE = "their number looks like a mobile, so I'll text instead of calling";
const UNSURE = "I couldn't tell what kind of line it is, so I'll text instead of calling";
const CARD = 'the place wants a card or a deposit';
/** Statuses that are still in motion: nothing new is planned while one exists. */
const ACTIVE: ReadonlySet<Candidate['status']> = new Set(['lookup', 'calling', 'retry', 'texted']);

const textReason = (c: Candidate): string => (c.lineType === 'mobile' ? MOBILE : UNSURE);

function fail(d: Draft, reason: string): void {
  close(d, 'failed', 'failed');
  set(d, { failedReason: reason });
  emit(d, { kind: 'notify_owner', about: 'failed', reason }, 'notify:failed');
}

/** Calls now if the line is callable, the place open and the number under its cap; else waits or asks. */
function dial(d: Draft, placeId: string, yes: Approval): void {
  const c = cand(d.e, placeId);
  if (!c) return;
  if (!callable(c)) {
    setCandidate(d, placeId, { status: 'new' });
    return ask(d, approval('text', placeId), textReason(c));
  }
  const { maxDialsPerDay: cap } = d.ctx.policy;
  const at = nextDialAt(d.ctx.now, dialsTo(d.e, c.phone), cap, c.hours, d.e.zone);
  if (at.getTime() > d.ctx.now.getTime()) {
    note(d, `${placeId} is closed or was called twice today: waits`);
    return setCandidate(d, placeId, { status: 'retry', approval: yes, due: at.toISOString() });
  }
  const attempts = c.attempts + 1;
  const purpose = yes.verb === 'book' ? 'accept' : 'ask';
  if (!outward(d, { kind: 'call', placeId, purpose, approval: yes }, `call:${placeId}`, attempts)) {
    return setCandidate(d, placeId, { status: 'new' });
  }
  const callKey = `${d.e.id}:call:${placeId}:${attempts}`;
  const dials = [...(c.dials ?? []), d.at];
  const due = inMs(d, d.ctx.policy.callDeadlineMs);
  setCandidate(d, placeId, { status: 'calling', attempts, approval: yes, callKey, dials, due });
}

/** The next thing to do with the places not tried yet. */
function plan(d: Draft): void {
  const fresh = d.e.candidates.filter((c) => c.status === 'new');
  if (!fresh.length) {
    const card = d.e.candidates.some((c) => c.status === 'needs_owner');
    return fail(d, card ? 'only a place that wants a card or a deposit' : 'no place could book it');
  }
  const head = fresh.slice(0, parallelAllowed(d.e, d.ctx.policy) ? d.ctx.policy.maxParallel : 1);
  const unchecked = head.filter((c) => c.lineChecked !== true);
  if (unchecked.length) {
    set(d, { step: 'lookup' });
    for (const { placeId } of unchecked) {
      setCandidate(d, placeId, { status: 'lookup', due: inMs(d, d.ctx.policy.lookupDeadlineMs) });
      emit(d, { kind: 'lookup_line_type', placeId }, `lookup:${placeId}`);
    }
    return;
  }
  const lines = head.filter(callable);
  if (lines.length) return ask(d, approval('call', ...lines.map((c) => c.placeId)));
  ask(d, approval('text', head[0].placeId), textReason(head[0]));
}

const MOOT: ReadonlySet<string> = new Set(['call', 'book', 'text', 'next']);
const steers = (q: Question | null): boolean => q !== null && MOOT.has(q.action.verb);

/** After a place is done with: wait on a question about places or anything in motion, else plan. */
function settle(d: Draft): void {
  if (isClosed(d.e) || d.e.state === 'scheduled') return;
  if (steers(d.e.pending) || d.e.queue.some(steers)) return;
  if (d.e.candidates.some((c) => ACTIVE.has(c.status))) return;
  plan(d);
}

/** Hangs up every live call (but `keep`), each by its own call key; nothing else is live. */
function hangUp(d: Draft, keep?: string): void {
  for (const c of d.e.candidates) {
    if (c.placeId === keep || !['calling', 'offered', 'retry'].includes(c.status)) continue;
    setCandidate(d, c.placeId, { status: 'cancelled' });
    if (c.status !== 'calling') continue;
    const { placeId, callKey: call, approval: yes } = c;
    if (!yes || !call) note(d, `no live call handle for ${placeId}`);
    else outward(d, { kind: 'cancel_call', placeId, call, approval: yes }, `cancel:${placeId}`);
  }
}

/** Closes as needs_owner, handing the owner the place, its phone and the slot. */
function handOver(d: Draft, placeId: string, reason: string): void {
  const c = cand(d.e, placeId);
  const prior = d.e.outcome?.placeId === placeId ? d.e.outcome : undefined;
  hangUp(d);
  close(d, 'done', 'handed_over');
  set(d, { outcome: { ...(prior ?? { placeId }), status: 'needs_owner', reason } });
  const slot = prior?.when ? { when: prior.when } : {};
  const notice = { kind: 'notify_owner', about: 'needs_owner', reason, placeId, ...slot } as const;
  emit(d, { ...notice, ...(c ? { phone: c.phone } : {}) }, `notify:needs_owner:${placeId}`);
}

function onConfirmed(d: Draft, questionId: string): string | void {
  const q = answered(d, questionId, 'owner_confirmed');
  if (typeof q === 'string') return q;
  const { action } = q;
  set(d, { approvals: [...d.e.approvals, action], step: describeApproval(action) });
  const [placeId] = action.placeIds;
  if (action.verb === 'call' || action.verb === 'book') {
    for (const id of action.placeIds) dial(d, id, action);
  } else if (action.verb === 'text') {
    if (!outward(d, { kind: 'text', placeId, approval: action }, `text:${placeId}`)) return;
    const due = inMs(d, textWaitMs(d.e, d.ctx.policy));
    setCandidate(d, placeId, { status: 'texted', approval: action, due });
  } else if (action.verb === 'schedule') {
    const when = d.e.outcome?.when ?? '';
    outward(d, { kind: 'calendar', placeId, at: when, approval: action }, `calendar:${placeId}`);
    const remindAt = Date.parse(when) - DAY_MS;
    if (remindAt > d.ctx.now.getTime()) {
      const at = new Date(remindAt).toISOString();
      outward(d, { kind: 'reminder', placeId, at, approval: action }, `reminder:${placeId}`);
    }
  } else if (action.verb === 'release') {
    outward(d, { kind: 'release_hold', placeId, approval: action }, `release:${placeId}`);
  } else {
    setCandidate(d, placeId, { status: 'declined' });
    settle(d);
  }
}

function onDeclined(d: Draft, questionId: string): string | void {
  const q = answered(d, questionId, 'owner_declined');
  if (typeof q === 'string') return q;
  const { verb, placeIds } = q.action;
  if (verb === 'schedule' || verb === 'release') return note(d, `owner said no to ${verb}`);
  if (verb === 'next') return handOver(d, placeIds[0], q.reason ?? 'the owner takes it from here');
  for (const id of placeIds) setCandidate(d, id, { status: 'declined' });
  settle(d);
}

function booked(d: Draft, c: Candidate, outcome: Outcome): void {
  hangUp(d, c.placeId);
  withdraw(d, (q) => MOOT.has(q.action.verb));
  setCandidate(d, c.placeId, { status: 'booked' });
  set(d, { outcome, state: 'scheduled', step: 'scheduled' });
  ask(d, approval('schedule', c.placeId), undefined, 'scheduled');
}

/** A real booking from a place we had stopped: tell the owner, and ask whether to release it. */
function lateBooking(d: Draft, c: Candidate, o: Omit<Outcome, 'status'>): void {
  note(d, `late booking from ${c.placeId}`);
  const slot = {
    ...(o.when ? { when: o.when } : {}),
    ...(o.confirmation ? { confirmation: o.confirmation } : {}),
  };
  const { placeId, phone } = c;
  const notice = { kind: 'notify_owner', about: 'late_booking', placeId, phone } as const;
  emit(d, { ...notice, ...slot }, `notify:late_booking:${placeId}`);
  ask(d, approval('release', c.placeId), `${c.name} booked anyway: release it?`);
}

/** A call that ended without a booking: next place, or try again inside the caps. */
function noBooking(d: Draft, c: Candidate, status: 'declined' | 'no_answer' | 'voicemail'): void {
  const spent = parallelAllowed(d.e, d.ctx.policy) || c.attempts > d.ctx.policy.maxRetries;
  if (status === 'declined' || spent) {
    setCandidate(d, c.placeId, { status: status === 'declined' ? 'declined' : 'exhausted' });
    return settle(d);
  }
  const { retryAfterMs, maxDialsPerDay } = d.ctx.policy;
  const later = new Date(d.ctx.now.getTime() + retryAfterMs);
  const at = nextDialAt(later, dialsTo(d.e, c.phone), maxDialsPerDay, c.hours, d.e.zone);
  setCandidate(d, c.placeId, { status: 'retry', due: at.toISOString() });
  set(d, { step: `retry:${c.placeId}` });
}

type CallOutcome = Extract<Signal, { type: 'call_outcome' }>;

function onOutcome(d: Draft, s: CallOutcome): string | void {
  const c = cand(d.e, s.placeId);
  if (!c) return `no candidate ${s.placeId}`;
  const base = agreed(s);
  const proven = Boolean(base.confirmation) || s.readBack === true;
  const real = s.status === 'booked' && proven && inWindow(s.when, d.e.constraints.window);
  if (c.status !== 'calling') {
    if (real && !s.requiresPayment && c.status !== 'booked') return lateBooking(d, c, base);
    return `no call in flight to ${s.placeId}`;
  }
  if (s.requiresPayment) {
    setCandidate(d, s.placeId, { status: 'needs_owner' });
    set(d, { outcome: { ...base, status: 'needs_owner', reason: CARD } });
    return ask(d, approval('next', s.placeId), CARD);
  }
  if (real) return booked(d, c, { ...base, status: 'booked' });
  if (s.status === 'booked' || s.status === 'offered') {
    if (s.status === 'booked') note(d, 'booked without proof or outside the window: an offer');
    setCandidate(d, s.placeId, { status: 'offered' });
    set(d, { outcome: { ...base, status: 'offered' } });
    return ask(d, approval('book', s.placeId));
  }
  set(d, { outcome: { ...base, status: s.status } });
  noBooking(d, c, s.status);
}

function passed(d: Draft): string | void {
  if (d.e.state !== 'scheduled') return `not scheduled (${d.e.state})`;
  close(d, 'done', 'follow_up');
  emit(d, { kind: 'notify_owner', about: 'follow_up' }, 'notify:follow_up');
}

/** Gives up on a place whose call never reported, without dialling it again. */
function noOutcome(d: Draft, c: Candidate, why: string): void {
  const { placeId } = c;
  setCandidate(d, placeId, { status: 'exhausted' });
  note(d, `${placeId}: ${why}`);
  const notice = { kind: 'notify_owner', about: 'no_outcome', placeId, reason: why } as const;
  emit(d, notice, `notify:no_outcome:${placeId}`);
}

function onWake(d: Draft): string | void {
  const now = d.ctx.now.getTime();
  const slot = d.e.outcome?.when ? Date.parse(d.e.outcome.when) : NaN;
  if (d.e.state === 'scheduled') return slot + DAY_MS <= now ? passed(d) : 'not due yet';
  const due = d.e.candidates.filter((c) => ACTIVE.has(c.status) && Date.parse(c.due ?? '') <= now);
  if (!due.length) return 'not due yet';
  for (const c of due) {
    if (c.status === 'lookup') {
      setCandidate(d, c.placeId, { status: 'new', lineChecked: true, lineType: 'unknown' });
      note(d, `no line type for ${c.placeId} by the deadline`);
    } else if (c.status === 'retry') dial(d, c.placeId, c.approval ?? approval('call', c.placeId));
    else if (c.status === 'calling') noOutcome(d, c, 'no outcome by the call deadline');
    else {
      setCandidate(d, c.placeId, { status: 'exhausted' });
      note(d, `no reply to the text to ${c.placeId}`);
    }
  }
  settle(d);
}

/** The runner gave up on an effect for good: let go of what it was for. */
function onEffectFailed(d: Draft, s: Extract<Signal, { type: 'effect_failed' }>): string | void {
  if (!s.idemKey.startsWith(`${d.e.id}:`)) return `not this errand's effect`;
  const [, verb, placeId] = s.idemKey.split(':');
  const c = cand(d.e, placeId ?? '');
  note(d, `effect ${verb} failed: ${s.reason}`);
  if (!c) return;
  if (verb === 'call' && c.status === 'calling' && c.callKey === s.idemKey) {
    setCandidate(d, placeId, { status: 'exhausted' });
  } else if (verb === 'lookup' && c.status === 'lookup') {
    setCandidate(d, placeId, { status: 'new', lineChecked: true, lineType: 'unknown' });
  } else if (verb === 'text' && c.status === 'texted') {
    setCandidate(d, placeId, { status: 'exhausted' });
  }
  settle(d);
}

/** A place answered a text: the owner reads it and says whether to try the next place. */
function onTextReply(d: Draft, placeId: string): string | void {
  const c = cand(d.e, placeId);
  if (c?.status !== 'texted') return `no text waiting on ${placeId}`;
  setCandidate(d, placeId, { status: 'replied' });
  emit(d, { kind: 'notify_owner', about: 'text_reply', placeId }, `notify:reply:${placeId}`);
  ask(d, approval('next', placeId), `${c.name} replied by text`);
}

function route(d: Draft, s: Signal): string | void {
  switch (s.type) {
    case 'owner_cancelled':
      hangUp(d);
      close(d, 'cancelled', 'cancelled');
      return emit(d, { kind: 'notify_owner', about: 'cancelled' }, 'notify:cancelled');
    case 'candidates_found': {
      if (d.e.state !== 'planning') return `not planning (${d.e.state})`;
      const { added, unsafe } = shortlist(d.e.candidates, s.candidates);
      if (unsafe) note(d, `dropped ${unsafe} candidate(s) whose place id is not safe`);
      set(d, { candidates: [...d.e.candidates, ...added] });
      return settle(d);
    }
    case 'line_type_found': {
      if (cand(d.e, s.placeId)?.status !== 'lookup') return `no lookup pending for ${s.placeId}`;
      setCandidate(d, s.placeId, { status: 'new', lineType: s.lineType, lineChecked: true });
      return settle(d);
    }
    case 'text_reply':
      return onTextReply(d, s.placeId);
    case 'owner_confirmed':
      return onConfirmed(d, s.questionId);
    case 'owner_declined':
      return onDeclined(d, s.questionId);
    case 'call_outcome':
      return onOutcome(d, s);
    case 'effect_failed':
      return onEffectFailed(d, s);
    case 'wake':
      return onWake(d);
    case 'event_passed':
      return passed(d);
  }
}

const KNOWN: ReadonlySet<string> = new Set([
  ...['candidates_found', 'line_type_found', 'owner_confirmed', 'owner_declined'],
  ...['owner_cancelled', 'call_outcome', 'effect_failed', 'text_reply', 'wake', 'event_passed'],
]);

/** A closed errand still hears a late booking and the answer to its open question; nothing else. */
function closedGate(e: Errand, s: Signal): string | undefined {
  if (!isClosed(e) || s.type === 'call_outcome') return undefined;
  const answer = s.type === 'owner_confirmed' || s.type === 'owner_declined';
  return answer && e.pending ? undefined : `errand is ${e.state}`;
}

/** An open errand's state follows from what is in motion. */
function derive(e: Errand): ErrandState {
  if (isClosed(e) || e.state === 'scheduled') return e.state;
  if (e.candidates.some((c) => c.status === 'calling')) return 'acting';
  if (e.pending) return 'awaiting_owner';
  if (e.candidates.some((c) => c.status === 'retry' || c.status === 'texted')) return 'waiting';
  return 'planning';
}

export function stepV1(e: Errand, signal: Signal, ctx: StepContext): StepResult {
  if (!KNOWN.has((signal as { type?: unknown }).type as string)) {
    return { next: e, effects: [], events: [] };
  }
  const at = ctx.now.toISOString();
  const heard: ErrandEvent = { type: 'signal', at, signal: signal.type };
  const d: Draft = { e, effects: [], events: [heard], at, ctx };
  const why = closedGate(e, signal) ?? route(d, signal);
  const ignored: ErrandEvent = { type: 'decision', at, note: `ignored: ${why}` };
  if (typeof why === 'string') return { next: e, effects: [], events: [heard, ignored] };
  let next: Errand = { ...d.e, state: derive(d.e), updatedAt: at, revision: e.revision + 1 };
  if (isClosed(next) && !next.closedAt) next = { ...next, closedAt: at };
  next = { ...next, nextWakeAt: wakeAt(next) };
  if (e.state !== next.state || e.step !== next.step) {
    d.events.push({ type: 'transition', at, from: e.state, to: next.state, step: next.step });
  }
  for (const f of d.effects)
    d.events.push({ type: 'effect', at, kind: f.kind, idemKey: f.idemKey });
  return { next, effects: d.effects, events: d.events };
}

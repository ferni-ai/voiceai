/**
 * An errand: something Ferni gets done for its owner out in the world (book a
 * cleaning, find a table), kept as a durable workflow until it is done,
 * cancelled or failed (errands design, 2026-10-18, 2.1). Types only. Nothing
 * here holds call text: an outcome keeps what was agreed and an evidence id.
 *
 * @module services/errands/errand
 */

import type { RetryPolicy } from './retry-policy.js';

export type ErrandKind = 'appointment' | 'reservation' | 'inquiry' | 'purchase-research' | 'custom';
export type ErrandState =
  | 'planning'
  | 'awaiting_owner'
  | 'acting'
  | 'waiting'
  | 'verifying'
  | 'scheduled'
  | 'done'
  | 'cancelled'
  | 'failed';

export const CLOSED_STATES: ReadonlySet<ErrandState> = new Set(['done', 'cancelled', 'failed']);
export const isClosed = (e: Errand): boolean => CLOSED_STATES.has(e.state);

/** What a line-type lookup said. Undefined on a candidate means nobody has looked yet. */
export type LineType = 'landline' | 'mobile' | 'voip' | 'unknown';

export type CandidateStatus =
  | 'new'
  | 'calling'
  | 'retry'
  | 'texted'
  | 'offered'
  | 'booked'
  | 'needs_owner'
  | 'declined'
  | 'exhausted'
  | 'cancelled';

/** Opening hours as "HH:MM" wall times in the errand's zone. */
export interface BusinessHours {
  readonly open: string;
  readonly close: string;
}

/** A place Ferni might call, as the search found it. step() ignores its lineType (lookup only). */
export interface NewCandidate {
  readonly placeId: string;
  readonly name: string;
  readonly phone: string;
  /** Why it made the shortlist (rating, distance, hours), for the read-back. */
  readonly why: string;
  readonly lineType?: LineType;
  readonly hours?: BusinessHours;
}

export interface Candidate extends NewCandidate {
  readonly status: CandidateStatus;
  /** Calls placed to it so far, retries included. */
  readonly attempts: number;
  /** A lookup ran. Line type is trusted only from a lookup, never from the search. */
  readonly lineChecked?: boolean;
  /** The owner-confirmed action that covers calling it (retries and cancels reuse it). */
  readonly approval?: Approval;
}

export interface Constraints {
  /** UTC ISO bounds the booking must fall in. */
  readonly window?: { readonly from?: string; readonly to?: string };
  readonly partySize?: number;
  readonly insurance?: string;
  readonly prefs: readonly string[];
  /** 'any-slot' ("find me any table tonight") is the only case that may call in parallel. */
  readonly urgency?: 'normal' | 'any-slot';
}

export type OutcomeStatus =
  'booked' | 'offered' | 'declined' | 'no_answer' | 'voicemail' | 'needs_owner';

/** What the last call settled. `booked` always has a confirmation or a read-back. */
export interface Outcome {
  readonly status: OutcomeStatus;
  readonly placeId: string;
  /** UTC ISO time of the slot booked or offered. */
  readonly when?: string;
  readonly confirmation?: string;
  readonly contactName?: string;
  readonly readBack?: boolean;
  /** The call id the outcome came from. */
  readonly evidence?: string;
  readonly reason?: string;
}

export interface Errand {
  readonly id: string;
  readonly userId: string;
  readonly kind: ErrandKind;
  readonly goal: string;
  /** The owner's IANA zone; business hours and retries are read in it. */
  readonly zone: string;
  readonly constraints: Constraints;
  readonly state: ErrandState;
  /** Where in the flow it is, e.g. "confirm:call:p1" or "retry:p1". */
  readonly step: string;
  /** The rules version it runs under (step.ts); a deploy never changes the rules under it. */
  readonly stepVersion: number;
  readonly nextWakeAt: string | null;
  readonly candidates: readonly Candidate[];
  /** The action the owner was asked to confirm and hasn't answered. */
  readonly pending: Approval | null;
  /** Every action the owner said yes to. An outward effect needs its action here. */
  readonly approvals: readonly Approval[];
  readonly outcome?: Outcome;
  readonly failedReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt?: string;
  readonly env: string;
}

export type ApprovalVerb = 'call' | 'book' | 'text' | 'schedule' | 'next';

/**
 * One action the owner was asked about, exactly as read back: what to do and
 * the places it covers. Structured, never a delimited string, so no place id
 * can widen what the owner said yes to.
 */
export interface Approval {
  readonly verb: ApprovalVerb;
  readonly placeIds: readonly string[];
}

export const sameApproval = (a: Approval, b: Approval): boolean =>
  a.verb === b.verb &&
  a.placeIds.length === b.placeIds.length &&
  a.placeIds.every((p, i) => p === b.placeIds[i]);

/** For logs and idempotency keys: "call:p1+p2". Safe because place ids are checked. */
export const describeApproval = (a: Approval): string => `${a.verb}:${a.placeIds.join('+')}`;

/** Letters, digits, '_' and '-' only, as Google place ids are: nothing that reads as a separator. */
export const isSafePlaceId = (id: string): boolean => /^[A-Za-z0-9_-]{1,256}$/.test(id);

export type CallStatus = Exclude<OutcomeStatus, 'needs_owner'>;

export type Signal =
  | { readonly type: 'candidates_found'; readonly candidates: readonly NewCandidate[] }
  | { readonly type: 'line_type_found'; readonly placeId: string; readonly lineType: LineType }
  | { readonly type: 'owner_confirmed'; readonly action: Approval }
  | { readonly type: 'owner_declined'; readonly action: Approval }
  | { readonly type: 'owner_cancelled' }
  | {
      readonly type: 'call_outcome';
      readonly placeId: string;
      readonly status: CallStatus;
      readonly when?: string;
      readonly confirmation?: string;
      readonly contactName?: string;
      readonly readBack?: boolean;
      /** The place asked for a card or a deposit. Ferni never pays. */
      readonly requiresPayment?: boolean;
      readonly callId?: string;
    }
  | { readonly type: 'wake' }
  | { readonly type: 'event_passed' };

/** Effects that reach a third party or the owner's calendar: each needs an owner yes. */
export const OUTWARD_KINDS = ['call', 'text', 'cancel_call', 'calendar', 'reminder'] as const;
export type OutwardKind = (typeof OUTWARD_KINDS)[number];

export type OwnerNotice = 'needs_owner' | 'failed' | 'follow_up' | 'cancelled';

export type EffectBody =
  | { readonly kind: 'ask_owner'; readonly action: Approval; readonly reason?: string }
  | { readonly kind: 'notify_owner'; readonly about: OwnerNotice; readonly reason?: string }
  | { readonly kind: 'offer_text_instead'; readonly action: Approval; readonly placeId: string }
  | { readonly kind: 'lookup_line_type'; readonly placeId: string }
  | {
      readonly kind: 'call';
      readonly placeId: string;
      readonly purpose: 'ask' | 'accept';
      readonly approval: Approval;
    }
  | { readonly kind: 'text'; readonly placeId: string; readonly approval: Approval }
  | { readonly kind: 'cancel_call'; readonly placeId: string; readonly approval: Approval }
  | {
      readonly kind: 'calendar' | 'reminder';
      readonly placeId: string;
      readonly at: string;
      readonly approval: Approval;
    };

export type EffectKind = EffectBody['kind'];

/**
 * Something the runner should do. `idemKey` is `errandId:step:attempt`, so a
 * replayed step never acts twice; `retry` comes from the one table in
 * retry-policy.ts.
 */
export type Effect = EffectBody & { readonly idemKey: string; readonly retry: RetryPolicy };

/** One line of the append-only log at errands/{id}/events. Outcomes and ids, never transcripts. */
export type ErrandEvent =
  | { readonly type: 'signal'; readonly at: string; readonly signal: Signal['type'] }
  | { readonly type: 'owner_confirmed'; readonly at: string; readonly action: Approval }
  | { readonly type: 'owner_declined'; readonly at: string; readonly action: Approval }
  | {
      readonly type: 'transition';
      readonly at: string;
      readonly from: ErrandState;
      readonly to: ErrandState;
      readonly step: string;
    }
  | {
      readonly type: 'effect';
      readonly at: string;
      readonly kind: EffectKind;
      readonly idemKey: string;
    }
  | { readonly type: 'decision'; readonly at: string; readonly note: string };

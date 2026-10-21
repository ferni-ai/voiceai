/**
 * What the errands context needs from storage. The Firestore adapter
 * (stores/errand-store.ts, bogle_users/{uid}/errands) implements it; the rules
 * live in step(), so the store only saves, finds and hands out effects.
 *
 * The effect outbox is what makes the home-grown engine durable (errands
 * design 2.1): save() writes each effect as pending in the same transaction
 * as the step that made it, BEFORE anything runs it.
 *
 * @module services/errands/ports
 */

import type { Effect, EffectKind, Errand, ErrandEvent } from './errand.js';

/** A new errand, before the store gives it an id, a state and timestamps. */
export type NewErrand = Pick<Errand, 'userId' | 'kind' | 'goal' | 'zone' | 'constraints' | 'env'>;

export type EffectStatus = 'pending' | 'running' | 'done' | 'failed';

/** errands/{errandId}/effects/{idemKey} */
export interface OutboxEffect {
  readonly idemKey: string;
  readonly userId: string;
  readonly errandId: string;
  readonly kind: EffectKind;
  readonly effect: Effect;
  readonly status: EffectStatus;
  readonly attempts: number;
  /** Claimable at or after this (backoff after a retryable failure). */
  readonly notBefore: string;
  readonly leaseUntil: string | null;
  /** Who holds the lease; complete and fail must present it. */
  readonly leaseId: string | null;
  /** The provider's id for what was sent (call SID, message SID). */
  readonly providerRef: string | null;
  /** It came back as needs_provider_check once: never queued again. */
  readonly providerCheck?: boolean;
  readonly error?: string;
  readonly updatedAt: string;
}

export interface ErrandStore {
  create: (e: NewErrand, now: Date, stepVersion: number) => Promise<Errand>;
  get: (userId: string, id: string) => Promise<Errand | null>;
  /** One person's errands that are not done, cancelled or failed. */
  open: (userId: string) => Promise<Errand[]>;
  /** Open errands, across everyone, whose nextWakeAt is at or before `now`. */
  due: (now: Date, limit: number) => Promise<Errand[]>;
  /**
   * Writes `next` only if the stored copy still has `expectedRevision`, and in
   * the same transaction appends `events` and puts `effects` in the outbox as
   * pending. False when it lost, and then nothing is written.
   */
  save: (
    next: Errand,
    expectedRevision: number,
    events?: readonly ErrandEvent[],
    effects?: readonly Effect[]
  ) => Promise<boolean>;
  /** The errand's log, oldest first. */
  events: (userId: string, id: string) => Promise<ErrandEvent[]>;
}

/** The lease a runner holds on one effect. */
export interface EffectLease {
  readonly userId: string;
  readonly errandId: string;
  readonly idemKey: string;
  readonly leaseId: string;
}

export type Claim =
  /** Run it. `recovered` when a dead runner's lease ran out on an effect safe to repeat. */
  | {
      readonly type: 'claimed';
      readonly lease: EffectLease;
      readonly effect: OutboxEffect;
      readonly recovered: boolean;
    }
  /** It may already have reached someone: look it up with the provider before anything else. */
  | {
      readonly type: 'needs_provider_check';
      readonly lease: EffectLease;
      readonly effect: OutboxEffect;
    }
  | { readonly type: 'none' };

/** errands/{id}/effects: runners lease, finish and fail effects here (stores/errand-outbox.ts). */
export interface EffectOutbox {
  /** Takes one runnable effect under a lease of `leaseMs`, or none. Only one claimer wins. */
  claimEffect: (now: Date, leaseMs: number) => Promise<Claim>;
  /**
   * Saves the provider's id the moment it exists, and renews the lease (long
   * calls). False means the lease is lost: another runner may take the effect,
   * so the runner MUST hang up the call (or stop the send) it is holding.
   */
  recordProviderRef: (
    lease: EffectLease,
    providerRef: string,
    now: Date,
    leaseMs: number
  ) => Promise<boolean>;
  completeEffect: (lease: EffectLease, providerRef: string | null, now: Date) => Promise<boolean>;
  /**
   * Back to pending after its backoff only when `error` is retryable, attempts
   * remain, the errand still wants it, and nothing may have reached a person:
   * a call or text needs `neverSent: true` (the request provably never left);
   * anything that had a provider check never goes back. Else failed.
   */
  failEffect: (
    lease: EffectLease,
    error: string,
    now: Date,
    opts?: { readonly neverSent?: boolean }
  ) => Promise<boolean>;
}

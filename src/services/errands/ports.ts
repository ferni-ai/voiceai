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
   * Writes `next` only if the stored copy still has `expectedUpdatedAt`, and in
   * the same transaction appends `events` and puts `effects` in the outbox as
   * pending. False when it lost, and then nothing is written.
   */
  save: (
    next: Errand,
    expectedUpdatedAt: string,
    events?: readonly ErrandEvent[],
    effects?: readonly Effect[]
  ) => Promise<boolean>;
  /** The errand's log, oldest first. */
  events: (userId: string, id: string) => Promise<ErrandEvent[]>;
}

/**
 * What the follow-through context needs from storage. The Firestore adapter
 * (L1, bogle_users/{uid}/follow_through) implements it; the rules live in
 * follow-up.ts and right-moment.ts, so the store only saves and finds.
 *
 * @module services/follow-through/ports
 */

import type { FollowUp } from './follow-up.js';

/** A new follow-up, before the store gives it an id and timestamps. */
export type NewFollowUp = Pick<
  FollowUp,
  'userId' | 'kind' | 'text' | 'dueAt' | 'zone' | 'repeat' | 'source'
>;

export interface FollowUpStore {
  /** Saves a new open follow-up, or returns the one already made from the same source. */
  open: (f: NewFollowUp, now: Date) => Promise<FollowUp>;
  /** One person's follow-ups that are still open or surfaced. */
  live: (userId: string) => Promise<FollowUp[]>;
  /** Open or surfaced follow-ups, across everyone, due at or before `now`. */
  due: (now: Date, limit: number) => Promise<FollowUp[]>;
  /** One person's follow-ups changed in [from, to), for "what Ferni did" and the weekly look back. */
  changedBetween: (userId: string, from: Date, to: Date) => Promise<FollowUp[]>;
  /**
   * Writes `next` only if the stored copy still has `expectedUpdatedAt`, so two
   * writers (a call and the delivery job) can't undo each other. False when it lost.
   */
  save: (next: FollowUp, expectedUpdatedAt: string) => Promise<boolean>;
}

/**
 * Something an existing store says Ferni should follow through on: a pending
 * reminder, an open commitment, a thread from the last call. `zone` is the
 * source's own zone when it has one (a reminder's), else the caller's applies.
 */
export interface SourceItem {
  readonly kind: NewFollowUp['kind'];
  readonly text: string;
  readonly dueAt: string | null;
  readonly repeat: NewFollowUp['repeat'];
  readonly source: NewFollowUp['source'];
  readonly zone?: string;
}

export interface FollowUpSources {
  /** What the existing stores hold for one person, minus anything they asked Ferni to forget. */
  itemsFor: (userId: string, now: Date) => Promise<SourceItem[]>;
}

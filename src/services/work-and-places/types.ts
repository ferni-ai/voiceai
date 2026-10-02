/**
 * Work & career and travel & places memory: types.
 *
 * Two areas share one record shape so they share one store, one set of
 * precedence rules and one deletion story:
 *
 *   bogle_users/{uid}/work_memory/{id}    jobs (with history), projects, wins,
 *                                         stresses, goals, interviews/reviews
 *   bogle_users/{uid}/place_memory/{id}   home (current and past), trips
 *                                         (planned and taken), favourites,
 *                                         places with meaning, bucket list
 *   bogle_users/{uid}/memory_tombstones/{id}   kind 'work' | 'place'
 *
 * @module services/work-and-places/types
 */

export type LifeArea = 'work' | 'places';

export type WorkKind =
  | 'job'
  | 'project'
  | 'win'
  | 'stress'
  | 'goal'
  | 'event' // interview, performance review, presentation, deadline
  | 'application';

export type PlaceKind = 'home' | 'trip' | 'favorite' | 'meaningful' | 'bucket_list';

export type LifeKind = WorkKind | PlaceKind;

export const WORK_KINDS: readonly WorkKind[] = [
  'job',
  'project',
  'win',
  'stress',
  'goal',
  'event',
  'application',
];
export const PLACE_KINDS: readonly PlaceKind[] = [
  'home',
  'trip',
  'favorite',
  'meaningful',
  'bucket_list',
];

/**
 * - `current`: the job they have now, the place they live, an active project.
 * - `past`: a job they left, a place they used to live, a finished project.
 * - `planned`: an upcoming trip / interview, an open goal.
 * - `done`: a trip they took, an interview that happened, a goal reached.
 */
export type LifeStatus = 'current' | 'past' | 'planned' | 'done';
export const LIFE_STATUSES: readonly LifeStatus[] = ['current', 'past', 'planned', 'done'];

/** How we know: the user's own words, a paraphrase/fact (inferred), or the page/tool. */
export type LifeSource = 'stated' | 'inferred' | 'user';

export type WorkEventType = 'interview' | 'review' | 'presentation' | 'deadline' | 'other';
export type PlaceCategory =
  | 'city'
  | 'neighbourhood'
  | 'country'
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'park'
  | 'beach'
  | 'other';

export interface LifeItem {
  readonly id: string;
  readonly area: LifeArea;
  readonly kind: LifeKind;
  /** Normalized identity key (`job:acme`, `trip:lisbon:2026`). */
  readonly key: string;
  /** Short display text ("Product manager at Acme", "Lisbon"). */
  readonly title: string;
  readonly status: LifeStatus;
  // Work
  readonly employer?: string;
  readonly role?: string;
  readonly team?: string;
  /** Earlier roles at the same employer, oldest first (promotions). */
  readonly previousRoles?: readonly string[];
  readonly eventType?: WorkEventType;
  // Places
  readonly place?: string;
  readonly category?: PlaceCategory;
  /** Why the place matters ("where we got engaged"). */
  readonly meaning?: string;
  /** People the user went / goes with, by name (linked to people at read time). */
  readonly withPeople?: readonly string[];
  /** dynamic_entities place id when extraction knows the place. */
  readonly entityId?: string;
  // Time
  /** `YYYY-MM-DD` or `YYYY-MM`: start of the job / trip / when they moved there. */
  readonly startDate?: string;
  /** `YYYY-MM-DD` or `YYYY-MM`: end of the job / trip / when they moved away. */
  readonly endDate?: string;
  /** Important-date id this item is reminded through (trips, interviews). */
  readonly dateId?: string;
  readonly notes?: string;
  // Provenance and precedence
  readonly source: LifeSource;
  readonly confidence: number;
  readonly userEdited: boolean;
  readonly sourceConversationIds: readonly string[];
  readonly sourceFactIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastMentionedAt: string;
  readonly editedAt?: string;
}

/** What capture (or the page) wants to record. */
export interface LifeInput {
  readonly area: LifeArea;
  readonly kind: LifeKind;
  /** Identity subject (employer, place, project name...). The key is built from it. */
  readonly subject: string;
  readonly title?: string;
  readonly status?: LifeStatus;
  readonly employer?: string;
  readonly role?: string;
  readonly team?: string;
  readonly eventType?: WorkEventType;
  readonly place?: string;
  readonly category?: PlaceCategory;
  readonly meaning?: string;
  readonly withPeople?: readonly string[];
  readonly entityId?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly notes?: string;
  readonly source: LifeSource;
  readonly confidence: number;
  readonly conversationId?: string;
  readonly factId?: string;
  /** A job/home that does not replace the current one ("I also work at...", "our cabin"). */
  readonly additional?: boolean;
}

export type UpsertOutcome =
  | 'created'
  | 'updated'
  | 'reinforced'
  | 'skipped_tombstoned'
  | 'skipped_user_edited'
  | 'skipped_disabled'
  | 'invalid';

export interface UpsertResult {
  readonly outcome: UpsertOutcome;
  readonly item?: LifeItem;
  /** Items moved to the past because this one replaced them (job change, move). */
  readonly superseded?: readonly LifeItem[];
  readonly reason?: string;
}

/** Fields the page may edit. */
export interface LifePatch {
  readonly title?: string;
  readonly status?: LifeStatus;
  readonly employer?: string;
  readonly role?: string;
  readonly team?: string;
  readonly place?: string;
  readonly meaning?: string;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly notes?: string | null;
}

export type TombstoneReason = 'user_deleted' | 'voice_forget' | 'conversation_deleted';

export const USERS_COLLECTION = 'bogle_users';
export const TOMBSTONE_COLLECTION = 'memory_tombstones';
export const AREA_COLLECTIONS: Readonly<Record<LifeArea, string>> = {
  work: 'work_memory',
  places: 'place_memory',
};
export const ID_PREFIX: Readonly<Record<LifeArea, string>> = { work: 'work_', places: 'place_' };

export function areaOfKind(kind: string): LifeArea | null {
  if ((WORK_KINDS as readonly string[]).includes(kind)) return 'work';
  if ((PLACE_KINDS as readonly string[]).includes(kind)) return 'places';
  return null;
}

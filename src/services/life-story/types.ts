/**
 * Life story, values and beliefs memory: types.
 *
 *   bogle_users/{uid}/life_story/{id}       where they grew up, family of origin,
 *                                           school years, stories they've told,
 *                                           formative moments, turning points,
 *                                           life chapters, recurring themes, how
 *                                           they make decisions
 *   bogle_users/{uid}/values/{id}           what matters most to them (the
 *                                           values-alignment store, now with provenance)
 *   bogle_users/{uid}/beliefs_memory/{id}   faith, spiritual practice, philosophical
 *                                           beliefs: ONLY with `beliefs` consent
 *   bogle_users/{uid}/memory_tombstones/{id}  kind 'story' | 'value' | 'belief'
 *
 * @module services/life-story/types
 */

export const USERS_COLLECTION = 'bogle_users';
export const STORY_COLLECTION = 'life_story';
/** Shared with services/superhuman/values-alignment (same documents, same shape). */
export const VALUES_COLLECTION = 'values';
export const BELIEFS_COLLECTION = 'beliefs_memory';
export const TOMBSTONE_COLLECTION = 'memory_tombstones';
/** Legacy narrative stores written by services/superhuman (exported and erased with ours). */
export const LEGACY_CHAPTERS_COLLECTION = 'life_chapters';
export const LEGACY_CONFLICTS_COLLECTION = 'value_conflicts';

export type StoryKind =
  | 'origin' // where they grew up / were born
  | 'family' // family of origin ("grew up with two brothers", "raised by my gran")
  | 'school' // school and college years
  | 'story' // a story they told ("the treehouse with my brother")
  | 'moment' // a formative moment
  | 'turning_point' // "that changed everything"
  | 'chapter' // a life chapter with a rough time ("my Berlin years")
  | 'theme' // a recurring theme ("always the one who holds it together")
  | 'decision'; // how they make decisions ("I sleep on big decisions")

export const STORY_KINDS: readonly StoryKind[] = [
  'origin',
  'family',
  'school',
  'story',
  'moment',
  'turning_point',
  'chapter',
  'theme',
  'decision',
];

export type BeliefKind =
  | 'faith' // "I'm Catholic", "I'm Buddhist", "I'm an atheist"
  | 'practice' // "I go to mass on Sundays", "I pray every morning"
  | 'belief' // philosophical or spiritual belief ("I'm a Stoic", "I believe in karma")
  | 'questioning'; // "I've been questioning my faith"

export const BELIEF_KINDS: readonly BeliefKind[] = ['faith', 'practice', 'belief', 'questioning'];

/** How we know: the user's words, a summary/fact (inferred), or the page. */
export type MemorySource = 'stated' | 'inferred' | 'user';

export type TombstoneReason = 'user_deleted' | 'voice_forget' | 'conversation_deleted';

export interface LinkedPerson {
  readonly name: string;
  /** Personal-insights person id when the name matches someone known. */
  readonly personId?: string;
}

export interface LinkedPlace {
  readonly name: string;
  /** Work & places item id (place_memory) when the name matches. */
  readonly placeId?: string;
}

/** Fields every stored item carries (story and beliefs). */
interface ProvenancedItem {
  readonly id: string;
  /** Normalized identity key ("origin:ohio", "story:brother treehouse"). */
  readonly key: string;
  /** Short display text ("Grew up in Ohio", "Building a treehouse with Sam"). */
  readonly title: string;
  /** Their words, a little longer. */
  readonly detail?: string;
  readonly source: MemorySource;
  readonly confidence: number;
  readonly userEdited: boolean;
  readonly editedAt?: string;
  readonly sourceConversationIds: readonly string[];
  readonly sourceFactIds: readonly string[];
  readonly mentions: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastMentionedAt: string;
}

export interface StoryItem extends ProvenancedItem {
  readonly area: 'story';
  readonly kind: StoryKind;
  /** Rough time as said: "childhood", "age 9", "college", "2012-2016", "my twenties". */
  readonly period?: string;
  /** A known date: YYYY, YYYY-MM or YYYY-MM-DD. */
  readonly date?: string;
  readonly people?: readonly LinkedPerson[];
  readonly place?: LinkedPlace;
  readonly themes?: readonly string[];
  /** Important-dates id when the item is pinned to a specific day. */
  readonly dateId?: string;
}

export interface BeliefItem extends ProvenancedItem {
  readonly area: 'beliefs';
  readonly kind: BeliefKind;
}

export type MemoryItem = StoryItem | BeliefItem;
export type ItemArea = MemoryItem['area'];

/** What capture (or the page) hands the store. */
export interface StoryInput {
  readonly area: 'story';
  readonly kind: StoryKind;
  readonly title: string;
  readonly detail?: string;
  readonly period?: string;
  readonly date?: string;
  readonly people?: readonly string[];
  readonly place?: string;
  readonly themes?: readonly string[];
  readonly source: MemorySource;
  readonly confidence: number;
  readonly conversationId?: string;
  readonly factId?: string;
}

export interface BeliefInput {
  readonly area: 'beliefs';
  readonly kind: BeliefKind;
  readonly title: string;
  readonly detail?: string;
  readonly source: MemorySource;
  readonly confidence: number;
  readonly conversationId?: string;
  readonly factId?: string;
}

export type ItemInput = StoryInput | BeliefInput;

export interface ItemPatch {
  readonly title?: string;
  readonly detail?: string | null;
  readonly period?: string | null;
  readonly date?: string | null;
}

export type UpsertOutcome =
  | 'created'
  | 'reinforced'
  | 'updated'
  | 'skipped_user_edited'
  | 'skipped_tombstoned'
  | 'skipped_no_consent'
  | 'invalid';

export interface UpsertResult {
  readonly outcome: UpsertOutcome;
  readonly item?: MemoryItem;
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// Values (shared document shape with services/superhuman/values-alignment)
// ---------------------------------------------------------------------------

export type ValueCategory =
  | 'family'
  | 'freedom'
  | 'security'
  | 'growth'
  | 'achievement'
  | 'service'
  | 'creativity'
  | 'authenticity'
  | 'connection'
  | 'health'
  | 'adventure'
  | 'peace'
  | 'purpose'
  | 'wealth'
  | 'fun';

export interface ValueItem {
  readonly id: string;
  /** What they called it: "family", "honesty", "being there for people". */
  readonly label: string;
  readonly category: ValueCategory;
  /** Their own words. */
  readonly statement: string;
  readonly importance: number;
  readonly mentions: number;
  readonly source: MemorySource;
  readonly userEdited: boolean;
  readonly sourceConversationIds: readonly string[];
  readonly sourceFactIds: readonly string[];
  readonly updatedAt: string;
}

export interface ValueInput {
  readonly label: string;
  readonly category?: ValueCategory;
  readonly statement: string;
  readonly source: MemorySource;
  readonly confidence: number;
  readonly conversationId?: string;
  readonly factId?: string;
}

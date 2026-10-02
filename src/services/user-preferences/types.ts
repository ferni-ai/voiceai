/**
 * User Preference Profile — types and vocabulary.
 *
 * One document per (domain, key) at `bogle_users/{uid}/preferences/{id}`.
 * Single-valued settings (response length, preferred name, units...) use a fixed
 * key. Multi-valued items (topics to avoid, liked foods...) put the item in the
 * key (`avoidTopic:dad`, `music:jazz`) so each one is its own editable document.
 *
 * Precedence (highest first):
 *   userEdited  — the user deliberately set it (Preferences page, account
 *                 settings, or the dedicated voice command "call me Sam")
 *   explicit    — the user said it outright in conversation ("I hate long answers")
 *   inferred    — learned from behaviour / facts; needs repeated evidence
 *
 * @module services/user-preferences/types
 */

export const PREFERENCE_DOMAINS = [
  'conversation',
  'boundaries',
  'coaching',
  'likes',
  'interests',
  'media',
  'food',
  'practical',
] as const;
export type PreferenceDomain = (typeof PREFERENCE_DOMAINS)[number];

export type PreferenceSource = 'explicit' | 'inferred';
export type Sentiment = 'like' | 'dislike';

/** Fixed keys with a closed set of values. Free-text keys are listed with `null`. */
export const SINGLE_KEYS: Readonly<
  Record<string, Readonly<Record<string, readonly string[] | null>>>
> = {
  conversation: {
    responseLength: ['short', 'medium', 'long'],
    tone: null,
    directness: ['gentle', 'balanced', 'direct'],
    pace: ['slow', 'normal', 'fast'],
    humor: ['none', 'light', 'lots'],
    followUpQuestions: ['fewer', 'normal', 'more'],
    preferredName: null,
    pronouns: null,
    language: null,
  },
  boundaries: {
    doNotContact: null,
  },
  coaching: {
    accountabilityStyle: ['gentle', 'balanced', 'firm'],
    motivationStyle: null,
    fourTendency: ['upholder', 'questioner', 'obliger', 'rebel'],
  },
  food: {
    spiceTolerance: ['none', 'mild', 'medium', 'hot', 'very_hot'],
    cookingSkill: ['beginner', 'intermediate', 'confident', 'advanced'],
  },
  practical: {
    units: ['metric', 'imperial'],
    temperatureUnit: ['celsius', 'fahrenheit'],
    distanceUnit: ['kilometers', 'miles'],
    timeFormat: ['12h', '24h'],
    timezone: null,
    voiceSpeed: ['slow', 'normal', 'fast'],
  },
};

/** Prefixes for multi-valued keys: `${prefix}:${item}`. */
export const LIST_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  boundaries: ['avoidTopic', 'sensitivity'],
  likes: ['activity', 'brand', 'place', 'other'],
  food: [
    // dietary needs (safety-critical)
    'allergy',
    'intolerance',
    'diet',
    'medical',
    // tastes
    'cuisine',
    'dish',
    'comfort',
    'ingredient',
    'drink',
    'restaurant',
    // cooking
    'signature',
    'recipe',
    'equipment',
    'routine',
    'cooksFor',
    'goal',
  ],
  interests: ['interest'],
  media: ['artist', 'genre', 'song', 'show', 'movie', 'book', 'podcast', 'game', 'team'],
  conversation: [],
  coaching: [],
  practical: ['custom'],
};

export const INTEREST_KINDS = [
  'hobby',
  'sport',
  'creative',
  'learning',
  'media',
  'collecting',
  'outdoors',
  'games',
  'other',
] as const;
export type InterestKind = (typeof INTEREST_KINDS)[number];

/** Engagement, lowest to highest. */
export const INTEREST_LEVELS = ['curious', 'casual', 'regular', 'serious'] as const;
export type InterestLevel = (typeof INTEREST_LEVELS)[number];

export interface InterestPerson {
  /** F's people-profile id when known. */
  readonly personId?: string;
  readonly name: string;
}

export const MEDIA_STATUSES = [
  'want_to',
  'watching',
  'reading',
  'listening',
  'playing',
  'following',
  'finished',
  'dropped',
] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe', 'anaphylactic'] as const;
export type AllergySeverity = (typeof ALLERGY_SEVERITIES)[number];

export const MEDIA_ORIGINS = ['conversation', 'listening_history', 'user'] as const;
export type MediaOrigin = (typeof MEDIA_ORIGINS)[number];

/**
 * Structured details for the `interests` and `media` domains.
 * interests: key `interest:<name>`; media: key `<artist|genre|song|show|movie|book|podcast|game|team>:<name>`.
 */
export interface InterestDetails {
  readonly kind?: InterestKind;
  readonly level?: InterestLevel;
  readonly relatedPeople?: readonly InterestPerson[];
  /** Specifics worth remembering: "plays a 1998 Fender", "training for a 10k". */
  readonly specifics?: readonly string[];
  readonly lastMentionedAt?: string;
  // ── media ──
  readonly status?: MediaStatus;
  /** "season 2", "book 3", "episode 4". */
  readonly progress?: string;
  readonly opinion?: string;
  /** Moods/activities this music goes with: "working", "runs". */
  readonly contexts?: readonly string[];
  /** Memories tied to it: "reminds them of their dad". */
  readonly memories?: readonly string[];
  /** Where we learned it. Explicit statements beat listening history. */
  readonly origin?: MediaOrigin;
  // ── food ──
  /** Allergy / intolerance severity, when mentioned. */
  readonly severity?: AllergySeverity;
  /** How a recipe turned out: "too salty", "perfect". */
  readonly outcome?: string;
}
export type PreferenceDetails = InterestDetails;

/** Domains whose documents carry `details`. */
export const DETAIL_DOMAINS: readonly string[] = ['interests', 'media', 'food'];

export interface UserPreference {
  readonly id: string;
  readonly domain: PreferenceDomain;
  readonly key: string;
  readonly value: string;
  /** Only for the likes domain. */
  readonly sentiment?: Sentiment;
  /** Only for the interests domain. */
  readonly details?: InterestDetails;
  readonly source: PreferenceSource;
  readonly confidence: number;
  readonly userEdited: boolean;
  readonly sourceConversationIds: readonly string[];
  /** Fact ids (B's dynamic_facts) this was derived from, if any. */
  readonly sourceFactIds?: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly editedAt?: string;
}

/** What a writer submits. Precedence decides whether it lands. */
export interface PreferenceInput {
  readonly domain: PreferenceDomain;
  readonly key: string;
  readonly value: string;
  readonly sentiment?: Sentiment;
  readonly details?: InterestDetails;
  readonly source: PreferenceSource;
  readonly confidence: number;
  /** True for deliberate settings (UI, account settings, the voice command). */
  readonly userEdited?: boolean;
  readonly conversationId?: string;
  readonly factId?: string;
}

export type UpsertOutcome =
  | 'created'
  | 'updated'
  | 'reinforced'
  | 'skipped_tombstoned'
  | 'skipped_lower_precedence'
  | 'invalid';

export interface UpsertResult {
  readonly outcome: UpsertOutcome;
  readonly preference?: UserPreference;
  readonly reason?: string;
}

/** A quiet window in the user's local time; `start > end` wraps past midnight. */
export interface DoNotContactWindow {
  /** 'HH:MM' (24h) */
  readonly start: string;
  /** 'HH:MM' (24h) */
  readonly end: string;
  /** 0 = Sunday … 6 = Saturday; absent = every day. */
  readonly days?: readonly number[];
  /** As the user said it, e.g. "9pm-8am". */
  readonly raw: string;
}

export interface ProactiveBoundaries {
  /** Topics Ferni must not raise on its own (normalised, lowercase). */
  readonly avoidTopics: readonly string[];
  /** Raw do-not-contact windows, e.g. "21:00-08:00" in the user's local time. */
  readonly doNotContact: readonly DoNotContactWindow[];
  /** Things to handle gently (not banned, but never joked about / pushed). */
  readonly sensitivities: readonly string[];
}

export const TOMBSTONE_COLLECTION = 'memory_tombstones';
export const PREFERENCES_COLLECTION = 'preferences';
export const USERS_COLLECTION = 'bogle_users';
/** Legacy single doc written by the old setPreference tool. */
export const LEGACY_SETTINGS_DOC = 'settings';

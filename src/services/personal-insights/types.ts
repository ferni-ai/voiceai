/**
 * Personal insights: the people in a user's life, the threads they keep
 * coming back to, what they are likely to bring up next, and a few grounded
 * openers. Everything here is DERIVED from the user's stored memory
 * (dynamic_facts, dynamic_entities, dynamic_relationships, summaries,
 * conversations) and carries `sourceConversationIds` so it disappears when
 * its sources are deleted.
 *
 * @module services/personal-insights/types
 */

// ============================================================================
// SOURCES (normalized from the collections other agents write)
// ============================================================================

/** A fact from dynamic_facts, normalized across the old and the contract shape. */
export interface SourceFact {
  readonly id: string;
  /** Who/what the fact is about ("Linda", "mom", "user"). */
  readonly subject: string;
  readonly predicate: string;
  readonly value: string;
  /** Human-readable text ("Linda's birthday is March 3"). */
  readonly text: string;
  readonly category?: string;
  readonly confidence: number;
  readonly conversationIds: readonly string[];
  /** Epoch ms of the most recent update (or extraction). */
  readonly at: number;
}

export interface SourceEntity {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly conversationIds: readonly string[];
  readonly at: number;
}

export interface SourceRelationship {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly type: string;
  readonly conversationIds: readonly string[];
  readonly at: number;
}

export interface SourceSummary {
  readonly id: string;
  readonly conversationId: string;
  readonly at: number;
  readonly mainTopics: readonly string[];
  readonly keyPoints: readonly string[];
  readonly followUps: readonly string[];
  readonly emotionalArc?: string;
}

export interface SourceConversation {
  readonly id: string;
  readonly startedAt: number;
  readonly summary?: string;
}

/** Everything the derivation reads for one user. */
/** A conflict recorded through the conflict tools (conflict_history). */
export interface SourceConflict {
  readonly withPerson: string;
  readonly relationship: string;
  readonly conflictType: string;
  readonly triggers: readonly string[];
  readonly effectiveApproaches: readonly string[];
  readonly ineffectiveApproaches: readonly string[];
  readonly outcome: string;
  readonly timestamp: number;
}

export interface UserMemorySources {
  readonly facts: readonly SourceFact[];
  readonly conflicts?: readonly SourceConflict[];
  readonly entities: readonly SourceEntity[];
  readonly relationships: readonly SourceRelationship[];
  readonly summaries: readonly SourceSummary[];
  readonly conversations: readonly SourceConversation[];
}

// ============================================================================
// PEOPLE
// ============================================================================

export type RelationshipGroup = 'family' | 'partner' | 'friend' | 'work' | 'pet' | 'other';

export interface Provenanced {
  readonly sourceConversationIds: readonly string[];
}

export interface PersonFact extends Provenanced {
  readonly text: string;
  readonly factId: string;
}

export interface OpenThread extends Provenanced {
  readonly text: string;
  readonly mentionedAt: number;
}

export type ImportantDateKind = 'birthday' | 'anniversary' | 'event' | 'deadline' | 'other';

export interface DetectedDate extends Provenanced {
  /** Deterministic key for the important-dates store. */
  readonly key: string;
  readonly title: string;
  /** 'YYYY-MM-DD' for one-off dates, '--MM-DD' for recurring ones. */
  readonly date: string;
  readonly recurring: boolean;
  readonly kind: ImportantDateKind;
  readonly personId?: string;
  readonly confidence: number;
}

export type SentimentTrend = 'improving' | 'steady' | 'declining' | 'unknown';

export interface PetDetails {
  readonly species?: string;
  readonly breed?: string;
  readonly age?: string;
  readonly personality: readonly string[];
  /** Vet visits, meds, injuries (fact texts). */
  readonly health: readonly string[];
  /** Walks, feeding, grooming. */
  readonly routines: readonly string[];
  readonly owner?: string;
  readonly stories: readonly string[];
}

export type Closeness = 'close' | 'regular' | 'acquaintance';

/** Friendship and other non-family ties. */
export interface ConnectionDetails {
  /** How the user knows them ("work", "school", "neighbor"). */
  readonly howMet?: string;
  readonly closeness: Closeness;
  /** Shared history and inside references (fact texts). */
  readonly sharedHistory: readonly string[];
  /** Their own life events: new job, baby, move, illness. */
  readonly lifeEvents: readonly OpenThread[];
  /** Last time the user mentioned talking to or seeing them. */
  readonly lastConnectedAt?: number;
  /** What the user said they'd do ("I should call Jess"). */
  readonly intentions: readonly OpenThread[];
}

export type RelationshipStatus =
  | 'dating'
  | 'engaged'
  | 'married'
  | 'separated'
  | 'divorced'
  | 'broken_up'
  | 'estranged'
  | 'reconciled';

/** The relationship itself: partner status and the dynamics of any close tie. */
export interface RelationshipDetails {
  readonly status?: RelationshipStatus;
  /** Status changes over time, oldest first (kept, not dwelt on). */
  readonly statusHistory: ReadonlyArray<{
    status: RelationshipStatus;
    at: number;
    sourceConversationIds: readonly string[];
  }>;
  /** A former partner (broken up / divorced): never mentioned proactively. */
  readonly isFormer: boolean;
  readonly howMet?: string;
  /** What they appreciate / love languages. */
  readonly appreciates: readonly string[];
  readonly dateIdeas: readonly string[];
  readonly sharedPlans: readonly string[];
  /** Recurring friction topics (from conflict pattern analysis). */
  readonly tensions: readonly string[];
  /** Approaches that helped before ("taking a break before talking"). */
  readonly whatHelped: readonly string[];
  readonly repairAttempts: readonly string[];
  /** What the user wants to do better ("listen more to Sam"). */
  readonly growthIntentions: readonly OpenThread[];
  readonly support: readonly string[];
  readonly health: SentimentTrend;
}

export interface PersonProfile extends Provenanced {
  readonly id: string;
  readonly kind: 'person' | 'pet';
  /** They have died: speak of them warmly, in the past tense, never as if alive. */
  readonly memorial: boolean;
  readonly pet?: PetDetails;
  readonly connection?: ConnectionDetails;
  readonly relationshipDetails?: RelationshipDetails;
  /** Best display name: a proper name when known, else "Mom", "your sister". */
  readonly name: string;
  readonly aliases: readonly string[];
  /** Canonical role relative to the user ("mother", "partner", "coworker"). */
  readonly relationship?: string;
  readonly group: RelationshipGroup;
  readonly keyFacts: readonly PersonFact[];
  readonly importantDates: readonly DetectedDate[];
  readonly openThreads: readonly OpenThread[];
  readonly mentionCount: number;
  readonly firstMentionedAt: number;
  readonly lastMentionedAt: number;
  readonly sentimentTrend: SentimentTrend;
  readonly sourceFactIds: readonly string[];
  readonly updatedAt: number;
}

// ============================================================================
// TOPICS / LIFE THREADS
// ============================================================================

export type SensitiveCategory = 'health' | 'grief' | 'money' | 'relationships' | 'crisis';

export type Trajectory = 'new' | 'rising' | 'steady' | 'fading';

export interface LifeThread extends Provenanced {
  readonly id: string;
  readonly label: string;
  readonly firstMentionedAt: number;
  readonly lastMentionedAt: number;
  /** Number of distinct conversations it came up in. */
  readonly mentionCount: number;
  readonly mentionTimes: readonly number[];
  readonly trajectory: Trajectory;
  /** Median days between mentions, when there are at least 3. */
  readonly cadenceDays?: number;
  readonly unresolved: readonly OpenThread[];
  readonly commitments: readonly OpenThread[];
  readonly personIds: readonly string[];
  readonly sensitive?: SensitiveCategory;
  readonly updatedAt: number;
}

// ============================================================================
// PREDICTION
// ============================================================================

export type PredictionKind = 'thread' | 'person' | 'date' | 'followup';

export interface PredictionComponents {
  readonly recency: number;
  readonly frequency: number;
  readonly cadence: number;
  readonly timePattern: number;
  readonly unresolved: number;
  readonly upcoming: number;
}

export interface TopicPrediction {
  readonly key: string;
  readonly kind: PredictionKind;
  readonly label: string;
  /** Calibrated probability-like score, 0-1. */
  readonly confidence: number;
  readonly rawScore: number;
  readonly reason: string;
  /** Words/aliases that count as "they talked about it". */
  readonly matchTerms: readonly string[];
  readonly components: PredictionComponents;
  readonly sensitive?: SensitiveCategory;
}

export interface PredictionOutcomeItem {
  readonly key: string;
  readonly kind: PredictionKind;
  readonly label: string;
  readonly confidence: number;
  readonly hit: boolean;
}

export interface PredictionOutcome extends Provenanced {
  readonly conversationId: string;
  readonly predictedAt: number;
  readonly scoredAt: number;
  readonly items: readonly PredictionOutcomeItem[];
  readonly hits: number;
  readonly total: number;
  /** Mean squared error of confidence vs hit (lower is better). */
  readonly brier: number;
}

export interface CalibrationStats {
  /** Per kind: predictions made and hits, from recent outcomes. */
  readonly byKind: Readonly<
    Record<PredictionKind, { n: number; hits: number; sumConfidence: number }>
  >;
  readonly outcomes: number;
  readonly meanBrier: number | null;
}

// ============================================================================
// INSIGHTS / OPENERS
// ============================================================================

export interface Evidence extends Provenanced {
  /** Short id the LLM cites ("E3"). */
  readonly id: string;
  readonly text: string;
  readonly at: number;
  readonly sensitive?: SensitiveCategory;
  readonly personId?: string;
  /** About someone who has died. */
  readonly memorial?: boolean;
}

export interface GroundedItem extends Provenanced {
  readonly text: string;
  readonly evidence: readonly string[];
  readonly sensitive?: SensitiveCategory;
  readonly personId?: string;
}

export interface InsightBundle extends Provenanced {
  readonly computedAt: number;
  readonly predictions: readonly TopicPrediction[];
  readonly insights: readonly GroundedItem[];
  readonly openers: readonly GroundedItem[];
  /** Gentle keep-in-touch suggestions for friends (from the relationship network logic). */
  readonly nudges: readonly GroundedItem[];
  readonly upcomingDates: readonly UpcomingDate[];
  /** Top people with something open, for the session block. */
  readonly people: readonly PersonSummary[];
  /** True when recent material triggered safety detection: openers withheld. */
  readonly safetyHold: boolean;
  readonly generator: 'llm' | 'rules';
}

export interface UpcomingDate {
  readonly title: string;
  readonly date: string;
  readonly daysAway: number;
  readonly personId?: string;
  readonly kind: ImportantDateKind;
}

export interface PersonSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: 'person' | 'pet';
  readonly relationship?: string;
  readonly openThread?: string;
  readonly memorial?: boolean;
}

/** The API shape C's `/api/memory/me` returns under `people`. */
export interface ApiPerson {
  readonly id: string;
  readonly name: string;
  readonly kind: 'person' | 'pet';
  readonly memorial?: boolean;
  readonly relationship?: string;
  readonly notes?: string;
  readonly updatedAt: string;
}

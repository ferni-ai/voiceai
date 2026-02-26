/**
 * Knowledge Graph Types
 *
 * Store and retrieve relationship-specific memories:
 * - Inside jokes (shared humor)
 * - Conversation rituals (routines)
 * - Communication preferences (how they like to be talked to)
 * - Trust milestones (moments that deepened the relationship)
 *
 * @module services/memory/knowledge-graph/types
 */

// ============================================================================
// INSIDE JOKES
// ============================================================================

/**
 * An inside joke shared between user and Ferni
 */
export interface InsideJoke {
  /** Unique ID */
  id: string;

  /** The joke or reference */
  content: string;

  /** Original context where it emerged */
  originContext: string;

  /** When it emerged */
  createdAt: Date;

  /** Times referenced */
  timesReferenced: number;

  /** Last time referenced */
  lastReferencedAt: Date;

  /** Keywords that trigger this joke */
  triggerKeywords: string[];

  /** User reaction history */
  reactions: Array<{
    date: Date;
    positive: boolean;
  }>;
}

// ============================================================================
// CONVERSATION RITUALS
// ============================================================================

/**
 * A recurring ritual in conversations
 */
export interface ConversationRitual {
  /** Unique ID */
  id: string;

  /** Name of the ritual */
  name: string;

  /** What the ritual involves */
  description: string;

  /** Type of ritual */
  type: 'greeting' | 'closing' | 'check-in' | 'celebration' | 'comfort' | 'custom';

  /** When this ritual typically happens */
  timing: 'session-start' | 'session-end' | 'milestone' | 'emotional-moment' | 'any';

  /** Phrases associated with the ritual */
  phrases: string[];

  /** When established */
  establishedAt: Date;

  /** Times performed */
  timesPerformed: number;

  /** User preference for this ritual (0-1) */
  userPreference: number;
}

// ============================================================================
// COMMUNICATION PREFERENCES
// ============================================================================

/**
 * User's communication preferences with Ferni
 */
export interface CommunicationPreference {
  /** Category of preference */
  category: 'tone' | 'length' | 'formality' | 'humor' | 'directness' | 'support';

  /** Preference value */
  value: string;

  /** Confidence in this preference (0-1) */
  confidence: number;

  /** How many data points support this */
  sampleSize: number;

  /** Last updated */
  updatedAt: Date;

  /** Examples that informed this preference */
  examples?: string[];
}

// ============================================================================
// TRUST MILESTONES
// ============================================================================

/**
 * A milestone in the trust relationship
 */
export interface TrustMilestone {
  /** Unique ID */
  id: string;

  /** Type of milestone */
  type:
    | 'first-vulnerability'
    | 'deep-share'
    | 'asked-for-help'
    | 'expressed-gratitude'
    | 'returned-after-break'
    | 'defended-relationship'
    | 'custom';

  /** Description of the moment */
  description: string;

  /** When it happened */
  occurredAt: Date;

  /** Session ID where it happened */
  sessionId: string;

  /** Impact on relationship (0-1) */
  impactScore: number;

  /** Context/topic */
  context?: string;
}

// ============================================================================
// AGGREGATE TYPES
// ============================================================================

/**
 * Complete relational memory for a user
 */
export interface RelationalMemory {
  /** User ID */
  userId: string;

  /** Inside jokes */
  jokes: InsideJoke[];

  /** Conversation rituals */
  rituals: ConversationRitual[];

  /** Communication preferences */
  preferences: CommunicationPreference[];

  /** Trust milestones */
  milestones: TrustMilestone[];

  /** Overall relationship stats */
  stats: RelationshipStats;

  /** Last updated */
  updatedAt: Date;
}

/**
 * Relationship statistics
 */
export interface RelationshipStats {
  /** Total sessions */
  totalSessions: number;

  /** Days since first interaction */
  daysSinceFirstInteraction: number;

  /** Trust level (0-1) */
  trustLevel: number;

  /** Engagement trend */
  engagementTrend: 'increasing' | 'stable' | 'decreasing';

  /** Most connected topics */
  topConnectedTopics: string[];
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Interface for Relational Memory
 */
export interface IRelationalMemory {
  // Jokes
  addJoke(
    userId: string,
    joke: Omit<
      InsideJoke,
      'id' | 'createdAt' | 'timesReferenced' | 'lastReferencedAt' | 'reactions'
    >
  ): Promise<InsideJoke>;
  getJokes(userId: string): Promise<InsideJoke[]>;
  findRelevantJoke(userId: string, keywords: string[]): Promise<InsideJoke | null>;
  recordJokeUse(userId: string, jokeId: string, wasPositive: boolean): Promise<void>;

  // Rituals
  addRitual(
    userId: string,
    ritual: Omit<ConversationRitual, 'id' | 'establishedAt' | 'timesPerformed'>
  ): Promise<ConversationRitual>;
  getRituals(userId: string): Promise<ConversationRitual[]>;
  getRitualsForTiming(
    userId: string,
    timing: ConversationRitual['timing']
  ): Promise<ConversationRitual[]>;
  recordRitualUse(userId: string, ritualId: string): Promise<void>;

  // Preferences
  updatePreference(userId: string, preference: CommunicationPreference): Promise<void>;
  getPreferences(userId: string): Promise<CommunicationPreference[]>;
  getPreferenceByCategory(
    userId: string,
    category: CommunicationPreference['category']
  ): Promise<CommunicationPreference | null>;

  // Milestones
  addMilestone(userId: string, milestone: Omit<TrustMilestone, 'id'>): Promise<TrustMilestone>;
  getMilestones(userId: string): Promise<TrustMilestone[]>;
  getRecentMilestones(userId: string, days: number): Promise<TrustMilestone[]>;

  // Aggregate
  getRelationalMemory(userId: string): Promise<RelationalMemory | null>;
  buildContextForLLM(userId: string): Promise<string>;

  // Maintenance
  cleanup(): void;
}

// ============================================================================
// DI TOKEN
// ============================================================================

/**
 * DI token for Relational Memory
 */
export const RelationalMemoryToken = Symbol('RelationalMemory');

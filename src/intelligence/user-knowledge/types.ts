/**
 * User Knowledge Types - "Better Than Human" Unified Intelligence
 *
 * Defines the complete structure of everything we know about a user,
 * aggregated from all intelligence sources.
 *
 * > "Your best friend forgets. We don't."
 *
 * @module intelligence/user-knowledge/types
 */

// ============================================================================
// MAIN KNOWLEDGE STRUCTURE
// ============================================================================

/**
 * Complete knowledge about a user aggregated from all sources
 */
export interface UserKnowledge {
  /** User identification */
  userId: string;

  /** Identity - Who they are */
  identity: IdentityKnowledge;

  /** Lifestyle - What they enjoy/avoid */
  lifestyle: LifestyleKnowledge;

  /** Relationships - People in their life */
  relationships: RelationshipKnowledge;

  /** Aspirations - Dreams and commitments */
  aspirations: AspirationsKnowledge;

  /** Wellness - Health and wellbeing */
  wellness: WellnessKnowledge;

  /** Work - Professional life */
  work: WorkKnowledge;

  /** Communication - How they prefer to interact */
  communication: CommunicationKnowledge;

  /** Emotional - Emotional patterns and trajectories */
  emotional: EmotionalKnowledge;

  /** Patterns - Behavioral patterns we've noticed */
  patterns: PatternKnowledge;

  /** Boundaries - Things to avoid */
  boundaries: BoundaryKnowledge;

  /** Shared History - Our relationship with them */
  sharedHistory: SharedHistoryKnowledge;

  /** Metadata about this knowledge */
  metadata: KnowledgeMetadata;
}

// ============================================================================
// KNOWLEDGE CATEGORIES
// ============================================================================

export interface IdentityKnowledge {
  name?: string;
  timezone?: string;
  language?: string;
  pronouns?: string;
  birthday?: string;
  occupation?: string;
  company?: string;
}

export interface LifestyleKnowledge {
  entertainment: {
    musicLikes: string[];
    musicDislikes: string[];
    movieGenres: string[];
    tvShows: string[];
    sportsTeams: string[];
  };
  food: {
    cuisineLikes: string[];
    cuisineDislikes: string[];
    dietaryRestrictions: string[];
    drinks: string[];
    favoriteRestaurants: string[];
  };
  travel: {
    style?: string;
    bucketList: string[];
    favoritePlaces: string[];
    homeLocation?: string;
  };
  learning: {
    goals: string[];
    skills: string[];
    interests: string[];
  };
  daily: {
    productivityStyle?: string;
    morningRoutine?: string;
    sleepPattern?: string;
    shoppingPreferences: string[];
  };
}

export interface RelationshipKnowledge {
  contacts: ContactInfo[];
  /** Key relationships (family, partner, close friends) */
  keyPeople: KeyPerson[];
  /** Relationship patterns from semantic intelligence */
  patterns: RelationshipPattern[];
}

export interface ContactInfo {
  name: string;
  relationship?: string;
  phone?: string;
  email?: string;
  lastMentioned?: Date;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface KeyPerson {
  name: string;
  relationship: string;
  importance: 'critical' | 'high' | 'medium';
  recentTopics?: string[];
  sentiment?: 'positive' | 'negative' | 'mixed' | 'neutral';
}

export interface RelationshipPattern {
  pattern: string;
  confidence: number;
  category: string;
}

export interface AspirationsKnowledge {
  dreams: DreamItem[];
  commitments: CommitmentItem[];
  goals: GoalItem[];
}

export interface DreamItem {
  description: string;
  type: string;
  mentionedAt?: Date;
  status?: 'active' | 'achieved' | 'abandoned';
}

export interface CommitmentItem {
  description: string;
  dueDate?: Date;
  status: 'pending' | 'completed' | 'overdue';
  createdAt?: Date;
}

export interface GoalItem {
  description: string;
  domain?: string;
  progress?: number;
  createdAt?: Date;
}

export interface WellnessKnowledge {
  health: {
    allergies: string[];
    conditions: string[];
    medications?: string[];
  };
  fitness: {
    exercises: string[];
    routines: string[];
    preferences: string[];
  };
  mental: {
    practices: string[];
    triggers?: string[];
    copingStrategies?: string[];
  };
  sleep: {
    pattern?: string;
    quality?: 'good' | 'fair' | 'poor';
    issues?: string[];
  };
}

export interface WorkKnowledge {
  role?: string;
  company?: string;
  industry?: string;
  workStyle?: string;
  stressors: string[];
  interests: string[];
  goals: string[];
}

export interface CommunicationKnowledge {
  preferredStyle?: 'direct' | 'gentle' | 'detailed' | 'brief';
  socialStyle?: 'introvert' | 'extrovert' | 'ambivert';
  bestTimeToTalk?: string;
  responsePreferences?: string[];
  linguisticPatterns?: string[];
}

export interface EmotionalKnowledge {
  /** Current emotional state */
  currentState?: {
    primary: string;
    intensity: number;
    timestamp: Date;
  };
  /** Emotional trajectory over time */
  trajectory?: {
    trend: 'improving' | 'stable' | 'declining';
    confidence: number;
    period: string;
  };
  /** Emotional patterns */
  patterns: EmotionalPattern[];
  /** Values we've detected */
  values: ValueItem[];
}

export interface EmotionalPattern {
  pattern: string;
  frequency: 'rare' | 'occasional' | 'frequent';
  triggers?: string[];
}

export interface ValueItem {
  value: string;
  strength: number;
  detectedFrom?: string;
}

export interface PatternKnowledge {
  /** Behavioral patterns we've noticed */
  behaviors: BehaviorPattern[];
  /** Time-based patterns */
  temporal: TemporalPattern[];
  /** Cross-domain correlations */
  correlations: CorrelationPattern[];
}

export interface BehaviorPattern {
  pattern: string;
  category: string;
  confidence: number;
  surfacedToUser: boolean;
}

export interface TemporalPattern {
  type: string;
  timeOfDay?: string;
  dayOfWeek?: string;
  description: string;
}

export interface CorrelationPattern {
  domains: string[];
  insight: string;
  confidence: number;
}

export interface BoundaryKnowledge {
  avoidTopics: string[];
  sensitivities: SensitivityItem[];
  ferniCommitments: FerniCommitmentItem[];
}

export interface SensitivityItem {
  topic: string;
  reason?: string;
  severity: 'low' | 'medium' | 'high';
}

export interface FerniCommitmentItem {
  description: string;
  status: 'pending' | 'completed' | 'broken';
  createdAt?: Date;
}

export interface SharedHistoryKnowledge {
  /** Inside jokes and callbacks */
  insideJokes: InsideJokeItem[];
  /** Open loops - things we said we'd revisit */
  openLoops: OpenLoopItem[];
  /** Total conversations */
  totalConversations: number;
  /** Relationship duration */
  firstConversation?: Date;
  /** Milestones */
  milestones: MilestoneItem[];
}

export interface InsideJokeItem {
  reference: string;
  context: string;
  createdAt?: Date;
}

export interface OpenLoopItem {
  topic: string;
  context: string;
  mentionedAt: Date;
  resolved: boolean;
}

export interface MilestoneItem {
  description: string;
  date: Date;
  type: string;
}

export interface KnowledgeMetadata {
  lastUpdated: Date;
  sources: string[];
  completeness: {
    identity: number;
    lifestyle: number;
    relationships: number;
    aspirations: number;
    wellness: number;
    work: number;
    communication: number;
    emotional: number;
    patterns: number;
    boundaries: number;
    sharedHistory: number;
    overall: number;
  };
}

// ============================================================================
// CONTEXT OUTPUT TYPES
// ============================================================================

/**
 * Knowledge formatted for LLM context injection
 */
export interface KnowledgeContext {
  /** Full context string */
  fullContext: string;
  /** Abbreviated context (under token limit) */
  briefContext: string;
  /** Token estimate */
  estimatedTokens: number;
  /** Sections included */
  sectionsIncluded: string[];
}

/**
 * Options for knowledge retrieval
 */
export interface KnowledgeOptions {
  /** Force refresh from Firestore (bypass cache) */
  forceRefresh?: boolean;
  /** Include specific sections only */
  includeSections?: Array<keyof UserKnowledge>;
  /** Exclude specific sections */
  excludeSections?: Array<keyof UserKnowledge>;
}

/**
 * Options for context formatting
 */
export interface ContextFormatOptions {
  /** Maximum tokens for context */
  maxTokens?: number;
  /** Sections to prioritize */
  prioritySections?: Array<keyof UserKnowledge>;
  /** Output style */
  style?: 'detailed' | 'concise' | 'bullet';
  /** Include section headers */
  includeHeaders?: boolean;
}

// ============================================================================
// QUERY TYPES
// ============================================================================

/**
 * Result from asking about the user
 */
export interface QueryResult {
  found: boolean;
  answer?: string;
  confidence: number;
  source: string;
  relatedKnowledge?: string[];
}

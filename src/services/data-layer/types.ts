/**
 * Unified Data Layer Types
 *
 * Comprehensive type definitions for the semantic data store architecture.
 * Supports 98 entity types across all Ferni domains.
 *
 * @module services/data-layer/types
 */

// ============================================================================
// STORE TYPES
// ============================================================================

export type StoreType =
  // Original stores
  | 'productivity'
  | 'financial'
  | 'life-data'
  // New semantic stores
  | 'trust'
  | 'superhuman'
  | 'superhuman-intelligence'
  | 'calendar'
  | 'contacts'
  | 'coaching'
  | 'scheduling'
  | 'conversation'
  | 'memory'
  | 'health'
  | 'media'
  | 'career'
  | 'emotional'
  | 'wisdom'
  | 'session-context'
  | 'life-stage'
  | 'outreach'
  | 'tool_output';

export type ChangeType = 'create' | 'update' | 'delete';

// ============================================================================
// ENTITY TYPES (98 Total)
// ============================================================================

export type EntityType =
  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTIVITY (6 types) - Maya's domain
  // ═══════════════════════════════════════════════════════════════════════════
  | 'habit'
  | 'task'
  | 'routine'
  | 'bill'
  | 'medication'
  | 'package'

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCIAL (6 types) - Maya's domain
  // ═══════════════════════════════════════════════════════════════════════════
  | 'budget'
  | 'savings_goal'
  | 'subscription'
  | 'spending_trigger'
  | 'investment'
  | 'debt'

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFE DATA (6 types) - Jordan's domain
  // ═══════════════════════════════════════════════════════════════════════════
  | 'milestone'
  | 'life_goal'
  | 'retirement_plan'
  | 'note'
  | 'journal'
  | 'trip'

  // ═══════════════════════════════════════════════════════════════════════════
  // TRUST SYSTEMS (13 types) - Core relationship building
  // ═══════════════════════════════════════════════════════════════════════════
  | 'commitment' // Promises made to/by user
  | 'boundary' // Topics NOT to bring up
  | 'growth_reflection' // Observed evolution in user
  | 'inside_joke' // Shared humor moments
  | 'small_win' // Celebrated efforts
  | 'thinking_of_you' // Proactive outreach moments
  | 'reading_between_lines' // What user didn't say
  | 'tonal_memory' // Voice/communication patterns
  | 'vulnerability_moment' // When user opened up
  | 'trust_milestone' // Relationship trust milestones
  | 'curiosity_mention' // Passing mentions to follow up on (NEW - Dec 2024)
  | 'between_session_thinking' // Continuous presence reflections (NEW - Dec 2024)
  | 'persona_growth' // How personas grow from user interaction (NEW - Dec 2024)

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPERHUMAN SERVICES (12 types) - "Better than Human" capabilities
  // ═══════════════════════════════════════════════════════════════════════════
  | 'dream' // Dream keeper entries
  | 'life_chapter' // Life narrative segments
  | 'values_alignment' // Values tracking
  | 'relationship_milestone' // Relationship tracker
  | 'capacity_state' // Burnout/energy tracking
  | 'seasonal_pattern' // Seasonal awareness
  | 'emotional_first_aid' // Crisis support moments
  | 'predictive_insight' // Predictive coaching
  | 'commitment_keeper' // Commitment tracking
  | 'relationship_network' // Social network mapping
  | 'conflict_memory' // Conflict resolution memory
  | 'recovery_milestone' // Recovery tracking

  // ═══════════════════════════════════════════════════════════════════════════
  // CALENDAR & SCHEDULING (8 types) - Alex's domain
  // ═══════════════════════════════════════════════════════════════════════════
  | 'calendar_event' // Synced calendar events
  | 'meeting_memory' // Post-meeting notes
  | 'recurring_commitment' // Regular commitments
  | 'calendar_conflict' // Scheduling conflicts
  | 'meeting_prep' // Pre-meeting briefs
  | 'availability_pattern' // When user is available
  | 'time_block' // Blocked time for focus
  | 'deadline' // Important deadlines

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTACTS & RELATIONSHIPS (10 types) - Alex's domain
  // ═══════════════════════════════════════════════════════════════════════════
  | 'contact' // Contact entries
  | 'relationship_note' // Notes about relationships
  | 'gift_idea' // Gift suggestions
  | 'important_date' // Birthdays, anniversaries
  | 'contact_interaction' // Recent interactions
  | 'relationship_health' // Relationship quality
  | 'family_member' // Family-specific data
  | 'friend_memory' // Shared memories with friends
  | 'professional_contact' // Work relationships
  | 'communication_preference' // How they prefer to communicate

  // ═══════════════════════════════════════════════════════════════════════════
  // COACHING & GROWTH (10 types) - Ferni/Maya's domain
  // ═══════════════════════════════════════════════════════════════════════════
  | 'coaching_insight' // AI coaching observations
  | 'breakthrough_moment' // Aha moments
  | 'stuck_pattern' // Recurring blockers
  | 'reframe_suggestion' // Perspective shifts offered
  | 'growth_edge' // Current growth areas
  | 'strength_identified' // User strengths
  | 'blind_spot' // Identified blind spots
  | 'accountability_item' // Accountability tracking
  | 'behavior_change' // Attempted behavior changes
  | 'motivation_insight' // What motivates user

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH & WELLNESS (11 types) - Maya's domain
  // ═══════════════════════════════════════════════════════════════════════════
  | 'health_goal' // Health objectives
  | 'health_summary' // Daily health snapshots
  | 'sleep_pattern' // Sleep tracking
  | 'energy_level' // Energy throughout day
  | 'workout' // Exercise sessions
  | 'wellness_checkin' // Regular checkins
  | 'mental_health_note' // Mental health tracking
  | 'nutrition_goal' // Diet/nutrition
  | 'body_awareness' // Physical sensations/signals
  | 'stress_trigger' // What triggers stress
  | 'recovery_practice' // Self-care practices

  // ═══════════════════════════════════════════════════════════════════════════
  // EMOTIONAL & BEHAVIORAL (8 types) - Cross-persona
  // ═══════════════════════════════════════════════════════════════════════════
  | 'emotional_pattern' // Recurring emotional states
  | 'mood_trigger' // What triggers moods
  | 'coping_strategy' // How user copes
  | 'behavioral_trigger' // Behavioral patterns
  | 'decision_pattern' // How user decides
  | 'procrastination_pattern' // Procrastination triggers
  | 'anxiety_pattern' // Anxiety triggers
  | 'joy_trigger' // What brings joy

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA & ENTERTAINMENT (12 types) - Cross-persona
  // ═══════════════════════════════════════════════════════════════════════════
  | 'music_preference' // Music tastes
  | 'emotional_song' // Songs tied to emotions
  | 'playlist_memory' // Playlist associations
  | 'book_highlight' // Book highlights/notes
  | 'reading_list' // Books user wants to read/is reading
  | 'reading_goal' // Reading objectives
  | 'podcast_insight' // Podcast takeaways
  | 'movie_preference' // Movie/TV preferences
  | 'game_preference' // Gaming preferences
  | 'content_recommendation' // Recommended content
  | 'media_memory' // Memories tied to media
  | 'creative_memory' // Creative discoveries/preferences

  // ═══════════════════════════════════════════════════════════════════════════
  // CAREER & PROFESSIONAL (8 types) - Peter/Alex's domain
  // ═══════════════════════════════════════════════════════════════════════════
  | 'career_goal' // Career objectives
  | 'job_search' // Job search tracking
  | 'skill_development' // Skills being developed
  | 'professional_network' // Professional contacts
  | 'work_achievement' // Work accomplishments
  | 'career_reflection' // Career reflections
  | 'work_challenge' // Current work challenges
  | 'career_aspiration' // Long-term career dreams

  // ═══════════════════════════════════════════════════════════════════════════
  // WISDOM & PHILOSOPHY (8 types) - Nayan's domain
  // ═══════════════════════════════════════════════════════════════════════════
  | 'life_thesis_component' // Life thesis elements
  | 'value_statement' // Articulated values
  | 'purpose_exploration' // Purpose discovery
  | 'wisdom_insight' // Wisdom captured
  | 'life_lesson' // Lessons learned
  | 'perspective_shift' // Paradigm shifts
  | 'existential_question' // Big questions pondered
  | 'legacy_thought' // Thoughts about legacy

  // ═══════════════════════════════════════════════════════════════════════════
  // MISCELLANEOUS (10 types) - Various domains
  // ═══════════════════════════════════════════════════════════════════════════
  | 'travel_preference' // Travel style
  | 'bucket_list_item' // Bucket list
  | 'home_project' // Home improvement
  | 'creative_project' // Creative endeavors
  | 'learning_resource' // Learning materials
  | 'decision_record' // Major decisions made
  | 'conversation_thread' // Conversation history
  | 'visual_memory' // Visual memories/images shared
  | 'reminder' // Scheduled reminders
  | 'gift_idea' // Gift ideas for contacts

  // ═══════════════════════════════════════════════════════════════════════════
  // BETTER THAN HUMAN / SUPERHUMAN INTELLIGENCE (8 types) - What makes us 200%
  // ═══════════════════════════════════════════════════════════════════════════
  | 'voice_biomarker' // Emotion detected from voice patterns
  | 'session_summary' // Perfect recall of every conversation
  | 'pattern_insight' // Hidden patterns discovered in user behavior
  | 'behavioral_pattern' // Behavioral intelligence observations
  | 'cross_session_thread' // Connected topics across conversations
  | 'correlation_insight' // Hidden connections between life areas
  | 'protective_moment' // When we knew to stay silent
  | 'voice_recognition' // Voice profile for recognition

  // ═══════════════════════════════════════════════════════════════════════════
  // OUTREACH & ACTIONS (3 types) - Proactive outreach and call results
  // ═══════════════════════════════════════════════════════════════════════════
  | 'call_result' // On-behalf call outcomes
  | 'follow_up_action' // Actions to take after calls
  | 'scheduled_outreach' // Scheduled proactive outreach

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFE STAGE TRANSITIONS (10 types) - Major life changes
  // ═══════════════════════════════════════════════════════════════════════════
  | 'new_parent' // New parent journey
  | 'empty_nest' // Empty nest transition
  | 'infidelity_recovery' // Infidelity processing
  | 'health_diagnosis' // Health condition journey
  | 'job_loss' // Unemployment navigation
  | 'sobriety' // Recovery/sobriety journey
  | 'sandwich_generation' // Dual caregiving
  | 'blended_family' // Blended family integration
  | 'coming_out' // LGBTQ+ journey
  | 'faith_transition' // Faith/spiritual transition

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCATION & PLACES (3 types) - Geographic context
  // ═══════════════════════════════════════════════════════════════════════════
  | 'favorite_place' // Places user loves
  | 'location_memory' // Memories tied to locations
  | 'geographic_preference' // Travel/living preferences

  // ═══════════════════════════════════════════════════════════════════════════
  // PETS & ANIMALS (3 types) - Pet family members
  // ═══════════════════════════════════════════════════════════════════════════
  | 'pet' // Pet information
  | 'pet_health' // Pet health records
  | 'pet_milestone' // Pet milestones (birthdays, adoption days)

  // ═══════════════════════════════════════════════════════════════════════════
  // PROPERTY & VEHICLES (3 types) - Major assets
  // ═══════════════════════════════════════════════════════════════════════════
  | 'vehicle' // Vehicle information
  | 'home_maintenance' // Home upkeep tracking
  | 'property_asset' // Real estate and property

  // ═══════════════════════════════════════════════════════════════════════════
  // INSURANCE & LEGAL (2 types) - Life admin
  // ═══════════════════════════════════════════════════════════════════════════
  | 'insurance_policy' // Insurance policies
  | 'legal_document' // Wills, contracts, legal matters

  // ═══════════════════════════════════════════════════════════════════════════
  // CRISIS & SUPPORT (2 types) - Past support moments
  // ═══════════════════════════════════════════════════════════════════════════
  | 'crisis_episode' // Past crisis and resolution
  | 'support_received' // Help user received from others

  // ═══════════════════════════════════════════════════════════════════════════
  // USER CORRECTIONS & LEARNING (2 types) - When we learn from mistakes
  // ═══════════════════════════════════════════════════════════════════════════
  | 'user_correction' // When user corrects Ferni
  | 'implicit_preference' // Preferences inferred from behavior

  // ═══════════════════════════════════════════════════════════════════════════
  // OUTREACH HISTORY (3 types) - Tracking proactive communication
  // ═══════════════════════════════════════════════════════════════════════════
  | 'outreach_attempt' // All outreach attempts
  | 'outreach_response' // User responses to outreach
  | 'outreach_preference' // User outreach preferences

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSONA INTERACTION (3 types) - Multi-agent preferences
  // ═══════════════════════════════════════════════════════════════════════════
  | 'persona_affinity' // Which persona user prefers
  | 'handoff_preference' // Handoff routing preferences
  | 'persona_interaction_history'; // History with each persona

// ============================================================================
// STORE CHANGE EVENT
// ============================================================================

/**
 * Store change event - fired when data changes
 */
export interface StoreChangeEvent {
  storeType: StoreType;
  changeType: ChangeType;
  userId: string;
  entityType: EntityType;
  entityId: string;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

// ============================================================================
// INDEXING POLICY
// ============================================================================

export type IndexingPriority = 'always' | 'active_only' | 'important_only' | 'never';

/**
 * Policy for what to index per entity type
 */
export interface EntityIndexingPolicy {
  entityType: EntityType;
  priority: IndexingPriority;
  /** Only index if these conditions are met */
  conditions?: {
    /** Only index active items */
    activeOnly?: boolean;
    /** Only index high/urgent priority */
    importantOnly?: boolean;
    /** Maximum items to index per user */
    maxPerUser?: number;
    /** Minimum value to index (e.g., budget > $100) */
    minValue?: number;
  };
  /** Fields to include in the indexed content */
  contentFields: string[];
  /** TTL in days (0 = no expiry) */
  ttlDays: number;
}

/**
 * Full indexing policy configuration
 */
export interface IndexingPolicy {
  entities: EntityIndexingPolicy[];
  /** Global max documents per user */
  maxDocsPerUser: number;
  /** Debounce time for batching changes */
  debounceMs: number;
}

// ============================================================================
// QUERY ROUTING
// ============================================================================

export type QueryType = 'structured' | 'semantic' | 'hybrid';

/**
 * Query routing decision
 */
export interface QueryRoutingDecision {
  queryType: QueryType;
  confidence: number;
  reason: string;
  /** Suggested stores to query for structured */
  stores?: StoreType[];
  /** Suggested entity types for filtering */
  entityTypes?: EntityType[];
}

// ============================================================================
// UNIFIED CONTEXT
// ============================================================================

import type { MayaFinancialData } from '../stores/financial-store.js';
import type { UserLifeData } from '../stores/life-data-store.js';
import type { ProductivityData } from '../stores/productivity-types.js';

/**
 * Unified user context combining all data sources
 */
export interface UnifiedUserContext {
  userId: string;
  timestamp: Date;

  // Structured data (from stores)
  productivity: ProductivityData | null;
  financial: MayaFinancialData | null;
  lifeData: UserLifeData | null;

  // Summary fields for quick access
  summary: ContextSummary;
}

/**
 * Summary of user data for quick context
 */
export interface ContextSummary {
  activeTaskCount: number;
  activeHabitCount: number;
  activeSavingsGoals: number;
  upcomingMilestones: number;
  openBillsCount: number;
  activeRoutinesCount: number;
  totalBudgetRemaining: number;
  habitStreakMax: number;
}

// ============================================================================
// SEMANTIC CONTEXT
// ============================================================================

export type MemoryType =
  | 'habit'
  | 'financial'
  | 'milestone'
  | 'task'
  | 'memory'
  | 'routine'
  | 'trust'
  | 'coaching'
  | 'health'
  | 'calendar'
  | 'contact'
  | 'wisdom'
  | 'better_than_human' // Ferni's unique capabilities (was "superhuman")
  | 'media'
  | 'career'
  | 'goal';

/**
 * Semantic search result
 */
export interface SemanticMemoryResult {
  content: string;
  source: string;
  score: number;
  type: MemoryType;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Semantic context for LLM injection
 */
export interface SemanticUserContext {
  userId: string;
  relevantMemories: SemanticMemoryResult[];
  structuredContext?: {
    habits?: string[];
    goals?: string[];
    milestones?: string[];
    recentActivity?: string[];
    commitments?: string[];
    relationships?: string[];
    insights?: string[];
  };
}

// ============================================================================
// HEALTH & METRICS
// ============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Data layer health check result
 */
export interface DataLayerHealth {
  status: HealthStatus;
  timestamp: Date;
  components: {
    stores: {
      productivity: boolean;
      financial: boolean;
      lifeData: boolean;
    };
    semanticMemory: {
      available: boolean;
      usingFallback: boolean;
    };
    indexing: {
      pendingCount: number;
      lastFlushTime?: Date;
      errorCount: number;
    };
  };
  metrics: DataLayerMetrics;
}

/**
 * Data layer performance metrics
 */
export interface DataLayerMetrics {
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
  /** Average query latency in ms */
  avgQueryLatencyMs: number;
  /** Semantic search hit rate */
  semanticHitRate: number;
  /** Index operations count */
  indexOperations: number;
  /** Errors in last hour */
  errorsLastHour: number;
}

// ============================================================================
// DOMAIN-SPECIFIC ENTITY INTERFACES
// ============================================================================

/**
 * Trust system entity interfaces
 */
export interface CommitmentEntity {
  description: string;
  madeBy: 'user' | 'ferni' | 'persona';
  deadline?: string;
  status: 'active' | 'completed' | 'broken' | 'cancelled' | 'pending' | 'fulfilled';
  personaId?: string;
  context?: string;
}

export interface BoundaryEntity {
  topic: string;
  reason?: string;
  severity: 'soft' | 'medium' | 'hard';
  setDate?: string;
  expiresAt?: string;
}

export interface InsideJokeEntity {
  joke: string;
  context: string;
  sharedMoment: string;
  personaId?: string;
}

export interface GrowthReflectionEntity {
  observation: string;
  area: string;
  evidence: string;
  dateObserved?: string;
}

export interface SmallWinEntity {
  win: string;
  effort: string;
  celebration?: string;
  dateAchieved?: string;
}

/**
 * Superhuman service entity interfaces
 */
export interface DreamEntity {
  dream: string;
  category: string; // Flexible category (career, personal, relationship, creative, adventure, other, etc.)
  timeframe?: 'short' | 'medium' | 'long';
  steps?: string[];
  status?: 'active' | 'achieved' | 'deferred' | 'dreaming' | 'planning' | 'pursuing' | 'released';
  lastRevisited?: string;
}

export interface LifeChapterEntity {
  title: string;
  summary?: string;
  period?: string | { start: string; end?: string }; // Can be object or formatted string
  themes: string[];
  keyMoments?: string[];
  lessonsLearned?: string[];
}

export interface ValuesAlignmentEntity {
  value: string;
  alignment?: 'aligned' | 'conflicted' | 'exploring';
  alignmentScore?: number; // 0-1 numeric alignment score
  evidence?: string;
  recentExamples?: string[];
  tension?: string;
  lastChecked?: string;
}

export interface CapacityStateEntity {
  level: 'depleted' | 'low' | 'moderate' | 'good' | 'thriving' | 'critical' | 'optimal';
  factors: string[];
  recommendation: string;
  timestamp?: string;
}

/**
 * Calendar entity interfaces
 */
export interface CalendarEventEntity {
  title: string;
  date: string;
  time?: string;
  duration?: number;
  attendees?: string[];
  notes?: string;
  importance?: 'low' | 'medium' | 'high';
}

export interface MeetingMemoryEntity {
  meetingTitle: string;
  date: string;
  keyPoints: string[];
  actionItems: string[];
  mood?: string;
  attendees?: string[];
}

/**
 * Contact entity interfaces
 */
export interface ContactEntity {
  name: string;
  relationship: string;
  notes?: string;
  importantDates?: Array<{ label: string; date: string }>;
  communicationPreference?: string;
}

export interface RelationshipNoteEntity {
  contactName: string;
  note: string;
  context?: string;
  date?: string;
}

export interface GiftIdeaEntity {
  forContact: string;
  idea: string;
  occasion?: string;
  priceRange?: string;
  status?: 'idea' | 'purchased' | 'given';
}

/**
 * Coaching entity interfaces
 */
export interface CoachingInsightEntity {
  insight: string;
  context: string;
  personaId: string;
  category: 'behavior' | 'mindset' | 'habit' | 'relationship' | 'growth' | 'follow_up';
  actionable?: boolean;
}

export interface BreakthroughMomentEntity {
  description: string;
  trigger: string;
  impact: string;
  date?: string;
}

export interface StuckPatternEntity {
  pattern: string;
  context: string;
  frequency: 'occasional' | 'frequent' | 'chronic';
  attempts?: string[];
}

/**
 * Health entity interfaces
 */
export interface HealthGoalEntity {
  goal: string;
  category: 'fitness' | 'nutrition' | 'sleep' | 'mental' | 'general';
  targetDate?: string;
  progress?: number;
  status?: 'active' | 'achieved' | 'paused';
}

export interface WellnessCheckinEntity {
  mood: number; // 1-10
  energy: number; // 1-10
  notes?: string;
  stressLevel?: number; // 1-10
  timestamp: string;
}

/**
 * Media entity interfaces
 */
export interface MusicPreferenceEntity {
  artist?: string;
  genre?: string;
  song?: string;
  mood?: string;
  context?: string;
  emotionalAssociation?: string;
}

export interface BookHighlightEntity {
  bookTitle: string;
  author?: string;
  highlight: string;
  page?: number;
  reflection?: string;
}

export interface ReadingListEntity {
  title: string;
  authors: string[];
  status: 'want_to_read' | 'reading' | 'completed' | 'abandoned';
  currentPage?: number;
  rating?: number;
  notes?: string;
  listName?: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface CreativeMemoryEntity {
  discovery: string;
  type: 'music' | 'art' | 'podcast' | 'video' | 'creator';
  source?: string;
  emotionalImpact?: string;
  sharedWith?: string[];
}

/**
 * Wisdom entity interfaces
 */
export interface WisdomInsightEntity {
  insight: string;
  source?: string;
  category: 'life' | 'relationship' | 'work' | 'self' | 'universal';
  resonanceLevel?: number; // 1-10
}

export interface LifeLessonEntity {
  lesson: string;
  experience: string;
  dateOfRealization?: string;
  applicationArea?: string;
}

/**
 * Health summary entity
 */
export interface HealthSummaryEntity {
  date: string;
  sleepHours?: number;
  sleepQuality?: string;
  activity?: string;
  activityMinutes?: number;
  stepsCount?: number;
  heartRateAvg?: number;
  mood?: number;
  notes?: string;
}

/**
 * Conversation thread entity
 */
export interface ConversationThreadEntity {
  topic: string;
  participantAgents: string[];
  messageCount: number;
  startedAt: string;
  emotionalContext?: string;
  status: 'active' | 'paused' | 'closed';
}

/**
 * Visual memory entity
 */
export interface VisualMemoryEntity {
  description: string;
  imageType: 'photo' | 'screenshot' | 'artwork' | 'document';
  context?: string;
  emotions?: string[];
  people?: string[];
  timestamp: string;
}

/**
 * Reminder entity
 */
export interface ReminderEntity {
  title: string;
  description?: string;
  scheduledFor: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  priority?: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed' | 'snoozed' | 'cancelled';
}

// ============================================================================
// BETTER THAN HUMAN ENTITY INTERFACES - What makes us 200%
// ============================================================================

/**
 * Voice biomarker - Emotion detected from voice patterns
 * "We hear what you're not saying"
 */
export interface VoiceBiomarkerEntity {
  emotion: string; // Primary emotion detected
  confidence: number; // 0-1 confidence score
  voiceFeatures: {
    pitch?: 'low' | 'normal' | 'high' | 'variable';
    pace?: 'slow' | 'normal' | 'fast' | 'rushed';
    energy?: 'low' | 'moderate' | 'high';
    strain?: boolean; // Voice strain detected
  };
  context?: string; // What was being discussed
  sessionId: string;
  timestamp: string;
  insights?: string[]; // What this might mean
}

/**
 * Session summary - Perfect recall of every conversation
 * "We remember your whole story"
 */
export interface SessionSummaryEntity {
  sessionId: string;
  summary: string;
  keyTopics: string[];
  emotionalArc?: string; // How user's emotion changed
  actionItems?: string[];
  promises?: string[]; // Commitments made
  questionsRaised?: string[]; // Questions to follow up on
  breakthroughs?: string[]; // Aha moments
  duration: number; // minutes
  timestamp: string;
}

/**
 * Pattern insight - Hidden patterns discovered in user behavior
 * "We see patterns you can't see yourself"
 */
export interface PatternInsightEntity {
  pattern: string; // Description of the pattern
  category: 'emotional' | 'behavioral' | 'relational' | 'temporal' | 'linguistic';
  evidence: string[]; // Examples that support this pattern
  frequency: 'emerging' | 'consistent' | 'strong';
  significance: 'curious' | 'important' | 'critical';
  surfacedGently: boolean; // Has this been shared with user?
  discoveredAt: string;
  lastObserved: string;
}

/**
 * Behavioral pattern - Behavioral intelligence observations
 * "We understand how you tick"
 */
export interface BehavioralPatternEntity {
  behavior: string;
  trigger?: string; // What triggers this behavior
  context?: string[]; // When this happens
  frequency: 'rare' | 'occasional' | 'frequent' | 'consistent';
  impact?: 'positive' | 'neutral' | 'negative';
  relatedPatterns?: string[]; // Other patterns this connects to
  observations: string[];
  firstObserved: string;
  lastObserved: string;
}

/**
 * Cross-session thread - Connected topics across conversations
 * "We connect the dots across time"
 */
export interface CrossSessionThreadEntity {
  topic: string;
  sessionIds: string[]; // Sessions where this came up
  evolution: string; // How the topic has evolved
  relatedTopics?: string[];
  emotionalSignificance?: 'low' | 'medium' | 'high';
  lastMentioned: string;
  mentionCount: number;
}

/**
 * Correlation insight - Hidden connections between life areas
 * "We find connections you'd never notice"
 */
export interface CorrelationInsightEntity {
  connection: string; // Description of the correlation
  domainA: string; // First life area
  domainB: string; // Second life area
  strength: 'weak' | 'moderate' | 'strong';
  examples: string[];
  implications?: string; // What this might mean
  discoveredAt: string;
}

/**
 * Protective moment - When we knew to stay silent
 * "We know when NOT to say something"
 */
export interface ProtectiveMomentEntity {
  situation: string;
  whatWeDidntSay: string; // What we held back
  whyWeHeld: string; // Our reasoning
  userState: string; // How user was at the time
  outcome?: string; // How it played out
  timestamp: string;
}

/**
 * Voice recognition - Voice profile for recognition
 * "We know your voice"
 */
export interface VoiceRecognitionEntity {
  voiceId: string;
  voiceCharacteristics: {
    pitchRange?: string;
    speakingPace?: string;
    uniqueFeatures?: string[];
  };
  confidenceScore: number;
  enrolledAt: string;
  lastVerified: string;
  verificationCount: number;
}

// ============================================================================
// OUTREACH & ACTIONS
// ============================================================================

/**
 * Call result - On-behalf call outcomes
 */
export interface CallResultEntity {
  callId: string;
  contactName: string;
  purpose: string;
  outcome: 'answered' | 'voicemail' | 'busy' | 'no_answer' | 'failed';
  summary?: string;
  nextSteps?: string;
  duration?: number;
  capturedAt: string;
}

/**
 * Follow-up action - Actions to take after calls
 */
export interface FollowUpActionEntity {
  actionType: 'callback' | 'reminder' | 'notification' | 'task';
  description: string;
  relatedCallId?: string;
  scheduledFor?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
}

/**
 * Scheduled outreach - Proactive outreach scheduled
 */
export interface ScheduledOutreachEntity {
  type: 'check_in' | 'reminder' | 'celebration' | 'thinking_of_you';
  reason: string;
  scheduledFor: string;
  channel: 'voice' | 'sms' | 'push';
  priority: 'low' | 'normal' | 'high';
  status: 'pending' | 'sent' | 'cancelled';
  createdAt: string;
}

// ============================================================================
// LOCATION & PLACES ENTITY INTERFACES
// ============================================================================

/**
 * Favorite place - Places user loves
 */
export interface FavoritePlaceEntity {
  name: string;
  type:
    | 'restaurant'
    | 'cafe'
    | 'park'
    | 'store'
    | 'venue'
    | 'neighborhood'
    | 'city'
    | 'country'
    | 'other';
  location?: string;
  whyLoved: string;
  lastVisited?: string;
  sharedWith?: string[];
  memories?: string[];
}

/**
 * Location memory - Memories tied to locations
 */
export interface LocationMemoryEntity {
  place: string;
  memory: string;
  date?: string;
  emotion: string;
  peopleInvolved?: string[];
  significance: 'casual' | 'meaningful' | 'life_changing';
}

/**
 * Geographic preference - Travel/living preferences
 */
export interface GeographicPreferenceEntity {
  preferenceType: 'climate' | 'city_size' | 'culture' | 'lifestyle' | 'proximity';
  preference: string;
  reason?: string;
  examples?: string[];
}

// ============================================================================
// PETS & ANIMALS ENTITY INTERFACES
// ============================================================================

/**
 * Pet - Pet information
 */
export interface PetEntity {
  name: string;
  species: 'dog' | 'cat' | 'bird' | 'fish' | 'reptile' | 'small_mammal' | 'other';
  breed?: string;
  age?: number;
  birthday?: string;
  adoptionDate?: string;
  personality?: string[];
  quirks?: string[];
  favorites?: { food?: string; toy?: string; activity?: string };
}

/**
 * Pet health - Pet health records
 */
export interface PetHealthEntity {
  petName: string;
  recordType: 'vet_visit' | 'vaccination' | 'medication' | 'condition' | 'checkup';
  description: string;
  date: string;
  nextDue?: string;
  vetName?: string;
  notes?: string;
}

/**
 * Pet milestone - Pet milestones
 */
export interface PetMilestoneEntity {
  petName: string;
  milestone: string;
  type: 'birthday' | 'adoption_anniversary' | 'training' | 'health' | 'other';
  date: string;
  celebration?: string;
}

// ============================================================================
// PROPERTY & VEHICLES ENTITY INTERFACES
// ============================================================================

/**
 * Vehicle - Vehicle information
 */
export interface VehicleEntity {
  make: string;
  model: string;
  year: number;
  nickname?: string;
  purchaseDate?: string;
  mileage?: number;
  maintenanceSchedule?: {
    service: string;
    intervalMiles?: number;
    intervalMonths?: number;
    lastDone?: string;
  }[];
  insuranceExpiry?: string;
  registrationExpiry?: string;
}

/**
 * Home maintenance - Home upkeep tracking
 */
export interface HomeMaintenanceEntity {
  task: string;
  category:
    | 'hvac'
    | 'plumbing'
    | 'electrical'
    | 'exterior'
    | 'interior'
    | 'appliance'
    | 'seasonal'
    | 'other';
  frequency?: 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'as_needed';
  lastDone?: string;
  nextDue?: string;
  cost?: number;
  vendor?: string;
  notes?: string;
}

/**
 * Property asset - Real estate and property
 */
export interface PropertyAssetEntity {
  name: string;
  type: 'primary_residence' | 'rental' | 'vacation' | 'investment' | 'land';
  address?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  currentValue?: number;
  mortgageBalance?: number;
  notes?: string;
}

// ============================================================================
// INSURANCE & LEGAL ENTITY INTERFACES
// ============================================================================

/**
 * Insurance policy - Insurance policies
 */
export interface InsurancePolicyEntity {
  type: 'health' | 'auto' | 'home' | 'life' | 'disability' | 'umbrella' | 'pet' | 'other';
  provider: string;
  policyNumber?: string;
  premium?: number;
  premiumFrequency?: 'monthly' | 'quarterly' | 'annual';
  coverage?: string;
  expiryDate?: string;
  notes?: string;
}

/**
 * Legal document - Wills, contracts, legal matters
 */
export interface LegalDocumentEntity {
  type:
    | 'will'
    | 'trust'
    | 'power_of_attorney'
    | 'healthcare_directive'
    | 'contract'
    | 'deed'
    | 'other';
  description: string;
  status: 'draft' | 'active' | 'needs_update' | 'expired';
  createdDate?: string;
  lastUpdated?: string;
  attorney?: string;
  location?: string;
  notes?: string;
}

// ============================================================================
// CRISIS & SUPPORT ENTITY INTERFACES
// ============================================================================

/**
 * Crisis episode - Past crisis and resolution
 */
export interface CrisisEpisodeEntity {
  description: string;
  type: 'emotional' | 'health' | 'financial' | 'relationship' | 'work' | 'family' | 'other';
  severity: 'minor' | 'moderate' | 'major' | 'severe';
  date: string;
  duration?: string;
  resolution?: string;
  whatHelped: string[];
  supportReceived?: string[];
  lessonsLearned?: string[];
}

/**
 * Support received - Help user received from others
 */
export interface SupportReceivedEntity {
  from: string;
  type: 'emotional' | 'practical' | 'financial' | 'advice' | 'presence';
  description: string;
  date?: string;
  impact: string;
  acknowledged?: boolean;
}

// ============================================================================
// USER CORRECTIONS & LEARNING ENTITY INTERFACES
// ============================================================================

/**
 * User correction - When user corrects Ferni
 */
export interface UserCorrectionEntity {
  whatFerniSaid: string;
  whatUserCorrected: string;
  correctInformation: string;
  category: 'fact' | 'preference' | 'relationship' | 'event' | 'opinion' | 'other';
  personaId?: string;
  timestamp: string;
  appliedToMemory: boolean;
}

/**
 * Implicit preference - Preferences inferred from behavior
 */
export interface ImplicitPreferenceEntity {
  preference: string;
  category: 'communication' | 'timing' | 'topics' | 'persona' | 'format' | 'other';
  evidence: string[];
  confidence: number; // 0-1
  firstObserved: string;
  lastConfirmed: string;
  contradicted?: boolean;
}

// ============================================================================
// OUTREACH HISTORY ENTITY INTERFACES
// ============================================================================

/**
 * Outreach attempt - All outreach attempts
 */
export interface OutreachAttemptEntity {
  type:
    | 'check_in'
    | 'reminder'
    | 'celebration'
    | 'thinking_of_you'
    | 'follow_up'
    | 'crisis_support';
  channel: 'voice' | 'sms' | 'push' | 'email';
  reason: string;
  message?: string;
  personaId: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  scheduledAt?: string;
  sentAt: string;
  deliveredAt?: string;
  triggeredBy?: string; // What triggered this outreach
}

/**
 * Outreach response - User responses to outreach
 */
export interface OutreachResponseEntity {
  outreachId: string;
  responseType: 'engaged' | 'acknowledged' | 'dismissed' | 'ignored' | 'negative_feedback';
  responseTime?: number; // Seconds to respond
  sentiment?: 'positive' | 'neutral' | 'negative';
  feedback?: string;
  ledToSession?: boolean;
  timestamp: string;
}

/**
 * Outreach preference - User outreach preferences
 */
export interface OutreachPreferenceEntity {
  preferredChannels: ('voice' | 'sms' | 'push' | 'email')[];
  preferredTimes?: { start: string; end: string }[];
  preferredDays?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
  frequency: 'rarely' | 'occasionally' | 'regularly' | 'frequently';
  doNotDisturb?: { start: string; end: string }[];
  topicPreferences?: { topic: string; wantOutreach: boolean }[];
}

// ============================================================================
// PERSONA INTERACTION ENTITY INTERFACES
// ============================================================================

/**
 * Persona affinity - Which persona user prefers
 */
export interface PersonaAffinityEntity {
  personaId: string;
  personaName: string;
  affinityScore: number; // 0-1
  totalSessions: number;
  averageSessionLength: number; // minutes
  topTopics: string[];
  emotionalResonance: 'low' | 'medium' | 'high';
  lastInteraction: string;
  notes?: string;
}

/**
 * Handoff preference - Handoff routing preferences
 */
export interface HandoffPreferenceEntity {
  fromPersona: string;
  toPersona: string;
  triggerTopics: string[];
  userApproved: boolean;
  successfulHandoffs: number;
  failedHandoffs: number;
  averageSatisfaction?: number; // 1-5
}

/**
 * Persona interaction history - History with each persona
 */
export interface PersonaInteractionHistoryEntity {
  personaId: string;
  interactionType: 'session' | 'handoff' | 'brief_mention' | 'rejected';
  date: string;
  duration?: number;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  outcome?: string;
}

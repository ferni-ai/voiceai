/**
 * Unified Data Layer Types
 *
 * Comprehensive type definitions for the semantic data store architecture.
 * Supports 98 entity types across all Ferni domains.
 *
 * @module services/data-layer/types
 */
export type StoreType = 'productivity' | 'financial' | 'life-data' | 'trust' | 'superhuman' | 'superhuman-intelligence' | 'calendar' | 'contacts' | 'coaching' | 'scheduling' | 'conversation' | 'memory' | 'health' | 'media' | 'career' | 'emotional' | 'wisdom' | 'session-context' | 'life-stage' | 'outreach' | 'tool_output';
export type ChangeType = 'create' | 'update' | 'delete';
export type EntityType = 'habit' | 'task' | 'routine' | 'bill' | 'medication' | 'package' | 'budget' | 'savings_goal' | 'subscription' | 'spending_trigger' | 'investment' | 'debt' | 'milestone' | 'life_goal' | 'retirement_plan' | 'note' | 'journal' | 'trip' | 'commitment' | 'boundary' | 'growth_reflection' | 'inside_joke' | 'small_win' | 'thinking_of_you' | 'reading_between_lines' | 'tonal_memory' | 'vulnerability_moment' | 'trust_milestone' | 'curiosity_mention' | 'between_session_thinking' | 'persona_growth' | 'conversation_texture' | 'dream' | 'life_chapter' | 'values_alignment' | 'relationship_milestone' | 'capacity_state' | 'seasonal_pattern' | 'emotional_first_aid' | 'predictive_insight' | 'commitment_keeper' | 'relationship_network' | 'conflict_memory' | 'recovery_milestone' | 'calendar_event' | 'meeting_memory' | 'recurring_commitment' | 'calendar_conflict' | 'meeting_prep' | 'availability_pattern' | 'time_block' | 'deadline' | 'contact' | 'relationship_note' | 'gift_idea' | 'important_date' | 'contact_interaction' | 'relationship_health' | 'family_member' | 'friend_memory' | 'professional_contact' | 'communication_preference' | 'coaching_insight' | 'breakthrough_moment' | 'stuck_pattern' | 'reframe_suggestion' | 'growth_edge' | 'strength_identified' | 'blind_spot' | 'accountability_item' | 'behavior_change' | 'motivation_insight' | 'health_goal' | 'health_summary' | 'sleep_pattern' | 'energy_level' | 'workout' | 'wellness_checkin' | 'mental_health_note' | 'nutrition_goal' | 'body_awareness' | 'stress_trigger' | 'recovery_practice' | 'emotional_pattern' | 'mood_trigger' | 'coping_strategy' | 'behavioral_trigger' | 'decision_pattern' | 'procrastination_pattern' | 'anxiety_pattern' | 'joy_trigger' | 'music_preference' | 'emotional_song' | 'playlist_memory' | 'book_highlight' | 'reading_list' | 'reading_goal' | 'podcast_insight' | 'movie_preference' | 'game_preference' | 'content_recommendation' | 'media_memory' | 'creative_memory' | 'career_goal' | 'job_search' | 'skill_development' | 'professional_network' | 'work_achievement' | 'career_reflection' | 'work_challenge' | 'career_aspiration' | 'life_thesis_component' | 'value_statement' | 'purpose_exploration' | 'wisdom_insight' | 'life_lesson' | 'perspective_shift' | 'existential_question' | 'legacy_thought' | 'travel_preference' | 'bucket_list_item' | 'home_project' | 'creative_project' | 'learning_resource' | 'decision_record' | 'conversation_thread' | 'visual_memory' | 'reminder' | 'gift_idea' | 'voice_biomarker' | 'session_summary' | 'pattern_insight' | 'behavioral_pattern' | 'cross_session_thread' | 'correlation_insight' | 'protective_moment' | 'voice_recognition' | 'call_result' | 'follow_up_action' | 'scheduled_outreach' | 'new_parent' | 'empty_nest' | 'infidelity_recovery' | 'health_diagnosis' | 'job_loss' | 'sobriety' | 'sandwich_generation' | 'blended_family' | 'coming_out' | 'faith_transition' | 'favorite_place' | 'location_memory' | 'geographic_preference' | 'pet' | 'pet_health' | 'pet_milestone' | 'vehicle' | 'home_maintenance' | 'property_asset' | 'insurance_policy' | 'legal_document' | 'crisis_episode' | 'support_received' | 'user_correction' | 'implicit_preference' | 'outreach_attempt' | 'outreach_response' | 'outreach_preference' | 'persona_affinity' | 'handoff_preference' | 'persona_interaction_history';
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
import type { MayaFinancialData } from '../stores/financial-store.js';
import type { UserLifeData } from '../stores/life-data-store.js';
import type { ProductivityData } from '../stores/productivity-types.js';
/**
 * Unified user context combining all data sources
 */
export interface UnifiedUserContext {
    userId: string;
    timestamp: Date;
    productivity: ProductivityData | null;
    financial: MayaFinancialData | null;
    lifeData: UserLifeData | null;
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
export type MemoryType = 'habit' | 'financial' | 'milestone' | 'task' | 'memory' | 'routine' | 'trust' | 'coaching' | 'health' | 'calendar' | 'contact' | 'wisdom' | 'better_than_human' | 'media' | 'career' | 'goal';
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
    category: string;
    timeframe?: 'short' | 'medium' | 'long';
    steps?: string[];
    status?: 'active' | 'achieved' | 'deferred' | 'dreaming' | 'planning' | 'pursuing' | 'released';
    lastRevisited?: string;
}
export interface LifeChapterEntity {
    title: string;
    summary?: string;
    period?: string | {
        start: string;
        end?: string;
    };
    themes: string[];
    keyMoments?: string[];
    lessonsLearned?: string[];
}
export interface ValuesAlignmentEntity {
    value: string;
    alignment?: 'aligned' | 'conflicted' | 'exploring';
    alignmentScore?: number;
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
    importantDates?: Array<{
        label: string;
        date: string;
    }>;
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
    mood: number;
    energy: number;
    notes?: string;
    stressLevel?: number;
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
    resonanceLevel?: number;
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
/**
 * Voice biomarker - Emotion detected from voice patterns
 * "We hear what you're not saying"
 */
export interface VoiceBiomarkerEntity {
    emotion: string;
    confidence: number;
    voiceFeatures: {
        pitch?: 'low' | 'normal' | 'high' | 'variable';
        pace?: 'slow' | 'normal' | 'fast' | 'rushed';
        energy?: 'low' | 'moderate' | 'high';
        strain?: boolean;
    };
    context?: string;
    sessionId: string;
    timestamp: string;
    insights?: string[];
}
/**
 * Session summary - Perfect recall of every conversation
 * "We remember your whole story"
 */
export interface SessionSummaryEntity {
    sessionId: string;
    summary: string;
    keyTopics: string[];
    emotionalArc?: string;
    actionItems?: string[];
    promises?: string[];
    questionsRaised?: string[];
    breakthroughs?: string[];
    duration: number;
    timestamp: string;
}
/**
 * Pattern insight - Hidden patterns discovered in user behavior
 * "We see patterns you can't see yourself"
 */
export interface PatternInsightEntity {
    pattern: string;
    category: 'emotional' | 'behavioral' | 'relational' | 'temporal' | 'linguistic';
    evidence: string[];
    frequency: 'emerging' | 'consistent' | 'strong';
    significance: 'curious' | 'important' | 'critical';
    surfacedGently: boolean;
    discoveredAt: string;
    lastObserved: string;
}
/**
 * Behavioral pattern - Behavioral intelligence observations
 * "We understand how you tick"
 */
export interface BehavioralPatternEntity {
    behavior: string;
    trigger?: string;
    context?: string[];
    frequency: 'rare' | 'occasional' | 'frequent' | 'consistent';
    impact?: 'positive' | 'neutral' | 'negative';
    relatedPatterns?: string[];
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
    sessionIds: string[];
    evolution: string;
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
    connection: string;
    domainA: string;
    domainB: string;
    strength: 'weak' | 'moderate' | 'strong';
    examples: string[];
    implications?: string;
    discoveredAt: string;
}
/**
 * Protective moment - When we knew to stay silent
 * "We know when NOT to say something"
 */
export interface ProtectiveMomentEntity {
    situation: string;
    whatWeDidntSay: string;
    whyWeHeld: string;
    userState: string;
    outcome?: string;
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
/**
 * Favorite place - Places user loves
 */
export interface FavoritePlaceEntity {
    name: string;
    type: 'restaurant' | 'cafe' | 'park' | 'store' | 'venue' | 'neighborhood' | 'city' | 'country' | 'other';
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
    favorites?: {
        food?: string;
        toy?: string;
        activity?: string;
    };
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
    category: 'hvac' | 'plumbing' | 'electrical' | 'exterior' | 'interior' | 'appliance' | 'seasonal' | 'other';
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
    type: 'will' | 'trust' | 'power_of_attorney' | 'healthcare_directive' | 'contract' | 'deed' | 'other';
    description: string;
    status: 'draft' | 'active' | 'needs_update' | 'expired';
    createdDate?: string;
    lastUpdated?: string;
    attorney?: string;
    location?: string;
    notes?: string;
}
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
    confidence: number;
    firstObserved: string;
    lastConfirmed: string;
    contradicted?: boolean;
}
/**
 * Outreach attempt - All outreach attempts
 */
export interface OutreachAttemptEntity {
    type: 'check_in' | 'reminder' | 'celebration' | 'thinking_of_you' | 'follow_up' | 'crisis_support';
    channel: 'voice' | 'sms' | 'push' | 'email';
    reason: string;
    message?: string;
    personaId: string;
    status: 'pending' | 'sent' | 'delivered' | 'failed';
    scheduledAt?: string;
    sentAt: string;
    deliveredAt?: string;
    triggeredBy?: string;
}
/**
 * Outreach response - User responses to outreach
 */
export interface OutreachResponseEntity {
    outreachId: string;
    responseType: 'engaged' | 'acknowledged' | 'dismissed' | 'ignored' | 'negative_feedback';
    responseTime?: number;
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
    preferredTimes?: {
        start: string;
        end: string;
    }[];
    preferredDays?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
    frequency: 'rarely' | 'occasionally' | 'regularly' | 'frequently';
    doNotDisturb?: {
        start: string;
        end: string;
    }[];
    topicPreferences?: {
        topic: string;
        wantOutreach: boolean;
    }[];
}
/**
 * Persona affinity - Which persona user prefers
 */
export interface PersonaAffinityEntity {
    personaId: string;
    personaName: string;
    affinityScore: number;
    totalSessions: number;
    averageSessionLength: number;
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
    averageSatisfaction?: number;
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
//# sourceMappingURL=types.d.ts.map
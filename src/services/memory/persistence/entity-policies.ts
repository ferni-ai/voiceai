/**
 * Entity Indexing Policy Definitions
 *
 * Defines what data gets indexed to semantic memory and how.
 * Not everything needs semantic search - use these policies to control costs
 * and search quality.
 *
 * NOTE: This file contains ~130 pure data declarations. It exceeds 500 lines
 * because each policy is a ~15-line typed object literal, and we support
 * 130+ entity types. Splitting by domain would create excessive file fragmentation
 * without improving readability. This is intentionally kept as a single
 * data-declaration file.
 *
 * @module services/memory/persistence/entity-policies
 */

import type { EntityIndexingPolicy, IndexingPolicy } from '../../data-layer/types.js';

// ============================================================================
// PRODUCTIVITY POLICIES
// ============================================================================

const habitPolicy: EntityIndexingPolicy = {
  entityType: 'habit',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 20,
  },
  contentFields: ['name', 'description', 'frequency', 'streakCurrent'],
  ttlDays: 0,
};

const taskPolicy: EntityIndexingPolicy = {
  entityType: 'task',
  priority: 'important_only',
  conditions: {
    activeOnly: true,
    importantOnly: true,
    maxPerUser: 15,
  },
  contentFields: ['title', 'description', 'priority', 'dueDate'],
  ttlDays: 30,
};

const routinePolicy: EntityIndexingPolicy = {
  entityType: 'routine',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 10,
  },
  contentFields: ['name', 'description', 'timeOfDay', 'steps'],
  ttlDays: 0,
};

const billPolicy: EntityIndexingPolicy = {
  entityType: 'bill',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 20,
  },
  contentFields: ['name', 'amount', 'dueDate', 'frequency'],
  ttlDays: 60,
};

const medicationPolicy: EntityIndexingPolicy = {
  entityType: 'medication',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 20,
  },
  contentFields: ['name', 'dosage', 'frequency', 'purpose'],
  ttlDays: 0,
};

const packagePolicy: EntityIndexingPolicy = {
  entityType: 'package',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 10,
  },
  contentFields: ['description', 'carrier', 'expectedDate'],
  ttlDays: 30,
};

// ============================================================================
// FINANCIAL POLICIES
// ============================================================================

const budgetPolicy: EntityIndexingPolicy = {
  entityType: 'budget',
  priority: 'always',
  conditions: {
    maxPerUser: 5,
  },
  contentFields: ['name', 'monthlyLimit', 'spent', 'remaining', 'categories'],
  ttlDays: 0,
};

const savingsGoalPolicy: EntityIndexingPolicy = {
  entityType: 'savings_goal',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 10,
  },
  contentFields: ['name', 'targetAmount', 'currentAmount', 'deadline', 'priority'],
  ttlDays: 0,
};

const subscriptionPolicy: EntityIndexingPolicy = {
  entityType: 'subscription',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 30,
  },
  contentFields: ['name', 'amount', 'frequency', 'category', 'usefulness'],
  ttlDays: 90,
};

const spendingTriggerPolicy: EntityIndexingPolicy = {
  entityType: 'spending_trigger',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['trigger', 'emotion', 'category', 'frequency'],
  ttlDays: 0,
};

const investmentPolicy: EntityIndexingPolicy = {
  entityType: 'investment',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['name', 'type', 'value', 'allocation'],
  ttlDays: 0,
};

const debtPolicy: EntityIndexingPolicy = {
  entityType: 'debt',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 15,
  },
  contentFields: ['name', 'amount', 'interestRate', 'minimumPayment'],
  ttlDays: 0,
};

// ============================================================================
// LIFE DATA POLICIES
// ============================================================================

const milestonePolicy: EntityIndexingPolicy = {
  entityType: 'milestone',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 10,
  },
  contentFields: ['name', 'category', 'status', 'targetDate', 'notes'],
  ttlDays: 0,
};

const lifeGoalPolicy: EntityIndexingPolicy = {
  entityType: 'life_goal',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 15,
  },
  contentFields: ['title', 'description', 'category', 'timeframe', 'progress'],
  ttlDays: 0,
};

const retirementPlanPolicy: EntityIndexingPolicy = {
  entityType: 'retirement_plan',
  priority: 'always',
  conditions: {
    maxPerUser: 3,
  },
  contentFields: ['style', 'targetAge', 'monthlyTarget', 'currentSavings', 'vision'],
  ttlDays: 0,
};

const notePolicy: EntityIndexingPolicy = {
  entityType: 'note',
  priority: 'never',
  conditions: {},
  contentFields: [],
  ttlDays: 0,
};

const journalPolicy: EntityIndexingPolicy = {
  entityType: 'journal',
  priority: 'important_only',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['title', 'content', 'mood', 'tags'],
  ttlDays: 365,
};

const tripPolicy: EntityIndexingPolicy = {
  entityType: 'trip',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 5,
  },
  contentFields: ['destination', 'startDate', 'endDate', 'purpose'],
  ttlDays: 90,
};

// ============================================================================
// TRUST SYSTEM POLICIES
// ============================================================================

const commitmentPolicy: EntityIndexingPolicy = {
  entityType: 'commitment',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 50,
  },
  contentFields: ['description', 'madeBy', 'status', 'deadline'],
  ttlDays: 0,
};

const boundaryPolicy: EntityIndexingPolicy = {
  entityType: 'boundary',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['topic', 'reason', 'severity'],
  ttlDays: 0,
};

const growthReflectionPolicy: EntityIndexingPolicy = {
  entityType: 'growth_reflection',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['observation', 'area', 'evidence'],
  ttlDays: 0,
};

const insideJokePolicy: EntityIndexingPolicy = {
  entityType: 'inside_joke',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['joke', 'context', 'sharedMoment'],
  ttlDays: 0,
};

const smallWinPolicy: EntityIndexingPolicy = {
  entityType: 'small_win',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['win', 'effort', 'celebration'],
  ttlDays: 365,
};

const thinkingOfYouPolicy: EntityIndexingPolicy = {
  entityType: 'thinking_of_you',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['reason', 'trigger', 'message'],
  ttlDays: 180,
};

const readingBetweenLinesPolicy: EntityIndexingPolicy = {
  entityType: 'reading_between_lines',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['observation', 'whatWasSaid', 'whatWasNotSaid'],
  ttlDays: 180,
};

const tonalMemoryPolicy: EntityIndexingPolicy = {
  entityType: 'tonal_memory',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['pattern', 'context', 'emotionalState'],
  ttlDays: 0,
};

const vulnerabilityMomentPolicy: EntityIndexingPolicy = {
  entityType: 'vulnerability_moment',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['topic', 'context', 'depth'],
  ttlDays: 0,
};

const trustMilestonePolicy: EntityIndexingPolicy = {
  entityType: 'trust_milestone',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['milestone', 'significance', 'stage'],
  ttlDays: 0,
};

// ============================================================================
// MEMORY ENHANCEMENT POLICIES
// ============================================================================

const curiosityMentionPolicy: EntityIndexingPolicy = {
  entityType: 'curiosity_mention',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['entity', 'entityType', 'originalContext', 'priority'],
  ttlDays: 90,
};

const betweenSessionThinkingPolicy: EntityIndexingPolicy = {
  entityType: 'between_session_thinking',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['topic', 'reflection', 'depth', 'emotionalTone'],
  ttlDays: 0,
};

const personaGrowthPolicy: EntityIndexingPolicy = {
  entityType: 'persona_growth',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['personaId', 'growthType', 'description', 'userInfluence'],
  ttlDays: 0,
};

const conversationTexturePolicy: EntityIndexingPolicy = {
  entityType: 'conversation_texture',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['personaId', 'tone', 'depth', 'rhythm', 'topics', 'energyPattern'],
  ttlDays: 180,
};

// ============================================================================
// SUPERHUMAN POLICIES
// ============================================================================

const dreamPolicy: EntityIndexingPolicy = {
  entityType: 'dream',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 30,
  },
  contentFields: ['dream', 'category', 'timeframe', 'steps'],
  ttlDays: 0,
};

const lifeChapterPolicy: EntityIndexingPolicy = {
  entityType: 'life_chapter',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['title', 'summary', 'period', 'themes'],
  ttlDays: 0,
};

const valuesAlignmentPolicy: EntityIndexingPolicy = {
  entityType: 'values_alignment',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['value', 'alignment', 'evidence'],
  ttlDays: 0,
};

const capacityStatePolicy: EntityIndexingPolicy = {
  entityType: 'capacity_state',
  priority: 'always',
  conditions: {
    maxPerUser: 10,
  },
  contentFields: ['level', 'factors', 'recommendation'],
  ttlDays: 30,
};

const relationshipMilestonePolicy: EntityIndexingPolicy = {
  entityType: 'relationship_milestone',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['milestone', 'relationship', 'significance'],
  ttlDays: 0,
};

const seasonalPatternPolicy: EntityIndexingPolicy = {
  entityType: 'seasonal_pattern',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['pattern', 'season', 'observation'],
  ttlDays: 0,
};

const emotionalFirstAidPolicy: EntityIndexingPolicy = {
  entityType: 'emotional_first_aid',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['situation', 'support', 'outcome'],
  ttlDays: 365,
};

const predictiveInsightPolicy: EntityIndexingPolicy = {
  entityType: 'predictive_insight',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['prediction', 'basis', 'confidence'],
  ttlDays: 90,
};

const commitmentKeeperPolicy: EntityIndexingPolicy = {
  entityType: 'commitment_keeper',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 30,
  },
  contentFields: ['commitment', 'madeOn', 'status'],
  ttlDays: 0,
};

const relationshipNetworkPolicy: EntityIndexingPolicy = {
  entityType: 'relationship_network',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['person', 'relationship', 'connectionStrength'],
  ttlDays: 0,
};

const conflictMemoryPolicy: EntityIndexingPolicy = {
  entityType: 'conflict_memory',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['conflict', 'parties', 'resolution', 'lessonsLearned'],
  ttlDays: 0,
};

const recoveryMilestonePolicy: EntityIndexingPolicy = {
  entityType: 'recovery_milestone',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['milestone', 'recoveryFrom', 'significance'],
  ttlDays: 0,
};

// ============================================================================
// CALENDAR POLICIES
// ============================================================================

const calendarEventPolicy: EntityIndexingPolicy = {
  entityType: 'calendar_event',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 50,
  },
  contentFields: ['title', 'date', 'time', 'attendees', 'notes'],
  ttlDays: 30,
};

const meetingMemoryPolicy: EntityIndexingPolicy = {
  entityType: 'meeting_memory',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['meetingTitle', 'keyPoints', 'actionItems'],
  ttlDays: 180,
};

const recurringCommitmentPolicy: EntityIndexingPolicy = {
  entityType: 'recurring_commitment',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['commitment', 'frequency', 'importance'],
  ttlDays: 0,
};

const calendarConflictPolicy: EntityIndexingPolicy = {
  entityType: 'calendar_conflict',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 10,
  },
  contentFields: ['events', 'date'],
  ttlDays: 14,
};

const meetingPrepPolicy: EntityIndexingPolicy = {
  entityType: 'meeting_prep',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['meetingTitle', 'prepNotes', 'objectives'],
  ttlDays: 30,
};

const availabilityPatternPolicy: EntityIndexingPolicy = {
  entityType: 'availability_pattern',
  priority: 'always',
  conditions: {
    maxPerUser: 10,
  },
  contentFields: ['pattern', 'dayType', 'timeRange'],
  ttlDays: 0,
};

const timeBlockPolicy: EntityIndexingPolicy = {
  entityType: 'time_block',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 20,
  },
  contentFields: ['purpose', 'date', 'startTime', 'endTime'],
  ttlDays: 30,
};

const deadlinePolicy: EntityIndexingPolicy = {
  entityType: 'deadline',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 30,
  },
  contentFields: ['title', 'date', 'project', 'importance'],
  ttlDays: 14,
};

// ============================================================================
// CONTACTS POLICIES
// ============================================================================

const contactPolicy: EntityIndexingPolicy = {
  entityType: 'contact',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['name', 'relationship', 'notes', 'importantDates'],
  ttlDays: 0,
};

const relationshipNotePolicy: EntityIndexingPolicy = {
  entityType: 'relationship_note',
  priority: 'always',
  conditions: {
    maxPerUser: 200,
  },
  contentFields: ['contactName', 'note', 'context'],
  ttlDays: 365,
};

const giftIdeaPolicy: EntityIndexingPolicy = {
  entityType: 'gift_idea',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 50,
  },
  contentFields: ['forContact', 'idea', 'occasion', 'priceRange'],
  ttlDays: 365,
};

const importantDatePolicy: EntityIndexingPolicy = {
  entityType: 'important_date',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['contactName', 'date', 'type', 'label'],
  ttlDays: 0,
};

const contactInteractionPolicy: EntityIndexingPolicy = {
  entityType: 'contact_interaction',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['contactName', 'interactionType', 'summary'],
  ttlDays: 180,
};

const relationshipHealthPolicy: EntityIndexingPolicy = {
  entityType: 'relationship_health',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['contactName', 'health', 'observations'],
  ttlDays: 90,
};

const familyMemberPolicy: EntityIndexingPolicy = {
  entityType: 'family_member',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['name', 'relation', 'notes', 'importantInfo'],
  ttlDays: 0,
};

const friendMemoryPolicy: EntityIndexingPolicy = {
  entityType: 'friend_memory',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['friendName', 'memory', 'sharedExperience'],
  ttlDays: 0,
};

const professionalContactPolicy: EntityIndexingPolicy = {
  entityType: 'professional_contact',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['name', 'company', 'role', 'relationship'],
  ttlDays: 0,
};

const communicationPreferencePolicy: EntityIndexingPolicy = {
  entityType: 'communication_preference',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['contactName', 'preferredChannel', 'bestTimes'],
  ttlDays: 0,
};

// ============================================================================
// COACHING POLICIES
// ============================================================================

const coachingInsightPolicy: EntityIndexingPolicy = {
  entityType: 'coaching_insight',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['insight', 'context', 'category'],
  ttlDays: 0,
};

const breakthroughMomentPolicy: EntityIndexingPolicy = {
  entityType: 'breakthrough_moment',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['description', 'trigger', 'impact'],
  ttlDays: 0,
};

const stuckPatternPolicy: EntityIndexingPolicy = {
  entityType: 'stuck_pattern',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['pattern', 'context', 'frequency', 'attempts'],
  ttlDays: 0,
};

const reframeSuggestionPolicy: EntityIndexingPolicy = {
  entityType: 'reframe_suggestion',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['originalPerspective', 'reframe', 'impact'],
  ttlDays: 365,
};

const growthEdgePolicy: EntityIndexingPolicy = {
  entityType: 'growth_edge',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['area', 'currentState', 'targetState'],
  ttlDays: 0,
};

const strengthIdentifiedPolicy: EntityIndexingPolicy = {
  entityType: 'strength_identified',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['strength', 'evidence', 'category'],
  ttlDays: 0,
};

const blindSpotPolicy: EntityIndexingPolicy = {
  entityType: 'blind_spot',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['blindSpot', 'observation', 'impact'],
  ttlDays: 0,
};

const accountabilityItemPolicy: EntityIndexingPolicy = {
  entityType: 'accountability_item',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 20,
  },
  contentFields: ['item', 'agreedOn', 'dueDate', 'status'],
  ttlDays: 90,
};

const behaviorChangePolicy: EntityIndexingPolicy = {
  entityType: 'behavior_change',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['behavior', 'from', 'to', 'progress'],
  ttlDays: 0,
};

const motivationInsightPolicy: EntityIndexingPolicy = {
  entityType: 'motivation_insight',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['insight', 'context', 'motivationType'],
  ttlDays: 0,
};

// ============================================================================
// HEALTH POLICIES
// ============================================================================

const healthGoalPolicy: EntityIndexingPolicy = {
  entityType: 'health_goal',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 10,
  },
  contentFields: ['goal', 'category', 'targetDate', 'progress'],
  ttlDays: 0,
};

const sleepPatternPolicy: EntityIndexingPolicy = {
  entityType: 'sleep_pattern',
  priority: 'always',
  conditions: {
    maxPerUser: 10,
  },
  contentFields: ['pattern', 'averageHours', 'quality'],
  ttlDays: 90,
};

const energyLevelPolicy: EntityIndexingPolicy = {
  entityType: 'energy_level',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['level', 'timeOfDay', 'factors'],
  ttlDays: 30,
};

const workoutPolicy: EntityIndexingPolicy = {
  entityType: 'workout',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['activity', 'duration', 'intensity'],
  ttlDays: 90,
};

const wellnessCheckinPolicy: EntityIndexingPolicy = {
  entityType: 'wellness_checkin',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['mood', 'energy', 'notes', 'stressLevel'],
  ttlDays: 60,
};

const mentalHealthNotePolicy: EntityIndexingPolicy = {
  entityType: 'mental_health_note',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['note', 'category', 'severity', 'coping'],
  ttlDays: 0,
};

const nutritionGoalPolicy: EntityIndexingPolicy = {
  entityType: 'nutrition_goal',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 10,
  },
  contentFields: ['goal', 'category', 'currentStatus'],
  ttlDays: 0,
};

const bodyAwarenessPolicy: EntityIndexingPolicy = {
  entityType: 'body_awareness',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['observation', 'bodyPart', 'context'],
  ttlDays: 180,
};

const stressTriggerPolicy: EntityIndexingPolicy = {
  entityType: 'stress_trigger',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['trigger', 'context', 'severity', 'copingStrategies'],
  ttlDays: 0,
};

const recoveryPracticePolicy: EntityIndexingPolicy = {
  entityType: 'recovery_practice',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['practice', 'category', 'effectiveness'],
  ttlDays: 0,
};

// ============================================================================
// MEDIA POLICIES
// ============================================================================

const musicPreferencePolicy: EntityIndexingPolicy = {
  entityType: 'music_preference',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['artist', 'genre', 'song', 'mood', 'emotionalAssociation'],
  ttlDays: 0,
};

const emotionalSongPolicy: EntityIndexingPolicy = {
  entityType: 'emotional_song',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['song', 'artist', 'emotion', 'memory'],
  ttlDays: 0,
};

const playlistMemoryPolicy: EntityIndexingPolicy = {
  entityType: 'playlist_memory',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['playlistName', 'association', 'mood'],
  ttlDays: 0,
};

const bookHighlightPolicy: EntityIndexingPolicy = {
  entityType: 'book_highlight',
  priority: 'always',
  conditions: {
    maxPerUser: 100,
  },
  contentFields: ['bookTitle', 'author', 'highlight', 'reflection'],
  ttlDays: 0,
};

const readingGoalPolicy: EntityIndexingPolicy = {
  entityType: 'reading_goal',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 5,
  },
  contentFields: ['goal', 'booksTarget', 'booksRead', 'genres'],
  ttlDays: 365,
};

const podcastInsightPolicy: EntityIndexingPolicy = {
  entityType: 'podcast_insight',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['podcastName', 'episodeTitle', 'insight', 'topic'],
  ttlDays: 365,
};

const moviePreferencePolicy: EntityIndexingPolicy = {
  entityType: 'movie_preference',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['title', 'genre', 'reaction', 'memorable'],
  ttlDays: 0,
};

const gamePreferencePolicy: EntityIndexingPolicy = {
  entityType: 'game_preference',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['game', 'platform', 'genre', 'playStyle'],
  ttlDays: 0,
};

const contentRecommendationPolicy: EntityIndexingPolicy = {
  entityType: 'content_recommendation',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['content', 'type', 'reason', 'feedback'],
  ttlDays: 180,
};

const mediaMemoryPolicy: EntityIndexingPolicy = {
  entityType: 'media_memory',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['media', 'type', 'memory'],
  ttlDays: 0,
};

// ============================================================================
// CAREER POLICIES
// ============================================================================

const careerGoalPolicy: EntityIndexingPolicy = {
  entityType: 'career_goal',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 10,
  },
  contentFields: ['goal', 'category', 'timeframe', 'progress'],
  ttlDays: 0,
};

const jobSearchPolicy: EntityIndexingPolicy = {
  entityType: 'job_search',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 5,
  },
  contentFields: ['targetRole', 'targetCompanies', 'status'],
  ttlDays: 180,
};

const skillDevelopmentPolicy: EntityIndexingPolicy = {
  entityType: 'skill_development',
  priority: 'always',
  conditions: {
    maxPerUser: 20,
  },
  contentFields: ['skill', 'currentLevel', 'targetLevel', 'method'],
  ttlDays: 0,
};

const professionalNetworkPolicy: EntityIndexingPolicy = {
  entityType: 'professional_network',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['person', 'company', 'role', 'connectionType'],
  ttlDays: 0,
};

const workAchievementPolicy: EntityIndexingPolicy = {
  entityType: 'work_achievement',
  priority: 'always',
  conditions: {
    maxPerUser: 50,
  },
  contentFields: ['achievement', 'impact', 'category'],
  ttlDays: 0,
};

const careerReflectionPolicy: EntityIndexingPolicy = {
  entityType: 'career_reflection',
  priority: 'always',
  conditions: {
    maxPerUser: 30,
  },
  contentFields: ['reflection', 'topic', 'insight'],
  ttlDays: 365,
};

const workChallengePolicy: EntityIndexingPolicy = {
  entityType: 'work_challenge',
  priority: 'active_only',
  conditions: {
    activeOnly: true,
    maxPerUser: 10,
  },
  contentFields: ['challenge', 'context', 'strategies'],
  ttlDays: 90,
};

const careerAspirationPolicy: EntityIndexingPolicy = {
  entityType: 'career_aspiration',
  priority: 'always',
  conditions: {
    maxPerUser: 10,
  },
  contentFields: ['aspiration', 'why', 'timeframe', 'firstSteps'],
  ttlDays: 0,
};

// ============================================================================
// WISDOM POLICIES
// ============================================================================

const lifeThesisComponentPolicy: EntityIndexingPolicy = {
  entityType: 'life_thesis_component',
  priority: 'always',
  conditions: { maxPerUser: 30 },
  contentFields: ['component', 'category', 'description'],
  ttlDays: 0,
};

const valueStatementPolicy: EntityIndexingPolicy = {
  entityType: 'value_statement',
  priority: 'always',
  conditions: { maxPerUser: 20 },
  contentFields: ['value', 'meaning', 'evidence'],
  ttlDays: 0,
};

const purposeExplorationPolicy: EntityIndexingPolicy = {
  entityType: 'purpose_exploration',
  priority: 'always',
  conditions: { maxPerUser: 20 },
  contentFields: ['exploration', 'trigger', 'insights'],
  ttlDays: 0,
};

const wisdomInsightPolicy: EntityIndexingPolicy = {
  entityType: 'wisdom_insight',
  priority: 'always',
  conditions: { maxPerUser: 100 },
  contentFields: ['insight', 'source', 'category'],
  ttlDays: 0,
};

const lifeLessonPolicy: EntityIndexingPolicy = {
  entityType: 'life_lesson',
  priority: 'always',
  conditions: { maxPerUser: 50 },
  contentFields: ['lesson', 'experience', 'applicationArea'],
  ttlDays: 0,
};

const perspectiveShiftPolicy: EntityIndexingPolicy = {
  entityType: 'perspective_shift',
  priority: 'always',
  conditions: { maxPerUser: 30 },
  contentFields: ['from', 'to', 'catalyst', 'impact'],
  ttlDays: 0,
};

const existentialQuestionPolicy: EntityIndexingPolicy = {
  entityType: 'existential_question',
  priority: 'always',
  conditions: { maxPerUser: 30 },
  contentFields: ['question', 'context', 'currentThinking'],
  ttlDays: 0,
};

const legacyThoughtPolicy: EntityIndexingPolicy = {
  entityType: 'legacy_thought',
  priority: 'always',
  conditions: { maxPerUser: 20 },
  contentFields: ['thought', 'category', 'significance'],
  ttlDays: 0,
};

// ============================================================================
// EMOTIONAL POLICIES
// ============================================================================

const emotionalPatternPolicy: EntityIndexingPolicy = {
  entityType: 'emotional_pattern',
  priority: 'always',
  conditions: { maxPerUser: 30 },
  contentFields: ['pattern', 'triggers', 'frequency', 'impact'],
  ttlDays: 0,
};

const moodTriggerPolicy: EntityIndexingPolicy = {
  entityType: 'mood_trigger',
  priority: 'always',
  conditions: { maxPerUser: 30 },
  contentFields: ['trigger', 'moodEffect', 'intensity'],
  ttlDays: 0,
};

const copingStrategyPolicy: EntityIndexingPolicy = {
  entityType: 'coping_strategy',
  priority: 'always',
  conditions: { maxPerUser: 20 },
  contentFields: ['strategy', 'forSituation', 'effectiveness'],
  ttlDays: 0,
};

const behavioralTriggerPolicy: EntityIndexingPolicy = {
  entityType: 'behavioral_trigger',
  priority: 'always',
  conditions: { maxPerUser: 30 },
  contentFields: ['trigger', 'behavior', 'context'],
  ttlDays: 0,
};

const decisionPatternPolicy: EntityIndexingPolicy = {
  entityType: 'decision_pattern',
  priority: 'always',
  conditions: { maxPerUser: 20 },
  contentFields: ['pattern', 'context', 'outcome'],
  ttlDays: 0,
};

const procrastinationPatternPolicy: EntityIndexingPolicy = {
  entityType: 'procrastination_pattern',
  priority: 'always',
  conditions: { maxPerUser: 20 },
  contentFields: ['pattern', 'trigger', 'impact'],
  ttlDays: 0,
};

const anxietyPatternPolicy: EntityIndexingPolicy = {
  entityType: 'anxiety_pattern',
  priority: 'always',
  conditions: { maxPerUser: 20 },
  contentFields: ['pattern', 'triggers', 'coping'],
  ttlDays: 0,
};

const joyTriggerPolicy: EntityIndexingPolicy = {
  entityType: 'joy_trigger',
  priority: 'always',
  conditions: { maxPerUser: 30 },
  contentFields: ['trigger', 'context', 'intensity'],
  ttlDays: 0,
};

// ============================================================================
// MISCELLANEOUS POLICIES
// ============================================================================

const travelPreferencePolicy: EntityIndexingPolicy = { entityType: 'travel_preference', priority: 'always', conditions: { maxPerUser: 20 }, contentFields: ['preference', 'type', 'notes'], ttlDays: 0 };
const bucketListItemPolicy: EntityIndexingPolicy = { entityType: 'bucket_list_item', priority: 'always', conditions: { maxPerUser: 50 }, contentFields: ['item', 'category', 'why'], ttlDays: 0 };
const homeProjectPolicy: EntityIndexingPolicy = { entityType: 'home_project', priority: 'active_only', conditions: { activeOnly: true, maxPerUser: 20 }, contentFields: ['project', 'status', 'timeline'], ttlDays: 180 };
const creativeProjectPolicy: EntityIndexingPolicy = { entityType: 'creative_project', priority: 'active_only', conditions: { activeOnly: true, maxPerUser: 20 }, contentFields: ['project', 'medium', 'status'], ttlDays: 0 };
const learningResourcePolicy: EntityIndexingPolicy = { entityType: 'learning_resource', priority: 'always', conditions: { maxPerUser: 50 }, contentFields: ['resource', 'topic', 'type'], ttlDays: 365 };
const decisionRecordPolicy: EntityIndexingPolicy = { entityType: 'decision_record', priority: 'always', conditions: { maxPerUser: 30 }, contentFields: ['decision', 'reasoning', 'outcome'], ttlDays: 0 };

// ============================================================================
// LIFE STAGE POLICIES
// ============================================================================

const newParentPolicy: EntityIndexingPolicy = { entityType: 'new_parent', priority: 'always', conditions: { maxPerUser: 5 }, contentFields: ['babyAge', 'identityStage', 'sleepDeprivation', 'supportNetwork', 'notes'], ttlDays: 0 };
const emptyNestPolicy: EntityIndexingPolicy = { entityType: 'empty_nest', priority: 'always', conditions: { maxPerUser: 5 }, contentFields: ['childrenMoved', 'adjustmentPhase', 'newPursuit', 'notes'], ttlDays: 0 };
const infidelityRecoveryPolicy: EntityIndexingPolicy = { entityType: 'infidelity_recovery', priority: 'always', conditions: { maxPerUser: 3 }, contentFields: ['role', 'phase', 'trustLevel', 'therapyInvolved', 'notes'], ttlDays: 0 };
const healthDiagnosisPolicy: EntityIndexingPolicy = { entityType: 'health_diagnosis', priority: 'always', conditions: { maxPerUser: 10 }, contentFields: ['condition', 'severity', 'treatmentPlan', 'emotionalStage', 'notes'], ttlDays: 0 };
const jobLossPolicy: EntityIndexingPolicy = { entityType: 'job_loss', priority: 'active_only', conditions: { activeOnly: true, maxPerUser: 5 }, contentFields: ['reason', 'financialBuffer', 'jobSearchActive', 'identityImpact', 'notes'], ttlDays: 365 };
const sobrietyPolicy: EntityIndexingPolicy = { entityType: 'sobriety', priority: 'always', conditions: { maxPerUser: 5 }, contentFields: ['substance', 'daysSober', 'supportGroup', 'triggers', 'notes'], ttlDays: 0 };
const sandwichGenerationPolicy: EntityIndexingPolicy = { entityType: 'sandwich_generation', priority: 'always', conditions: { maxPerUser: 3 }, contentFields: ['elderCareNeeds', 'childCareNeeds', 'burnoutLevel', 'supportResources', 'notes'], ttlDays: 0 };
const blendedFamilyPolicy: EntityIndexingPolicy = { entityType: 'blended_family', priority: 'always', conditions: { maxPerUser: 3 }, contentFields: ['stepRelationships', 'challengeAreas', 'integrationProgress', 'notes'], ttlDays: 0 };
const comingOutPolicy: EntityIndexingPolicy = { entityType: 'coming_out', priority: 'always', conditions: { maxPerUser: 3 }, contentFields: ['identity', 'audiencesComeOutTo', 'supportReceived', 'challengesFaced', 'notes'], ttlDays: 0 };
const faithTransitionPolicy: EntityIndexingPolicy = { entityType: 'faith_transition', priority: 'always', conditions: { maxPerUser: 3 }, contentFields: ['fromFaith', 'toFaith', 'stage', 'communityImpact', 'notes'], ttlDays: 0 };

// ============================================================================
// LOCATION, PETS, PROPERTY, LEGAL, CRISIS, LEARNING, OUTREACH, PERSONA POLICIES
// ============================================================================

const favoritePlacePolicy: EntityIndexingPolicy = { entityType: 'favorite_place', priority: 'always', conditions: { maxPerUser: 50 }, contentFields: ['name', 'type', 'location', 'whyLoved', 'memories'], ttlDays: 0 };
const locationMemoryPolicy: EntityIndexingPolicy = { entityType: 'location_memory', priority: 'always', conditions: { maxPerUser: 100 }, contentFields: ['place', 'memory', 'emotion', 'significance'], ttlDays: 0 };
const geographicPreferencePolicy: EntityIndexingPolicy = { entityType: 'geographic_preference', priority: 'always', conditions: { maxPerUser: 20 }, contentFields: ['preferenceType', 'preference', 'reason'], ttlDays: 0 };
const petPolicy: EntityIndexingPolicy = { entityType: 'pet', priority: 'always', conditions: { maxPerUser: 10 }, contentFields: ['name', 'species', 'breed', 'personality', 'quirks'], ttlDays: 0 };
const petHealthPolicy: EntityIndexingPolicy = { entityType: 'pet_health', priority: 'always', conditions: { maxPerUser: 50 }, contentFields: ['petName', 'recordType', 'description', 'nextDue'], ttlDays: 365 };
const petMilestonePolicy: EntityIndexingPolicy = { entityType: 'pet_milestone', priority: 'always', conditions: { maxPerUser: 30 }, contentFields: ['petName', 'milestone', 'type', 'date'], ttlDays: 0 };
const vehiclePolicy: EntityIndexingPolicy = { entityType: 'vehicle', priority: 'always', conditions: { maxPerUser: 5 }, contentFields: ['make', 'model', 'year', 'nickname', 'maintenanceSchedule'], ttlDays: 0 };
const homeMaintenancePolicy: EntityIndexingPolicy = { entityType: 'home_maintenance', priority: 'active_only', conditions: { activeOnly: true, maxPerUser: 30 }, contentFields: ['task', 'category', 'frequency', 'nextDue'], ttlDays: 365 };
const propertyAssetPolicy: EntityIndexingPolicy = { entityType: 'property_asset', priority: 'always', conditions: { maxPerUser: 10 }, contentFields: ['name', 'type', 'address', 'currentValue'], ttlDays: 0 };
const insurancePolicyPolicy: EntityIndexingPolicy = { entityType: 'insurance_policy', priority: 'always', conditions: { maxPerUser: 15 }, contentFields: ['type', 'provider', 'coverage', 'expiryDate'], ttlDays: 0 };
const legalDocumentPolicy: EntityIndexingPolicy = { entityType: 'legal_document', priority: 'always', conditions: { maxPerUser: 20 }, contentFields: ['type', 'description', 'status', 'lastUpdated'], ttlDays: 0 };
const crisisEpisodePolicy: EntityIndexingPolicy = { entityType: 'crisis_episode', priority: 'always', conditions: { maxPerUser: 50 }, contentFields: ['description', 'type', 'severity', 'resolution', 'whatHelped', 'lessonsLearned'], ttlDays: 0 };
const supportReceivedPolicy: EntityIndexingPolicy = { entityType: 'support_received', priority: 'always', conditions: { maxPerUser: 100 }, contentFields: ['from', 'type', 'description', 'impact'], ttlDays: 0 };
const userCorrectionPolicy: EntityIndexingPolicy = { entityType: 'user_correction', priority: 'always', conditions: { maxPerUser: 200 }, contentFields: ['whatFerniSaid', 'whatUserCorrected', 'correctInformation', 'category'], ttlDays: 0 };
const implicitPreferencePolicy: EntityIndexingPolicy = { entityType: 'implicit_preference', priority: 'always', conditions: { maxPerUser: 100 }, contentFields: ['preference', 'category', 'evidence', 'confidence'], ttlDays: 0 };
const outreachAttemptPolicy: EntityIndexingPolicy = { entityType: 'outreach_attempt', priority: 'always', conditions: { maxPerUser: 500 }, contentFields: ['type', 'channel', 'reason', 'status', 'triggeredBy'], ttlDays: 365 };
const outreachResponsePolicy: EntityIndexingPolicy = { entityType: 'outreach_response', priority: 'always', conditions: { maxPerUser: 500 }, contentFields: ['responseType', 'sentiment', 'feedback', 'ledToSession'], ttlDays: 365 };
const outreachPreferencePolicy: EntityIndexingPolicy = { entityType: 'outreach_preference', priority: 'always', conditions: { maxPerUser: 5 }, contentFields: ['preferredChannels', 'preferredTimes', 'frequency', 'doNotDisturb'], ttlDays: 0 };
const personaAffinityPolicy: EntityIndexingPolicy = { entityType: 'persona_affinity', priority: 'always', conditions: { maxPerUser: 10 }, contentFields: ['personaId', 'personaName', 'affinityScore', 'topTopics', 'emotionalResonance'], ttlDays: 0 };
const handoffPreferencePolicy: EntityIndexingPolicy = { entityType: 'handoff_preference', priority: 'always', conditions: { maxPerUser: 30 }, contentFields: ['fromPersona', 'toPersona', 'triggerTopics', 'userApproved'], ttlDays: 0 };
const personaInteractionHistoryPolicy: EntityIndexingPolicy = { entityType: 'persona_interaction_history', priority: 'always', conditions: { maxPerUser: 200 }, contentFields: ['personaId', 'interactionType', 'topics', 'sentiment', 'outcome'], ttlDays: 365 };

// ============================================================================
// CONVERSATION & BETTER THAN HUMAN POLICIES
// ============================================================================

const conversationThreadPolicy: EntityIndexingPolicy = { entityType: 'conversation_thread', priority: 'active_only', conditions: { activeOnly: true, maxPerUser: 20 }, contentFields: ['topic', 'emotionalContext', 'participantAgents'], ttlDays: 30 };
const voiceBiomarkerPolicy: EntityIndexingPolicy = { entityType: 'voice_biomarker', priority: 'always', conditions: { maxPerUser: 100 }, contentFields: ['emotion', 'voiceFeatures', 'context', 'insights'], ttlDays: 30 };
const sessionSummaryPolicy: EntityIndexingPolicy = { entityType: 'session_summary', priority: 'always', conditions: { maxPerUser: 500 }, contentFields: ['summary', 'keyTopics', 'emotionalArc', 'promises', 'breakthroughs'], ttlDays: 0 };
const patternInsightPolicy: EntityIndexingPolicy = { entityType: 'pattern_insight', priority: 'always', conditions: { maxPerUser: 100 }, contentFields: ['pattern', 'category', 'evidence', 'significance'], ttlDays: 0 };
const behavioralPatternPolicy: EntityIndexingPolicy = { entityType: 'behavioral_pattern', priority: 'always', conditions: { maxPerUser: 100 }, contentFields: ['behavior', 'trigger', 'frequency', 'impact', 'observations'], ttlDays: 0 };
const crossSessionThreadPolicy: EntityIndexingPolicy = { entityType: 'cross_session_thread', priority: 'always', conditions: { maxPerUser: 50 }, contentFields: ['topic', 'evolution', 'emotionalSignificance'], ttlDays: 0 };
const correlationInsightPolicy: EntityIndexingPolicy = { entityType: 'correlation_insight', priority: 'always', conditions: { maxPerUser: 100 }, contentFields: ['connection', 'domainA', 'domainB', 'examples', 'implications'], ttlDays: 365 };
const protectiveMomentPolicy: EntityIndexingPolicy = { entityType: 'protective_moment', priority: 'always', conditions: { maxPerUser: 100 }, contentFields: ['situation', 'whatWeDidntSay', 'whyWeHeld', 'userState'], ttlDays: 0 };
const voiceRecognitionPolicy: EntityIndexingPolicy = { entityType: 'voice_recognition', priority: 'always', conditions: { maxPerUser: 5 }, contentFields: ['voiceCharacteristics', 'confidenceScore'], ttlDays: 0 };

// ============================================================================
// DEFAULT INDEXING POLICY (assembles all policies)
// ============================================================================

export const DEFAULT_INDEXING_POLICY: IndexingPolicy = {
  entities: [
    habitPolicy, taskPolicy, routinePolicy, billPolicy, medicationPolicy, packagePolicy,
    budgetPolicy, savingsGoalPolicy, subscriptionPolicy, spendingTriggerPolicy, investmentPolicy, debtPolicy,
    milestonePolicy, lifeGoalPolicy, retirementPlanPolicy, notePolicy, journalPolicy, tripPolicy,
    commitmentPolicy, boundaryPolicy, growthReflectionPolicy, insideJokePolicy, smallWinPolicy,
    thinkingOfYouPolicy, readingBetweenLinesPolicy, tonalMemoryPolicy, vulnerabilityMomentPolicy, trustMilestonePolicy,
    curiosityMentionPolicy, betweenSessionThinkingPolicy, personaGrowthPolicy, conversationTexturePolicy,
    dreamPolicy, lifeChapterPolicy, valuesAlignmentPolicy, capacityStatePolicy, relationshipMilestonePolicy,
    seasonalPatternPolicy, emotionalFirstAidPolicy, predictiveInsightPolicy, commitmentKeeperPolicy,
    relationshipNetworkPolicy, conflictMemoryPolicy, recoveryMilestonePolicy,
    calendarEventPolicy, meetingMemoryPolicy, recurringCommitmentPolicy, calendarConflictPolicy,
    meetingPrepPolicy, availabilityPatternPolicy, timeBlockPolicy, deadlinePolicy,
    contactPolicy, relationshipNotePolicy, giftIdeaPolicy, importantDatePolicy, contactInteractionPolicy,
    relationshipHealthPolicy, familyMemberPolicy, friendMemoryPolicy, professionalContactPolicy, communicationPreferencePolicy,
    coachingInsightPolicy, breakthroughMomentPolicy, stuckPatternPolicy, reframeSuggestionPolicy,
    growthEdgePolicy, strengthIdentifiedPolicy, blindSpotPolicy, accountabilityItemPolicy, behaviorChangePolicy, motivationInsightPolicy,
    healthGoalPolicy, sleepPatternPolicy, energyLevelPolicy, workoutPolicy, wellnessCheckinPolicy,
    mentalHealthNotePolicy, nutritionGoalPolicy, bodyAwarenessPolicy, stressTriggerPolicy, recoveryPracticePolicy,
    musicPreferencePolicy, emotionalSongPolicy, playlistMemoryPolicy, bookHighlightPolicy, readingGoalPolicy,
    podcastInsightPolicy, moviePreferencePolicy, gamePreferencePolicy, contentRecommendationPolicy, mediaMemoryPolicy,
    careerGoalPolicy, jobSearchPolicy, skillDevelopmentPolicy, professionalNetworkPolicy,
    workAchievementPolicy, careerReflectionPolicy, workChallengePolicy, careerAspirationPolicy,
    lifeThesisComponentPolicy, valueStatementPolicy, purposeExplorationPolicy, wisdomInsightPolicy,
    lifeLessonPolicy, perspectiveShiftPolicy, existentialQuestionPolicy, legacyThoughtPolicy,
    emotionalPatternPolicy, moodTriggerPolicy, copingStrategyPolicy, behavioralTriggerPolicy,
    decisionPatternPolicy, procrastinationPatternPolicy, anxietyPatternPolicy, joyTriggerPolicy,
    travelPreferencePolicy, bucketListItemPolicy, homeProjectPolicy, creativeProjectPolicy, learningResourcePolicy, decisionRecordPolicy,
    conversationThreadPolicy, voiceBiomarkerPolicy, sessionSummaryPolicy, patternInsightPolicy,
    behavioralPatternPolicy, crossSessionThreadPolicy, correlationInsightPolicy, protectiveMomentPolicy, voiceRecognitionPolicy,
    newParentPolicy, emptyNestPolicy, infidelityRecoveryPolicy, healthDiagnosisPolicy, jobLossPolicy,
    sobrietyPolicy, sandwichGenerationPolicy, blendedFamilyPolicy, comingOutPolicy, faithTransitionPolicy,
    favoritePlacePolicy, locationMemoryPolicy, geographicPreferencePolicy,
    petPolicy, petHealthPolicy, petMilestonePolicy,
    vehiclePolicy, homeMaintenancePolicy, propertyAssetPolicy,
    insurancePolicyPolicy, legalDocumentPolicy,
    crisisEpisodePolicy, supportReceivedPolicy,
    userCorrectionPolicy, implicitPreferencePolicy,
    outreachAttemptPolicy, outreachResponsePolicy, outreachPreferencePolicy,
    personaAffinityPolicy, handoffPreferencePolicy, personaInteractionHistoryPolicy,
  ],
  maxDocsPerUser: 600,
  debounceMs: 2000,
};

// Re-export individual policies for getPoliciesByDomain
export {
  habitPolicy, taskPolicy, routinePolicy, billPolicy, medicationPolicy, packagePolicy,
  budgetPolicy, savingsGoalPolicy, subscriptionPolicy, spendingTriggerPolicy, investmentPolicy, debtPolicy,
  milestonePolicy, lifeGoalPolicy, retirementPlanPolicy, notePolicy, journalPolicy, tripPolicy,
  commitmentPolicy, boundaryPolicy, growthReflectionPolicy, insideJokePolicy, smallWinPolicy,
  thinkingOfYouPolicy, readingBetweenLinesPolicy, tonalMemoryPolicy, vulnerabilityMomentPolicy, trustMilestonePolicy,
  curiosityMentionPolicy, betweenSessionThinkingPolicy, personaGrowthPolicy, conversationTexturePolicy,
  dreamPolicy, lifeChapterPolicy, valuesAlignmentPolicy, capacityStatePolicy, relationshipMilestonePolicy,
  seasonalPatternPolicy, emotionalFirstAidPolicy, predictiveInsightPolicy, commitmentKeeperPolicy,
  relationshipNetworkPolicy, conflictMemoryPolicy, recoveryMilestonePolicy,
  calendarEventPolicy, meetingMemoryPolicy, recurringCommitmentPolicy, calendarConflictPolicy,
  meetingPrepPolicy, availabilityPatternPolicy, timeBlockPolicy, deadlinePolicy,
  contactPolicy, relationshipNotePolicy, giftIdeaPolicy, importantDatePolicy, contactInteractionPolicy,
  relationshipHealthPolicy, familyMemberPolicy, friendMemoryPolicy, professionalContactPolicy, communicationPreferencePolicy,
  coachingInsightPolicy, breakthroughMomentPolicy, stuckPatternPolicy, reframeSuggestionPolicy,
  growthEdgePolicy, strengthIdentifiedPolicy, blindSpotPolicy, accountabilityItemPolicy, behaviorChangePolicy, motivationInsightPolicy,
  healthGoalPolicy, sleepPatternPolicy, energyLevelPolicy, workoutPolicy, wellnessCheckinPolicy,
  mentalHealthNotePolicy, nutritionGoalPolicy, bodyAwarenessPolicy, stressTriggerPolicy, recoveryPracticePolicy,
  musicPreferencePolicy, emotionalSongPolicy, playlistMemoryPolicy, bookHighlightPolicy, readingGoalPolicy,
  podcastInsightPolicy, moviePreferencePolicy, gamePreferencePolicy, contentRecommendationPolicy, mediaMemoryPolicy,
  careerGoalPolicy, jobSearchPolicy, skillDevelopmentPolicy, professionalNetworkPolicy,
  workAchievementPolicy, careerReflectionPolicy, workChallengePolicy, careerAspirationPolicy,
  lifeThesisComponentPolicy, valueStatementPolicy, purposeExplorationPolicy, wisdomInsightPolicy,
  lifeLessonPolicy, perspectiveShiftPolicy, existentialQuestionPolicy, legacyThoughtPolicy,
  emotionalPatternPolicy, moodTriggerPolicy, copingStrategyPolicy, behavioralTriggerPolicy,
  decisionPatternPolicy, procrastinationPatternPolicy, anxietyPatternPolicy, joyTriggerPolicy,
  travelPreferencePolicy, bucketListItemPolicy, homeProjectPolicy, creativeProjectPolicy, learningResourcePolicy, decisionRecordPolicy,
  newParentPolicy, emptyNestPolicy, infidelityRecoveryPolicy, healthDiagnosisPolicy, jobLossPolicy,
  sobrietyPolicy, sandwichGenerationPolicy, blendedFamilyPolicy, comingOutPolicy, faithTransitionPolicy,
  favoritePlacePolicy, locationMemoryPolicy, geographicPreferencePolicy,
  petPolicy, petHealthPolicy, petMilestonePolicy,
  vehiclePolicy, homeMaintenancePolicy, propertyAssetPolicy,
  insurancePolicyPolicy, legalDocumentPolicy,
  crisisEpisodePolicy, supportReceivedPolicy,
  userCorrectionPolicy, implicitPreferencePolicy,
  outreachAttemptPolicy, outreachResponsePolicy, outreachPreferencePolicy,
  personaAffinityPolicy, handoffPreferencePolicy, personaInteractionHistoryPolicy,
  conversationThreadPolicy, voiceBiomarkerPolicy, sessionSummaryPolicy, patternInsightPolicy,
  behavioralPatternPolicy, crossSessionThreadPolicy, correlationInsightPolicy, protectiveMomentPolicy, voiceRecognitionPolicy,
};

// ============================================================================
// DOMAIN GROUPING
// ============================================================================

/**
 * Get all policies grouped by domain
 */
export function getPoliciesByDomain(): Record<string, EntityIndexingPolicy[]> {
  return {
    productivity: [habitPolicy, taskPolicy, routinePolicy, billPolicy, medicationPolicy, packagePolicy],
    financial: [budgetPolicy, savingsGoalPolicy, subscriptionPolicy, spendingTriggerPolicy, investmentPolicy, debtPolicy],
    lifeData: [milestonePolicy, lifeGoalPolicy, retirementPlanPolicy, notePolicy, journalPolicy, tripPolicy],
    trust: [
      commitmentPolicy, boundaryPolicy, growthReflectionPolicy, insideJokePolicy, smallWinPolicy,
      thinkingOfYouPolicy, readingBetweenLinesPolicy, tonalMemoryPolicy, vulnerabilityMomentPolicy, trustMilestonePolicy,
      curiosityMentionPolicy, betweenSessionThinkingPolicy, personaGrowthPolicy, conversationTexturePolicy,
    ],
    superhuman: [
      dreamPolicy, lifeChapterPolicy, valuesAlignmentPolicy, capacityStatePolicy, relationshipMilestonePolicy,
      seasonalPatternPolicy, emotionalFirstAidPolicy, predictiveInsightPolicy, commitmentKeeperPolicy,
      relationshipNetworkPolicy, conflictMemoryPolicy, recoveryMilestonePolicy,
    ],
    calendar: [
      calendarEventPolicy, meetingMemoryPolicy, recurringCommitmentPolicy, calendarConflictPolicy,
      meetingPrepPolicy, availabilityPatternPolicy, timeBlockPolicy, deadlinePolicy,
    ],
    contacts: [
      contactPolicy, relationshipNotePolicy, giftIdeaPolicy, importantDatePolicy, contactInteractionPolicy,
      relationshipHealthPolicy, familyMemberPolicy, friendMemoryPolicy, professionalContactPolicy, communicationPreferencePolicy,
    ],
    coaching: [
      coachingInsightPolicy, breakthroughMomentPolicy, stuckPatternPolicy, reframeSuggestionPolicy,
      growthEdgePolicy, strengthIdentifiedPolicy, blindSpotPolicy, accountabilityItemPolicy, behaviorChangePolicy, motivationInsightPolicy,
    ],
    health: [
      healthGoalPolicy, sleepPatternPolicy, energyLevelPolicy, workoutPolicy, wellnessCheckinPolicy,
      mentalHealthNotePolicy, nutritionGoalPolicy, bodyAwarenessPolicy, stressTriggerPolicy, recoveryPracticePolicy,
    ],
    media: [
      musicPreferencePolicy, emotionalSongPolicy, playlistMemoryPolicy, bookHighlightPolicy, readingGoalPolicy,
      podcastInsightPolicy, moviePreferencePolicy, gamePreferencePolicy, contentRecommendationPolicy, mediaMemoryPolicy,
    ],
    career: [
      careerGoalPolicy, jobSearchPolicy, skillDevelopmentPolicy, professionalNetworkPolicy,
      workAchievementPolicy, careerReflectionPolicy, workChallengePolicy, careerAspirationPolicy,
    ],
    wisdom: [
      lifeThesisComponentPolicy, valueStatementPolicy, purposeExplorationPolicy, wisdomInsightPolicy,
      lifeLessonPolicy, perspectiveShiftPolicy, existentialQuestionPolicy, legacyThoughtPolicy,
    ],
    emotional: [
      emotionalPatternPolicy, moodTriggerPolicy, copingStrategyPolicy, behavioralTriggerPolicy,
      decisionPatternPolicy, procrastinationPatternPolicy, anxietyPatternPolicy, joyTriggerPolicy,
    ],
    miscellaneous: [travelPreferencePolicy, bucketListItemPolicy, homeProjectPolicy, creativeProjectPolicy, learningResourcePolicy, decisionRecordPolicy],
    lifeStage: [
      newParentPolicy, emptyNestPolicy, infidelityRecoveryPolicy, healthDiagnosisPolicy, jobLossPolicy,
      sobrietyPolicy, sandwichGenerationPolicy, blendedFamilyPolicy, comingOutPolicy, faithTransitionPolicy,
    ],
    location: [favoritePlacePolicy, locationMemoryPolicy, geographicPreferencePolicy],
    pets: [petPolicy, petHealthPolicy, petMilestonePolicy],
    property: [vehiclePolicy, homeMaintenancePolicy, propertyAssetPolicy],
    legal: [insurancePolicyPolicy, legalDocumentPolicy],
    crisis: [crisisEpisodePolicy, supportReceivedPolicy],
    learning: [userCorrectionPolicy, implicitPreferencePolicy],
    outreachHistory: [outreachAttemptPolicy, outreachResponsePolicy, outreachPreferencePolicy],
    personaInteraction: [personaAffinityPolicy, handoffPreferencePolicy, personaInteractionHistoryPolicy],
  };
}

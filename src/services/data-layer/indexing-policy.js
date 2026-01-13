/**
 * Indexing Policy Configuration
 *
 * Defines what data gets indexed to semantic memory and how.
 * Not everything needs semantic search - use this policy to control costs
 * and search quality.
 *
 * @module services/data-layer/indexing-policy
 */
// ============================================================================
// PRODUCTIVITY POLICIES
// ============================================================================
const habitPolicy = {
    entityType: 'habit',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 20,
    },
    contentFields: ['name', 'description', 'frequency', 'streakCurrent'],
    ttlDays: 0, // No expiry - habits are long-lived
};
const taskPolicy = {
    entityType: 'task',
    priority: 'important_only',
    conditions: {
        activeOnly: true,
        importantOnly: true, // Only high/urgent priority
        maxPerUser: 15,
    },
    contentFields: ['title', 'description', 'priority', 'dueDate'],
    ttlDays: 30, // Tasks expire from index after 30 days
};
const routinePolicy = {
    entityType: 'routine',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 10,
    },
    contentFields: ['name', 'description', 'timeOfDay', 'steps'],
    ttlDays: 0,
};
const billPolicy = {
    entityType: 'bill',
    priority: 'active_only',
    conditions: {
        activeOnly: true, // Only unpaid bills
        maxPerUser: 20,
    },
    contentFields: ['name', 'amount', 'dueDate', 'frequency'],
    ttlDays: 60,
};
const medicationPolicy = {
    entityType: 'medication',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 20,
    },
    contentFields: ['name', 'dosage', 'frequency', 'purpose'],
    ttlDays: 0,
};
const packagePolicy = {
    entityType: 'package',
    priority: 'active_only',
    conditions: {
        activeOnly: true, // Not delivered
        maxPerUser: 10,
    },
    contentFields: ['description', 'carrier', 'expectedDate'],
    ttlDays: 30,
};
// ============================================================================
// FINANCIAL POLICIES
// ============================================================================
const budgetPolicy = {
    entityType: 'budget',
    priority: 'always',
    conditions: {
        maxPerUser: 5,
    },
    contentFields: ['name', 'monthlyLimit', 'spent', 'remaining', 'categories'],
    ttlDays: 0,
};
const savingsGoalPolicy = {
    entityType: 'savings_goal',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 10,
    },
    contentFields: ['name', 'targetAmount', 'currentAmount', 'deadline', 'priority'],
    ttlDays: 0,
};
const subscriptionPolicy = {
    entityType: 'subscription',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 30,
    },
    contentFields: ['name', 'amount', 'frequency', 'category', 'usefulness'],
    ttlDays: 90,
};
const spendingTriggerPolicy = {
    entityType: 'spending_trigger',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['trigger', 'emotion', 'category', 'frequency'],
    ttlDays: 0, // Behavioral patterns don't expire
};
const investmentPolicy = {
    entityType: 'investment',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['name', 'type', 'value', 'allocation'],
    ttlDays: 0,
};
const debtPolicy = {
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
const milestonePolicy = {
    entityType: 'milestone',
    priority: 'active_only',
    conditions: {
        activeOnly: true, // Not completed
        maxPerUser: 10,
    },
    contentFields: ['name', 'category', 'status', 'targetDate', 'notes'],
    ttlDays: 0,
};
const lifeGoalPolicy = {
    entityType: 'life_goal',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 15,
    },
    contentFields: ['title', 'description', 'category', 'timeframe', 'progress'],
    ttlDays: 0,
};
const retirementPlanPolicy = {
    entityType: 'retirement_plan',
    priority: 'always',
    conditions: {
        maxPerUser: 3,
    },
    contentFields: ['style', 'targetAge', 'monthlyTarget', 'currentSavings', 'vision'],
    ttlDays: 0,
};
const notePolicy = {
    entityType: 'note',
    priority: 'never', // Notes are too noisy for semantic search
    conditions: {},
    contentFields: [],
    ttlDays: 0,
};
const journalPolicy = {
    entityType: 'journal',
    priority: 'important_only',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['title', 'content', 'mood', 'tags'],
    ttlDays: 365, // Keep journals for a year
};
const tripPolicy = {
    entityType: 'trip',
    priority: 'active_only',
    conditions: {
        activeOnly: true, // Future trips
        maxPerUser: 5,
    },
    contentFields: ['destination', 'startDate', 'endDate', 'purpose'],
    ttlDays: 90,
};
// ============================================================================
// TRUST SYSTEM POLICIES
// ============================================================================
const commitmentPolicy = {
    entityType: 'commitment',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 50,
    },
    contentFields: ['description', 'madeBy', 'status', 'deadline'],
    ttlDays: 0, // Commitments are permanent
};
const boundaryPolicy = {
    entityType: 'boundary',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['topic', 'reason', 'severity'],
    ttlDays: 0, // Boundaries don't expire
};
const growthReflectionPolicy = {
    entityType: 'growth_reflection',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['observation', 'area', 'evidence'],
    ttlDays: 0,
};
const insideJokePolicy = {
    entityType: 'inside_joke',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['joke', 'context', 'sharedMoment'],
    ttlDays: 0,
};
const smallWinPolicy = {
    entityType: 'small_win',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['win', 'effort', 'celebration'],
    ttlDays: 365,
};
const thinkingOfYouPolicy = {
    entityType: 'thinking_of_you',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['reason', 'trigger', 'message'],
    ttlDays: 180,
};
const readingBetweenLinesPolicy = {
    entityType: 'reading_between_lines',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['observation', 'whatWasSaid', 'whatWasNotSaid'],
    ttlDays: 180,
};
const tonalMemoryPolicy = {
    entityType: 'tonal_memory',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['pattern', 'context', 'emotionalState'],
    ttlDays: 0,
};
const vulnerabilityMomentPolicy = {
    entityType: 'vulnerability_moment',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['topic', 'context', 'depth'],
    ttlDays: 0,
};
const trustMilestonePolicy = {
    entityType: 'trust_milestone',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['milestone', 'significance', 'stage'],
    ttlDays: 0,
};
// ============================================================================
// MEMORY ENHANCEMENT POLICIES (NEW - December 2024)
// ============================================================================
const curiosityMentionPolicy = {
    entityType: 'curiosity_mention',
    priority: 'always',
    conditions: {
        maxPerUser: 100, // Track many mentions for rich follow-up opportunities
    },
    contentFields: ['entity', 'entityType', 'originalContext', 'priority'],
    ttlDays: 90, // Expire after 3 months if not followed up
};
const betweenSessionThinkingPolicy = {
    entityType: 'between_session_thinking',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['topic', 'reflection', 'depth', 'emotionalTone'],
    ttlDays: 0, // Never expire - these are meaningful reflections
};
const personaGrowthPolicy = {
    entityType: 'persona_growth',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['personaId', 'growthType', 'description', 'userInfluence'],
    ttlDays: 0, // Never expire - persona growth is permanent
};
const conversationTexturePolicy = {
    entityType: 'conversation_texture',
    priority: 'always',
    conditions: {
        maxPerUser: 100, // Track conversation feel over time
    },
    contentFields: ['personaId', 'tone', 'depth', 'rhythm', 'topics', 'energyPattern'],
    ttlDays: 180, // Expire after 6 months - texture is about recent patterns
};
// ============================================================================
// SUPERHUMAN POLICIES
// ============================================================================
const dreamPolicy = {
    entityType: 'dream',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 30,
    },
    contentFields: ['dream', 'category', 'timeframe', 'steps'],
    ttlDays: 0,
};
const lifeChapterPolicy = {
    entityType: 'life_chapter',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['title', 'summary', 'period', 'themes'],
    ttlDays: 0,
};
const valuesAlignmentPolicy = {
    entityType: 'values_alignment',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['value', 'alignment', 'evidence'],
    ttlDays: 0,
};
const capacityStatePolicy = {
    entityType: 'capacity_state',
    priority: 'always',
    conditions: {
        maxPerUser: 10, // Only recent states
    },
    contentFields: ['level', 'factors', 'recommendation'],
    ttlDays: 30,
};
const relationshipMilestonePolicy = {
    entityType: 'relationship_milestone',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['milestone', 'relationship', 'significance'],
    ttlDays: 0,
};
const seasonalPatternPolicy = {
    entityType: 'seasonal_pattern',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['pattern', 'season', 'observation'],
    ttlDays: 0,
};
const emotionalFirstAidPolicy = {
    entityType: 'emotional_first_aid',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['situation', 'support', 'outcome'],
    ttlDays: 365,
};
const predictiveInsightPolicy = {
    entityType: 'predictive_insight',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['prediction', 'basis', 'confidence'],
    ttlDays: 90,
};
const commitmentKeeperPolicy = {
    entityType: 'commitment_keeper',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 30,
    },
    contentFields: ['commitment', 'madeOn', 'status'],
    ttlDays: 0,
};
const relationshipNetworkPolicy = {
    entityType: 'relationship_network',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['person', 'relationship', 'connectionStrength'],
    ttlDays: 0,
};
const conflictMemoryPolicy = {
    entityType: 'conflict_memory',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['conflict', 'parties', 'resolution', 'lessonsLearned'],
    ttlDays: 0,
};
const recoveryMilestonePolicy = {
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
const calendarEventPolicy = {
    entityType: 'calendar_event',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 50,
    },
    contentFields: ['title', 'date', 'time', 'attendees', 'notes'],
    ttlDays: 30, // Past events expire
};
const meetingMemoryPolicy = {
    entityType: 'meeting_memory',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['meetingTitle', 'keyPoints', 'actionItems'],
    ttlDays: 180,
};
const recurringCommitmentPolicy = {
    entityType: 'recurring_commitment',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['commitment', 'frequency', 'importance'],
    ttlDays: 0,
};
const calendarConflictPolicy = {
    entityType: 'calendar_conflict',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 10,
    },
    contentFields: ['events', 'date'],
    ttlDays: 14,
};
const meetingPrepPolicy = {
    entityType: 'meeting_prep',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['meetingTitle', 'prepNotes', 'objectives'],
    ttlDays: 30,
};
const availabilityPatternPolicy = {
    entityType: 'availability_pattern',
    priority: 'always',
    conditions: {
        maxPerUser: 10,
    },
    contentFields: ['pattern', 'dayType', 'timeRange'],
    ttlDays: 0,
};
const timeBlockPolicy = {
    entityType: 'time_block',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 20,
    },
    contentFields: ['purpose', 'date', 'startTime', 'endTime'],
    ttlDays: 30,
};
const deadlinePolicy = {
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
const contactPolicy = {
    entityType: 'contact',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['name', 'relationship', 'notes', 'importantDates'],
    ttlDays: 0,
};
const relationshipNotePolicy = {
    entityType: 'relationship_note',
    priority: 'always',
    conditions: {
        maxPerUser: 200,
    },
    contentFields: ['contactName', 'note', 'context'],
    ttlDays: 365,
};
const giftIdeaPolicy = {
    entityType: 'gift_idea',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 50,
    },
    contentFields: ['forContact', 'idea', 'occasion', 'priceRange'],
    ttlDays: 365,
};
const importantDatePolicy = {
    entityType: 'important_date',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['contactName', 'date', 'type', 'label'],
    ttlDays: 0,
};
const contactInteractionPolicy = {
    entityType: 'contact_interaction',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['contactName', 'interactionType', 'summary'],
    ttlDays: 180,
};
const relationshipHealthPolicy = {
    entityType: 'relationship_health',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['contactName', 'health', 'observations'],
    ttlDays: 90,
};
const familyMemberPolicy = {
    entityType: 'family_member',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['name', 'relation', 'notes', 'importantInfo'],
    ttlDays: 0,
};
const friendMemoryPolicy = {
    entityType: 'friend_memory',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['friendName', 'memory', 'sharedExperience'],
    ttlDays: 0,
};
const professionalContactPolicy = {
    entityType: 'professional_contact',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['name', 'company', 'role', 'relationship'],
    ttlDays: 0,
};
const communicationPreferencePolicy = {
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
const coachingInsightPolicy = {
    entityType: 'coaching_insight',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['insight', 'context', 'category'],
    ttlDays: 0,
};
const breakthroughMomentPolicy = {
    entityType: 'breakthrough_moment',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['description', 'trigger', 'impact'],
    ttlDays: 0,
};
const stuckPatternPolicy = {
    entityType: 'stuck_pattern',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['pattern', 'context', 'frequency', 'attempts'],
    ttlDays: 0,
};
const reframeSuggestionPolicy = {
    entityType: 'reframe_suggestion',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['originalPerspective', 'reframe', 'impact'],
    ttlDays: 365,
};
const growthEdgePolicy = {
    entityType: 'growth_edge',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['area', 'currentState', 'targetState'],
    ttlDays: 0,
};
const strengthIdentifiedPolicy = {
    entityType: 'strength_identified',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['strength', 'evidence', 'category'],
    ttlDays: 0,
};
const blindSpotPolicy = {
    entityType: 'blind_spot',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['blindSpot', 'observation', 'impact'],
    ttlDays: 0,
};
const accountabilityItemPolicy = {
    entityType: 'accountability_item',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 20,
    },
    contentFields: ['item', 'agreedOn', 'dueDate', 'status'],
    ttlDays: 90,
};
const behaviorChangePolicy = {
    entityType: 'behavior_change',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['behavior', 'from', 'to', 'progress'],
    ttlDays: 0,
};
const motivationInsightPolicy = {
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
const healthGoalPolicy = {
    entityType: 'health_goal',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 10,
    },
    contentFields: ['goal', 'category', 'targetDate', 'progress'],
    ttlDays: 0,
};
const sleepPatternPolicy = {
    entityType: 'sleep_pattern',
    priority: 'always',
    conditions: {
        maxPerUser: 10,
    },
    contentFields: ['pattern', 'averageHours', 'quality'],
    ttlDays: 90,
};
const energyLevelPolicy = {
    entityType: 'energy_level',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['level', 'timeOfDay', 'factors'],
    ttlDays: 30,
};
const workoutPolicy = {
    entityType: 'workout',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['activity', 'duration', 'intensity'],
    ttlDays: 90,
};
const wellnessCheckinPolicy = {
    entityType: 'wellness_checkin',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['mood', 'energy', 'notes', 'stressLevel'],
    ttlDays: 60,
};
const mentalHealthNotePolicy = {
    entityType: 'mental_health_note',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['note', 'category', 'severity', 'coping'],
    ttlDays: 0,
};
const nutritionGoalPolicy = {
    entityType: 'nutrition_goal',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 10,
    },
    contentFields: ['goal', 'category', 'currentStatus'],
    ttlDays: 0,
};
const bodyAwarenessPolicy = {
    entityType: 'body_awareness',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['observation', 'bodyPart', 'context'],
    ttlDays: 180,
};
const stressTriggerPolicy = {
    entityType: 'stress_trigger',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['trigger', 'context', 'severity', 'copingStrategies'],
    ttlDays: 0,
};
const recoveryPracticePolicy = {
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
const musicPreferencePolicy = {
    entityType: 'music_preference',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['artist', 'genre', 'song', 'mood', 'emotionalAssociation'],
    ttlDays: 0,
};
const emotionalSongPolicy = {
    entityType: 'emotional_song',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['song', 'artist', 'emotion', 'memory'],
    ttlDays: 0,
};
const playlistMemoryPolicy = {
    entityType: 'playlist_memory',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['playlistName', 'association', 'mood'],
    ttlDays: 0,
};
const bookHighlightPolicy = {
    entityType: 'book_highlight',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['bookTitle', 'author', 'highlight', 'reflection'],
    ttlDays: 0,
};
const readingGoalPolicy = {
    entityType: 'reading_goal',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 5,
    },
    contentFields: ['goal', 'booksTarget', 'booksRead', 'genres'],
    ttlDays: 365,
};
const podcastInsightPolicy = {
    entityType: 'podcast_insight',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['podcastName', 'episodeTitle', 'insight', 'topic'],
    ttlDays: 365,
};
const moviePreferencePolicy = {
    entityType: 'movie_preference',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['title', 'genre', 'reaction', 'memorable'],
    ttlDays: 0,
};
const gamePreferencePolicy = {
    entityType: 'game_preference',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['game', 'platform', 'genre', 'playStyle'],
    ttlDays: 0,
};
const contentRecommendationPolicy = {
    entityType: 'content_recommendation',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['content', 'type', 'reason', 'feedback'],
    ttlDays: 180,
};
const mediaMemoryPolicy = {
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
const careerGoalPolicy = {
    entityType: 'career_goal',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 10,
    },
    contentFields: ['goal', 'category', 'timeframe', 'progress'],
    ttlDays: 0,
};
const jobSearchPolicy = {
    entityType: 'job_search',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 5,
    },
    contentFields: ['targetRole', 'targetCompanies', 'status'],
    ttlDays: 180,
};
const skillDevelopmentPolicy = {
    entityType: 'skill_development',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['skill', 'currentLevel', 'targetLevel', 'method'],
    ttlDays: 0,
};
const professionalNetworkPolicy = {
    entityType: 'professional_network',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['person', 'company', 'role', 'connectionType'],
    ttlDays: 0,
};
const workAchievementPolicy = {
    entityType: 'work_achievement',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['achievement', 'impact', 'category'],
    ttlDays: 0,
};
const careerReflectionPolicy = {
    entityType: 'career_reflection',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['reflection', 'topic', 'insight'],
    ttlDays: 365,
};
const workChallengePolicy = {
    entityType: 'work_challenge',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 10,
    },
    contentFields: ['challenge', 'context', 'strategies'],
    ttlDays: 90,
};
const careerAspirationPolicy = {
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
const lifeThesisComponentPolicy = {
    entityType: 'life_thesis_component',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['component', 'category', 'description'],
    ttlDays: 0,
};
const valueStatementPolicy = {
    entityType: 'value_statement',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['value', 'meaning', 'evidence'],
    ttlDays: 0,
};
const purposeExplorationPolicy = {
    entityType: 'purpose_exploration',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['exploration', 'trigger', 'insights'],
    ttlDays: 0,
};
const wisdomInsightPolicy = {
    entityType: 'wisdom_insight',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['insight', 'source', 'category'],
    ttlDays: 0,
};
const lifeLessonPolicy = {
    entityType: 'life_lesson',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['lesson', 'experience', 'applicationArea'],
    ttlDays: 0,
};
const perspectiveShiftPolicy = {
    entityType: 'perspective_shift',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['from', 'to', 'catalyst', 'impact'],
    ttlDays: 0,
};
const existentialQuestionPolicy = {
    entityType: 'existential_question',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['question', 'context', 'currentThinking'],
    ttlDays: 0,
};
const legacyThoughtPolicy = {
    entityType: 'legacy_thought',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['thought', 'category', 'significance'],
    ttlDays: 0,
};
// ============================================================================
// LIFE STAGE POLICIES
// ============================================================================
const newParentPolicy = {
    entityType: 'new_parent',
    priority: 'always',
    conditions: {
        maxPerUser: 5,
    },
    contentFields: ['babyAge', 'identityStage', 'sleepDeprivation', 'supportNetwork', 'notes'],
    ttlDays: 0,
};
const emptyNestPolicy = {
    entityType: 'empty_nest',
    priority: 'always',
    conditions: {
        maxPerUser: 5,
    },
    contentFields: ['childrenMoved', 'adjustmentPhase', 'newPursuit', 'notes'],
    ttlDays: 0,
};
const infidelityRecoveryPolicy = {
    entityType: 'infidelity_recovery',
    priority: 'always',
    conditions: {
        maxPerUser: 3,
    },
    contentFields: ['role', 'phase', 'trustLevel', 'therapyInvolved', 'notes'],
    ttlDays: 0,
};
const healthDiagnosisPolicy = {
    entityType: 'health_diagnosis',
    priority: 'always',
    conditions: {
        maxPerUser: 10,
    },
    contentFields: ['condition', 'severity', 'treatmentPlan', 'emotionalStage', 'notes'],
    ttlDays: 0,
};
const jobLossPolicy = {
    entityType: 'job_loss',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 5,
    },
    contentFields: ['reason', 'financialBuffer', 'jobSearchActive', 'identityImpact', 'notes'],
    ttlDays: 365,
};
const sobrietyPolicy = {
    entityType: 'sobriety',
    priority: 'always',
    conditions: {
        maxPerUser: 5,
    },
    contentFields: ['substance', 'daysSober', 'supportGroup', 'triggers', 'notes'],
    ttlDays: 0, // Never expire - recovery is lifelong
};
const sandwichGenerationPolicy = {
    entityType: 'sandwich_generation',
    priority: 'always',
    conditions: {
        maxPerUser: 3,
    },
    contentFields: ['elderCareNeeds', 'childCareNeeds', 'burnoutLevel', 'supportResources', 'notes'],
    ttlDays: 0,
};
const blendedFamilyPolicy = {
    entityType: 'blended_family',
    priority: 'always',
    conditions: {
        maxPerUser: 3,
    },
    contentFields: ['stepRelationships', 'challengeAreas', 'integrationProgress', 'notes'],
    ttlDays: 0,
};
const comingOutPolicy = {
    entityType: 'coming_out',
    priority: 'always',
    conditions: {
        maxPerUser: 3,
    },
    contentFields: ['identity', 'audiencesComeOutTo', 'supportReceived', 'challengesFaced', 'notes'],
    ttlDays: 0,
};
const faithTransitionPolicy = {
    entityType: 'faith_transition',
    priority: 'always',
    conditions: {
        maxPerUser: 3,
    },
    contentFields: ['fromFaith', 'toFaith', 'stage', 'communityImpact', 'notes'],
    ttlDays: 0,
};
// ============================================================================
// LOCATION & PLACES POLICIES
// ============================================================================
const favoritePlacePolicy = {
    entityType: 'favorite_place',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['name', 'type', 'location', 'whyLoved', 'memories'],
    ttlDays: 0,
};
const locationMemoryPolicy = {
    entityType: 'location_memory',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['place', 'memory', 'emotion', 'significance'],
    ttlDays: 0,
};
const geographicPreferencePolicy = {
    entityType: 'geographic_preference',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['preferenceType', 'preference', 'reason'],
    ttlDays: 0,
};
// ============================================================================
// PETS & ANIMALS POLICIES
// ============================================================================
const petPolicy = {
    entityType: 'pet',
    priority: 'always',
    conditions: {
        maxPerUser: 10,
    },
    contentFields: ['name', 'species', 'breed', 'personality', 'quirks'],
    ttlDays: 0, // Pets are forever family
};
const petHealthPolicy = {
    entityType: 'pet_health',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['petName', 'recordType', 'description', 'nextDue'],
    ttlDays: 365,
};
const petMilestonePolicy = {
    entityType: 'pet_milestone',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['petName', 'milestone', 'type', 'date'],
    ttlDays: 0,
};
// ============================================================================
// PROPERTY & VEHICLES POLICIES
// ============================================================================
const vehiclePolicy = {
    entityType: 'vehicle',
    priority: 'always',
    conditions: {
        maxPerUser: 5,
    },
    contentFields: ['make', 'model', 'year', 'nickname', 'maintenanceSchedule'],
    ttlDays: 0,
};
const homeMaintenancePolicy = {
    entityType: 'home_maintenance',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 30,
    },
    contentFields: ['task', 'category', 'frequency', 'nextDue'],
    ttlDays: 365,
};
const propertyAssetPolicy = {
    entityType: 'property_asset',
    priority: 'always',
    conditions: {
        maxPerUser: 10,
    },
    contentFields: ['name', 'type', 'address', 'currentValue'],
    ttlDays: 0,
};
// ============================================================================
// INSURANCE & LEGAL POLICIES
// ============================================================================
const insurancePolicyPolicy = {
    entityType: 'insurance_policy',
    priority: 'always',
    conditions: {
        maxPerUser: 15,
    },
    contentFields: ['type', 'provider', 'coverage', 'expiryDate'],
    ttlDays: 0,
};
const legalDocumentPolicy = {
    entityType: 'legal_document',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['type', 'description', 'status', 'lastUpdated'],
    ttlDays: 0,
};
// ============================================================================
// CRISIS & SUPPORT POLICIES
// ============================================================================
const crisisEpisodePolicy = {
    entityType: 'crisis_episode',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['description', 'type', 'severity', 'resolution', 'whatHelped', 'lessonsLearned'],
    ttlDays: 0, // Never forget how we supported them
};
const supportReceivedPolicy = {
    entityType: 'support_received',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['from', 'type', 'description', 'impact'],
    ttlDays: 0,
};
// ============================================================================
// USER CORRECTIONS & LEARNING POLICIES
// ============================================================================
const userCorrectionPolicy = {
    entityType: 'user_correction',
    priority: 'always',
    conditions: {
        maxPerUser: 200, // Important to remember ALL corrections
    },
    contentFields: ['whatFerniSaid', 'whatUserCorrected', 'correctInformation', 'category'],
    ttlDays: 0, // Never forget corrections - this is how we learn
};
const implicitPreferencePolicy = {
    entityType: 'implicit_preference',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['preference', 'category', 'evidence', 'confidence'],
    ttlDays: 0,
};
// ============================================================================
// OUTREACH HISTORY POLICIES
// ============================================================================
const outreachAttemptPolicy = {
    entityType: 'outreach_attempt',
    priority: 'always',
    conditions: {
        maxPerUser: 500, // Track all outreach for learning
    },
    contentFields: ['type', 'channel', 'reason', 'status', 'triggeredBy'],
    ttlDays: 365, // Keep for a year for pattern learning
};
const outreachResponsePolicy = {
    entityType: 'outreach_response',
    priority: 'always',
    conditions: {
        maxPerUser: 500,
    },
    contentFields: ['responseType', 'sentiment', 'feedback', 'ledToSession'],
    ttlDays: 365,
};
const outreachPreferencePolicy = {
    entityType: 'outreach_preference',
    priority: 'always',
    conditions: {
        maxPerUser: 5,
    },
    contentFields: ['preferredChannels', 'preferredTimes', 'frequency', 'doNotDisturb'],
    ttlDays: 0,
};
// ============================================================================
// PERSONA INTERACTION POLICIES
// ============================================================================
const personaAffinityPolicy = {
    entityType: 'persona_affinity',
    priority: 'always',
    conditions: {
        maxPerUser: 10, // One per persona
    },
    contentFields: ['personaId', 'personaName', 'affinityScore', 'topTopics', 'emotionalResonance'],
    ttlDays: 0,
};
const handoffPreferencePolicy = {
    entityType: 'handoff_preference',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['fromPersona', 'toPersona', 'triggerTopics', 'userApproved'],
    ttlDays: 0,
};
const personaInteractionHistoryPolicy = {
    entityType: 'persona_interaction_history',
    priority: 'always',
    conditions: {
        maxPerUser: 200,
    },
    contentFields: ['personaId', 'interactionType', 'topics', 'sentiment', 'outcome'],
    ttlDays: 365,
};
// ============================================================================
// EMOTIONAL POLICIES
// ============================================================================
const emotionalPatternPolicy = {
    entityType: 'emotional_pattern',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['pattern', 'triggers', 'frequency', 'impact'],
    ttlDays: 0,
};
const moodTriggerPolicy = {
    entityType: 'mood_trigger',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['trigger', 'moodEffect', 'intensity'],
    ttlDays: 0,
};
const copingStrategyPolicy = {
    entityType: 'coping_strategy',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['strategy', 'forSituation', 'effectiveness'],
    ttlDays: 0,
};
const behavioralTriggerPolicy = {
    entityType: 'behavioral_trigger',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['trigger', 'behavior', 'context'],
    ttlDays: 0,
};
const decisionPatternPolicy = {
    entityType: 'decision_pattern',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['pattern', 'context', 'outcome'],
    ttlDays: 0,
};
const procrastinationPatternPolicy = {
    entityType: 'procrastination_pattern',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['pattern', 'trigger', 'impact'],
    ttlDays: 0,
};
const anxietyPatternPolicy = {
    entityType: 'anxiety_pattern',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['pattern', 'triggers', 'coping'],
    ttlDays: 0,
};
const joyTriggerPolicy = {
    entityType: 'joy_trigger',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['trigger', 'context', 'intensity'],
    ttlDays: 0,
};
// ============================================================================
// MISCELLANEOUS POLICIES
// ============================================================================
const travelPreferencePolicy = {
    entityType: 'travel_preference',
    priority: 'always',
    conditions: {
        maxPerUser: 20,
    },
    contentFields: ['preference', 'type', 'notes'],
    ttlDays: 0,
};
const bucketListItemPolicy = {
    entityType: 'bucket_list_item',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['item', 'category', 'why'],
    ttlDays: 0,
};
const homeProjectPolicy = {
    entityType: 'home_project',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 20,
    },
    contentFields: ['project', 'status', 'timeline'],
    ttlDays: 180,
};
const creativeProjectPolicy = {
    entityType: 'creative_project',
    priority: 'active_only',
    conditions: {
        activeOnly: true,
        maxPerUser: 20,
    },
    contentFields: ['project', 'medium', 'status'],
    ttlDays: 0,
};
const learningResourcePolicy = {
    entityType: 'learning_resource',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['resource', 'topic', 'type'],
    ttlDays: 365,
};
const decisionRecordPolicy = {
    entityType: 'decision_record',
    priority: 'always',
    conditions: {
        maxPerUser: 30,
    },
    contentFields: ['decision', 'reasoning', 'outcome'],
    ttlDays: 0,
};
// ============================================================================
// CONVERSATION POLICIES
// ============================================================================
/**
 * Conversation threads - Track active conversations for context
 * Closed conversations are skipped (handled by hook's shouldSkip)
 */
const conversationThreadPolicy = {
    entityType: 'conversation_thread',
    priority: 'active_only',
    conditions: {
        activeOnly: true, // Only index active/open threads
        maxPerUser: 20, // Keep recent threads for context
    },
    contentFields: ['topic', 'emotionalContext', 'participantAgents'],
    ttlDays: 30, // Conversations fade after a month
};
// ============================================================================
// BETTER THAN HUMAN POLICIES - What makes us superhuman
// ============================================================================
/**
 * Voice biomarkers - "We hear what you're not saying"
 * Short TTL since these are frequent readings
 */
const voiceBiomarkerPolicy = {
    entityType: 'voice_biomarker',
    priority: 'always',
    conditions: {
        maxPerUser: 100, // Many readings per session
    },
    contentFields: ['emotion', 'voiceFeatures', 'context', 'insights'],
    ttlDays: 30, // Short-term - patterns matter more than individual readings
};
/**
 * Session summaries - "We remember your whole story"
 * Long TTL - every conversation is important
 */
const sessionSummaryPolicy = {
    entityType: 'session_summary',
    priority: 'always',
    conditions: {
        maxPerUser: 500, // We want to remember ALL conversations
    },
    contentFields: ['summary', 'keyTopics', 'emotionalArc', 'promises', 'breakthroughs'],
    ttlDays: 0, // Never expire - this IS our memory
};
/**
 * Pattern insights - "We see patterns you can't see yourself"
 */
const patternInsightPolicy = {
    entityType: 'pattern_insight',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['pattern', 'category', 'evidence', 'significance'],
    ttlDays: 0, // Patterns are long-term insights
};
/**
 * Behavioral patterns - "We understand how you tick"
 */
const behavioralPatternPolicy = {
    entityType: 'behavioral_pattern',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['behavior', 'trigger', 'frequency', 'impact', 'observations'],
    ttlDays: 0,
};
/**
 * Cross-session threads - "We connect the dots across time"
 */
const crossSessionThreadPolicy = {
    entityType: 'cross_session_thread',
    priority: 'always',
    conditions: {
        maxPerUser: 50,
    },
    contentFields: ['topic', 'evolution', 'emotionalSignificance'],
    ttlDays: 0, // Threads represent important connections
};
/**
 * Correlation insights - "We find connections you'd never notice"
 */
const correlationInsightPolicy = {
    entityType: 'correlation_insight',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['connection', 'domainA', 'domainB', 'examples', 'implications'],
    ttlDays: 365, // Keep for a year - correlations are valuable
};
/**
 * Protective moments - "We know when NOT to say something"
 */
const protectiveMomentPolicy = {
    entityType: 'protective_moment',
    priority: 'always',
    conditions: {
        maxPerUser: 100,
    },
    contentFields: ['situation', 'whatWeDidntSay', 'whyWeHeld', 'userState'],
    ttlDays: 0, // Never forget what's sensitive
};
/**
 * Voice recognition - "We know your voice"
 */
const voiceRecognitionPolicy = {
    entityType: 'voice_recognition',
    priority: 'always',
    conditions: {
        maxPerUser: 5, // One per user, but allow family voices
    },
    contentFields: ['voiceCharacteristics', 'confidenceScore'],
    ttlDays: 0,
};
// ============================================================================
// DEFAULT POLICY
// ============================================================================
export const DEFAULT_INDEXING_POLICY = {
    entities: [
        // Productivity
        habitPolicy,
        taskPolicy,
        routinePolicy,
        billPolicy,
        medicationPolicy,
        packagePolicy,
        // Financial
        budgetPolicy,
        savingsGoalPolicy,
        subscriptionPolicy,
        spendingTriggerPolicy,
        investmentPolicy,
        debtPolicy,
        // Life Data
        milestonePolicy,
        lifeGoalPolicy,
        retirementPlanPolicy,
        notePolicy,
        journalPolicy,
        tripPolicy,
        // Trust Systems
        commitmentPolicy,
        boundaryPolicy,
        growthReflectionPolicy,
        insideJokePolicy,
        smallWinPolicy,
        thinkingOfYouPolicy,
        readingBetweenLinesPolicy,
        tonalMemoryPolicy,
        vulnerabilityMomentPolicy,
        trustMilestonePolicy,
        // Memory Enhancement (NEW - December 2024)
        curiosityMentionPolicy,
        betweenSessionThinkingPolicy,
        personaGrowthPolicy,
        conversationTexturePolicy,
        // Superhuman
        dreamPolicy,
        lifeChapterPolicy,
        valuesAlignmentPolicy,
        capacityStatePolicy,
        relationshipMilestonePolicy,
        seasonalPatternPolicy,
        emotionalFirstAidPolicy,
        predictiveInsightPolicy,
        commitmentKeeperPolicy,
        relationshipNetworkPolicy,
        conflictMemoryPolicy,
        recoveryMilestonePolicy,
        // Calendar
        calendarEventPolicy,
        meetingMemoryPolicy,
        recurringCommitmentPolicy,
        calendarConflictPolicy,
        meetingPrepPolicy,
        availabilityPatternPolicy,
        timeBlockPolicy,
        deadlinePolicy,
        // Contacts
        contactPolicy,
        relationshipNotePolicy,
        giftIdeaPolicy,
        importantDatePolicy,
        contactInteractionPolicy,
        relationshipHealthPolicy,
        familyMemberPolicy,
        friendMemoryPolicy,
        professionalContactPolicy,
        communicationPreferencePolicy,
        // Coaching
        coachingInsightPolicy,
        breakthroughMomentPolicy,
        stuckPatternPolicy,
        reframeSuggestionPolicy,
        growthEdgePolicy,
        strengthIdentifiedPolicy,
        blindSpotPolicy,
        accountabilityItemPolicy,
        behaviorChangePolicy,
        motivationInsightPolicy,
        // Health
        healthGoalPolicy,
        sleepPatternPolicy,
        energyLevelPolicy,
        workoutPolicy,
        wellnessCheckinPolicy,
        mentalHealthNotePolicy,
        nutritionGoalPolicy,
        bodyAwarenessPolicy,
        stressTriggerPolicy,
        recoveryPracticePolicy,
        // Media
        musicPreferencePolicy,
        emotionalSongPolicy,
        playlistMemoryPolicy,
        bookHighlightPolicy,
        readingGoalPolicy,
        podcastInsightPolicy,
        moviePreferencePolicy,
        gamePreferencePolicy,
        contentRecommendationPolicy,
        mediaMemoryPolicy,
        // Career
        careerGoalPolicy,
        jobSearchPolicy,
        skillDevelopmentPolicy,
        professionalNetworkPolicy,
        workAchievementPolicy,
        careerReflectionPolicy,
        workChallengePolicy,
        careerAspirationPolicy,
        // Wisdom
        lifeThesisComponentPolicy,
        valueStatementPolicy,
        purposeExplorationPolicy,
        wisdomInsightPolicy,
        lifeLessonPolicy,
        perspectiveShiftPolicy,
        existentialQuestionPolicy,
        legacyThoughtPolicy,
        // Emotional
        emotionalPatternPolicy,
        moodTriggerPolicy,
        copingStrategyPolicy,
        behavioralTriggerPolicy,
        decisionPatternPolicy,
        procrastinationPatternPolicy,
        anxietyPatternPolicy,
        joyTriggerPolicy,
        // Miscellaneous
        travelPreferencePolicy,
        bucketListItemPolicy,
        homeProjectPolicy,
        creativeProjectPolicy,
        learningResourcePolicy,
        decisionRecordPolicy,
        // Conversation
        conversationThreadPolicy,
        // Better Than Human - What makes us superhuman
        voiceBiomarkerPolicy,
        sessionSummaryPolicy,
        patternInsightPolicy,
        behavioralPatternPolicy,
        crossSessionThreadPolicy,
        correlationInsightPolicy,
        protectiveMomentPolicy,
        voiceRecognitionPolicy,
        // Life Stage Transitions
        newParentPolicy,
        emptyNestPolicy,
        infidelityRecoveryPolicy,
        healthDiagnosisPolicy,
        jobLossPolicy,
        sobrietyPolicy,
        sandwichGenerationPolicy,
        blendedFamilyPolicy,
        comingOutPolicy,
        faithTransitionPolicy,
        // Location & Places
        favoritePlacePolicy,
        locationMemoryPolicy,
        geographicPreferencePolicy,
        // Pets & Animals
        petPolicy,
        petHealthPolicy,
        petMilestonePolicy,
        // Property & Vehicles
        vehiclePolicy,
        homeMaintenancePolicy,
        propertyAssetPolicy,
        // Insurance & Legal
        insurancePolicyPolicy,
        legalDocumentPolicy,
        // Crisis & Support
        crisisEpisodePolicy,
        supportReceivedPolicy,
        // User Corrections & Learning
        userCorrectionPolicy,
        implicitPreferencePolicy,
        // Outreach History
        outreachAttemptPolicy,
        outreachResponsePolicy,
        outreachPreferencePolicy,
        // Persona Interaction
        personaAffinityPolicy,
        handoffPreferencePolicy,
        personaInteractionHistoryPolicy,
    ],
    maxDocsPerUser: 600, // Increased to support more entity types
    debounceMs: 2000,
};
// ============================================================================
// POLICY HELPERS
// ============================================================================
let currentPolicy = DEFAULT_INDEXING_POLICY;
/**
 * Get the current indexing policy
 */
export function getIndexingPolicy() {
    return currentPolicy;
}
/**
 * Update the indexing policy
 */
export function setIndexingPolicy(policy) {
    currentPolicy = { ...currentPolicy, ...policy };
}
/**
 * Get policy for a specific entity type
 */
export function getEntityPolicy(entityType) {
    return currentPolicy.entities.find((e) => e.entityType === entityType);
}
/**
 * Check if an entity should be indexed based on policy
 */
export function shouldIndex(entityType, entity) {
    const policy = getEntityPolicy(entityType);
    if (!policy) {
        return { shouldIndex: false, reason: 'No policy defined for entity type' };
    }
    if (policy.priority === 'never') {
        return { shouldIndex: false, reason: 'Policy priority is never' };
    }
    const conditions = policy.conditions || {};
    // Check active condition
    if (conditions.activeOnly) {
        const isActive = entity.isActive === true ||
            entity.status === 'active' ||
            entity.status === 'planning' ||
            entity.status === 'in-progress' ||
            entity.status === 'exploring' ||
            entity.status === 'upcoming' ||
            entity.status === 'pending' ||
            entity.completed === false ||
            entity.isPaid === false ||
            entity.delivered === false ||
            entity.resolved === false;
        if (!isActive) {
            return { shouldIndex: false, reason: 'Entity is not active' };
        }
    }
    // Check important condition
    if (conditions.importantOnly) {
        const isImportant = entity.priority === 'high' ||
            entity.priority === 'urgent' ||
            entity.priority === 'critical' ||
            entity.importance === 'high';
        if (!isImportant) {
            return { shouldIndex: false, reason: 'Entity is not important' };
        }
    }
    // Check minimum value
    if (conditions.minValue !== undefined) {
        const value = entity.amount || entity.targetAmount || 0;
        if (value < conditions.minValue) {
            return { shouldIndex: false, reason: `Value ${value} below minimum ${conditions.minValue}` };
        }
    }
    return { shouldIndex: true, reason: 'Passes all policy conditions' };
}
/**
 * Build indexable content from entity based on policy
 */
export function buildIndexContent(entityType, entity) {
    const policy = getEntityPolicy(entityType);
    if (!policy)
        return '';
    const parts = [];
    // Add entity type label
    parts.push(`${entityType.replace(/_/g, ' ')}:`);
    // Add configured fields
    for (const field of policy.contentFields) {
        const value = entity[field];
        if (value !== undefined && value !== null && value !== '') {
            if (Array.isArray(value)) {
                parts.push(`${field}: ${value.join(', ')}`);
            }
            else if (typeof value === 'object') {
                parts.push(`${field}: ${JSON.stringify(value)}`);
            }
            else {
                parts.push(`${value}`);
            }
        }
    }
    return parts.join(' ').trim();
}
/**
 * Get all policies as a record keyed by entity type
 */
export function getAllPolicies() {
    const policies = {};
    for (const entityPolicy of currentPolicy.entities) {
        policies[entityPolicy.entityType] = entityPolicy;
    }
    return policies;
}
/**
 * Get all policies grouped by domain
 */
export function getPoliciesByDomain() {
    return {
        productivity: [
            habitPolicy,
            taskPolicy,
            routinePolicy,
            billPolicy,
            medicationPolicy,
            packagePolicy,
        ],
        financial: [
            budgetPolicy,
            savingsGoalPolicy,
            subscriptionPolicy,
            spendingTriggerPolicy,
            investmentPolicy,
            debtPolicy,
        ],
        lifeData: [
            milestonePolicy,
            lifeGoalPolicy,
            retirementPlanPolicy,
            notePolicy,
            journalPolicy,
            tripPolicy,
        ],
        trust: [
            commitmentPolicy,
            boundaryPolicy,
            growthReflectionPolicy,
            insideJokePolicy,
            smallWinPolicy,
            thinkingOfYouPolicy,
            readingBetweenLinesPolicy,
            tonalMemoryPolicy,
            vulnerabilityMomentPolicy,
            trustMilestonePolicy,
            // Memory Enhancement (NEW - December 2024)
            curiosityMentionPolicy,
            betweenSessionThinkingPolicy,
            personaGrowthPolicy,
            conversationTexturePolicy,
        ],
        superhuman: [
            dreamPolicy,
            lifeChapterPolicy,
            valuesAlignmentPolicy,
            capacityStatePolicy,
            relationshipMilestonePolicy,
            seasonalPatternPolicy,
            emotionalFirstAidPolicy,
            predictiveInsightPolicy,
            commitmentKeeperPolicy,
            relationshipNetworkPolicy,
            conflictMemoryPolicy,
            recoveryMilestonePolicy,
        ],
        calendar: [
            calendarEventPolicy,
            meetingMemoryPolicy,
            recurringCommitmentPolicy,
            calendarConflictPolicy,
            meetingPrepPolicy,
            availabilityPatternPolicy,
            timeBlockPolicy,
            deadlinePolicy,
        ],
        contacts: [
            contactPolicy,
            relationshipNotePolicy,
            giftIdeaPolicy,
            importantDatePolicy,
            contactInteractionPolicy,
            relationshipHealthPolicy,
            familyMemberPolicy,
            friendMemoryPolicy,
            professionalContactPolicy,
            communicationPreferencePolicy,
        ],
        coaching: [
            coachingInsightPolicy,
            breakthroughMomentPolicy,
            stuckPatternPolicy,
            reframeSuggestionPolicy,
            growthEdgePolicy,
            strengthIdentifiedPolicy,
            blindSpotPolicy,
            accountabilityItemPolicy,
            behaviorChangePolicy,
            motivationInsightPolicy,
        ],
        health: [
            healthGoalPolicy,
            sleepPatternPolicy,
            energyLevelPolicy,
            workoutPolicy,
            wellnessCheckinPolicy,
            mentalHealthNotePolicy,
            nutritionGoalPolicy,
            bodyAwarenessPolicy,
            stressTriggerPolicy,
            recoveryPracticePolicy,
        ],
        media: [
            musicPreferencePolicy,
            emotionalSongPolicy,
            playlistMemoryPolicy,
            bookHighlightPolicy,
            readingGoalPolicy,
            podcastInsightPolicy,
            moviePreferencePolicy,
            gamePreferencePolicy,
            contentRecommendationPolicy,
            mediaMemoryPolicy,
        ],
        career: [
            careerGoalPolicy,
            jobSearchPolicy,
            skillDevelopmentPolicy,
            professionalNetworkPolicy,
            workAchievementPolicy,
            careerReflectionPolicy,
            workChallengePolicy,
            careerAspirationPolicy,
        ],
        wisdom: [
            lifeThesisComponentPolicy,
            valueStatementPolicy,
            purposeExplorationPolicy,
            wisdomInsightPolicy,
            lifeLessonPolicy,
            perspectiveShiftPolicy,
            existentialQuestionPolicy,
            legacyThoughtPolicy,
        ],
        emotional: [
            emotionalPatternPolicy,
            moodTriggerPolicy,
            copingStrategyPolicy,
            behavioralTriggerPolicy,
            decisionPatternPolicy,
            procrastinationPatternPolicy,
            anxietyPatternPolicy,
            joyTriggerPolicy,
        ],
        miscellaneous: [
            travelPreferencePolicy,
            bucketListItemPolicy,
            homeProjectPolicy,
            creativeProjectPolicy,
            learningResourcePolicy,
            decisionRecordPolicy,
        ],
        lifeStage: [
            newParentPolicy,
            emptyNestPolicy,
            infidelityRecoveryPolicy,
            healthDiagnosisPolicy,
            jobLossPolicy,
            sobrietyPolicy,
            sandwichGenerationPolicy,
            blendedFamilyPolicy,
            comingOutPolicy,
            faithTransitionPolicy,
        ],
        location: [favoritePlacePolicy, locationMemoryPolicy, geographicPreferencePolicy],
        pets: [petPolicy, petHealthPolicy, petMilestonePolicy],
        property: [vehiclePolicy, homeMaintenancePolicy, propertyAssetPolicy],
        legal: [insurancePolicyPolicy, legalDocumentPolicy],
        crisis: [crisisEpisodePolicy, supportReceivedPolicy],
        learning: [userCorrectionPolicy, implicitPreferencePolicy],
        outreachHistory: [outreachAttemptPolicy, outreachResponsePolicy, outreachPreferencePolicy],
        personaInteraction: [
            personaAffinityPolicy,
            handoffPreferencePolicy,
            personaInteractionHistoryPolicy,
        ],
    };
}
//# sourceMappingURL=indexing-policy.js.map
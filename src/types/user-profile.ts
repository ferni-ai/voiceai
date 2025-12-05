/**
 * User Profile Types
 *
 * Comprehensive type definitions for persistent user memory,
 * preferences, relationship history, and financial context.
 */

// ============================================================================
// VOICE MEMORY
// ============================================================================

/**
 * Voice sketch - compact representation of voice characteristics
 * Used for "Your voice sounds familiar" recognition across devices
 */
export interface VoiceSketch {
  // Pitch characteristics (in Hz)
  pitchMean: number; // Average fundamental frequency
  pitchMin: number; // Lowest pitch observed
  pitchMax: number; // Highest pitch observed
  pitchStdDev: number; // How much pitch varies

  // Timing characteristics
  speakingRateMean: number; // Average syllables per second (estimated)
  pauseFrequency: number; // How often they pause (pauses per minute)
  avgPauseDuration: number; // Average pause length (ms)

  // Spectral characteristics (voice "color")
  spectralCentroidMean: number; // Brightness of voice
  spectralCentroidStdDev: number;
  spectralRolloffMean: number; // High frequency content

  // Energy characteristics
  energyMean: number; // Average loudness
  energyStdDev: number; // Dynamic range

  // Metadata
  samplesAnalyzed: number; // How many audio chunks contributed
  totalDurationMs: number; // Total speech analyzed
  confidence: number; // 0-1, how reliable is this sketch
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// CORE PROFILE
// ============================================================================

/**
 * Communication style learned from user interactions
 */
export type CommunicationStyle = 'formal' | 'casual' | 'playful' | 'mixed';

/**
 * User's preferred speaking pace (words per minute buckets)
 */
export type SpeakingPace = 'slow' | 'moderate' | 'fast';

/**
 * Emotional patterns observed over time
 */
export interface EmotionalPattern {
  timestamp: Date;
  emotion: string;
  intensity: number; // 0-1
  context?: string;
  trigger?: string;
}

/**
 * Important moments from conversations
 */
export interface KeyMoment {
  id: string;
  timestamp: Date;
  type:
    | 'shared_vulnerability'
    | 'breakthrough'
    | 'milestone'
    | 'concern'
    | 'celebration'
    | 'decision';
  summary: string;
  emotionalWeight: 'light' | 'medium' | 'heavy';
  topics: string[];
  followUpNeeded?: boolean;
  followUpDate?: Date;
}

/**
 * Story that Jack has shared with this user
 */
export interface SharedStory {
  storyId: string;
  theme: string;
  sharedAt: Date;
  userReaction?: 'positive' | 'neutral' | 'moved' | 'curious';
  context: string;
}

/**
 * Conversation summary for long-term memory
 */
export interface ConversationSummary {
  id: string;
  sessionId: string;
  timestamp: Date;
  duration: number; // in seconds
  turnCount: number;

  // Content
  mainTopics: string[];
  keyPoints: string[];
  emotionalArc: string; // e.g., "started anxious, ended hopeful"

  // Outcomes
  decisionsReached?: string[];
  questionsRemaining?: string[];
  followUpItems?: string[];

  // Embedding for semantic search
  embedding?: number[];
}

// ============================================================================
// FINANCIAL CONTEXT
// ============================================================================

/**
 * User's risk tolerance profile
 */
export interface RiskProfile {
  tolerance: 'conservative' | 'moderate' | 'aggressive' | 'unknown';
  confidence: number; // 0-1, how confident we are in this assessment
  assessedAt: Date;
  factors: string[]; // e.g., ["near retirement", "stable income", "low debt"]
}

/**
 * Financial goal with progress tracking
 */
export interface FinancialGoal {
  id: string;
  name: string;
  type: 'retirement' | 'education' | 'home' | 'emergency' | 'travel' | 'other';

  // Target
  targetAmount?: number;
  targetDate?: Date;
  timeHorizon: 'short' | 'medium' | 'long' | 'unknown'; // <5y, 5-15y, >15y

  // Progress
  currentProgress?: number;
  progressPercent?: number;

  // Status
  status: 'planning' | 'active' | 'on_track' | 'behind' | 'achieved' | 'abandoned';
  priority: 'high' | 'medium' | 'low';

  // History
  createdAt: Date;
  updatedAt: Date;
  milestones?: Array<{ date: Date; note: string }>;

  // Jack's perspective
  jackNotes?: string; // Jack's personal observations about this goal
}

/**
 * Significant investment-related event
 */
export interface InvestmentEvent {
  id: string;
  timestamp: Date;
  type:
    | 'started_investing'
    | 'major_contribution'
    | 'withdrawal'
    | 'rebalance'
    | 'market_concern'
    | 'goal_reached'
    | 'strategy_change'
    | 'question_asked';
  description: string;
  emotionalContext?: string;
  outcome?: string;
}

/**
 * Primary financial concern
 */
export type PrimaryConcern =
  | 'retirement'
  | 'savings'
  | 'debt'
  | 'education'
  | 'market_volatility'
  | 'inflation'
  | 'job_security'
  | 'healthcare'
  | 'legacy'
  | 'general'
  | 'none';

/**
 * Life stage of the user
 */
export type LifeStage =
  | 'young_adult'
  | 'early_career'
  | 'mid_career'
  | 'pre_retirement'
  | 'retirement';

/**
 * Significant life event (for Jordan's Life's Firsts coordination)
 */
export interface LifeEvent {
  id: string;
  type:
    | 'wedding'
    | 'baby'
    | 'first_home'
    | 'graduation'
    | 'retirement_start'
    | 'milestone_birthday'
    | 'career_change'
    | 'relocation'
    | 'loss'
    | 'celebration'
    | 'other';
  title: string;
  description?: string;
  date?: Date; // When it happened or will happen
  status: 'planning' | 'upcoming' | 'in_progress' | 'completed' | 'ongoing';

  // Planning context (for Jordan)
  budget?: number;
  checklist?: Array<{
    id: string;
    task: string;
    completed: boolean;
    dueDate?: Date;
    assignee?: 'jordan' | 'maya' | 'alex' | 'user';
  }>;

  // Related team members involved
  teamInvolved?: Array<'jordan' | 'maya' | 'alex' | 'jack' | 'peter'>;

  // Memory and sentiment
  emotionalSignificance: 'routine' | 'meaningful' | 'major' | 'life_changing';
  userSentiment?: 'excited' | 'anxious' | 'neutral' | 'mixed' | 'stressed';

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  // Notes from team members
  notes?: Array<{
    from: string;
    content: string;
    timestamp: Date;
  }>;
}

/**
 * Verbosity preference
 */
export type VerbosityPreference = 'concise' | 'balanced' | 'storytelling';

/**
 * Investment account types
 */
export interface InvestmentAccount {
  type: '401k' | 'IRA' | 'Roth IRA' | 'Brokerage' | 'HSA' | 'Other';
  hasAccount: boolean;
}

/**
 * User's current financial situation
 */
export interface FinancialSituation {
  hasEmergencyFund: boolean;
  hasDebt: boolean;
  debtTypes?: string[];
  investmentAccounts: InvestmentAccount[];
  monthlyIncome?: number;
  monthlyExpenses?: number;
}

/**
 * User preferences for personalization
 */
export interface UserPreferences {
  verbosity: VerbosityPreference;
  topicsToAvoid: string[];
  preferredGreeting?: string;
  wantsProactiveAdvice: boolean;
  financialPrivacyLevel: 'open' | 'moderate' | 'private';
}

// ============================================================================
// RELATIONSHIP CONTEXT
// ============================================================================

/**
 * Relationship stage with Jack
 */
export type RelationshipStage =
  | 'new_acquaintance' // First few conversations
  | 'getting_to_know' // Learning about each other
  | 'trusted_advisor' // Regular, trusted relationship
  | 'old_friend'; // Deep, long-term relationship

/**
 * Family member mentioned by user
 */
export interface FamilyMember {
  relationship: string; // e.g., "daughter", "spouse", "father"
  name?: string;
  mentionedTopics?: string[]; // e.g., ["college fund", "wedding"]
  lastMentioned?: Date;
}

// ============================================================================
// PER-PERSONA RELATIONSHIP TYPES
// ============================================================================

/**
 * Relationship stages with a specific persona
 * Different from global relationship - tracks depth with EACH team member
 */
export type PersonaRelationshipStage =
  | 'stranger' // First 1-2 interactions
  | 'acquaintance' // Getting to know (3-5 interactions)
  | 'friend' // Comfortable relationship (6+ interactions, shared moments)
  | 'trusted_advisor'; // Deep relationship (many interactions, vulnerability shared)

/**
 * Detailed relationship data for a specific persona
 */
export interface PerPersonaRelationshipData {
  /** Total conversation count with this persona */
  conversationCount: number;

  /** Total minutes talked (estimated) */
  totalMinutes: number;

  /** Key moments shared with this persona */
  keyMoments: Array<{
    type: 'breakthrough' | 'vulnerability' | 'celebration' | 'support' | 'humor';
    summary: string;
    timestamp: Date;
  }>;

  /** Stories this persona has told the user */
  storiesTold: string[];

  /** Vulnerability moments shared with this persona */
  vulnerabilityCount: number;

  /** Topics frequently discussed with this persona */
  frequentTopics: string[];

  /** Last interaction timestamp */
  lastInteraction?: Date;

  /** First interaction timestamp */
  firstInteraction?: Date;
}

// ============================================================================
// MAIN USER PROFILE
// ============================================================================

/**
 * Complete user profile with all persistent data
 */
export interface UserProfile {
  // Identity
  id: string;
  name?: string;
  preferredName?: string; // What Jack calls them
  linkedIdentifiers?: string[]; // Phone numbers, auth IDs linked to this profile

  // Voice Recognition - "Your voice sounds familiar"
  voiceSketch?: VoiceSketch; // Compact voice characteristics for cross-device recognition

  // Contact Information (for Alex's communication features)
  contactInfo?: {
    phone?: string; // E.164 format: +15551234567
    email?: string;
    preferredContactMethod?: 'sms' | 'email' | 'call' | 'voice_message';
    timezone?: string; // e.g., 'America/New_York'
    quietHoursStart?: number; // Hour (0-23) when do-not-disturb starts
    quietHoursEnd?: number; // Hour (0-23) when do-not-disturb ends
  };

  // Timestamps
  firstContact: Date;
  lastContact: Date;
  totalConversations: number;
  totalMinutesTalked: number;

  // Communication preferences (learned)
  communicationStyle: CommunicationStyle;
  speakingPace: SpeakingPace;
  averageWPM?: number;
  preferredTopics: string[];
  avoidTopics: string[]; // Topics they've shown discomfort with
  humorAppreciation: 'high' | 'medium' | 'low'; // Do they enjoy Jack's jokes?

  // Relationship
  relationshipStage: RelationshipStage;
  familyMembers: FamilyMember[];
  keyMoments: KeyMoment[];
  sharedStories: SharedStory[]; // Stories Jack has told them
  emotionalPatterns: EmotionalPattern[];

  // Financial context
  riskProfile: RiskProfile;
  goals: FinancialGoal[];
  primaryConcerns: PrimaryConcern[];
  investmentEvents: InvestmentEvent[];
  hasInvestments: boolean;
  investmentExperience: 'beginner' | 'intermediate' | 'experienced' | 'unknown';
  financialSituation?: FinancialSituation;
  financialAnxietyTriggers?: string[];

  // Life context
  lifeStage?: LifeStage;
  lifeEvents?: LifeEvent[]; // Significant life events (wedding, baby, first home, etc.)

  // Preferences
  preferences: UserPreferences;

  // Conversation history
  conversationSummaries: ConversationSummary[];
  lastConversationSummary?: string; // Quick access to most recent
  openQuestions: string[]; // Things they asked that weren't fully addressed
  pendingFollowUps: Array<{ topic: string; targetDate: Date; reason: string }>;

  // Session state (for current conversation)
  currentSessionId?: string;
  currentMood?: string;
  currentEnergyLevel?: 'low' | 'medium' | 'high';

  // Custom data (for extensibility)
  customData?: Record<string, unknown>;

  // ============================================================================
  // HUMANIZING STATE (cross-session persona depth)
  // ============================================================================

  /**
   * Humanizing state persisted across sessions.
   * Enables the AI to remember mood patterns, spontaneous shares,
   * and build genuine relationship depth over time.
   */
  humanizingState?: {
    /** Tags from spontaneous shares already used (to avoid repetition) */
    usedShareTags: string[];

    /** Total spontaneous shares across all sessions */
    totalSpontaneousShares: number;

    /** Last persona mood (for continuity) */
    lastMood?:
      | 'energized'
      | 'reflective'
      | 'playful'
      | 'grounded'
      | 'tired_but_present'
      | 'philosophical'
      | 'nostalgic';

    /** Mood history (last 10 moods for pattern detection) */
    moodHistory?: Array<{
      mood: string;
      timestamp: Date;
      sessionId: string;
    }>;

    /** Stories/micro-stories told to this user */
    storiesTold?: string[];

    /** Hot takes shared with this user */
    hotTakesShared?: string[];

    /** Inner world content revealed */
    innerWorldRevealed?: Array<{
      type: string;
      content: string;
      sharedAt: Date;
    }>;

    /** Relationship transition moments */
    relationshipMilestones?: Array<{
      from: string;
      to: string;
      timestamp: Date;
      acknowledgmentGiven: boolean;
    }>;

    /** Vulnerability moments shared by persona */
    vulnerabilityMoments?: number;

    /** Greetings used (hashes to prevent repetition) */
    usedGreetings?: string[];

    /** Last greeting timestamp */
    lastGreetingAt?: Date;

    /** Last updated */
    updatedAt: Date;

    /** Per-persona meeting counts (for self-aware entrances) */
    perPersonaMeetingCounts?: Record<string, number>;

    /** Last topic discussed with each persona (for memory callbacks) */
    perPersonaLastTopic?: Record<string, string>;

    /** Per-persona relationship stage (stranger -> acquaintance -> friend -> trusted_advisor) */
    perPersonaRelationshipStage?: Record<string, PersonaRelationshipStage>;

    /** Per-persona relationship depth data */
    perPersonaRelationshipData?: Record<string, PerPersonaRelationshipData>;
  };

  // ============================================================================
  // ADVANCED INTELLIGENCE DATA
  // ============================================================================

  // Response Quality - What kind of responses work with this user
  responseQuality?: {
    signals: Array<{
      id: string;
      timestamp: Date;
      responseType: string;
      responseLength: string;
      topic: string;
      userReaction: string;
      engagementScore: number;
    }>;
    preferences?: {
      likesStories: boolean;
      likesHumor: boolean;
      likesQuestions: boolean;
      prefersDirectAdvice: boolean;
      preferredResponseLength: 'brief' | 'moderate' | 'lengthy';
      highEngagementTopics: string[];
      lowEngagementTopics: string[];
    };
  };

  // Conversation Patterns - When/how they like to chat
  conversationPatterns?: {
    sessions: Array<{
      id: string;
      startedAt: Date;
      endedAt: Date;
      dayOfWeek: string;
      timeOfDay: string;
      durationMinutes: number;
      openingStyle: string;
      topicSequence: string[];
    }>;
    preferences?: {
      preferredTimes: string[];
      preferredDays: string[];
      avgDuration: number;
      likesSmallTalkFirst: boolean;
      prefersQuickConversations: boolean;
    };
  };

  // Proactive Insights - Generated insights for this user
  proactiveInsights?: Array<{
    id: string;
    type: string;
    priority: string;
    title: string;
    message: string;
    generatedAt: Date;
    delivered: boolean;
    deliveredAt?: Date;
    userReaction?: string;
  }>;

  // Financial Journey - Long-term progress tracking
  financialJourney?: {
    startedAt: Date;
    snapshots: Array<{
      id: string;
      date: Date;
      type: string;
      emergencyFundStatus: string;
      hasDebt: boolean;
      hasInvestments: boolean;
      goalsAchieved: number;
      financialConfidence: string;
    }>;
    milestones: Array<{
      id: string;
      date: Date;
      type: string;
      title: string;
      description: string;
      celebrationGiven: boolean;
    }>;
  };

  // Cross-Session Threads - Topics to continue
  openThreads?: Array<{
    id: string;
    topic: string;
    reason: string;
    priority: string;
    suggestedResumption: string;
    status: 'open' | 'resumed' | 'closed';
    createdAt: Date;
  }>;

  // Promised Follow-ups - Things Jack said he'd do
  promisedFollowUps?: Array<{
    id: string;
    type: string;
    description: string;
    delivered: boolean;
    createdAt: Date;
  }>;

  // Voice Pace - Speaking rhythm preferences
  voicePace?: {
    observations: Array<{
      timestamp: Date;
      userWPM: number;
      userMessageLength: number;
      userResponseTime: number;
    }>;
    preferences?: {
      avgWPM: number;
      preferredPauseLength: number;
      preferredTempo: string;
      recommendedJackWPM: number;
      recommendedResponseLength: 'brief' | 'moderate' | 'detailed';
    };
  };

  // ============================================================================
  // PERSONA MEMORIES - What each persona remembers about this user
  // ============================================================================

  personaMemories?: {
    // Ferni (Life Coach) - Preferences, wins, topics
    jackie?: Array<{
      id: string;
      type: 'preference' | 'win' | 'topic' | 'style' | 'music' | 'inside_joke';
      name: string;
      details?: string;
      sentiment?: 'positive' | 'negative' | 'neutral';
      tags: string[];
      createdAt: Date;
      timesReferenced: number;
    }>;

    // Jack Bogle - Funds, philosophy, allocations
    bogle?: Array<{
      id: string;
      type: 'fund' | 'philosophy' | 'allocation' | 'wisdom' | 'avoid';
      name: string;
      ticker?: string;
      category?: 'index' | 'bond' | 'international' | 'balanced' | 'sector';
      expenseRatio?: number;
      sentiment?: 'positive' | 'negative' | 'neutral';
      tags: string[];
      createdAt: Date;
      timesReferenced: number;
    }>;

    // Peter John - Stocks, watchlist, companies
    peter?: Array<{
      id: string;
      type: 'stock' | 'company' | 'watchlist' | 'story' | 'ten_bagger' | 'avoid';
      name: string;
      ticker?: string;
      sector?: string;
      reason?: string; // "I use their products", etc.
      priceWhenAdded?: number;
      targetPrice?: number;
      sentiment?: 'positive' | 'negative' | 'neutral' | 'watchful';
      tags: string[];
      createdAt: Date;
      timesReferenced: number;
    }>;

    // Maya - Merchants, triggers, bills, goals
    maya?: Array<{
      id: string;
      type: 'merchant' | 'bill' | 'subscription' | 'savings_goal' | 'trigger' | 'category' | 'win';
      name: string;
      merchantCategory?: string;
      averageSpend?: number;
      dueDate?: number;
      amount?: number;
      targetAmount?: number;
      currentAmount?: number;
      isAutoPay?: boolean;
      sentiment?: 'positive' | 'negative' | 'neutral';
      notes?: string;
      tags: string[];
      createdAt: Date;
      timesReferenced: number;
    }>;

    // Jordan - Dates, venues, destinations
    jordan?: Array<{
      id: string;
      type: 'date' | 'venue' | 'vendor' | 'destination' | 'milestone' | 'preference';
      name: string;
      date?: string;
      recurring?: 'yearly' | 'monthly' | 'once';
      person?: string;
      location?: string;
      priceRange?: string;
      rating?: number;
      sentiment?: 'positive' | 'negative' | 'neutral';
      notes?: string;
      tags: string[];
      createdAt: Date;
      timesReferenced: number;
    }>;

    // Alex - Contacts are in separate contacts service
    alex?: Array<{
      id: string;
      type: 'communication_preference' | 'scheduling_note' | 'contact_note';
      name: string;
      details?: string;
      tags: string[];
      createdAt: Date;
      timesReferenced: number;
    }>;
  };

  // ============================================================================
  // PRODUCTIVITY DATA (daily tools)
  // ============================================================================

  /**
   * Productivity data for daily tools (tasks, bills, habits, etc.)
   * Stored as a nested object for efficient persistence.
   */
  productivityData?: {
    userId: string;
    lastUpdated: Date;
    tasks?: unknown[];
    bills?: unknown[];
    billPayments?: unknown[];
    routines?: unknown[];
    routineCompletions?: unknown[];
    notes?: unknown[];
    journalEntries?: unknown[];
    habits?: unknown[];
    habitLogs?: unknown[];
    shoppingLists?: unknown[];
    medications?: unknown[];
    doseLogs?: unknown[];
    packages?: unknown[];
    savedTrips?: unknown[];
    flightSearches?: unknown[];
    hotelSearches?: unknown[];
  };

  /**
   * Background tasks, workflows, and scheduled jobs.
   * Enables async operations and multi-step processes.
   */
  backgroundData?: {
    userId: string;
    tasks?: unknown[];
    workflows?: unknown[];
    pendingActions?: unknown[];
    scheduledJobs?: unknown[];
    delegations?: unknown[];
    lastUpdated: Date;
  };

  // ============================================================================
  // COGNITIVE INTELLIGENCE DATA
  // ============================================================================

  /**
   * Cognitive intelligence data for personalized thinking adaptation.
   * Tracks how the user thinks, what approaches work, and cognitive learning.
   */
  cognitiveIntelligence?: {
    /** User's detected cognitive style */
    detectedStyle:
      | 'analytical'
      | 'emotional'
      | 'practical'
      | 'narrative'
      | 'systematic'
      | 'intuitive'
      | 'unknown';

    /** Confidence in style detection (0-1) */
    styleConfidence: number;

    /** When style was last updated */
    styleUpdatedAt: Date;

    /** Effectiveness scores by approach per persona */
    approachEffectiveness: Record<
      string,
      Array<{
        approach:
          | 'analytical'
          | 'empathetic'
          | 'narrative'
          | 'systematic'
          | 'pragmatic'
          | 'intuitive';
        totalScore: number;
        sampleCount: number;
        lastUsed: Date;
      }>
    >;

    /** Topics user has demonstrated expertise in */
    expertiseAreas: string[];

    /** Topics user is learning */
    noviceAreas: string[];

    /** Topics that have been explained (don't re-explain) */
    explainedTopics: Record<
      string,
      {
        personaId: string;
        level: 'introduced' | 'explained' | 'deep_dive';
        lastExplained: Date;
        revisits: number;
      }
    >;

    /** Concepts user has demonstrated understanding of */
    demonstratedUnderstanding: string[];

    /** Cognitive approach preferences by topic */
    topicPreferences: Record<
      string,
      {
        preferredApproach: string;
        confidence: number;
      }
    >;

    /** Total cognitive interactions tracked */
    totalInteractions: number;

    /** Per-persona cognitive relationship data */
    perPersonaCognitiveData?: Record<
      string,
      {
        /** Effective approaches with this persona */
        effectiveApproaches: string[];
        /** Ineffective approaches with this persona */
        ineffectiveApproaches: string[];
        /** Topics explained by this persona */
        explainedTopics: string[];
        /** Relationship cognitive growth stage */
        cognitiveGrowthStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
      }
    >;

    /** Last updated */
    updatedAt: Date;
  };

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  version: number; // For migration purposes
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a new user profile with defaults
 */
export function createUserProfile(id: string, name?: string): UserProfile {
  const now = new Date();

  return {
    id,
    name,
    contactInfo: undefined, // Will be populated when user provides phone/email
    firstContact: now,
    lastContact: now,
    totalConversations: 0,
    totalMinutesTalked: 0,

    communicationStyle: 'mixed',
    speakingPace: 'moderate',
    preferredTopics: [],
    avoidTopics: [],
    humorAppreciation: 'medium',

    relationshipStage: 'new_acquaintance',
    familyMembers: [],
    keyMoments: [],
    sharedStories: [],
    emotionalPatterns: [],

    riskProfile: {
      tolerance: 'unknown',
      confidence: 0,
      assessedAt: now,
      factors: [],
    },
    goals: [],
    primaryConcerns: [],
    investmentEvents: [],
    hasInvestments: false,
    investmentExperience: 'unknown',
    financialSituation: undefined,
    financialAnxietyTriggers: [],

    lifeStage: undefined,

    preferences: {
      verbosity: 'balanced',
      topicsToAvoid: [],
      wantsProactiveAdvice: true,
      financialPrivacyLevel: 'moderate',
    },

    conversationSummaries: [],
    openQuestions: [],
    pendingFollowUps: [],

    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

/**
 * Update relationship stage based on interaction count and depth
 */
export function calculateRelationshipStage(profile: UserProfile): RelationshipStage {
  const { totalConversations, totalMinutesTalked, keyMoments } = profile;
  const deepMoments = keyMoments.filter((m) => m.emotionalWeight === 'heavy').length;

  if (totalConversations <= 2) {
    return 'new_acquaintance';
  }

  if (totalConversations <= 5 && totalMinutesTalked < 60) {
    return 'getting_to_know';
  }

  if (totalConversations >= 10 && deepMoments >= 3) {
    return 'old_friend';
  }

  if (totalConversations >= 5 || deepMoments >= 1) {
    return 'trusted_advisor';
  }

  return 'getting_to_know';
}

/**
 * Merge new session data into existing profile
 */
export function updateProfileFromSession(
  profile: UserProfile,
  sessionData: Partial<{
    name: string;
    mood: string;
    energyLevel: 'low' | 'medium' | 'high';
    topicsDiscussed: string[];
    emotionalMoments: EmotionalPattern[];
    questionsAsked: string[];
    sessionDurationMinutes: number;
  }>
): UserProfile {
  const updated = { ...profile };
  const now = new Date();

  // Update name - always update if provided (allows name corrections)
  if (sessionData.name) {
    updated.name = sessionData.name;
  }

  updated.lastContact = now;
  updated.totalConversations += 1;
  updated.totalMinutesTalked += sessionData.sessionDurationMinutes || 0;

  // Update current session state
  updated.currentMood = sessionData.mood;
  updated.currentEnergyLevel = sessionData.energyLevel;

  // Learn topics
  if (sessionData.topicsDiscussed) {
    for (const topic of sessionData.topicsDiscussed) {
      if (!updated.preferredTopics.includes(topic)) {
        updated.preferredTopics.push(topic);
      }
    }
  }

  // Track emotional patterns
  if (sessionData.emotionalMoments) {
    updated.emotionalPatterns.push(...sessionData.emotionalMoments);
    // Keep only last 50 patterns
    if (updated.emotionalPatterns.length > 50) {
      updated.emotionalPatterns = updated.emotionalPatterns.slice(-50);
    }
  }

  // Track open questions
  if (sessionData.questionsAsked) {
    updated.openQuestions.push(...sessionData.questionsAsked);
    // Dedupe and limit
    updated.openQuestions = [...new Set(updated.openQuestions)].slice(-20);
  }

  // Update relationship stage
  updated.relationshipStage = calculateRelationshipStage(updated);

  updated.updatedAt = now;
  updated.version += 1;

  return updated;
}

export default UserProfile;

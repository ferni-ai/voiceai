/**
 * User Profile Types
 *
 * Comprehensive type definitions for persistent user memory,
 * preferences, relationship history, and financial context.
 */

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
  milestones?: { date: Date; note: string }[];

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

  // Preferences
  preferences: UserPreferences;

  // Conversation history
  conversationSummaries: ConversationSummary[];
  lastConversationSummary?: string; // Quick access to most recent
  openQuestions: string[]; // Things they asked that weren't fully addressed
  pendingFollowUps: { topic: string; targetDate: Date; reason: string }[];

  // Session state (for current conversation)
  currentSessionId?: string;
  currentMood?: string;
  currentEnergyLevel?: 'low' | 'medium' | 'high';

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

  // Update basics
  if (sessionData.name && !updated.name) {
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

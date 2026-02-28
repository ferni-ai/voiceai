/**
 * Ferni Awareness Service
 *
 * Provides Ferni with comprehensive awareness of:
 * - User context and history
 * - Emotional state and patterns
 * - Relationship health and stage
 * - Trust system insights
 * - Time and seasonal context
 * - Conversational flow
 *
 * This makes Ferni "200% better than human" by giving superhuman
 * awareness while expressing it in human ways.
 *
 * @module FerniAwareness
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';
import type { SessionServices } from '../types.js';

const log = createLogger({ module: 'FerniAwareness' });

// ============================================================================
// TYPES
// ============================================================================

export interface UserAwareness {
  /** Who they are */
  identity: {
    name: string | undefined;
    userId: string | undefined;
    isReturningUser: boolean;
    totalConversations: number;
    daysKnown: number;
  };

  /** Where they are in their journey with Ferni */
  relationship: {
    stage: 'new' | 'acquaintance' | 'familiar' | 'trusted';
    healthScore: number;
    recentTrend: 'improving' | 'stable' | 'declining';
    lastConversation: string | null;
    sharedMoments: number;
  };

  /** What's going on emotionally */
  emotional: {
    currentMood: string | undefined;
    moodIntensity: number;
    recentMoods: string[];
    emotionalPatterns: string[];
    needsSupport: boolean;
  };

  /** What matters to them */
  context: {
    activeGoals: Array<{ name: string; progress: number }>;
    recentTopics: string[];
    pendingFollowUps: string[];
    upcomingEvents: string[];
    areasOfGrowth: string[];
  };

  /** How they prefer to communicate */
  preferences: {
    communicationStyle: 'direct' | 'gentle' | 'exploratory' | 'mixed';
    preferredPace: 'quick' | 'moderate' | 'slow';
    responsiveness: 'high' | 'medium' | 'low';
    celebrationStyle: 'big' | 'subtle' | 'none';
  };
}

export interface ConversationAwareness {
  /** Current state */
  state: {
    turnCount: number;
    sessionDuration: number;
    currentTopic: string | undefined;
    currentMood: string | undefined;
    engagementLevel: 'high' | 'medium' | 'low';
    mode: 'listening' | 'exploring' | 'advising' | 'supporting' | 'wrapping';
  };

  /** What's been discussed */
  history: {
    topicsDiscussed: string[];
    emotionalJourney: string[];
    toolsUsed: string[];
    keyMoments: string[];
    unfinishedThreads: string[];
  };

  /** What Ferni has noticed */
  insights: {
    patterns: string[];
    unsaidSignals: string[];
    growthOpportunities: string[];
    celebrationOpportunities: string[];
    boundariesToRespect: string[];
  };
}

export interface TimeAwareness {
  /** Current moment */
  now: {
    timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
    dayOfWeek: string;
    isWeekend: boolean;
    hour: number;
  };

  /** Seasonal context */
  seasonal: {
    season: 'spring' | 'summer' | 'fall' | 'winter';
    specialDays: string[];
    userSpecificDates: string[];
  };

  /** Conversation timing */
  timing: {
    isLateNight: boolean;
    isGoodTimeForDeepConvo: boolean;
    suggestedEnergy: 'high' | 'moderate' | 'calm';
  };
}

export interface FerniAwarenessContext {
  user: UserAwareness;
  conversation: ConversationAwareness;
  time: TimeAwareness;
  /** Superhuman capabilities available */
  superpowers: {
    perfectMemory: boolean;
    patternRecognition: boolean;
    emotionalConsistency: boolean;
    predictiveCare: boolean;
    boundaryRespect: boolean;
  };
}

// ============================================================================
// AWARENESS BUILDER
// ============================================================================

/**
 * Build complete awareness context for Ferni
 */
export async function buildFerniAwareness(
  services: SessionServices | undefined,
  userProfile: UserProfile | null,
  conversationData: {
    turnCount?: number;
    currentTopic?: string;
    currentMood?: string;
    recentTopics?: string[];
    keyMoments?: string[];
  }
): Promise<FerniAwarenessContext> {
  const now = new Date();
  const hour = now.getHours();

  // Build user awareness
  const user = buildUserAwareness(userProfile, services);

  // Build conversation awareness
  const conversation = buildConversationAwareness(services, conversationData);

  // Build time awareness
  const time = buildTimeAwareness(now);

  return {
    user,
    conversation,
    time,
    superpowers: {
      perfectMemory: true,
      patternRecognition: true,
      emotionalConsistency: true,
      predictiveCare: true,
      boundaryRespect: true,
    },
  };
}

/**
 * Build user awareness from profile and services
 */
function buildUserAwareness(
  profile: UserProfile | null,
  services: SessionServices | undefined
): UserAwareness {
  const totalConversations = profile?.totalConversations || 0;
  const firstSeen = profile?.firstContact ? new Date(profile.firstContact) : new Date();
  const daysKnown = Math.floor((Date.now() - firstSeen.getTime()) / (1000 * 60 * 60 * 24));

  // Map relationship stage from profile
  // RelationshipStage: 'new_acquaintance' | 'getting_to_know' | 'trusted_advisor' | 'old_friend'
  const profileStage = profile?.relationshipStage;
  let stage: UserAwareness['relationship']['stage'] = 'new';
  if (profileStage === 'old_friend' || profileStage === 'trusted_advisor') {
    stage = 'trusted';
  } else if (profileStage === 'getting_to_know') {
    stage = 'familiar';
  } else if (profileStage === 'new_acquaintance') {
    stage = 'acquaintance';
  }

  // Map communication style
  // CommunicationStyle: 'formal' | 'casual' | 'playful' | 'mixed'
  let commStyle: UserAwareness['preferences']['communicationStyle'] = 'mixed';
  if (profile?.communicationStyle === 'formal') {
    commStyle = 'direct';
  } else if (profile?.communicationStyle === 'casual') {
    commStyle = 'gentle';
  } else if (profile?.communicationStyle === 'playful') {
    commStyle = 'exploratory';
  }

  // Map speaking pace to preferred pace
  let preferredPace: UserAwareness['preferences']['preferredPace'] = 'moderate';
  if (profile?.speakingPace === 'fast') {
    preferredPace = 'quick';
  } else if (profile?.speakingPace === 'slow') {
    preferredPace = 'slow';
  }

  // Extract emotional patterns (EmotionalPattern has: timestamp, emotion, intensity, context?, trigger?)
  const emotionalPatterns =
    profile?.emotionalPatterns?.map((p) => p.trigger || p.context || p.emotion) || [];
  const recentMoods = profile?.emotionalPatterns?.slice(-5).map((p) => p.emotion) || [];

  return {
    identity: {
      name: profile?.name || profile?.preferredName,
      userId: services?.userId,
      isReturningUser: totalConversations > 0,
      totalConversations,
      daysKnown,
    },
    relationship: {
      stage,
      healthScore: 50 + totalConversations * 2, // Simple health score based on engagement
      recentTrend: 'stable',
      lastConversation: profile?.lastConversationSummary || null,
      sharedMoments: profile?.keyMoments?.length || 0,
    },
    emotional: {
      currentMood: undefined,
      moodIntensity: 0.5,
      recentMoods,
      emotionalPatterns,
      needsSupport: false,
    },
    context: {
      activeGoals:
        profile?.goals
          ?.filter((g) => g.status === 'active')
          .map((g) => ({
            name: g.name,
            progress: 0, // Goals don't have progress field
          })) || [],
      recentTopics: profile?.preferredTopics || [],
      pendingFollowUps: profile?.pendingFollowUps?.map((f) => f.topic) || [],
      upcomingEvents: [],
      areasOfGrowth: [], // Not tracked in profile
    },
    preferences: {
      communicationStyle: commStyle,
      preferredPace,
      responsiveness: 'medium',
      celebrationStyle: profile?.humorAppreciation === 'high' ? 'big' : 'subtle',
    },
  };
}

/**
 * Build conversation awareness
 */
function buildConversationAwareness(
  services: SessionServices | undefined,
  data: {
    turnCount?: number;
    currentTopic?: string;
    currentMood?: string;
    recentTopics?: string[];
    keyMoments?: string[];
  }
): ConversationAwareness {
  const turnCount = data.turnCount || 0;
  const sessionStart = services?.sessionStartTime || Date.now();
  const sessionDuration = Math.floor((Date.now() - sessionStart) / 1000);

  // Determine engagement level based on turn count and duration
  let engagementLevel: 'high' | 'medium' | 'low' = 'medium';
  if (turnCount > 15 || sessionDuration > 600) {
    engagementLevel = 'high';
  } else if (turnCount < 3 && sessionDuration < 60) {
    engagementLevel = 'low';
  }

  // Determine mode based on context
  let mode: ConversationAwareness['state']['mode'] = 'listening';
  if (turnCount < 3) {
    mode = 'listening';
  } else if (turnCount > 20) {
    mode = 'wrapping';
  }

  return {
    state: {
      turnCount,
      sessionDuration,
      currentTopic: data.currentTopic,
      currentMood: data.currentMood,
      engagementLevel,
      mode,
    },
    history: {
      topicsDiscussed: data.recentTopics || [],
      emotionalJourney: [],
      toolsUsed: [],
      keyMoments: data.keyMoments || [],
      unfinishedThreads: [],
    },
    insights: {
      patterns: [],
      unsaidSignals: [],
      growthOpportunities: [],
      celebrationOpportunities: [],
      boundariesToRespect: [],
    },
  };
}

/**
 * Build time awareness
 */
function buildTimeAwareness(now: Date): TimeAwareness {
  const hour = now.getHours();
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const month = now.getMonth();

  // Time of day
  let timeOfDay: TimeAwareness['now']['timeOfDay'] = 'afternoon';
  if (hour >= 5 && hour < 9) {
    timeOfDay = 'early_morning';
  } else if (hour >= 9 && hour < 12) {
    timeOfDay = 'morning';
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'late_night';
  }

  // Season
  let season: TimeAwareness['seasonal']['season'] = 'winter';
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'fall';

  // Is it a good time for deep conversation?
  const isLateNight = hour >= 22 || hour < 5;
  const isGoodTimeForDeepConvo = (hour >= 19 && hour <= 23) || isWeekend;

  // Suggested energy level
  let suggestedEnergy: TimeAwareness['timing']['suggestedEnergy'] = 'moderate';
  if (isLateNight) {
    suggestedEnergy = 'calm';
  } else if (timeOfDay === 'morning' || (isWeekend && timeOfDay === 'afternoon')) {
    suggestedEnergy = 'high';
  }

  return {
    now: {
      timeOfDay,
      dayOfWeek,
      isWeekend,
      hour,
    },
    seasonal: {
      season,
      specialDays: [], // Could be populated with holidays
      userSpecificDates: [], // Anniversaries, birthdays, etc.
    },
    timing: {
      isLateNight,
      isGoodTimeForDeepConvo,
      suggestedEnergy,
    },
  };
}

// ============================================================================
// AWARENESS QUERIES
// ============================================================================

/**
 * Check if this is a good moment for Ferni to share something vulnerable
 */
export function isGoodMomentForVulnerability(context: FerniAwarenessContext): boolean {
  const { user, conversation, time } = context;

  // Need established relationship
  if (user.relationship.stage === 'new') return false;

  // Need enough turns for trust
  if (conversation.state.turnCount < 5) return false;

  // Late night is good for vulnerability
  if (time.timing.isLateNight) return true;

  // High engagement is good
  if (conversation.state.engagementLevel === 'high') return true;

  // User sharing something personal triggers reciprocity
  if (user.emotional.needsSupport) return true;

  return false;
}

/**
 * Check if Ferni should activate late-night mode
 */
export function shouldActivateLateNightMode(context: FerniAwarenessContext): boolean {
  return context.time.timing.isLateNight && context.user.relationship.stage !== 'new';
}

/**
 * Check if Ferni should surface a pattern
 */
export function shouldSurfacePattern(context: FerniAwarenessContext): boolean {
  const { user, conversation } = context;

  // Need trusted relationship for pattern surfacing
  if (user.relationship.stage !== 'trusted' && user.relationship.stage !== 'familiar') {
    return false;
  }

  // Need enough conversation depth
  if (conversation.state.turnCount < 8) return false;

  // Random chance (don't do it every conversation)
  return Math.random() < 0.2;
}

/**
 * Get the appropriate energy level for Ferni's responses
 */
export function getAppropriateEnergy(context: FerniAwarenessContext): 'high' | 'moderate' | 'calm' {
  const { user, conversation, time } = context;

  // If user is distressed, be calm
  if (user.emotional.needsSupport) return 'calm';

  // Late night = calm
  if (time.timing.isLateNight) return 'calm';

  // Match user energy if excited
  if (user.emotional.currentMood === 'excited') return 'high';

  // Default to time-based suggestion
  return time.timing.suggestedEnergy;
}

/**
 * Get context for tool decision making
 */
export function getToolDecisionContext(context: FerniAwarenessContext): {
  shouldUseTools: boolean;
  suggestedTools: string[];
  avoidTools: string[];
  toolStyle: 'proactive' | 'reactive' | 'minimal';
} {
  const { user, conversation, time } = context;

  // New users: minimal tool use, focus on connection
  if (user.relationship.stage === 'new') {
    return {
      shouldUseTools: false,
      suggestedTools: [],
      avoidTools: ['calendar', 'tasks', 'goals'],
      toolStyle: 'minimal',
    };
  }

  // Late night: minimal tools, focus on presence
  if (time.timing.isLateNight) {
    return {
      shouldUseTools: false,
      suggestedTools: ['grounding', 'breathing'],
      avoidTools: ['calendar', 'tasks', 'productivity'],
      toolStyle: 'minimal',
    };
  }

  // Distressed user: supportive tools only
  if (user.emotional.needsSupport) {
    return {
      shouldUseTools: true,
      suggestedTools: ['grounding', 'breathing', 'journaling'],
      avoidTools: ['productivity', 'tasks'],
      toolStyle: 'reactive',
    };
  }

  // Normal: proactive helpful
  return {
    shouldUseTools: true,
    suggestedTools: [],
    avoidTools: [],
    toolStyle: 'proactive',
  };
}

export default {
  buildFerniAwareness,
  isGoodMomentForVulnerability,
  shouldActivateLateNightMode,
  shouldSurfacePattern,
  getAppropriateEnergy,
  getToolDecisionContext,
};

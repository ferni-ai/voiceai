/**
 * Per-Persona Relationship Service
 *
 * Tracks relationship depth with EACH persona separately.
 * Enables:
 * - Different relationship stages per persona
 * - Gated content based on relationship depth
 * - Natural relationship progression
 * - Persona-specific memory and vulnerability sharing
 */

import { log } from '@livekit/agents';
import type {
  UserProfile,
  PersonaRelationshipStage,
  PerPersonaRelationshipData,
} from '../types/user-profile.js';

const getLogger = () => log();

// ============================================================================
// RELATIONSHIP STAGE THRESHOLDS
// ============================================================================

/**
 * Thresholds for advancing relationship stages
 * Each persona can have different "ease of connection" - some warmer, some more reserved
 */
interface RelationshipThresholds {
  /** Conversations to move from stranger to acquaintance */
  strangerToAcquaintance: number;
  /** Conversations to move from acquaintance to friend */
  acquaintanceToFriend: number;
  /** Vulnerability moments needed for friend -> trusted_advisor */
  friendToTrustedAdvisor: { conversations: number; vulnerabilityCount: number };
}

const DEFAULT_THRESHOLDS: RelationshipThresholds = {
  strangerToAcquaintance: 2,
  acquaintanceToFriend: 5,
  friendToTrustedAdvisor: { conversations: 10, vulnerabilityCount: 2 },
};

/**
 * Per-persona thresholds (some personas are warmer/faster to connect with)
 */
const PERSONA_THRESHOLDS: Record<string, Partial<RelationshipThresholds>> = {
  ferni: {
    // Ferni is warm and connects quickly
    strangerToAcquaintance: 1,
    acquaintanceToFriend: 3,
    friendToTrustedAdvisor: { conversations: 7, vulnerabilityCount: 1 },
  },
  'jordan-taylor': {
    // Jordan is enthusiastic and friendly
    strangerToAcquaintance: 2,
    acquaintanceToFriend: 4,
    friendToTrustedAdvisor: { conversations: 8, vulnerabilityCount: 2 },
  },
  'nayan-patel': {
    // Jack is grandfatherly - builds trust through wisdom
    strangerToAcquaintance: 2,
    acquaintanceToFriend: 6,
    friendToTrustedAdvisor: { conversations: 12, vulnerabilityCount: 3 },
  },
  'peter-john': {
    // Peter is enthusiastic but relationship is research-focused
    strangerToAcquaintance: 2,
    acquaintanceToFriend: 5,
    friendToTrustedAdvisor: { conversations: 10, vulnerabilityCount: 2 },
  },
  'alex-chen': {
    // Alex is professional but warms up
    strangerToAcquaintance: 2,
    acquaintanceToFriend: 5,
    friendToTrustedAdvisor: { conversations: 10, vulnerabilityCount: 2 },
  },
  'maya-santos': {
    // Maya is very warm and supportive
    strangerToAcquaintance: 1,
    acquaintanceToFriend: 3,
    friendToTrustedAdvisor: { conversations: 6, vulnerabilityCount: 1 },
  },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get the current relationship stage with a specific persona
 */
export function getPersonaRelationshipStage(
  profile: UserProfile | null,
  personaId: string
): PersonaRelationshipStage {
  if (!profile?.humanizingState?.perPersonaRelationshipStage) {
    return 'stranger';
  }
  return profile.humanizingState.perPersonaRelationshipStage[personaId] || 'stranger';
}

/**
 * Get detailed relationship data for a specific persona
 */
export function getPersonaRelationshipData(
  profile: UserProfile | null,
  personaId: string
): PerPersonaRelationshipData | null {
  if (!profile?.humanizingState?.perPersonaRelationshipData) {
    return null;
  }
  return profile.humanizingState.perPersonaRelationshipData[personaId] || null;
}

/**
 * Calculate what relationship stage should be based on data
 */
export function calculatePersonaRelationshipStage(
  data: PerPersonaRelationshipData,
  personaId: string
): PersonaRelationshipStage {
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...PERSONA_THRESHOLDS[personaId],
  };

  const { conversationCount, vulnerabilityCount, keyMoments } = data;

  // Check for trusted_advisor (highest level)
  if (
    conversationCount >= thresholds.friendToTrustedAdvisor.conversations &&
    vulnerabilityCount >= thresholds.friendToTrustedAdvisor.vulnerabilityCount
  ) {
    return 'trusted_advisor';
  }

  // Check for friend
  // Can also achieve friend status through key moments even with fewer conversations
  const deepMoments = keyMoments.filter(
    (m) => m.type === 'vulnerability' || m.type === 'breakthrough'
  ).length;

  if (
    conversationCount >= thresholds.acquaintanceToFriend ||
    (conversationCount >= 3 && deepMoments >= 1)
  ) {
    return 'friend';
  }

  // Check for acquaintance
  if (conversationCount >= thresholds.strangerToAcquaintance) {
    return 'acquaintance';
  }

  return 'stranger';
}

/**
 * Create default relationship data for a new persona relationship
 */
export function createDefaultRelationshipData(): PerPersonaRelationshipData {
  return {
    conversationCount: 0,
    totalMinutes: 0,
    keyMoments: [],
    storiesTold: [],
    vulnerabilityCount: 0,
    frequentTopics: [],
    firstInteraction: new Date(),
    lastInteraction: new Date(),
  };
}

/**
 * Update relationship data after a session
 */
export function updatePersonaRelationshipData(
  existingData: PerPersonaRelationshipData | null,
  update: {
    minutesTalked?: number;
    topicsDiscussed?: string[];
    keyMoment?: {
      type: 'breakthrough' | 'vulnerability' | 'celebration' | 'support' | 'humor';
      summary: string;
    };
    storyTold?: string;
    vulnerabilityShared?: boolean;
  }
): PerPersonaRelationshipData {
  const data = existingData || createDefaultRelationshipData();
  const now = new Date();

  // Update basic counts
  const updated: PerPersonaRelationshipData = {
    ...data,
    conversationCount: data.conversationCount + 1,
    totalMinutes: data.totalMinutes + (update.minutesTalked || 0),
    lastInteraction: now,
  };

  // Track topics
  if (update.topicsDiscussed) {
    const allTopics = [...data.frequentTopics, ...update.topicsDiscussed];
    // Count frequency and keep top 10
    const topicCounts = allTopics.reduce(
      (acc, topic) => {
        acc[topic] = (acc[topic] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    updated.frequentTopics = Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([topic]) => topic);
  }

  // Track key moments
  if (update.keyMoment) {
    updated.keyMoments = [
      ...data.keyMoments,
      {
        ...update.keyMoment,
        timestamp: now,
      },
    ].slice(-20); // Keep last 20 moments
  }

  // Track stories told
  if (update.storyTold && !data.storiesTold.includes(update.storyTold)) {
    updated.storiesTold = [...data.storiesTold, update.storyTold];
  }

  // Track vulnerability
  if (update.vulnerabilityShared) {
    updated.vulnerabilityCount = data.vulnerabilityCount + 1;
  }

  return updated;
}

/**
 * Apply relationship updates to user profile
 */
export function applyRelationshipUpdateToProfile(
  profile: UserProfile,
  personaId: string,
  update: {
    minutesTalked?: number;
    topicsDiscussed?: string[];
    keyMoment?: {
      type: 'breakthrough' | 'vulnerability' | 'celebration' | 'support' | 'humor';
      summary: string;
    };
    storyTold?: string;
    vulnerabilityShared?: boolean;
  }
): UserProfile {
  // Get existing data
  const existingData = getPersonaRelationshipData(profile, personaId);

  // Update relationship data
  const updatedData = updatePersonaRelationshipData(existingData, update);

  // Calculate new stage
  const newStage = calculatePersonaRelationshipStage(updatedData, personaId);
  const oldStage = getPersonaRelationshipStage(profile, personaId);

  // Check for stage transition
  if (newStage !== oldStage) {
    getLogger().info(
      { personaId, from: oldStage, to: newStage },
      '🎭 Relationship stage advanced!'
    );
  }

  // Build updated profile
  return {
    ...profile,
    humanizingState: {
      ...profile.humanizingState,
      usedShareTags: profile.humanizingState?.usedShareTags || [],
      totalSpontaneousShares: profile.humanizingState?.totalSpontaneousShares || 0,
      updatedAt: new Date(),
      perPersonaRelationshipStage: {
        ...profile.humanizingState?.perPersonaRelationshipStage,
        [personaId]: newStage,
      },
      perPersonaRelationshipData: {
        ...profile.humanizingState?.perPersonaRelationshipData,
        [personaId]: updatedData,
      },
    },
    updatedAt: new Date(),
  };
}

// ============================================================================
// GATING FUNCTIONS
// ============================================================================

/**
 * Check if user has reached a minimum relationship stage with a persona
 */
export function hasMinimumRelationship(
  profile: UserProfile | null,
  personaId: string,
  minimumStage: PersonaRelationshipStage
): boolean {
  const currentStage = getPersonaRelationshipStage(profile, personaId);

  const stageOrder: PersonaRelationshipStage[] = [
    'stranger',
    'acquaintance',
    'friend',
    'trusted_advisor',
  ];

  const currentIndex = stageOrder.indexOf(currentStage);
  const minimumIndex = stageOrder.indexOf(minimumStage);

  return currentIndex >= minimumIndex;
}

/**
 * Get the warmth multiplier based on relationship stage
 * Used to adjust greeting warmth, response style, etc.
 */
export function getWarmthMultiplier(
  profile: UserProfile | null,
  personaId: string
): number {
  const stage = getPersonaRelationshipStage(profile, personaId);

  switch (stage) {
    case 'stranger':
      return 0.6; // Friendly but reserved
    case 'acquaintance':
      return 0.75; // Getting warmer
    case 'friend':
      return 0.9; // Comfortable warmth
    case 'trusted_advisor':
      return 1.0; // Full warmth
    default:
      return 0.7;
  }
}

/**
 * Check if a story can be told based on relationship stage
 */
export function canTellStory(
  profile: UserProfile | null,
  personaId: string,
  storyId: string,
  requiredStage: PersonaRelationshipStage = 'acquaintance'
): { allowed: boolean; reason?: string } {
  // Check relationship stage
  if (!hasMinimumRelationship(profile, personaId, requiredStage)) {
    return {
      allowed: false,
      reason: `Need to be at least ${requiredStage} to hear this story`,
    };
  }

  // Check if already told
  const data = getPersonaRelationshipData(profile, personaId);
  if (data?.storiesTold.includes(storyId)) {
    return {
      allowed: false,
      reason: 'Story already told to this user',
    };
  }

  return { allowed: true };
}

/**
 * Check if vulnerability can be shared based on relationship stage
 */
export function canShareVulnerability(
  profile: UserProfile | null,
  personaId: string,
  vulnerabilityType: 'light' | 'medium' | 'deep' = 'medium'
): boolean {
  const minimumStages: Record<string, PersonaRelationshipStage> = {
    light: 'acquaintance', // Can share light struggles early
    medium: 'friend', // Personal struggles need friendship
    deep: 'trusted_advisor', // Deep fears/secrets need trust
  };

  return hasMinimumRelationship(profile, personaId, minimumStages[vulnerabilityType]);
}

// ============================================================================
// RELATIONSHIP TRANSITION PHRASES
// ============================================================================

/**
 * Get a transition phrase when relationship stage advances
 * Returns null if no transition occurred
 */
export function getRelationshipTransitionPhrase(
  oldStage: PersonaRelationshipStage,
  newStage: PersonaRelationshipStage,
  transitionPhrases?: {
    stranger_to_acquaintance?: string[];
    acquaintance_to_friend?: string[];
    friend_to_trusted_advisor?: string[];
  }
): string | null {
  if (oldStage === newStage) {
    return null;
  }

  // Determine which transition occurred
  let phrases: string[] | undefined;

  if (oldStage === 'stranger' && newStage === 'acquaintance') {
    phrases = transitionPhrases?.stranger_to_acquaintance;
  } else if (oldStage === 'acquaintance' && newStage === 'friend') {
    phrases = transitionPhrases?.acquaintance_to_friend;
  } else if (oldStage === 'friend' && newStage === 'trusted_advisor') {
    phrases = transitionPhrases?.friend_to_trusted_advisor;
  }

  if (!phrases || phrases.length === 0) {
    return null;
  }

  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get a memory callback phrase for following up on a previous topic
 */
export function getMemoryCallbackPhrase(
  topic: string,
  callbackType: 'general' | 'hard_topic' | 'progress' | 'habit' | 'event',
  memoryCallbacks?: {
    general?: string[];
    checking_in_on_hard_topic?: string[];
    celebrating_progress?: string[];
    habit_check_in?: string[];
    event_countdown?: string[];
  }
): string | null {
  let phrases: string[] | undefined;

  switch (callbackType) {
    case 'hard_topic':
      phrases = memoryCallbacks?.checking_in_on_hard_topic;
      break;
    case 'progress':
      phrases = memoryCallbacks?.celebrating_progress;
      break;
    case 'habit':
      phrases = memoryCallbacks?.habit_check_in;
      break;
    case 'event':
      phrases = memoryCallbacks?.event_countdown;
      break;
    default:
      phrases = memoryCallbacks?.general;
  }

  if (!phrases || phrases.length === 0) {
    // Fall back to general
    phrases = memoryCallbacks?.general;
    if (!phrases || phrases.length === 0) {
      return null;
    }
  }

  const phrase = phrases[Math.floor(Math.random() * phrases.length)];
  return phrase.replace(/\{topic\}/g, topic);
}

/**
 * Determine if a relationship transition should be announced
 * (Don't announce every time - only ~50% of the time to feel natural)
 */
export function shouldAnnounceTransition(
  oldStage: PersonaRelationshipStage,
  newStage: PersonaRelationshipStage
): boolean {
  // Always announce friend -> trusted_advisor (it's special)
  if (oldStage === 'friend' && newStage === 'trusted_advisor') {
    return Math.random() < 0.8; // 80% chance
  }

  // Announce other transitions 50% of the time
  return Math.random() < 0.5;
}

// ============================================================================
// LOGGING & DEBUGGING
// ============================================================================

/**
 * Log relationship summary for debugging
 */
export function logRelationshipSummary(profile: UserProfile | null, personaId: string): void {
  const stage = getPersonaRelationshipStage(profile, personaId);
  const data = getPersonaRelationshipData(profile, personaId);

  getLogger().info(
    {
      personaId,
      stage,
      conversationCount: data?.conversationCount || 0,
      vulnerabilityCount: data?.vulnerabilityCount || 0,
      keyMomentsCount: data?.keyMoments.length || 0,
      storiesCount: data?.storiesTold.length || 0,
      topTopics: data?.frequentTopics.slice(0, 3) || [],
      warmthMultiplier: getWarmthMultiplier(profile, personaId),
    },
    '🤝 Per-persona relationship summary'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getPersonaRelationshipStage,
  getPersonaRelationshipData,
  calculatePersonaRelationshipStage,
  createDefaultRelationshipData,
  updatePersonaRelationshipData,
  applyRelationshipUpdateToProfile,
  hasMinimumRelationship,
  getWarmthMultiplier,
  canTellStory,
  canShareVulnerability,
  getRelationshipTransitionPhrase,
  getMemoryCallbackPhrase,
  shouldAnnounceTransition,
  logRelationshipSummary,
};


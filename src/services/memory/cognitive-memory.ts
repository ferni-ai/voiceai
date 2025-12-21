/**
 * Cognitive Memory Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates cognitive learning with persistent user profiles.
 * Loads cognitive state on session start, saves on session end.
 *
 * This enables:
 * - Cross-session cognitive learning
 * - Remember user's thinking style
 * - Don't re-explain topics
 * - Track what approaches work over time
 *
 * A good friend remembers how you think, not just what you've said.
 * They learn what explanations resonate with you, what makes you light up,
 * what approaches help you most. This module builds that understanding.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';
import type { ReasoningStyle } from '../../personas/cognitive-types.js';
import {
  getUserCognitiveProfile,
  saveUserCognitiveProfile,
  updateUserCognitiveStyle,
  recordApproachEffectiveness as persistApproachEffectiveness,
  getRecommendedApproach,
  getUserKnowledgeState,
  recordTopicExplained as persistTopicExplained,
  userKnowsTopic,
  type UserCognitiveProfile,
} from './cognitive-persistence.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CognitiveSessionState {
  userId: string;
  personaId: string;
  /** User's detected cognitive style */
  userStyle?: ReasoningStyle;
  userStyleConfidence: number;
  /** Approaches used this session */
  approachesUsed: Array<{
    approach: ReasoningStyle;
    topic: string;
    engagementScore: number;
    timestamp: Date;
  }>;
  /** Topics explained this session */
  topicsExplained: string[];
  /** Session start time */
  startTime: Date;
}

// Session states
const activeSessions = new Map<string, CognitiveSessionState>();

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Initialize cognitive state for a new session
 * Loads previous learning from user profile
 */
export async function initializeCognitiveSession(
  userId: string,
  personaId: string,
  userProfile: UserProfile | null
): Promise<CognitiveSessionState> {
  const sessionKey = `${userId}_${personaId}`;

  // Check if already initialized
  if (activeSessions.has(sessionKey)) {
    return activeSessions.get(sessionKey)!;
  }

  // Create new session state
  const sessionState: CognitiveSessionState = {
    userId,
    personaId,
    userStyleConfidence: 0,
    approachesUsed: [],
    topicsExplained: [],
    startTime: new Date(),
  };

  // Load from user profile if available
  if (userProfile?.cognitiveIntelligence) {
    const cogData = userProfile.cognitiveIntelligence;

    // Load detected style
    if (cogData.detectedStyle && cogData.detectedStyle !== 'unknown') {
      sessionState.userStyle = mapUserStyleToReasoningStyle(cogData.detectedStyle);
      sessionState.userStyleConfidence = cogData.styleConfidence;
    }

    getLogger().info(
      {
        userId,
        personaId,
        detectedStyle: sessionState.userStyle,
        styleConfidence: sessionState.userStyleConfidence,
      },
      '🧠 Cognitive session initialized from profile'
    );
  } else {
    // Try loading from Firestore directly
    const persistedProfile = await getUserCognitiveProfile(userId);
    if (persistedProfile) {
      sessionState.userStyle = persistedProfile.detectedStyle;
      sessionState.userStyleConfidence = persistedProfile.styleConfidence;

      getLogger().info(
        {
          userId,
          personaId,
          detectedStyle: sessionState.userStyle,
          styleConfidence: sessionState.userStyleConfidence,
        },
        '🧠 Cognitive session initialized from Firestore'
      );
    }
  }

  activeSessions.set(sessionKey, sessionState);
  return sessionState;
}

/**
 * Get current cognitive session state
 */
export function getCognitiveSession(
  userId: string,
  personaId: string
): CognitiveSessionState | null {
  return activeSessions.get(`${userId}_${personaId}`) || null;
}

/**
 * Record a cognitive approach used in this session
 */
export function recordSessionApproach(
  userId: string,
  personaId: string,
  approach: ReasoningStyle,
  topic: string,
  engagementScore: number
): void {
  const sessionKey = `${userId}_${personaId}`;
  const session = activeSessions.get(sessionKey);

  if (!session) {
    getLogger().warn({ userId, personaId }, 'No cognitive session found');
    return;
  }

  session.approachesUsed.push({
    approach,
    topic,
    engagementScore,
    timestamp: new Date(),
  });

  // Also persist immediately for durability
  persistApproachEffectiveness(userId, personaId, approach, engagementScore).catch((err) => {
    getLogger().warn({ err }, 'Failed to persist approach effectiveness');
  });
}

/**
 * Record that a topic was explained
 */
export function recordSessionTopicExplained(
  userId: string,
  personaId: string,
  topic: string
): void {
  const sessionKey = `${userId}_${personaId}`;
  const session = activeSessions.get(sessionKey);

  if (session && !session.topicsExplained.includes(topic)) {
    session.topicsExplained.push(topic);
  }

  // Persist
  persistTopicExplained(userId, topic, personaId, 'explained').catch((err) => {
    getLogger().warn({ err }, 'Failed to persist topic explained');
  });
}

/**
 * Update user's detected cognitive style
 */
export function updateSessionUserStyle(
  userId: string,
  personaId: string,
  style: ReasoningStyle,
  confidence: number
): void {
  const sessionKey = `${userId}_${personaId}`;
  const session = activeSessions.get(sessionKey);

  if (session && confidence > session.userStyleConfidence) {
    session.userStyle = style;
    session.userStyleConfidence = confidence;

    // Persist
    updateUserCognitiveStyle(userId, style, confidence).catch((err) => {
      getLogger().warn({ err }, 'Failed to persist user cognitive style');
    });
  }
}

/**
 * End cognitive session and save learnings to user profile
 */
export async function endCognitiveSession(
  userId: string,
  personaId: string
): Promise<{
  approachesUsed: number;
  topicsExplained: number;
  userStyle?: ReasoningStyle;
}> {
  const sessionKey = `${userId}_${personaId}`;
  const session = activeSessions.get(sessionKey);

  if (!session) {
    return { approachesUsed: 0, topicsExplained: 0 };
  }

  // Save session summary
  getLogger().info(
    {
      userId,
      personaId,
      approachesUsed: session.approachesUsed.length,
      topicsExplained: session.topicsExplained.length,
      userStyle: session.userStyle,
      sessionDuration: Date.now() - session.startTime.getTime(),
    },
    '🧠 Cognitive session ended'
  );

  // Clean up
  activeSessions.delete(sessionKey);

  return {
    approachesUsed: session.approachesUsed.length,
    topicsExplained: session.topicsExplained.length,
    userStyle: session.userStyle,
  };
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get recommended cognitive approach for this user
 */
export async function getRecommendedApproachForUser(
  userId: string,
  personaId: string,
  defaultApproach: ReasoningStyle
): Promise<{ approach: ReasoningStyle; confidence: number; reason: string }> {
  // Check session first
  const session = getCognitiveSession(userId, personaId);
  if (session && session.approachesUsed.length >= 3) {
    // Calculate best approach from session
    const approachScores = new Map<ReasoningStyle, { total: number; count: number }>();

    for (const used of session.approachesUsed) {
      const current = approachScores.get(used.approach) || { total: 0, count: 0 };
      current.total += used.engagementScore;
      current.count += 1;
      approachScores.set(used.approach, current);
    }

    let bestApproach = defaultApproach;
    let bestAvg = 0;

    for (const [approach, scores] of approachScores) {
      const avg = scores.total / scores.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestApproach = approach;
      }
    }

    if (bestAvg > 0.6) {
      return {
        approach: bestApproach,
        confidence: bestAvg,
        reason: 'Based on session engagement',
      };
    }
  }

  // Fall back to persisted data
  return getRecommendedApproach(userId, personaId, defaultApproach);
}

/**
 * Check if we should skip explaining a topic
 */
export async function shouldSkipExplanation(
  userId: string,
  topic: string
): Promise<{ skip: boolean; level?: string; revisits?: number }> {
  // Check session first
  for (const [, session] of activeSessions) {
    if (session.userId === userId && session.topicsExplained.includes(topic)) {
      return { skip: true, level: 'explained', revisits: 0 };
    }
  }

  // Check persisted
  const knowledge = await userKnowsTopic(userId, topic);
  if (knowledge.knows && knowledge.level === 'deep_dive') {
    return { skip: true, level: knowledge.level, revisits: knowledge.revisits };
  }

  return { skip: false };
}

/**
 * Get user's cognitive style with session context
 */
export function getUserCognitiveStyleWithSession(
  userId: string,
  personaId: string
): { style?: ReasoningStyle; confidence: number } {
  const session = getCognitiveSession(userId, personaId);

  if (session?.userStyle && session.userStyleConfidence > 0.5) {
    return {
      style: session.userStyle,
      confidence: session.userStyleConfidence,
    };
  }

  return { confidence: 0 };
}

// ============================================================================
// PROFILE SYNC
// ============================================================================

/**
 * Sync cognitive data to user profile
 * Call this before saving user profile
 */
export async function syncCognitiveToProfile(
  userId: string,
  profile: UserProfile
): Promise<UserProfile> {
  // Get all sessions for this user
  const userSessions: CognitiveSessionState[] = [];
  for (const [key, session] of activeSessions) {
    if (session.userId === userId) {
      userSessions.push(session);
    }
  }

  // Get persisted cognitive profile
  const persistedProfile = await getUserCognitiveProfile(userId);

  // Initialize cognitive intelligence if not present
  if (!profile.cognitiveIntelligence) {
    profile.cognitiveIntelligence = {
      detectedStyle: 'unknown',
      styleConfidence: 0,
      styleUpdatedAt: new Date(),
      approachEffectiveness: {},
      expertiseAreas: [],
      noviceAreas: [],
      explainedTopics: {},
      demonstratedUnderstanding: [],
      topicPreferences: {},
      totalInteractions: 0,
      updatedAt: new Date(),
    };
  }

  // Merge session data
  for (const session of userSessions) {
    // Update style if better confidence
    if (
      session.userStyle &&
      session.userStyleConfidence > profile.cognitiveIntelligence.styleConfidence
    ) {
      profile.cognitiveIntelligence.detectedStyle = mapReasoningStyleToUserStyle(session.userStyle);
      profile.cognitiveIntelligence.styleConfidence = session.userStyleConfidence;
      profile.cognitiveIntelligence.styleUpdatedAt = new Date();
    }

    // Merge approach effectiveness
    if (!profile.cognitiveIntelligence.approachEffectiveness[session.personaId]) {
      profile.cognitiveIntelligence.approachEffectiveness[session.personaId] = [];
    }

    for (const used of session.approachesUsed) {
      const existing = profile.cognitiveIntelligence.approachEffectiveness[session.personaId].find(
        (e) => e.approach === used.approach
      );

      if (existing) {
        existing.totalScore += used.engagementScore;
        existing.sampleCount += 1;
        existing.lastUsed = used.timestamp;
      } else {
        profile.cognitiveIntelligence.approachEffectiveness[session.personaId].push({
          approach: used.approach,
          totalScore: used.engagementScore,
          sampleCount: 1,
          lastUsed: used.timestamp,
        });
      }
    }

    // Merge explained topics
    for (const topic of session.topicsExplained) {
      profile.cognitiveIntelligence.explainedTopics[topic] = {
        personaId: session.personaId,
        level: 'explained',
        lastExplained: new Date(),
        revisits: (profile.cognitiveIntelligence.explainedTopics[topic]?.revisits || 0) + 1,
      };
    }

    profile.cognitiveIntelligence.totalInteractions += session.approachesUsed.length;
  }

  // Merge persisted profile data
  if (persistedProfile) {
    // Merge expertise areas
    for (const area of persistedProfile.expertiseAreas) {
      if (!profile.cognitiveIntelligence.expertiseAreas.includes(area)) {
        profile.cognitiveIntelligence.expertiseAreas.push(area);
      }
    }

    // Merge novice areas
    for (const area of persistedProfile.noviceAreas) {
      if (!profile.cognitiveIntelligence.noviceAreas.includes(area)) {
        profile.cognitiveIntelligence.noviceAreas.push(area);
      }
    }
  }

  profile.cognitiveIntelligence.updatedAt = new Date();

  return profile;
}

/**
 * Load cognitive data from user profile into session
 * Call this on session start
 */
export function loadCognitiveFromProfile(
  userId: string,
  personaId: string,
  profile: UserProfile
): void {
  if (!profile.cognitiveIntelligence) return;

  const sessionKey = `${userId}_${personaId}`;
  let session = activeSessions.get(sessionKey);

  if (!session) {
    session = {
      userId,
      personaId,
      userStyleConfidence: 0,
      approachesUsed: [],
      topicsExplained: [],
      startTime: new Date(),
    };
    activeSessions.set(sessionKey, session);
  }

  // Load style
  const cogData = profile.cognitiveIntelligence;
  if (cogData.detectedStyle && cogData.detectedStyle !== 'unknown') {
    session.userStyle = mapUserStyleToReasoningStyle(cogData.detectedStyle);
    session.userStyleConfidence = cogData.styleConfidence;
  }

  // Load explained topics
  session.topicsExplained = Object.keys(cogData.explainedTopics);

  getLogger().debug(
    {
      userId,
      personaId,
      loadedStyle: session.userStyle,
      loadedTopics: session.topicsExplained.length,
    },
    '📥 Loaded cognitive data from profile'
  );
}

// ============================================================================
// HELPERS
// ============================================================================

type UserCognitiveStyle =
  | 'analytical'
  | 'emotional'
  | 'practical'
  | 'narrative'
  | 'systematic'
  | 'intuitive'
  | 'unknown';

function mapUserStyleToReasoningStyle(style: UserCognitiveStyle): ReasoningStyle {
  const map: Record<UserCognitiveStyle, ReasoningStyle> = {
    analytical: 'analytical',
    emotional: 'empathetic',
    practical: 'pragmatic',
    narrative: 'narrative',
    systematic: 'systematic',
    intuitive: 'intuitive',
    unknown: 'narrative', // Default
  };
  return map[style] || 'narrative';
}

function mapReasoningStyleToUserStyle(style: ReasoningStyle): UserCognitiveStyle {
  const map: Record<ReasoningStyle, UserCognitiveStyle> = {
    analytical: 'analytical',
    empathetic: 'emotional',
    pragmatic: 'practical',
    narrative: 'narrative',
    systematic: 'systematic',
    intuitive: 'intuitive',
  };
  return map[style] || 'unknown';
}

/**
 * Clear all active sessions (for testing)
 */
export function clearAllCognitiveSessions(): void {
  activeSessions.clear();
}

// ============================================================================
// SERVICE INTERFACE (for data-export.ts compatibility)
// ============================================================================

export interface CognitiveMemoryService {
  getMemories: (userId: string) => Promise<Array<Record<string, unknown>>>;
  getProfile: (userId: string) => Promise<Record<string, unknown>>;
}

let cognitiveMemoryServiceInstance: CognitiveMemoryService | null = null;

/**
 * Get the cognitive memory service (singleton)
 */
export function getCognitiveMemoryService(): CognitiveMemoryService {
  if (!cognitiveMemoryServiceInstance) {
    cognitiveMemoryServiceInstance = {
      async getMemories(userId: string): Promise<Array<Record<string, unknown>>> {
        // Return cognitive session data as memories
        const session = getCognitiveSession(userId, 'default');
        if (!session) return [];
        return [
          {
            type: 'reasoning_style',
            data: session.userStyle || null,
          },
          {
            type: 'topics_explained',
            data: session.topicsExplained,
          },
          {
            type: 'approaches_used',
            data: session.approachesUsed,
          },
        ];
      },
      async getProfile(userId: string): Promise<Record<string, unknown>> {
        const session = getCognitiveSession(userId, 'default');
        return {
          userId,
          userStyle: session?.userStyle || null,
          topicsExplained: session?.topicsExplained || [],
          approachesUsed: session?.approachesUsed || [],
        };
      },
    };
  }
  return cognitiveMemoryServiceInstance;
}

export default {
  initializeCognitiveSession,
  getCognitiveSession,
  recordSessionApproach,
  recordSessionTopicExplained,
  updateSessionUserStyle,
  endCognitiveSession,
  getRecommendedApproachForUser,
  shouldSkipExplanation,
  getUserCognitiveStyleWithSession,
  syncCognitiveToProfile,
  loadCognitiveFromProfile,
  clearAllCognitiveSessions,
};

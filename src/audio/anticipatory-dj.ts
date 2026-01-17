/**
 * Anticipatory DJ System
 *
 * > "Better than human - we notice what no friend could see."
 *
 * Proactively predicts when users might want music based on:
 * - Time patterns (late night, morning routine, etc.)
 * - Emotional context (stress detected, celebration moments)
 * - Conversation patterns (long silences, topic shifts)
 * - Historical preferences (what worked before)
 *
 * This is the "Better Than Human" music intelligence - no human friend
 * could track these patterns across hundreds of conversations.
 */

import { getLogger } from '../utils/safe-logger.js';
import { getUserProfile, type MusicMemoryEntry } from './music-user-learning.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context signals that might trigger music anticipation
 */
export interface MusicContextSignals {
  userId: string;

  // Time context
  hour: number; // 0-23
  dayOfWeek: number; // 0-6, 0=Sunday
  isWeekend: boolean;

  // Emotional context
  detectedEmotion?: 'stressed' | 'sad' | 'anxious' | 'excited' | 'neutral' | 'overwhelmed';
  emotionalIntensity?: number; // 0-1

  // Conversation context
  conversationDuration: number; // seconds
  silenceDuration?: number; // seconds of current silence
  topicDepth?: 'surface' | 'moderate' | 'deep';
  recentTopics?: string[];

  // Music context
  lastMusicPlayedAt?: number; // timestamp
  musicRequestsToday?: number;

  // User state
  connectionStreak?: number; // days in a row
  sessionCount?: number; // total sessions ever
}

/**
 * Music anticipation prediction
 */
export interface MusicAnticipation {
  /** Should we proactively offer music? */
  shouldOffer: boolean;

  /** Confidence in this prediction (0-1) */
  confidence: number;

  /** What type of music to suggest */
  suggestedMood?: string;

  /** Why we're suggesting this */
  reason: string;

  /** How to phrase the offer */
  offerPhrase?: string;

  /** Priority (higher = more urgent) */
  priority: 'low' | 'medium' | 'high';
}

/**
 * Time-based music patterns
 */
interface TimeMusicPattern {
  /** Hours when user typically wants music */
  preferredHours: number[];

  /** Day patterns (e.g., Sunday evenings) */
  dayPatterns: Array<{
    dayOfWeek: number;
    hours: number[];
    mood?: string;
  }>;

  /** Detected routines */
  routines: Array<{
    name: string; // e.g., "morning focus", "evening wind-down"
    startHour: number;
    endHour: number;
    preferredMood: string;
    frequency: number; // times observed
  }>;
}

/**
 * User's music anticipation profile
 */
export interface MusicAnticipationProfile {
  userId: string;
  timePatterns: TimeMusicPattern;
  emotionalTriggers: Array<{
    emotion: string;
    preferredMood: string;
    successRate: number;
    observations: number;
  }>;
  conversationTriggers: {
    afterTopics: string[]; // topics that often precede music requests
    afterSilence: number; // seconds of silence that often precede requests
    afterDepth: 'deep' | 'moderate'; // conversation depth that triggers
  };
  lastUpdated: number;
}

// ============================================================================
// PROFILE STORAGE
// ============================================================================

const anticipationProfiles = new Map<string, MusicAnticipationProfile>();

function getOrCreateProfile(userId: string): MusicAnticipationProfile {
  let profile = anticipationProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      timePatterns: {
        preferredHours: [],
        dayPatterns: [],
        routines: [],
      },
      emotionalTriggers: [],
      conversationTriggers: {
        afterTopics: [],
        afterSilence: 30, // default: 30 seconds
        afterDepth: 'deep',
      },
      lastUpdated: Date.now(),
    };
    anticipationProfiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// PREDICTION LOGIC
// ============================================================================

/**
 * Predict whether now is a good time to offer music
 *
 * This is the core "Better Than Human" intelligence - analyzing patterns
 * that no human friend could consistently track.
 */
export function predictMusicNeed(signals: MusicContextSignals): MusicAnticipation {
  const profile = getOrCreateProfile(signals.userId);
  const userLearning = getUserProfile(signals.userId);

  let totalScore = 0;
  let confidence = 0;
  const reasons: string[] = [];
  let suggestedMood: string | undefined;

  // === TIME-BASED PATTERNS ===

  // Late night music (10 PM - 2 AM)
  if (signals.hour >= 22 || signals.hour <= 2) {
    totalScore += 0.3;
    reasons.push('late-night-vibes');
    suggestedMood = 'chill';
    confidence += 0.2;
  }

  // Sunday evening wind-down
  if (signals.dayOfWeek === 0 && signals.hour >= 18 && signals.hour <= 22) {
    totalScore += 0.25;
    reasons.push('sunday-wind-down');
    suggestedMood = suggestedMood || 'relaxing';
    confidence += 0.15;
  }

  // Weekend morning
  if (signals.isWeekend && signals.hour >= 8 && signals.hour <= 11) {
    totalScore += 0.2;
    reasons.push('weekend-morning');
    suggestedMood = suggestedMood || 'upbeat';
    confidence += 0.1;
  }

  // Check user's historical time preferences
  if (profile.timePatterns.preferredHours.includes(signals.hour)) {
    totalScore += 0.3;
    reasons.push('historical-time-preference');
    confidence += 0.25;
  }

  // Check for detected routines
  for (const routine of profile.timePatterns.routines) {
    if (signals.hour >= routine.startHour && signals.hour <= routine.endHour) {
      totalScore += 0.35 * (routine.frequency / 10); // More weight for established routines
      reasons.push(`routine:${routine.name}`);
      suggestedMood = routine.preferredMood;
      confidence += 0.2;
      break;
    }
  }

  // === EMOTIONAL PATTERNS ===

  if (signals.detectedEmotion) {
    const emotionalBoost = getEmotionalMusicBoost(
      signals.detectedEmotion,
      signals.emotionalIntensity || 0.5,
      profile
    );
    totalScore += emotionalBoost.score;
    if (emotionalBoost.mood) suggestedMood = emotionalBoost.mood;
    if (emotionalBoost.reason) reasons.push(emotionalBoost.reason);
    confidence += emotionalBoost.confidence;
  }

  // === CONVERSATION PATTERNS ===

  // Long silence might indicate need for ambient music
  if (
    signals.silenceDuration &&
    signals.silenceDuration >= profile.conversationTriggers.afterSilence
  ) {
    totalScore += 0.2;
    reasons.push('extended-silence');
    suggestedMood = suggestedMood || 'ambient';
    confidence += 0.1;
  }

  // Deep conversation often benefits from calming music afterward
  if (signals.topicDepth === 'deep' && signals.conversationDuration > 600) {
    // 10+ minutes of deep talk
    totalScore += 0.25;
    reasons.push('after-deep-conversation');
    suggestedMood = suggestedMood || 'calming';
    confidence += 0.15;
  }

  // Check if recent topics match user's music request patterns
  if (signals.recentTopics) {
    const matchingTopics = signals.recentTopics.filter((t) =>
      profile.conversationTriggers.afterTopics.some((pattern) => t.toLowerCase().includes(pattern))
    );
    if (matchingTopics.length > 0) {
      totalScore += 0.2;
      reasons.push('topic-pattern-match');
      confidence += 0.15;
    }
  }

  // === MUSIC HISTORY ===

  // Don't offer too soon after last music
  if (signals.lastMusicPlayedAt) {
    const timeSinceMusic = (Date.now() - signals.lastMusicPlayedAt) / 1000 / 60; // minutes
    if (timeSinceMusic < 5) {
      totalScore -= 0.5; // Strong penalty for offering too soon
      reasons.push('too-soon-after-music');
    } else if (timeSinceMusic > 30) {
      totalScore += 0.15; // Slight boost if it's been a while
      reasons.push('been-a-while-since-music');
    }
  }

  // === USER ENGAGEMENT ===

  // New users get gentler offers
  if (signals.sessionCount && signals.sessionCount < 5) {
    totalScore *= 0.7; // Less aggressive for new users
    reasons.push('new-user-gentler');
  }

  // Loyal users (high streak) appreciate proactive offers
  if (signals.connectionStreak && signals.connectionStreak > 7) {
    totalScore += 0.1;
    reasons.push('loyal-user');
    confidence += 0.1;
  }

  // === LEVERAGE MUSIC MEMORY ===

  // Check if we have successful music memories for similar contexts
  const relevantMemory = findRelevantMusicMemory(userLearning.musicMemory, signals);
  if (relevantMemory) {
    totalScore += 0.3 * relevantMemory.outcomeScore;
    suggestedMood = suggestedMood || relevantMemory.music.mood;
    reasons.push('successful-memory-match');
    confidence += 0.2;
  }

  // === FINAL CALCULATION ===

  // Normalize confidence
  confidence = Math.min(confidence, 0.9);

  // Determine if we should offer
  const shouldOffer = totalScore >= 0.5;

  // Determine priority
  let priority: 'low' | 'medium' | 'high' = 'low';
  if (totalScore >= 0.8) priority = 'high';
  else if (totalScore >= 0.6) priority = 'medium';

  // Generate offer phrase
  const offerPhrase = shouldOffer ? generateOfferPhrase(reasons, suggestedMood) : undefined;

  log.debug(
    {
      userId: signals.userId,
      totalScore,
      confidence,
      reasons,
      shouldOffer,
      suggestedMood,
    },
    '🎵 Music anticipation prediction'
  );

  return {
    shouldOffer,
    confidence,
    suggestedMood,
    reason: reasons.join(', '),
    offerPhrase,
    priority,
  };
}

/**
 * Get emotional context boost for music anticipation
 */
function getEmotionalMusicBoost(
  emotion: string,
  intensity: number,
  profile: MusicAnticipationProfile
): { score: number; mood?: string; reason?: string; confidence: number } {
  // Check user's historical emotional triggers
  const historicalTrigger = profile.emotionalTriggers.find((t) => t.emotion === emotion);

  if (historicalTrigger && historicalTrigger.successRate > 0.6) {
    return {
      score: 0.4 * historicalTrigger.successRate,
      mood: historicalTrigger.preferredMood,
      reason: `emotion:${emotion}-historical`,
      confidence: 0.25,
    };
  }

  // Default emotional mappings
  const emotionMusicMap: Record<string, { boost: number; mood: string }> = {
    stressed: { boost: 0.35 * intensity, mood: 'calming' },
    anxious: { boost: 0.3 * intensity, mood: 'peaceful' },
    sad: { boost: 0.25 * intensity, mood: 'comforting' },
    overwhelmed: { boost: 0.4 * intensity, mood: 'grounding' },
    excited: { boost: 0.2 * intensity, mood: 'upbeat' },
    neutral: { boost: 0.1, mood: 'background' },
  };

  const mapping = emotionMusicMap[emotion];
  if (mapping) {
    return {
      score: mapping.boost,
      mood: mapping.mood,
      reason: `emotion:${emotion}`,
      confidence: 0.15,
    };
  }

  return { score: 0, confidence: 0 };
}

/**
 * Find a relevant music memory for the current context
 */
function findRelevantMusicMemory(
  memories: MusicMemoryEntry[],
  signals: MusicContextSignals
): MusicMemoryEntry | null {
  if (memories.length === 0) return null;

  // Score each memory by relevance
  let bestMemory: MusicMemoryEntry | null = null;
  let bestScore = 0;

  for (const memory of memories) {
    let score = 0;

    // Emotional context match
    if (signals.detectedEmotion && memory.emotionalContext.includes(signals.detectedEmotion)) {
      score += 0.4;
    }

    // Topic context match
    if (signals.recentTopics && memory.topicContext) {
      if (
        signals.recentTopics.some((t) =>
          t.toLowerCase().includes(memory.topicContext!.toLowerCase())
        )
      ) {
        score += 0.3;
      }
    }

    // Recency bonus (more recent memories are more relevant)
    const ageInDays = (Date.now() - memory.timestamp) / (1000 * 60 * 60 * 24);
    if (ageInDays < 7) score += 0.2;
    else if (ageInDays < 30) score += 0.1;

    // Outcome score weight
    score *= memory.outcomeScore;

    if (score > bestScore) {
      bestScore = score;
      bestMemory = memory;
    }
  }

  return bestScore > 0.3 ? bestMemory : null;
}

/**
 * Generate a natural offer phrase
 */
function generateOfferPhrase(reasons: string[], mood?: string): string {
  // Offer phrases based on context
  const phrases: Record<string, string[]> = {
    'late-night-vibes': [
      'Some late night music might be nice...',
      'Want some chill vibes for this hour?',
      "I could put on something ambient if you'd like.",
    ],
    'sunday-wind-down': [
      'Sunday evening... want some wind-down music?',
      'Some relaxing tunes for the end of the weekend?',
    ],
    'extended-silence': [
      'Want some background music while we chat?',
      'Some ambient music might be nice here.',
    ],
    'after-deep-conversation': [
      'That was a lot. Some calming music?',
      'Want to breathe with some gentle music?',
    ],
    'emotion:stressed': [
      'Sounds like a lot on your mind. Some calming music?',
      'Music might help right now...',
    ],
    'emotion:anxious': ['Want some grounding music?', 'Some peaceful music might help...'],
    'emotion:sad': ['Some comforting music?', 'I could put on something gentle...'],
  };

  // Find matching phrase
  for (const reason of reasons) {
    if (phrases[reason]) {
      return phrases[reason][Math.floor(Math.random() * phrases[reason].length)];
    }
  }

  // Default phrase based on mood
  if (mood) {
    return `Want some ${mood} music?`;
  }

  return 'Want some music?';
}

// ============================================================================
// LEARNING FUNCTIONS
// ============================================================================

/**
 * Record when user accepts a music offer
 */
export function recordMusicAcceptance(
  userId: string,
  signals: MusicContextSignals,
  acceptedMood: string
): void {
  const profile = getOrCreateProfile(userId);

  // Update time patterns
  if (!profile.timePatterns.preferredHours.includes(signals.hour)) {
    profile.timePatterns.preferredHours.push(signals.hour);
    // Keep only top 5 hours
    if (profile.timePatterns.preferredHours.length > 5) {
      profile.timePatterns.preferredHours.shift();
    }
  }

  // Update emotional triggers
  if (signals.detectedEmotion) {
    const existing = profile.emotionalTriggers.find((t) => t.emotion === signals.detectedEmotion);
    if (existing) {
      existing.observations++;
      existing.successRate =
        (existing.successRate * (existing.observations - 1) + 1) / existing.observations;
    } else {
      profile.emotionalTriggers.push({
        emotion: signals.detectedEmotion,
        preferredMood: acceptedMood,
        successRate: 1,
        observations: 1,
      });
    }
  }

  // Update topic triggers
  if (signals.recentTopics) {
    for (const topic of signals.recentTopics) {
      if (!profile.conversationTriggers.afterTopics.includes(topic.toLowerCase())) {
        profile.conversationTriggers.afterTopics.push(topic.toLowerCase());
        // Keep only top 10 topics
        if (profile.conversationTriggers.afterTopics.length > 10) {
          profile.conversationTriggers.afterTopics.shift();
        }
      }
    }
  }

  profile.lastUpdated = Date.now();
  log.debug({ userId, hour: signals.hour, mood: acceptedMood }, '🎵 Recorded music acceptance');
}

/**
 * Record when user declines a music offer
 */
export function recordMusicDecline(userId: string, signals: MusicContextSignals): void {
  const profile = getOrCreateProfile(userId);

  // Update emotional triggers (lower success rate)
  if (signals.detectedEmotion) {
    const existing = profile.emotionalTriggers.find((t) => t.emotion === signals.detectedEmotion);
    if (existing) {
      existing.observations++;
      existing.successRate =
        (existing.successRate * (existing.observations - 1)) / existing.observations;
    }
  }

  // Maybe remove this hour from preferred hours if declined multiple times
  const hourIndex = profile.timePatterns.preferredHours.indexOf(signals.hour);
  if (hourIndex !== -1) {
    // Remove after 2 declines at this hour
    profile.timePatterns.preferredHours.splice(hourIndex, 1);
  }

  profile.lastUpdated = Date.now();
  log.debug({ userId, hour: signals.hour }, '🎵 Recorded music decline');
}

/**
 * Detect and record routines based on repeated patterns
 */
export function detectRoutine(
  userId: string,
  routineName: string,
  startHour: number,
  endHour: number,
  preferredMood: string
): void {
  const profile = getOrCreateProfile(userId);

  const existing = profile.timePatterns.routines.find((r) => r.name === routineName);
  if (existing) {
    existing.frequency++;
  } else {
    profile.timePatterns.routines.push({
      name: routineName,
      startHour,
      endHour,
      preferredMood,
      frequency: 1,
    });
  }

  profile.lastUpdated = Date.now();
  log.info(
    { userId, routineName, frequency: existing?.frequency || 1 },
    '🎵 Routine detected/updated'
  );
}

// ============================================================================
// INTEGRATION HELPERS
// ============================================================================

/**
 * Build context signals from current session state
 */
export function buildMusicContextSignals(
  userId: string,
  sessionData: {
    emotionalState?: string;
    emotionalIntensity?: number;
    conversationDurationSec?: number;
    silenceDurationSec?: number;
    topicDepth?: 'surface' | 'moderate' | 'deep';
    recentTopics?: string[];
    lastMusicPlayedAt?: number;
    musicRequestsToday?: number;
    connectionStreak?: number;
    sessionCount?: number;
  }
): MusicContextSignals {
  const now = new Date();

  return {
    userId,
    hour: now.getHours(),
    dayOfWeek: now.getDay(),
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
    detectedEmotion: sessionData.emotionalState as MusicContextSignals['detectedEmotion'],
    emotionalIntensity: sessionData.emotionalIntensity,
    conversationDuration: sessionData.conversationDurationSec || 0,
    silenceDuration: sessionData.silenceDurationSec,
    topicDepth: sessionData.topicDepth,
    recentTopics: sessionData.recentTopics,
    lastMusicPlayedAt: sessionData.lastMusicPlayedAt,
    musicRequestsToday: sessionData.musicRequestsToday,
    connectionStreak: sessionData.connectionStreak,
    sessionCount: sessionData.sessionCount,
  };
}

/**
 * Export profile for persistence
 */
export function exportProfile(userId: string): MusicAnticipationProfile | null {
  return anticipationProfiles.get(userId) || null;
}

/**
 * Import profile from storage
 */
export function importProfile(profile: MusicAnticipationProfile): void {
  anticipationProfiles.set(profile.userId, profile);
}

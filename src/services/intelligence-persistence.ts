/**
 * Intelligence Persistence Module
 *
 * Unified persistence layer for all intelligence engines.
 * Ensures that learned user preferences, patterns, and memories
 * are reliably saved to the user profile.
 *
 * This module solves the critical gap where intelligence engines
 * collect valuable data but don't persist it reliably.
 */

import type { UserProfile } from '../types/user-profile.js';
import { getLogger } from '../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../utils/interval-manager.js';

// Import metrics for observability
import { persistenceMetrics } from './analytics/persistence-metrics.js';

// Intelligence Engines
import {
  getHumorCalibration,
  removeHumorCalibration,
  type HumorPreferences,
} from '../intelligence/humor-calibration.js';

import {
  getStoryPreference,
  removeStoryPreference,
  type StoryPreferences,
} from '../intelligence/story-preference.js';

import {
  getCommunicationMirroring,
  removeCommunicationMirroring,
} from '../intelligence/communication-mirroring.js';

import {
  getEmotionalMemory,
  removeEmotionalMemory,
  type EmotionalMoment,
} from '../intelligence/emotional-memory.js';

import {
  getVoicePaceAdapter,
  removeVoicePaceAdapter,
  type LearnedPacePreferences,
} from '../intelligence/voice-pace-adapter.js';

import {
  getResponseQualityTracker,
  removeResponseQualityTracker,
  type LearnedResponsePreferences,
  type ResponseSignal,
} from '../intelligence/response-quality-tracker.js';

import {
  getConversationPatternAnalyzer,
  removeConversationPatternAnalyzer,
  type ConversationSession,
  type LearnedConversationPatterns,
} from '../intelligence/conversation-pattern-analyzer.js';

import {
  getCrossSessionThreader,
  removeCrossSessionThreader,
  type OpenThread,
  type PromisedFollowUp,
} from '../intelligence/cross-session-threader.js';

// 🌟 Better Than Human capabilities
import {
  getBetterThanHuman,
  getExistingBetterThanHumanForUser,
} from '../conversation/superhuman/orchestrator.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Complete intelligence state for a user
 * Stored in profile.customData.intelligenceState
 */
export interface IntelligenceState {
  version: number;
  savedAt: Date;

  // Humor calibration
  humor?: {
    preferences: HumorPreferences | null;
  };

  // Story preferences
  stories?: {
    preferences: StoryPreferences | null;
  };

  // Communication style
  communication?: {
    formality: string;
    energy: string;
    vocabulary: string;
  };

  // Emotional memory
  emotional?: {
    moments: EmotionalMoment[];
    stats: {
      totalMoments: number;
      unresolvedCount: number;
    };
  };

  // Voice pace
  voicePace?: {
    preferences: LearnedPacePreferences | null;
  };

  // Response quality
  responseQuality?: {
    preferences: LearnedResponsePreferences | null;
    signals: ResponseSignal[];
  };

  // Conversation patterns
  patterns?: {
    preferences: LearnedConversationPatterns | null;
    sessions: ConversationSession[];
  };

  // Cross-session threads
  threads?: {
    openThreads: OpenThread[];
    promisedFollowUps: PromisedFollowUp[];
  };

  // 🌟 Better Than Human capabilities
  betterThanHuman?: {
    emotionalBond: unknown;
    anticipation: unknown;
    linguistic: unknown;
    jokes: unknown;
    team: unknown;
    temporal: unknown;
    metaRelationship: unknown;
    observations: unknown;
    sessionCount: number;
  };
}

/**
 * Persistence configuration
 */
export interface PersistenceConfig {
  /** Auto-save interval in milliseconds (0 = disabled) */
  autoSaveIntervalMs: number;
  /** Maximum attempts for retrying saves */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelayMs: number;
  /** Whether to validate data before saving */
  validateBeforeSave: boolean;
}

const DEFAULT_CONFIG: PersistenceConfig = {
  autoSaveIntervalMs: 30000, // 30 seconds
  maxRetries: 3,
  retryDelayMs: 1000,
  validateBeforeSave: true,
};

// Current intelligence state version
const INTELLIGENCE_STATE_VERSION = 1;

// ============================================================================
// EXPORT STATE FUNCTIONS
// ============================================================================

/**
 * Export all intelligence state for a user
 */
export function exportIntelligenceState(userId: string): IntelligenceState {
  const startTime = Date.now();
  let engineCount = 0;

  const state: IntelligenceState = {
    version: INTELLIGENCE_STATE_VERSION,
    savedAt: new Date(),
  };

  try {
    // Humor calibration
    const humorEngine = getHumorCalibration(userId);
    state.humor = {
      preferences: humorEngine.calculatePreferences(),
    };
    engineCount++;
  } catch (error) {
    getLogger().debug({ error, userId }, 'No humor calibration data');
  }

  try {
    // Story preferences
    const storyEngine = getStoryPreference(userId);
    state.stories = {
      preferences: storyEngine.calculatePreferences(),
    };
    engineCount++;
  } catch (error) {
    getLogger().debug({ error, userId }, 'No story preference data');
  }

  try {
    // Communication mirroring
    const commEngine = getCommunicationMirroring(userId);
    const commStats = commEngine.getStats();
    state.communication = {
      formality: commStats.style.formality,
      energy: commStats.style.energy,
      vocabulary: commStats.style.vocabulary,
    };
    engineCount++;
  } catch (error) {
    getLogger().debug({ error, userId }, 'No communication mirroring data');
  }

  try {
    // Emotional memory
    const emotionalEngine = getEmotionalMemory(userId);
    const emotionalStats = emotionalEngine.getStats();
    state.emotional = {
      moments: emotionalEngine.exportMoments(),
      stats: {
        totalMoments: emotionalStats.totalMoments,
        unresolvedCount: emotionalStats.unresolvedCount,
      },
    };
    engineCount++;
  } catch (error) {
    getLogger().debug({ error, userId }, 'No emotional memory data');
  }

  try {
    // Voice pace
    const paceEngine = getVoicePaceAdapter(userId);
    state.voicePace = {
      preferences: paceEngine.calculatePreferences(),
    };
    engineCount++;
  } catch (error) {
    getLogger().debug({ error, userId }, 'No voice pace data');
  }

  try {
    // Response quality
    const qualityTracker = getResponseQualityTracker(userId);
    state.responseQuality = {
      preferences: qualityTracker.calculatePreferences(),
      signals: qualityTracker.getSignals().slice(-50), // Keep last 50
    };
    engineCount++;
  } catch (error) {
    getLogger().debug({ error, userId }, 'No response quality data');
  }

  try {
    // Conversation patterns
    const patternAnalyzer = getConversationPatternAnalyzer(userId);
    state.patterns = {
      preferences: patternAnalyzer.analyzePatterns(),
      sessions: patternAnalyzer.getSessions().slice(-20), // Keep last 20
    };
    engineCount++;
  } catch (error) {
    getLogger().debug({ error, userId }, 'No conversation pattern data');
  }

  try {
    // Cross-session threads
    const threader = getCrossSessionThreader(userId);
    const threadData = threader.getAllData();
    state.threads = {
      openThreads: threadData.threads,
      promisedFollowUps: threadData.followUps,
    };
    engineCount++;
  } catch (error) {
    getLogger().debug({ error, userId }, 'No cross-session thread data');
  }

  // 🌟 Better Than Human capabilities
  try {
    // FIX: Use getExistingBetterThanHuman to avoid creating orphaned orchestrators
    // that cause memory leaks. Each `export-{timestamp}` sessionId was creating
    // a new orchestrator in the singleton Map that was never cleaned up.
    const existingOrchestrator = getExistingBetterThanHumanForUser(userId);
    if (existingOrchestrator) {
      const bthState = existingOrchestrator.export();
      state.betterThanHuman = bthState;
      engineCount++;
      getLogger().debug(
        { userId, sessionCount: bthState.sessionCount },
        'Exported Better Than Human state'
      );
    } else {
      getLogger().debug({ userId }, 'No active Better Than Human session to export');
    }
  } catch (error) {
    getLogger().debug({ error, userId }, 'No Better Than Human data');
  }

  // Record metrics
  const durationMs = Date.now() - startTime;
  persistenceMetrics.recordIntelligenceExport(userId, engineCount, durationMs);

  return state;
}

// ============================================================================
// IMPORT STATE FUNCTIONS
// ============================================================================

/**
 * Import intelligence state for a user from their profile
 */
export function importIntelligenceState(userId: string, state: IntelligenceState): void {
  const startTime = Date.now();
  let engineCount = 0;

  if (!state) {
    getLogger().debug({ userId }, 'No intelligence state to import');
    return;
  }

  // Version check for future migrations
  if (state.version > INTELLIGENCE_STATE_VERSION) {
    getLogger().warn(
      { userId, stateVersion: state.version, currentVersion: INTELLIGENCE_STATE_VERSION },
      'Intelligence state from newer version, some data may not load'
    );
  }

  try {
    // Emotional memory - this is the most important to restore
    if (state.emotional?.moments?.length) {
      const emotionalEngine = getEmotionalMemory(userId);
      emotionalEngine.importMoments(state.emotional.moments);
      engineCount++;
      getLogger().debug(
        { userId, count: state.emotional.moments.length },
        'Imported emotional memory'
      );
    }
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to import emotional memory');
  }

  try {
    // Cross-session threads - restore open threads for continuity
    if (state.threads?.openThreads?.length || state.threads?.promisedFollowUps?.length) {
      // Getting the threader will initialize it with the persisted data
      getCrossSessionThreader(userId, state.threads.openThreads, state.threads.promisedFollowUps);
      engineCount++;
      getLogger().debug(
        {
          userId,
          threads: state.threads.openThreads?.length || 0,
          followUps: state.threads.promisedFollowUps?.length || 0,
        },
        'Imported cross-session threads'
      );
    }
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to import cross-session threads');
  }

  // Note: Humor, Story, Communication, VoicePace, ResponseQuality, and Pattern
  // preferences are calculated fresh from observations during the session.
  // We only persist the preferences (learned outcomes), not the raw observations.
  // This is intentional - we want fresh calculations each session.

  // 🌟 Better Than Human capabilities - restore emotional bonds, jokes, etc.
  try {
    if (state.betterThanHuman) {
      const bthOrchestrator = getBetterThanHuman(
        userId,
        `import-${Date.now()}`,
        'ferni',
        state.betterThanHuman.sessionCount || 0
      );
      bthOrchestrator.import(state.betterThanHuman as ReturnType<typeof bthOrchestrator.export>);
      engineCount++;
      getLogger().debug(
        { userId, sessionCount: state.betterThanHuman.sessionCount },
        'Imported Better Than Human state'
      );
    }
  } catch (error) {
    getLogger().warn({ error, userId }, 'Failed to import Better Than Human state');
  }

  // Record metrics
  const durationMs = Date.now() - startTime;
  persistenceMetrics.recordIntelligenceImport(userId, engineCount, durationMs);

  getLogger().info(
    { userId, stateVersion: state.version, engineCount },
    'Intelligence state imported'
  );
}

// ============================================================================
// PROFILE INTEGRATION
// ============================================================================

/**
 * Apply intelligence state to user profile for persistence
 */
export function applyIntelligenceToProfile(profile: UserProfile, userId: string): UserProfile {
  const state = exportIntelligenceState(userId);

  // Store in customData for persistence
  if (!profile.customData) {
    profile.customData = {};
  }

  (profile.customData as Record<string, unknown>).intelligenceState = state;

  // Also update direct profile fields where applicable
  if (state.voicePace?.preferences) {
    const prefs = state.voicePace.preferences;
    profile.voicePace = {
      observations: [], // Observations are session-specific, not persisted
      preferences: {
        avgWPM: prefs.avgWPM,
        preferredPauseLength: prefs.avgResponseTime * 1000 || 200,
        preferredTempo: prefs.wpmCategory || 'moderate',
        recommendedJackWPM: prefs.recommendedJackWPM,
        recommendedResponseLength: prefs.prefersShortResponses ? 'brief' : 'moderate',
      },
    };
  }

  if (state.responseQuality?.preferences) {
    const prefs = state.responseQuality.preferences;
    profile.responseQuality = {
      signals: (state.responseQuality.signals || []).map((sig) => ({
        id: sig.id,
        timestamp: sig.timestamp,
        responseType: sig.responseType,
        responseLength: sig.responseLength,
        topic: sig.topic,
        userReaction: sig.userReaction,
        engagementScore: sig.engagementScore,
      })),
      preferences: {
        likesStories: prefs.storyEffectiveness > 0.6,
        likesHumor: prefs.humorEffectiveness > 0.6,
        likesQuestions: prefs.questionEffectiveness > 0.6,
        prefersDirectAdvice: prefs.adviceEffectiveness > 0.6,
        preferredResponseLength: prefs.preferredResponseLength,
        highEngagementTopics: prefs.highEngagementTopics || [],
        lowEngagementTopics: prefs.lowEngagementTopics || [],
      },
    };
  }

  if (state.patterns?.preferences) {
    const prefs = state.patterns.preferences;
    profile.conversationPatterns = {
      sessions: (state.patterns.sessions || []).map((sess) => ({
        id: sess.id,
        startedAt: sess.startedAt,
        endedAt: sess.endedAt,
        dayOfWeek: sess.dayOfWeek,
        timeOfDay: sess.timeOfDay,
        durationMinutes: sess.durationMinutes,
        openingStyle: sess.openingStyle,
        topicSequence: sess.topicSequence,
      })),
      preferences: {
        preferredTimes: prefs.preferredTimes || [],
        preferredDays: prefs.preferredDays || [],
        avgDuration: prefs.avgDuration || 15,
        likesSmallTalkFirst: prefs.likesSmallTalkFirst ?? true,
        prefersQuickConversations: prefs.hasTimeConstraints ?? false,
      },
    };
  }

  // Open threads and follow-ups
  if (state.threads) {
    // Map threads to profile format, excluding 'abandoned' status
    profile.openThreads = state.threads.openThreads.map((thread) => ({
      id: thread.id,
      topic: thread.topic,
      reason: thread.reason,
      priority: thread.priority,
      suggestedResumption: thread.suggestedResumption,
      // Map 'abandoned' to 'closed' for profile compatibility
      status: thread.status === 'abandoned' ? 'closed' : thread.status,
      createdAt: thread.createdAt,
    })) as UserProfile['openThreads'];

    profile.promisedFollowUps = state.threads.promisedFollowUps;
  }

  // Emotional moments in customData
  if (state.emotional?.moments) {
    (profile.customData as Record<string, unknown>).emotionalMoments = state.emotional.moments;
  }

  profile.updatedAt = new Date();

  return profile;
}

/**
 * Load intelligence state from user profile
 */
export function loadIntelligenceFromProfile(userId: string, profile: UserProfile): void {
  const customData = profile.customData as Record<string, unknown> | undefined;

  if (customData?.intelligenceState) {
    importIntelligenceState(userId, customData.intelligenceState as IntelligenceState);
    return;
  }

  // Fallback: Load from individual profile fields (backward compatibility)
  const legacyState: IntelligenceState = {
    version: 0, // Legacy marker
    savedAt: profile.updatedAt || new Date(),
  };

  // Load emotional moments
  if (customData?.emotionalMoments) {
    legacyState.emotional = {
      moments: customData.emotionalMoments as EmotionalMoment[],
      stats: { totalMoments: 0, unresolvedCount: 0 },
    };
  }

  // Load threads
  if (profile.openThreads || profile.promisedFollowUps) {
    legacyState.threads = {
      openThreads: (profile.openThreads || []) as OpenThread[],
      promisedFollowUps: (profile.promisedFollowUps || []) as PromisedFollowUp[],
    };
  }

  if (Object.keys(legacyState).length > 2) {
    importIntelligenceState(userId, legacyState);
    getLogger().info({ userId }, 'Loaded intelligence from legacy profile fields');
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up all intelligence engines for a user
 */
export function cleanupIntelligenceEngines(userId: string): void {
  try {
    removeHumorCalibration(userId);
    removeStoryPreference(userId);
    removeCommunicationMirroring(userId);
    removeEmotionalMemory(userId);
    removeVoicePaceAdapter(userId);
    removeResponseQualityTracker(userId);
    removeConversationPatternAnalyzer(userId);
    removeCrossSessionThreader(userId);

    getLogger().debug({ userId }, 'Cleaned up intelligence engines');
  } catch (error) {
    getLogger().warn({ error, userId }, 'Error during intelligence cleanup');
  }
}

// ============================================================================
// AUTO-SAVE MANAGER
// ============================================================================

function getAutoSaveIntervalName(userId: string): string {
  return `intelligence-auto-save-${userId}`;
}

interface AutoSaveEntry {
  userId: string;
  lastSave: Date;
  saveCallback: (userId: string) => Promise<void>;
}

const autoSaveRegistry = new Map<string, AutoSaveEntry>();

/**
 * Start auto-saving intelligence state for a user
 */
export function startAutoSave(
  userId: string,
  saveCallback: (userId: string) => Promise<void>,
  config: Partial<PersistenceConfig> = {}
): void {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  if (mergedConfig.autoSaveIntervalMs <= 0) {
    getLogger().debug({ userId }, 'Auto-save disabled');
    return;
  }

  // Clear existing auto-save if any
  stopAutoSave(userId);

  registerInterval(
    getAutoSaveIntervalName(userId),
    () => {
      void (async () => {
        try {
          await saveCallback(userId);
          const entry = autoSaveRegistry.get(userId);
          if (entry) {
            entry.lastSave = new Date();
          }
          getLogger().debug({ userId }, 'Auto-saved intelligence state');
        } catch (error) {
          getLogger().warn({ error, userId }, 'Auto-save failed');
        }
      })();
    },
    mergedConfig.autoSaveIntervalMs
  );

  autoSaveRegistry.set(userId, {
    userId,
    lastSave: new Date(),
    saveCallback,
  });

  getLogger().info({ userId, intervalMs: mergedConfig.autoSaveIntervalMs }, 'Started auto-save');
}

/**
 * Stop auto-saving for a user
 */
export function stopAutoSave(userId: string): void {
  const intervalName = getAutoSaveIntervalName(userId);
  const entry = autoSaveRegistry.get(userId);

  // Always try to clear the interval even if not in registry
  // (handles edge cases where registry is out of sync)
  const intervalCleared = clearNamedInterval(intervalName);

  if (entry) {
    autoSaveRegistry.delete(userId);
    getLogger().info({ userId, intervalName, intervalCleared }, '🛑 Stopped auto-save for user');
  } else if (intervalCleared) {
    // Interval existed but wasn't in registry - still cleaned up
    getLogger().warn(
      { userId, intervalName },
      '⚠️ Auto-save interval existed but was not in registry - cleaned up orphan'
    );
  } else {
    // Neither existed - log for debugging memory leak issues
    getLogger().debug({ userId, intervalName }, 'stopAutoSave called but no auto-save was active');
  }
}

/**
 * Stop all auto-saves (for shutdown)
 */
export function stopAllAutoSaves(): void {
  for (const [userId] of autoSaveRegistry.entries()) {
    clearNamedInterval(getAutoSaveIntervalName(userId));
    getLogger().debug({ userId }, 'Stopped auto-save during shutdown');
  }
  autoSaveRegistry.clear();
}

/**
 * Get auto-save status
 */
export function getAutoSaveStatus(): Map<string, { lastSave: Date }> {
  const status = new Map<string, { lastSave: Date }>();
  for (const [userId, entry] of autoSaveRegistry.entries()) {
    status.set(userId, { lastSave: entry.lastSave });
  }
  return status;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  exportIntelligenceState,
  importIntelligenceState,
  applyIntelligenceToProfile,
  loadIntelligenceFromProfile,
  cleanupIntelligenceEngines,
  startAutoSave,
  stopAutoSave,
  stopAllAutoSaves,
  getAutoSaveStatus,
};

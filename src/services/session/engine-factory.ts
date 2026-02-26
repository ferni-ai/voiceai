/**
 * Engine Factory
 *
 * Creates and initializes all intelligence engines for a session.
 * Handles both advanced intelligence engines and human-level interaction engines.
 *
 * @module session-manager/engine-factory
 */

import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';

// Advanced Intelligence Engines
import {
  getCommunicationMirroring,
  getConversationPatternAnalyzer,
  getCrossSessionThreader,
  getEmotionalMemory,
  getFinancialJourneyTracker,
  getHumorCalibration,
  getProactiveInsightEngine,
  getResponseQualityTracker,
  getStoryPreference,
  getVoicePaceAdapter,
} from '../../intelligence/index.js';

import type { OpenThread, PromisedFollowUp } from '../../intelligence/cross-session-threader.js';
import type { EmotionalMoment } from '../../intelligence/emotional-memory.js';

/**
 * All intelligence engines created for a session
 *
 * Uses ReturnType to infer correct types from getter functions
 */
export interface SessionEngines {
  // Advanced Intelligence Engines
  responseQualityTracker: ReturnType<typeof getResponseQualityTracker>;
  patternAnalyzer: ReturnType<typeof getConversationPatternAnalyzer>;
  proactiveEngine: ReturnType<typeof getProactiveInsightEngine>;
  journeyTracker: ReturnType<typeof getFinancialJourneyTracker>;
  voicePaceAdapter: ReturnType<typeof getVoicePaceAdapter>;
  crossSessionThreader: ReturnType<typeof getCrossSessionThreader>;

  // Human-Level Interaction Engines
  humorCalibration: ReturnType<typeof getHumorCalibration>;
  storyPreference: ReturnType<typeof getStoryPreference>;
  communicationMirroring: ReturnType<typeof getCommunicationMirroring>;
  emotionalMemory: ReturnType<typeof getEmotionalMemory>;
}

/**
 * Options for creating session engines
 */
export interface CreateEnginesOptions {
  /** User ID for the session (or session ID if no user) */
  engineKey: string;
  /** Session ID for tracking */
  sessionId: string;
  /** User profile for loading persisted state */
  userProfile: UserProfile | null;
  /** Whether this is a returning user */
  isReturningUser: boolean;
}

/**
 * Create all intelligence engines for a session
 *
 * This initializes:
 * - Advanced intelligence engines (pattern analysis, quality tracking, etc.)
 * - Human-level interaction engines (humor, stories, communication style)
 * - Cross-session threading with persistence from user profile
 * - Emotional memory with session tracking
 */
export function createSessionEngines(options: CreateEnginesOptions): SessionEngines {
  const { engineKey, sessionId, userProfile, isReturningUser } = options;
  const log = getLogger();

  // ============================================================================
  // ADVANCED INTELLIGENCE ENGINES
  // ============================================================================

  const responseQualityTracker = getResponseQualityTracker(engineKey);
  const patternAnalyzer = getConversationPatternAnalyzer(engineKey);
  const proactiveEngine = getProactiveInsightEngine(engineKey);
  const journeyTracker = getFinancialJourneyTracker(engineKey);
  const voicePaceAdapter = getVoicePaceAdapter(engineKey);

  // ============================================================================
  // HUMAN-LEVEL INTERACTION ENGINES
  // ============================================================================

  const humorCalibration = getHumorCalibration(engineKey);
  const storyPreference = getStoryPreference(engineKey);
  const communicationMirroring = getCommunicationMirroring(engineKey);
  const emotionalMemory = getEmotionalMemory(engineKey);

  // Start emotional memory session
  emotionalMemory.startSession(sessionId);

  // Load emotional memory from profile for returning users
  if (userProfile?.customData && isReturningUser) {
    loadEmotionalMemoryFromProfile(userProfile, emotionalMemory, log);
  }

  // ============================================================================
  // CROSS-SESSION THREADER (with persistence from user profile)
  // ============================================================================

  const crossSessionThreader = createCrossSessionThreader(
    engineKey,
    sessionId,
    userProfile,
    isReturningUser,
    log
  );

  log.info('Advanced intelligence engines initialized');

  return {
    responseQualityTracker,
    patternAnalyzer,
    proactiveEngine,
    journeyTracker,
    voicePaceAdapter,
    crossSessionThreader,
    humorCalibration,
    storyPreference,
    communicationMirroring,
    emotionalMemory,
  };
}

/**
 * Load emotional memory from user profile for returning users
 */
function loadEmotionalMemoryFromProfile(
  userProfile: UserProfile,
  emotionalMemory: ReturnType<typeof getEmotionalMemory>,
  log: ReturnType<typeof getLogger>
): void {
  const customData = userProfile.customData as {
    emotionalMoments?: EmotionalMoment[];
  };

  if (customData.emotionalMoments?.length) {
    emotionalMemory.importMoments(customData.emotionalMoments);
    log.info({ count: customData.emotionalMoments.length }, 'Loaded emotional memory from profile');
  }
}

/**
 * Create cross-session threader with persistence from user profile
 */
function createCrossSessionThreader(
  engineKey: string,
  sessionId: string,
  userProfile: UserProfile | null,
  isReturningUser: boolean,
  log: ReturnType<typeof getLogger>
): ReturnType<typeof getCrossSessionThreader> {
  let existingThreads: OpenThread[] | undefined;
  let existingFollowUps: PromisedFollowUp[] | undefined;

  // FIX: Load existing threads and follow-ups for returning users
  if (userProfile?.customData && isReturningUser) {
    const customData = userProfile.customData as {
      openThreads?: OpenThread[];
      promisedFollowUps?: PromisedFollowUp[];
    };

    existingThreads = customData.openThreads;
    existingFollowUps = customData.promisedFollowUps;

    if (existingThreads?.length || existingFollowUps?.length) {
      log.info(
        {
          openThreads: existingThreads?.filter((t) => t.status === 'open').length || 0,
          pendingFollowUps: existingFollowUps?.filter((f) => !f.delivered).length || 0,
        },
        'Loaded cross-session threads from user profile'
      );
    }
  }

  const crossSessionThreader = getCrossSessionThreader(
    engineKey,
    existingThreads,
    existingFollowUps
  );

  // Set current session ID for thread tracking
  crossSessionThreader.setCurrentSession(sessionId);

  return crossSessionThreader;
}

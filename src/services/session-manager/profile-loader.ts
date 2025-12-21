/**
 * Profile Loader
 *
 * Handles loading or creating user profiles for sessions.
 * Includes realtime memory enrichment and intelligence state loading.
 *
 * @module session-manager/profile-loader
 */

import type { UserProfile } from '../../types/user-profile.js';
import { getLogger } from '../../utils/safe-logger.js';
import { validateUserId } from './validation.js';

// Real-time memory - persist turns as they happen, never lose data
import * as realtimeMemory from '../memory/realtime-memory.js';

// Cross-persona insights - load team intelligence for new sessions
import { loadInsights as loadCrossPersonaInsights } from '../cross-persona-insights.js';

// Unified persistence - session lifecycle hooks
import { onSessionStartUnified } from '../trust-systems/unified-persistence.js';

// Intelligence persistence - load intelligence state from profile
import { loadIntelligenceFromProfile } from '../intelligence-persistence.js';

// Global services type
import type { GlobalServices } from '../types.js';

/**
 * Result of profile loading operation
 */
export interface ProfileLoadResult {
  /** Loaded or created user profile, null if no valid userId */
  userProfile: UserProfile | null;
  /** Validated user ID, undefined if invalid */
  validatedUserId: string | undefined;
  /** Whether this is a returning user */
  isReturningUser: boolean;
}

/**
 * Load or create a user profile for a session
 *
 * This function handles:
 * - User ID validation
 * - Profile loading or creation
 * - Realtime memory enrichment for returning users
 * - Intelligence state loading
 * - Cross-persona insights loading
 * - Unified trust persistence initialization
 */
export async function loadOrCreateProfile(
  userId: string | undefined,
  sessionId: string,
  global: GlobalServices
): Promise<ProfileLoadResult> {
  const log = getLogger();

  // FIX BUG #session-13: Validate userId format before profile operations
  const validatedUserId = validateUserId(userId);

  if (!validatedUserId) {
    if (userId) {
      log.warn(
        { providedUserId: userId?.slice(0, 20) },
        'Skipping profile operations due to invalid userId'
      );
    }
    return {
      userProfile: null,
      validatedUserId: undefined,
      isReturningUser: false,
    };
  }

  // Load or create user profile
  let userProfile = await global.store.getProfile(validatedUserId);
  let isReturningUser = false;

  if (!userProfile) {
    const { createUserProfile } = await import('../../types/user-profile.js');
    userProfile = createUserProfile(validatedUserId);
    await global.store.saveProfile(userProfile);
  } else {
    isReturningUser = userProfile.totalConversations > 0;
  }

  // 🔴 REALTIME MEMORY: Enrich profile with recent conversation context
  if (isReturningUser && !userProfile.lastConversationSummary) {
    await enrichProfileWithRealtimeContext(validatedUserId, userProfile, log);
  }

  // FIX: Load intelligence state from profile for returning users
  if (isReturningUser) {
    loadIntelligenceState(validatedUserId, userProfile, log);
  }

  // Load cross-persona insights (team intelligence)
  await loadTeamInsights(validatedUserId, log);

  // Initialize unified trust persistence for this session
  await initializeTrustPersistence(validatedUserId, sessionId, log);

  return {
    userProfile,
    validatedUserId,
    isReturningUser,
  };
}

/**
 * Enrich profile with realtime conversation context
 * If the legacy lastConversationSummary is missing but we have realtime data,
 * pull from the realtime conversation store
 */
async function enrichProfileWithRealtimeContext(
  userId: string,
  userProfile: UserProfile,
  log: ReturnType<typeof getLogger>
): Promise<void> {
  try {
    const lastContext = await realtimeMemory.getLastConversationContext(userId);
    if (lastContext) {
      const summary = lastContext.summary || realtimeMemory.buildQuickSummary(lastContext.turns);
      if (summary) {
        userProfile.lastConversationSummary = summary;
        log.info(
          { userId, summary: summary.slice(0, 50) },
          '🔴 REALTIME: Enriched profile with last conversation context'
        );
      }
    }
  } catch (error) {
    log.debug(
      { error: String(error), userId },
      'Could not load realtime conversation context (non-blocking)'
    );
  }
}

/**
 * Load intelligence state from profile for returning users
 */
function loadIntelligenceState(
  userId: string,
  userProfile: UserProfile,
  log: ReturnType<typeof getLogger>
): void {
  try {
    loadIntelligenceFromProfile(userId, userProfile);
    log.info({ userId }, '🧠 Loaded intelligence state from profile');
  } catch (error) {
    log.warn({ error, userId }, 'Failed to load intelligence state');
  }
}

/**
 * Load cross-persona insights (team intelligence)
 */
async function loadTeamInsights(userId: string, log: ReturnType<typeof getLogger>): Promise<void> {
  try {
    await loadCrossPersonaInsights(userId);
    log.debug({ userId }, '💡 Loaded cross-persona insights');
  } catch {
    // Non-critical
  }
}

/**
 * Initialize unified trust persistence for this session
 */
async function initializeTrustPersistence(
  userId: string,
  sessionId: string,
  log: ReturnType<typeof getLogger>
): Promise<void> {
  try {
    await onSessionStartUnified(userId, sessionId);
  } catch {
    // Non-critical
  }
}

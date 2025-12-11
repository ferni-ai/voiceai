/**
 * World Awareness Session Integration
 *
 * Integrates world awareness pre-fetching with voice agent sessions.
 * Call initWorldAwareness() at session start to pre-warm the cache.
 *
 * @module WorldAwarenessSessionIntegration
 */

import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';

import { clearUserCache, warmWorldCache, type UserInterests } from './index.js';

const log = createLogger({ module: 'WorldAwarenessSession' });

// ============================================================================
// SESSION INTEGRATION
// ============================================================================

/**
 * Initialize world awareness for a user session.
 * Call this at session start - it runs in background, doesn't block.
 *
 * @param userId - The user's ID
 * @param userProfile - Optional user profile with location data
 */
export async function initWorldAwareness(
  userId: string,
  userProfile?: UserProfile | null
): Promise<void> {
  if (!userId || userId === 'anonymous') {
    log.debug('Skipping world awareness for anonymous user');
    return;
  }

  // Extract interests from user profile if available
  const interests: Partial<UserInterests> = {};
  const customData = userProfile?.customData as Record<string, unknown> | undefined;

  // Try to get location from profile customData
  if (customData?.location && typeof customData.location === 'string') {
    interests.location = customData.location;
  } else if (customData?.city && typeof customData.city === 'string') {
    interests.location = customData.city;
  }

  // Get timezone if available (from contactInfo or customData)
  if (userProfile?.contactInfo?.timezone) {
    interests.timezone = userProfile.contactInfo.timezone;
  } else if (customData?.timezone && typeof customData.timezone === 'string') {
    interests.timezone = customData.timezone;
  }

  // Get favorite teams if stored
  if (customData?.favoriteTeams && Array.isArray(customData.favoriteTeams)) {
    interests.favoriteTeams = customData.favoriteTeams as string[];
  }

  // Get industries of interest
  if (customData?.industries && Array.isArray(customData.industries)) {
    interests.industries = customData.industries as string[];
  }

  log.info(
    {
      userId,
      hasLocation: !!interests.location,
      teamCount: interests.favoriteTeams?.length || 0,
    },
    '🌍 Initializing world awareness'
  );

  // Warm the cache (runs in background)
  await warmWorldCache(userId, interests);
}

/**
 * Clean up world awareness when session ends.
 */
export function cleanupWorldAwareness(userId: string): void {
  if (!userId || userId === 'anonymous') return;

  clearUserCache(userId);
  log.debug({ userId }, 'World awareness cleaned up');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initWorldAwareness,
  cleanupWorldAwareness,
};

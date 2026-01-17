/**
 * World Awareness Session Integration
 *
 * Integrates world awareness pre-fetching with voice agent sessions.
 * Call initWorldAwareness() at session start to pre-warm the cache.
 *
 * Enhanced with IP-detected location for "TikTok-style" personalization:
 * - Weather for detected location
 * - Local sports teams suggestions
 * - Regional content hints
 *
 * @module WorldAwarenessSessionIntegration
 */

import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';

import { clearUserCache, warmWorldCache, type UserInterests } from './index.js';

const log = createLogger({ module: 'WorldAwarenessSession' });

// ============================================================================
// LOCAL TEAMS BY REGION (TikTok-style personalization)
// ============================================================================

/**
 * Map of regions/cities to local sports teams
 * Used to auto-suggest teams based on IP-detected location
 */
const REGION_TO_TEAMS: Record<string, string[]> = {
  // Utah
  utah: ['Jazz', 'Real Salt Lake'],
  'salt lake': ['Jazz', 'Real Salt Lake'],
  provo: ['Jazz', 'BYU'],
  // California
  'los angeles': ['Lakers', 'Dodgers', 'Rams', 'Chargers', 'Clippers', 'Kings', 'Galaxy'],
  'san francisco': ['49ers', 'Giants', 'Warriors'],
  'san diego': ['Padres'],
  oakland: ['Athletics', 'Raiders'],
  // New York
  'new york': ['Yankees', 'Mets', 'Giants', 'Jets', 'Knicks', 'Rangers', 'Nets'],
  brooklyn: ['Nets'],
  // Texas
  dallas: ['Cowboys', 'Mavericks', 'Rangers', 'Stars'],
  houston: ['Texans', 'Rockets', 'Astros'],
  austin: ['Longhorns'],
  'san antonio': ['Spurs'],
  // Pennsylvania
  philadelphia: ['Eagles', 'Phillies', '76ers', 'Flyers'],
  pittsburgh: ['Steelers', 'Pirates', 'Penguins'],
  // Illinois
  chicago: ['Bears', 'Bulls', 'Cubs', 'White Sox', 'Blackhawks'],
  // Massachusetts
  boston: ['Red Sox', 'Celtics', 'Patriots', 'Bruins'],
  // Florida
  miami: ['Heat', 'Dolphins', 'Marlins'],
  tampa: ['Buccaneers', 'Rays', 'Lightning'],
  orlando: ['Magic'],
  // Georgia
  atlanta: ['Braves', 'Falcons', 'Hawks'],
  // Washington
  seattle: ['Seahawks', 'Mariners', 'Kraken'],
  // Colorado
  denver: ['Broncos', 'Nuggets', 'Rockies', 'Avalanche'],
  // Arizona
  phoenix: ['Suns', 'Cardinals', 'Diamondbacks', 'Coyotes'],
  // Michigan
  detroit: ['Lions', 'Tigers', 'Pistons', 'Red Wings'],
  // Minnesota
  minneapolis: ['Vikings', 'Twins', 'Timberwolves', 'Wild'],
  // Ohio
  cleveland: ['Browns', 'Guardians', 'Cavaliers'],
  cincinnati: ['Bengals', 'Reds'],
  // Missouri
  'kansas city': ['Chiefs', 'Royals'],
  'st. louis': ['Cardinals', 'Blues'],
  // Wisconsin
  'green bay': ['Packers'],
  milwaukee: ['Bucks', 'Brewers'],
  // Washington DC
  washington: ['Commanders', 'Nationals', 'Wizards', 'Capitals'],
  // Nevada
  'las vegas': ['Raiders', 'Golden Knights'],
  // Tennessee
  nashville: ['Titans', 'Predators'],
  // Louisiana
  'new orleans': ['Saints', 'Pelicans'],
  // North Carolina
  charlotte: ['Panthers', 'Hornets'],
  // Indiana
  indianapolis: ['Colts', 'Pacers'],
};

/**
 * Get suggested local teams based on detected location
 */
function getLocalTeams(city?: string, regionCode?: string): string[] {
  if (!city && !regionCode) return [];

  const searchTerms = [city?.toLowerCase(), regionCode?.toLowerCase()].filter(Boolean);

  for (const term of searchTerms) {
    if (!term) continue;

    // Try exact match
    if (REGION_TO_TEAMS[term]) {
      return REGION_TO_TEAMS[term];
    }

    // Try partial match
    for (const [region, teams] of Object.entries(REGION_TO_TEAMS)) {
      if (term.includes(region) || region.includes(term)) {
        return teams;
      }
    }
  }

  return [];
}

// ============================================================================
// IP-DETECTED LOCATION TYPE
// ============================================================================

export interface IPDetectedLocation {
  city?: string;
  regionCode?: string;
  countryCode?: string;
}

// ============================================================================
// SESSION INTEGRATION
// ============================================================================

/**
 * Initialize world awareness for a user session.
 * Call this at session start - it runs in background, doesn't block.
 *
 * @param userId - The user's ID
 * @param userProfile - Optional user profile with location data
 * @param ipLocation - Optional IP-detected location (TikTok-style personalization)
 */
export async function initWorldAwareness(
  userId: string,
  userProfile?: UserProfile | null,
  ipLocation?: IPDetectedLocation
): Promise<void> {
  if (!userId || userId === 'anonymous') {
    log.debug('Skipping world awareness for anonymous user');
    return;
  }

  // Extract interests from user profile if available
  const interests: Partial<UserInterests> = {};
  const customData = userProfile?.customData as Record<string, unknown> | undefined;

  // Priority 1: Profile location
  // Priority 2: IP-detected location (TikTok-style)
  if (customData?.location && typeof customData.location === 'string') {
    interests.location = customData.location;
  } else if (customData?.city && typeof customData.city === 'string') {
    interests.location = customData.city;
  } else if (ipLocation?.city) {
    // Use IP-detected location!
    interests.location = ipLocation.regionCode
      ? `${ipLocation.city}, ${ipLocation.regionCode}`
      : ipLocation.city;
    log.info({ location: interests.location }, '📍 Using IP-detected location for world awareness');
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
  } else if (ipLocation?.city || ipLocation?.regionCode) {
    // Suggest local teams based on IP location (TikTok-style)
    const localTeams = getLocalTeams(ipLocation.city, ipLocation.regionCode);
    if (localTeams.length > 0) {
      interests.favoriteTeams = localTeams.slice(0, 3); // Top 3 local teams
      log.info({ teams: interests.favoriteTeams }, '🏈 Suggested local teams from IP location');
    }
  }

  // Get industries of interest
  if (customData?.industries && Array.isArray(customData.industries)) {
    interests.industries = customData.industries as string[];
  }

  log.info(
    {
      userId,
      hasLocation: !!interests.location,
      locationSource: customData?.location ? 'profile' : ipLocation?.city ? 'ip' : 'none',
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

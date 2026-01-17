/**
 * Moments Data Connector
 *
 * Connects the Moments System to existing data sources:
 * - Streak data from localStorage / seeds-economy.service
 * - Seeds balance from cosmetics.service
 * - Achievements from Firestore user profile
 *
 * @module ui/moments/data-connector
 */

import { getSeedBalance } from '../../services/cosmetics.service.js';
import { getCurrentStreak } from '../../services/seeds-economy.service.js';
import { createLogger } from '../../utils/logger.js';
import { badges } from './badges.js';
import type { Badge } from './types.js';

const log = createLogger('MomentsDataConnector');

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  ACHIEVEMENTS: 'ferni_achievements',
  ACHIEVEMENTS_SEEN: 'ferni_achievements_seen',
} as const;

// ============================================================================
// ACHIEVEMENT TRACKING
// ============================================================================

interface StoredAchievements {
  earned: Array<{
    id: string;
    earnedAt: string;
  }>;
  lastUpdated: string;
}

/**
 * Load achievements from localStorage
 */
function loadAchievements(): Badge[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS);
    if (!stored) return [];

    const data: StoredAchievements = JSON.parse(stored);
    return data.earned.map((a) => ({
      id: a.id,
      name: a.id, // Will be enriched by trophy room
      description: '',
      icon: '',
      category: 'special' as const,
      earnedAt: new Date(a.earnedAt),
    }));
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load achievements');
    return [];
  }
}

/**
 * Save achievement to localStorage
 */
function saveAchievement(badgeId: string): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS);
    const data: StoredAchievements = stored
      ? JSON.parse(stored)
      : { earned: [], lastUpdated: new Date().toISOString() };

    // Don't add duplicates
    if (data.earned.some((a) => a.id === badgeId)) return;

    data.earned.push({
      id: badgeId,
      earnedAt: new Date().toISOString(),
    });
    data.lastUpdated = new Date().toISOString();

    localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(data));
    log.info({ badgeId }, 'Achievement saved');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to save achievement');
  }
}

/**
 * Get unseen achievement IDs
 */
function getUnseenAchievements(): string[] {
  try {
    const achievements = loadAchievements();
    const seenStr = localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS_SEEN);
    const seen: string[] = seenStr ? JSON.parse(seenStr) : [];

    return achievements.filter((a) => !seen.includes(a.id)).map((a) => a.id);
  } catch {
    return [];
  }
}

/**
 * Mark achievements as seen
 */
function markAchievementsSeen(badgeIds: string[]): void {
  try {
    const seenStr = localStorage.getItem(STORAGE_KEYS.ACHIEVEMENTS_SEEN);
    const seen: string[] = seenStr ? JSON.parse(seenStr) : [];
    const updated = [...new Set([...seen, ...badgeIds])];
    localStorage.setItem(STORAGE_KEYS.ACHIEVEMENTS_SEEN, JSON.stringify(updated));
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to mark achievements seen');
  }
}

// ============================================================================
// DATA SYNC
// ============================================================================

/**
 * Sync all data sources to badge display
 */
export async function syncBadgeData(): Promise<void> {
  try {
    // Get streak
    const streak = getCurrentStreak();

    // Get seeds balance
    const seeds = await getSeedBalance();

    // Get achievements
    const achievements = loadAchievements();
    const unseenIds = getUnseenAchievements();

    // Update badge display
    badges.updateStreak(streak, false);
    badges.updateSeeds(seeds, false);
    badges.updateAchievements(achievements.length, unseenIds);

    log.debug(
      { streak, seeds, achievementCount: achievements.length, unseen: unseenIds.length },
      'Badge data synced'
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to sync badge data');
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle streak update events
 */
export function onStreakUpdate(newStreak: number): void {
  badges.updateStreak(newStreak, true);
}

/**
 * Handle seeds earned events
 */
export function onSeedsEarned(newBalance: number): void {
  badges.updateSeeds(newBalance, true);
}

/**
 * Handle achievement unlock events
 */
export function onAchievementUnlocked(badgeId: string): void {
  // Save to storage
  saveAchievement(badgeId);

  // Update display
  const achievements = loadAchievements();
  badges.updateAchievements(achievements.length, [badgeId]);

  log.info({ badgeId }, 'Achievement unlocked');
}

/**
 * Handle check-in request events
 */
export function onCheckinRequest(message?: string): void {
  badges.setCheckinPending(true, message);
}

/**
 * Get all earned achievements for trophy room
 */
export function getEarnedAchievements(): Badge[] {
  return loadAchievements();
}

/**
 * Mark trophy room as viewed (clear unseen)
 */
export function onTrophyRoomViewed(): void {
  const achievements = loadAchievements();
  markAchievementsSeen(achievements.map((a) => a.id));
  badges.markSeen();
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================

let listenersAttached = false;

/**
 * Attach event listeners for data updates
 */
export function attachDataListeners(): void {
  if (listenersAttached) return;

  // Listen for streak updates
  window.addEventListener('ferni:streak-updated', ((e: CustomEvent<{ streak: number }>) => {
    onStreakUpdate(e.detail.streak);
  }) as EventListener);

  // Listen for seeds earned
  window.addEventListener('ferni:seeds-earned', ((e: CustomEvent<{ balance: number }>) => {
    onSeedsEarned(e.detail.balance);
  }) as EventListener);

  // Listen for achievement unlocks
  window.addEventListener('ferni:achievement-unlocked', ((e: CustomEvent<{ badgeId: string }>) => {
    onAchievementUnlocked(e.detail.badgeId);
  }) as EventListener);

  // Listen for check-in requests
  window.addEventListener('ferni:checkin-request', ((e: CustomEvent<{ message?: string }>) => {
    onCheckinRequest(e.detail?.message);
  }) as EventListener);

  // Listen for trophy room open request
  window.addEventListener('ferni:open-trophy-room', () => {
    import('./trophy-room.js').then(({ openTrophyRoom }) => {
      const achievements = getEarnedAchievements();
      openTrophyRoom(achievements);
    });
  });

  // Listen for trophy room close
  window.addEventListener('ferni:trophy-room-closed', () => {
    onTrophyRoomViewed();
  });

  listenersAttached = true;
  log.debug('Data listeners attached');
}

/**
 * Remove event listeners
 */
export function detachDataListeners(): void {
  // Note: In production, we'd store references to remove them
  // For now, we just mark as detached
  listenersAttached = false;
}

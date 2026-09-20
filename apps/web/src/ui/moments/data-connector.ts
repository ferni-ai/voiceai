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
 * Handlers are kept on module scope so detachDataListeners() can actually
 * remove them. Previously the listeners were anonymous and detach only flipped
 * the flag, so every init/destroy cycle left another live set attached.
 */
interface AttachedListener {
  target: EventTarget;
  type: string;
  handler: EventListener;
}

let attachedListeners: AttachedListener[] = [];

function listen(target: EventTarget, type: string, handler: EventListener): void {
  target.addEventListener(type, handler);
  attachedListeners.push({ target, type, handler });
}

/**
 * Attach event listeners for data updates
 */
export function attachDataListeners(): void {
  if (listenersAttached) return;

  // NOTE: we deliberately do NOT listen for 'ferni:streak-updated'. badges.ts
  // is that event's only producer, so listening here echoed the badge's own
  // update straight back into badges.updateStreak() - and because the event
  // detail is { count, previous } rather than { streak }, the echo passed
  // undefined and wiped the streak on every update.

  // Seeds are announced by seeds-economy.service on `document` (matching
  // seeds-toast/seeds-display), and the detail carries the amount EARNED, not
  // the new balance - so read the balance from its owner instead.
  listen(document, 'ferni:seeds-earned', (() => {
    onSeedsEarned(getSeedBalance());
  }) as EventListener);

  // Achievement unlocks come from easter-eggs.ui.ts as { id, achievement }.
  listen(window, 'ferni:achievement-unlocked', ((e: CustomEvent<{ id: string }>) => {
    if (e.detail?.id) {
      onAchievementUnlocked(e.detail.id);
    }
  }) as EventListener);

  // Listen for check-in requests
  listen(window, 'ferni:checkin-request', ((e: CustomEvent<{ message?: string }>) => {
    onCheckinRequest(e.detail?.message);
  }) as EventListener);

  // Listen for trophy room open request
  listen(window, 'ferni:open-trophy-room', () => {
    void import('./trophy-room.js').then(({ openTrophyRoom }) => {
      const achievements = getEarnedAchievements();
      openTrophyRoom(achievements);
    });
  });

  // Listen for trophy room close
  listen(window, 'ferni:trophy-room-closed', () => {
    onTrophyRoomViewed();
  });

  listenersAttached = true;
  log.debug('Data listeners attached');
}

/**
 * Remove event listeners
 */
export function detachDataListeners(): void {
  for (const { target, type, handler } of attachedListeners) {
    target.removeEventListener(type, handler);
  }
  attachedListeners = [];
  listenersAttached = false;
  log.debug('Data listeners detached');
}

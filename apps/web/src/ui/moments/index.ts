/**
 * Moments System - Unified Feedback API
 *
 * Avatar-centric notification system that's better than Apple, Google, and Pixar.
 * All feedback flows through four emotional levels:
 *
 * 1. WHISPER - Transient confirmations ("Saved!")
 * 2. NOTICE - Events with optional actions ("+10 seeds")
 * 3. CELEBRATION - Milestone moments (streak, badge)
 * 4. MILESTONE - Full modal experiences (team unlock, anniversary)
 *
 * @example
 * import { moments } from '@ferni/ui/moments';
 *
 * // Level 1: Whisper
 * moments.whisper('Saved!');
 * moments.whisper('Updated', { type: 'success' });
 *
 * // Level 2: Notice
 * moments.notice('+10 seeds', { type: 'seeds', amount: 10 });
 * moments.notice('New message', { action: { label: 'View', callback: openChat } });
 *
 * // Level 3: Celebration
 * await moments.celebrate('streak', { count: 7 });
 * await moments.celebrate('badge', { badge: '🌅', title: 'Early Bird' });
 *
 * // Level 4: Milestone
 * await moments.milestone('team_unlock', {
 *   title: 'Meet Maya!',
 *   message: 'A new friend has joined your team.',
 *   action: { label: 'Say Hello', callback: switchToMaya },
 * });
 *
 * @module ui/moments
 */

import { getMomentsManager, resetMomentsManager, MomentsManager } from './manager.js';
import { getBadgeDisplay, initBadgeDisplay, badges, BadgeDisplay } from './badges.js';
import {
  getTrophyRoom,
  openTrophyRoom,
  closeTrophyRoom,
  TrophyRoom,
  BADGE_DEFINITIONS,
  BADGE_CATEGORIES,
} from './trophy-room.js';
import {
  initMomentsSystem,
  destroyMomentsSystem,
  isMomentsSystemInitialized,
} from './init.js';
import {
  syncBadgeData,
  onStreakUpdate,
  onSeedsEarned,
  onAchievementUnlocked,
  onCheckinRequest,
  getEarnedAchievements,
} from './data-connector.js';

// ============================================================================
// CONVENIENCE API
// ============================================================================

/**
 * Unified moments API - the primary export for all feedback.
 *
 * Use this for all toasts, notifications, celebrations, and milestones.
 */
export const moments = {
  /**
   * Level 1: Whisper - transient feedback
   *
   * @example
   * moments.whisper('Saved!');
   * moments.whisper('Error', { type: 'error' });
   */
  whisper: (
    message: string,
    options?: {
      type?: 'info' | 'success' | 'warning' | 'error';
      duration?: number;
      icon?: string;
    }
  ) => getMomentsManager().whisper(message, options),

  /**
   * Level 2: Notice - event with optional action
   *
   * @example
   * moments.notice('+10 seeds', { type: 'seeds', amount: 10 });
   * moments.notice('New message', { action: { label: 'View', callback: fn } });
   */
  notice: (
    message: string,
    options?: {
      type?: 'info' | 'seeds' | 'badge' | 'streak' | 'secret' | 'checkin';
      amount?: number;
      icon?: string;
      action?: { label: string; callback: () => void };
      duration?: number;
    }
  ) => getMomentsManager().notice(message, options),

  /**
   * Level 3: Celebration - milestone moment with visual flourish
   *
   * @example
   * await moments.celebrate('streak', { count: 7 });
   * await moments.celebrate('badge', { badge: '🌅', title: 'Early Bird' });
   */
  celebrate: (
    type: 'small_win' | 'big_win' | 'streak' | 'badge' | 'secret' | 'team_unlock' | 'first_meeting',
    data?: {
      title?: string;
      subtitle?: string;
      badge?: string;
      count?: number;
      personaId?: string;
      personaName?: string;
    }
  ) => getMomentsManager().celebrate(type, data),

  /**
   * Level 4: Milestone - full modal experience
   *
   * @example
   * await moments.milestone('team_unlock', {
   *   title: 'Meet Maya!',
   *   message: 'A new friend has joined your team.',
   *   action: { label: 'Say Hello', callback: switchToMaya },
   * });
   */
  milestone: (
    type: 'anniversary' | 'relationship_stage' | 'journey_complete' | 'year_in_review' | 'team_unlock',
    data: {
      title: string;
      message: string;
      eyebrow?: string;
      stats?: Record<string, string | number>;
      action?: { label: string; callback: () => void };
      secondaryAction?: { label: string; callback: () => void };
      personaId?: string;
      personaName?: string;
      personaRole?: string;
    }
  ) => getMomentsManager().milestone(type, data),

  /**
   * Dismiss the active moment
   */
  dismiss: (id?: string) => getMomentsManager().dismiss(id),

  /**
   * Dismiss all moments and clear queue
   */
  dismissAll: () => getMomentsManager().dismissAll(),

  /**
   * Subscribe to moment events
   *
   * @example
   * const unsub = moments.on('badge:unlocked', (badge) => {
   *   analytics.track('badge_unlocked', badge);
   * });
   */
  on: getMomentsManager().on.bind(getMomentsManager()),
};

// ============================================================================
// TOAST COMPATIBILITY LAYER
// Drop-in replacement for existing toast calls
// ============================================================================

/**
 * Toast-compatible API for backward compatibility.
 *
 * @deprecated Use `moments.whisper()` instead
 *
 * @example
 * // Old code (still works):
 * import { toast } from './moments';
 * toast.success('Saved!');
 *
 * // New code (preferred):
 * import { moments } from './moments';
 * moments.whisper('Saved!', { type: 'success' });
 */
export const toast = {
  info: (message: string) => moments.whisper(message, { type: 'info' }),
  success: (message: string) => moments.whisper(message, { type: 'success' }),
  warning: (message: string) => moments.whisper(message, { type: 'warning' }),
  error: (message: string) => moments.whisper(message, { type: 'error' }),
  show: (config: { message: string; type?: string; duration?: number }) =>
    moments.whisper(config.message, {
      type: config.type as 'info' | 'success' | 'warning' | 'error',
      duration: config.duration,
    }),
  dismiss: moments.dismiss,
  dismissAll: moments.dismissAll,
};

// ============================================================================
// WHISPER COMPATIBILITY LAYER
// Drop-in replacement for existing whisper calls
// ============================================================================

/**
 * Whisper-compatible API for backward compatibility.
 *
 * @deprecated Use `moments.whisper()` or `moments.notice()` instead
 */
export const whisper = {
  info: (message: string) => moments.whisper(message, { type: 'info' }),
  success: (message: string) => moments.whisper(message, { type: 'success' }),
  warning: (message: string) => moments.whisper(message, { type: 'warning' }),
  error: (message: string) => moments.whisper(message, { type: 'error' }),
  celebration: (amount: number, reason?: string) =>
    moments.notice(reason ?? 'seeds', { type: 'seeds', amount }),
  show: moments.whisper,
  dismiss: moments.dismiss,
  dismissAll: moments.dismissAll,
};

// ============================================================================
// SINGLETON ACCESS
// ============================================================================

export { getMomentsManager, resetMomentsManager, MomentsManager };

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type {
  MomentLevel,
  WhisperType,
  NoticeType,
  CelebrationType,
  MilestoneType,
  MomentType,
  WhisperConfig,
  NoticeConfig,
  CelebrationConfig,
  MilestoneConfig,
  MomentAction,
  MomentState,
  Badge,
  BadgeCategory,
  BadgeState,
  MomentEvents,
  HapticPattern,
} from './types.js';

// ============================================================================
// BADGE SYSTEM EXPORTS
// ============================================================================

export {
  badges,
  initBadgeDisplay,
  getBadgeDisplay,
  BadgeDisplay,
};

// ============================================================================
// TROPHY ROOM EXPORTS
// ============================================================================

export {
  openTrophyRoom,
  closeTrophyRoom,
  getTrophyRoom,
  TrophyRoom,
  BADGE_DEFINITIONS,
  BADGE_CATEGORIES,
};

// ============================================================================
// INITIALIZATION EXPORTS
// ============================================================================

export {
  initMomentsSystem,
  destroyMomentsSystem,
  isMomentsSystemInitialized,
};

// ============================================================================
// DATA CONNECTOR EXPORTS
// ============================================================================

export {
  syncBadgeData,
  onStreakUpdate,
  onSeedsEarned,
  onAchievementUnlocked,
  onCheckinRequest,
  getEarnedAchievements,
};

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default moments;

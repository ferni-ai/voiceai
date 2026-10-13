/**
 * Celebration types and the zen presets each type plays with (split out of
 * celebration.ui.ts, which is over the file-size budget).
 *
 * @module ui/celebration-presets
 */

import { DURATION } from '../config/animation-constants.js';

// ============================================================================
// TYPES
// ============================================================================

export type CelebrationType =
  | 'small_win' // Quick acknowledgment
  | 'big_win' // Major achievement
  | 'milestone' // Significant progress
  | 'streak' // Consistency reward
  | 'team_unlock' // New persona available
  | 'first_meeting' // Meeting a new persona
  | 'deep_moment'; // Emotional breakthrough

export interface CelebrationConfig {
  type: CelebrationType;
  title?: string;
  subtitle?: string;
  emoji?: string;
  duration?: number;
  showConfetti?: boolean;
  hapticPattern?: string;
  soundId?: string;
}

// ============================================================================
// ZEN CELEBRATION PRESETS - Warm, human, not game-like
// No confetti. No fanfares. Just gentle acknowledgment.
// ============================================================================

export const CELEBRATION_PRESETS: Record<CelebrationType, Partial<CelebrationConfig>> = {
  small_win: {
    duration: DURATION.SLOW, // 300ms - quick acknowledgment
    showConfetti: false,
    hapticPattern: 'softTap', // Gentle tap only
    soundId: undefined, // No sound - haptic only
  },
  big_win: {
    duration: DURATION.CELEBRATION, // 800ms
    showConfetti: false, // No confetti - let the moment breathe
    hapticPattern: 'success',
    soundId: undefined, // No sound
  },
  milestone: {
    duration: DURATION.CELEBRATION, // 800ms
    showConfetti: false, // No confetti
    hapticPattern: 'success',
    soundId: undefined, // No sound - visual + haptic only
  },
  streak: {
    duration: DURATION.CELEBRATION, // 800ms
    showConfetti: false, // No confetti
    hapticPattern: 'success',
    soundId: undefined, // No sound
  },
  team_unlock: {
    duration: DURATION.CELEBRATION, // 800ms (was 3000!)
    showConfetti: false, // No confetti
    hapticPattern: 'warmWelcome',
    soundId: 'notification.gentle', // Keep gentle notification for unlocks
  },
  first_meeting: {
    duration: DURATION.DELIBERATE, // 500ms
    showConfetti: false,
    hapticPattern: 'warmWelcome',
    soundId: undefined, // Silent
  },
  deep_moment: {
    duration: DURATION.DELIBERATE, // 500ms
    showConfetti: false,
    hapticPattern: 'empathy',
    soundId: undefined, // Silent - let the emotional moment speak
  },
};

/**
 * Copy keys, colours and default icons per notification type (split out of
 * notifications.ui.ts, which is over the file-size budget).
 *
 * @module ui/notifications-copy
 */

import type { IconName } from './engagement-components.js';

export type NotificationType =
  'ritual_reminder' | 'streak_milestone' | 'prediction_ready' | 'team_huddle' | 'welcome';

// ============================================================================
// HUMANIZED COPY
// ============================================================================

export const NOTIFICATION_COPY = {
  ritual_reminder: {
    titleKey: 'notifications.ritualReminder.title',
    ctaKey: 'notifications.ritualReminder.cta',
  },
  streak_milestone: {
    titleKey: 'notifications.streakMilestone.title',
  },
  prediction_ready: {
    titleKey: 'notifications.predictionReady.title',
    ctaKey: 'notifications.predictionReady.cta',
  },
  team_huddle: {
    titleKey: 'notifications.teamHuddle.title',
    ctaKey: 'notifications.teamHuddle.cta',
  },
  welcome: {
    titleKey: 'notifications.welcome.title',
  },
};

// ============================================================================
// NOTIFICATION COLORS BY TYPE (CSS Variables)
// ============================================================================

export const TYPE_COLORS: Record<NotificationType, { bg: string; border: string; icon: string }> = {
  ritual_reminder: {
    bg: 'var(--persona-tint, var(--color-accent-subtle))',
    border: 'var(--persona-primary, var(--color-accent-primary))',
    icon: 'var(--persona-text, var(--color-accent-text))',
  },
  streak_milestone: {
    bg: 'var(--color-semantic-success-glow)',
    border: 'var(--color-semantic-success)',
    icon: 'var(--color-semantic-success)',
  },
  prediction_ready: {
    bg: 'var(--color-semantic-info-glow)',
    border: 'var(--color-semantic-info)',
    icon: 'var(--color-semantic-info)',
  },
  team_huddle: {
    bg: 'var(--color-semantic-warning-glow)',
    border: 'var(--color-semantic-warning)',
    icon: 'var(--color-semantic-warning)',
  },
  welcome: {
    bg: 'var(--persona-tint, var(--color-accent-subtle))',
    border: 'var(--persona-primary, var(--color-accent-primary))',
    icon: 'var(--persona-text, var(--color-accent-text))',
  },
};

// ============================================================================
// DEFAULT ICONS BY TYPE
// ============================================================================

export const TYPE_ICONS: Record<NotificationType, IconName> = {
  ritual_reminder: 'clock',
  streak_milestone: 'flame',
  prediction_ready: 'clock',
  team_huddle: 'heart',
  welcome: 'sunny',
};

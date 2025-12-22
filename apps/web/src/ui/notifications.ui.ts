/**
 * Notifications UI
 *
 * Brand-aligned notification system for proactive engagement.
 * Displays ritual reminders, streak milestones, and engagement prompts.
 *
 * DESIGN SYSTEM COMPLIANCE:
 * - Uses shared components from engagement-components.ts
 * - Uses CSS variables from tokens.css
 * - Uses DURATION/EASING from animation-constants.ts
 * - Respects prefers-reduced-motion
 * - Humanized, encouraging copy
 */

import { t } from '../i18n/index.js';
import { DURATION, prefersReducedMotion } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import {
  ICONS,
  injectSharedStyles,
  escapeHtml,
  type IconName,
} from './engagement-components.js';

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface Notification {
  id: string;
  type: 'ritual_reminder' | 'streak_milestone' | 'prediction_ready' | 'team_huddle' | 'welcome';
  title: string;
  message: string;
  personaId?: string;
  icon?: IconName;
  priority: 'low' | 'medium' | 'high';
  action?: {
    label: string;
    callback: () => void;
  };
  dismissAfter?: number; // ms, undefined = manual dismiss
  timestamp: number;
}

export interface NotificationUICallbacks {
  onDismiss?: (notification: Notification) => void;
  onAction?: (notification: Notification) => void;
}

// ============================================================================
// HUMANIZED COPY
// ============================================================================

const NOTIFICATION_COPY = {
  ritual_reminder: {
    title: 'Your practice awaits',
    cta: 'Begin',
  },
  streak_milestone: {
    title: 'Look at you go',
    getMessage: (count: number, name: string) => `${count} days of ${name}. You're building something real.`,
  },
  prediction_ready: {
    title: 'Time to check in',
    cta: 'See results',
  },
  team_huddle: {
    title: 'Your team wants to connect',
    cta: 'Join',
  },
  welcome: {
    title: 'Welcome back',
  },
};

// ============================================================================
// NOTIFICATION COLORS BY TYPE (CSS Variables)
// ============================================================================

const TYPE_COLORS: Record<Notification['type'], { bg: string; border: string; icon: string }> = {
  ritual_reminder: {
    bg: 'var(--persona-tint, var(--color-accent-subtle))',
    border: 'var(--persona-primary, var(--color-accent-primary))',
    icon: 'var(--persona-primary, var(--color-accent-primary))',
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
    icon: 'var(--persona-primary, var(--color-accent-primary))',
  },
};

// ============================================================================
// DEFAULT ICONS BY TYPE
// ============================================================================

const TYPE_ICONS: Record<Notification['type'], IconName> = {
  ritual_reminder: 'clock',
  streak_milestone: 'flame',
  prediction_ready: 'clock',
  team_huddle: 'heart',
  welcome: 'sunny',
};

// ============================================================================
// NOTIFICATIONS UI CLASS
// ============================================================================

class NotificationsUI {
  private container: HTMLElement | null = null;
  private notifications: Map<string, { element: HTMLElement; data: Notification }> = new Map();
  private callbacks: NotificationUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;

  /**
   * Initialize the notifications container
   */
  initialize(): void {
    if (this.container) return;

    // HMR protection - clean up orphaned containers
    document.querySelectorAll('.notifications-container').forEach(el => el.remove());

    // Inject shared design system styles
    injectSharedStyles();
    this.injectStyles();

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'notifications-container';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Notifications');
    this.container.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.container);
  }

  /**
   * Set callbacks for notification events
   */
  setCallbacks(callbacks: NotificationUICallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Show a notification
   */
  show(notification: Notification): void {
    this.initialize();
    if (!this.container) return;

    // Create notification element
    const element = this.createNotificationElement(notification);
    this.container.appendChild(element);
    this.notifications.set(notification.id, { element, data: notification });

    // Animate in
    requestAnimationFrame(() => {
      element.classList.add('notification--visible');
    });

    // Auto-dismiss if configured
    if (notification.dismissAfter && notification.dismissAfter > 0) {
      trackedTimeout(() => {
        this.dismiss(notification.id);
      }, notification.dismissAfter);
    }
  }

  /**
   * Dismiss a notification
   */
  dismiss(id: string): void {
    const item = this.notifications.get(id);
    if (!item) return;

    const { element, data } = item;

    // Animate out
    element.classList.remove('notification--visible');
    element.classList.add('notification--exiting');

    // Remove after animation
    const duration = prefersReducedMotion() ? 0 : DURATION.SLOW;
    trackedTimeout(() => {
      element.remove();
      this.notifications.delete(id);
      this.callbacks.onDismiss?.(data);
    }, duration);
  }

  /**
   * Dismiss all notifications
   */
  dismissAll(): void {
    for (const id of this.notifications.keys()) {
      this.dismiss(id);
    }
  }

  /**
   * Get active notification count
   */
  getCount(): number {
    return this.notifications.size;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createNotificationElement(notification: Notification): HTMLElement {
    const colors = TYPE_COLORS[notification.type];
    const iconName = notification.icon ?? TYPE_ICONS[notification.type];

    const element = document.createElement('div');
    element.className = `notification notification--${notification.type} notification--${notification.priority}`;
    element.setAttribute('role', 'alert');
    element.style.setProperty('--notification-bg', colors.bg);
    element.style.setProperty('--notification-border', colors.border);
    element.style.setProperty('--notification-icon', colors.icon);

    // Use shared icons
    const iconSvg = ICONS[iconName] ?? ICONS.clock;

    element.innerHTML = `
      <div class="notification__icon">
        ${iconSvg}
      </div>
      <div class="notification__content">
        <div class="notification__title">${escapeHtml(notification.title)}</div>
        <div class="notification__message">${escapeHtml(notification.message)}</div>
        ${notification.action ? `
          <button aria-label="Close" class="notification__action" type="button">
            ${escapeHtml(notification.action.label)}
          </button>
        ` : ''}
      </div>
      <button class="notification__close engagement-close-btn" type="button" aria-label="${t('accessibility.dismissNotification')}">
        ${ICONS.close}
      </button>
    `;

    // Event handlers
    const closeBtn = element.querySelector('.notification__close');
    closeBtn?.addEventListener('click', () => this.dismiss(notification.id));

    if (notification.action) {
      const actionBtn = element.querySelector('.notification__action');
      actionBtn?.addEventListener('click', () => {
        notification.action?.callback();
        this.callbacks.onAction?.(notification);
        this.dismiss(notification.id);
      });
    }

    return element;
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'notifications-ui-styles';
    this.styleElement.textContent = `
      /* ========================================
         NOTIFICATIONS CONTAINER
         ======================================== */
      .notifications-container {
        position: fixed;
        top: var(--ma-rest);
        right: var(--ma-rest);
        z-index: var(--z-notification, 1500);
        display: flex;
        flex-direction: column;
        gap: var(--ma-pause);
        max-width: min(380px, 100%);
        pointer-events: none;
      }

      /* ========================================
         NOTIFICATION CARD
         ======================================== */
      .notification {
        display: flex;
        align-items: flex-start;
        gap: var(--ma-pause);
        padding: var(--ma-rest);
        background: var(--color-background-elevated);
        border: 1px solid var(--notification-border);
        border-left: 3px solid var(--notification-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-lg);
        pointer-events: auto;
        opacity: 0;
        transform: translateX(100%);
        transition: 
          opacity var(--duration-slow) var(--ease-expo-out),
          transform var(--duration-slow) var(--ease-spring);
      }

      .notification--visible {
        opacity: 1;
        transform: translateX(0);
      }

      .notification--exiting {
        opacity: 0;
        transform: translateX(100%);
      }

      /* High priority - subtle pulse */
      .notification--high {
        animation: notification-pulse 2s var(--ease-gentle) infinite;
      }

      @keyframes notification-pulse {
        0%, 100% { box-shadow: var(--shadow-lg); }
        50% { box-shadow: 0 8px 32px var(--notification-border); }
      }

      /* ========================================
         NOTIFICATION ICON
         ======================================== */
      .notification__icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: var(--notification-bg);
        border-radius: var(--radius-md);
        color: var(--notification-icon);
      }

      .notification__icon svg {
        width: 20px;
        height: 20px;
      }

      /* ========================================
         NOTIFICATION CONTENT
         ======================================== */
      .notification__content {
        flex: 1;
        min-width: 0;
      }

      .notification__title {
        font-family: var(--font-display);
        font-size: var(--text-base);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin-bottom: var(--space-1);
        line-height: var(--leading-tight);
      }

      .notification__message {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed);
      }

      /* ========================================
         NOTIFICATION ACTION BUTTON
         ======================================== */
      .notification__action {
        display: inline-flex;
        align-items: center;
        margin-top: var(--ma-pause);
        padding: var(--ma-breath) var(--ma-pause);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-medium, 500);
        color: var(--notification-icon);
        background: var(--notification-bg);
        border: 1px solid var(--notification-border);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: 
          background var(--duration-fast) var(--ease-gentle),
          color var(--duration-fast) var(--ease-gentle),
          transform var(--duration-fast) var(--ease-spring);
      }

      .notification__action:hover {
        background: var(--notification-border);
        color: white;
        transform: scale(1.02);
      }

      .notification__action:active {
        transform: scale(0.98);
      }

      /* ========================================
         NOTIFICATION CLOSE BUTTON (uses shared)
         ======================================== */
      .notification__close.engagement-close-btn {
        width: 28px;
        height: 28px;
        background: transparent;
        border: none;
        box-shadow: none;
      }

      .notification__close.engagement-close-btn:hover {
        background: var(--color-background-tertiary);
        box-shadow: none;
      }

      .notification__close svg {
        width: 14px;
        height: 14px;
      }

      /* ========================================
         DARK THEME (Cedar Night)
         ======================================== */
      [data-theme="midnight"] .notification {
        background: var(--color-background-elevated);
        box-shadow: var(--shadow-lg);
      }

      [data-theme="midnight"] .notification__title {
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .notification__message {
        color: var(--color-text-secondary);
      }

      [data-theme="midnight"] .notification__close.engagement-close-btn:hover {
        background: var(--color-background-tertiary);
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .notification__action:hover {
        color: var(--color-text-primary);
      }

      /* ========================================
         REDUCED MOTION
         ======================================== */
      @media (prefers-reduced-motion: reduce) {
        .notification {
          transition: opacity var(--duration-fast) linear;
          transform: none;
        }
        
        .notification--visible {
          transform: none;
        }
        
        .notification--exiting {
          transform: none;
        }
        
        .notification--high {
          animation: none;
        }
      }

      /* ========================================
         RESPONSIVE
         ======================================== */
      @media (max-width: clamp(336px, 90vw, 480px)) {
        .notifications-container {
          right: var(--ma-pause);
          left: var(--ma-pause);
          max-width: none;
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.dismissAll();
    this.container?.remove();
    this.styleElement?.remove();
    this.container = null;
    this.styleElement = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: NotificationsUI | null = null;

export function getNotificationsUI(): NotificationsUI {
  if (!instance) {
    instance = new NotificationsUI();
  }
  return instance;
}

export function initNotificationsUI(): void {
  getNotificationsUI().initialize();
}

// ============================================================================
// CONVENIENCE HELPERS (with humanized copy)
// ============================================================================

/**
 * Show a ritual reminder notification
 */
export function showRitualReminder(
  ritualName: string,
  personaId: string,
  onStart?: () => void
): void {
  getNotificationsUI().show({
    id: `ritual-${Date.now()}`,
    type: 'ritual_reminder',
    title: NOTIFICATION_COPY.ritual_reminder.title,
    message: `Time for your ${ritualName}`,
    personaId,
    icon: 'clock',
    priority: 'medium',
    action: onStart ? { label: NOTIFICATION_COPY.ritual_reminder.cta, callback: onStart } : undefined,
    dismissAfter: 15000,
    timestamp: Date.now(),
  });
}

/**
 * Show a streak milestone notification
 */
export function showStreakMilestone(
  ritualName: string,
  streakCount: number,
  personaId: string
): void {
  getNotificationsUI().show({
    id: `streak-${Date.now()}`,
    type: 'streak_milestone',
    title: NOTIFICATION_COPY.streak_milestone.title,
    message: NOTIFICATION_COPY.streak_milestone.getMessage(streakCount, ritualName),
    personaId,
    icon: 'flame',
    priority: 'high',
    dismissAfter: 8000,
    timestamp: Date.now(),
  });
}

/**
 * Show a prediction ready notification
 */
export function showPredictionReady(
  questionPreview: string,
  onResolve?: () => void
): void {
  getNotificationsUI().show({
    id: `prediction-${Date.now()}`,
    type: 'prediction_ready',
    title: NOTIFICATION_COPY.prediction_ready.title,
    message: `How accurate was your prediction about "${questionPreview.slice(0, 50)}..."?`,
    icon: 'clock',
    priority: 'medium',
    action: onResolve ? { label: NOTIFICATION_COPY.prediction_ready.cta, callback: onResolve } : undefined,
    dismissAfter: 20000,
    timestamp: Date.now(),
  });
}

/**
 * Show a team huddle notification
 */
export function showTeamHuddle(
  participants: string[],
  onJoin?: () => void
): void {
  const participantNames = participants.slice(0, 3).join(', ');
  getNotificationsUI().show({
    id: `huddle-${Date.now()}`,
    type: 'team_huddle',
    title: NOTIFICATION_COPY.team_huddle.title,
    message: `${participantNames} want to discuss your progress`,
    icon: 'heart',
    priority: 'medium',
    action: onJoin ? { label: NOTIFICATION_COPY.team_huddle.cta, callback: onJoin } : undefined,
    dismissAfter: 30000,
    timestamp: Date.now(),
  });
}

export default NotificationsUI;

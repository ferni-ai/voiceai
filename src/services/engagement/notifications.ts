/**
 * Engagement Notification Service
 *
 * Handles proactive engagement notifications:
 * - Streak reminders (protect your streak!)
 * - Ritual due notifications
 * - Milestone celebrations
 * - Team huddle invitations
 * - Memory callback triggers
 *
 * Designed to be respectful and non-intrusive:
 * - Honors quiet hours
 * - Limits frequency
 * - Allows opt-out
 *
 * PERSISTENCE: User notification state is persisted to Firestore.
 */

import * as admin from 'firebase-admin';
import { getLogger } from '../../utils/safe-logger.js';
import { getDailyRitualsService, PERSONA_RITUALS } from '../daily-rituals.js';

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const NOTIFICATION_STATE_COLLECTION = 'engagement_notification_states';

function getFirestore(): admin.firestore.Firestore | null {
  try {
    return admin.firestore();
  } catch {
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface EngagementNotification {
  id: string;
  type:
    | 'streak_reminder'
    | 'ritual_due'
    | 'milestone'
    | 'team_huddle'
    | 'memory_callback'
    | 'seasonal_event';
  priority: 'low' | 'medium' | 'high';
  title: string;
  body: string;
  personaId?: string;
  actionUrl?: string;
  expiresAt?: Date;
  createdAt: Date;
  delivered: boolean;
  dismissed: boolean;
}

export interface NotificationPreferences {
  enabled: boolean;
  quietHoursStart: number; // 0-23
  quietHoursEnd: number; // 0-23
  maxPerDay: number;
  allowedTypes: Array<EngagementNotification['type']>;
  preferredChannel: 'push' | 'in_app' | 'both';
}

export interface UserNotificationState {
  userId: string;
  preferences: NotificationPreferences;
  lastNotificationAt: Date | null;
  todayCount: number;
  dismissedNotifications: string[];
  snoozeUntil: Date | null;
}

// ============================================================================
// DEFAULT PREFERENCES
// ============================================================================

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  quietHoursStart: 22, // 10 PM
  quietHoursEnd: 7, // 7 AM
  maxPerDay: 3,
  allowedTypes: ['streak_reminder', 'milestone', 'team_huddle'],
  preferredChannel: 'in_app',
};

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

const NOTIFICATION_TEMPLATES = {
  streak_reminder: {
    title: 'Your streak needs you',
    bodies: [
      "Don't lose your {streak}-day streak with {ritual}.",
      'Quick check-in to keep your {ritual} streak going?',
      '{streak} days strong. Keep the momentum going.',
    ],
  },
  ritual_due: {
    title: 'Daily practice ready',
    bodies: [
      'Your {ritual} is ready when you are.',
      "Time for today's {ritual}?",
      '{persona} is here for your daily practice.',
    ],
  },
  milestone: {
    title: 'Milestone reached',
    bodies: [
      "{streak} days of {ritual}. That's something to be proud of.",
      "You've reached a milestone. {streak} days of consistent practice.",
      'A moment to celebrate: {streak} days.',
    ],
  },
  team_huddle: {
    title: 'Team check-in',
    bodies: [
      'The team has some thoughts about your week.',
      "Time for a team huddle? We've been watching your progress.",
      'Your weekly team check-in is ready.',
    ],
  },
  memory_callback: {
    title: 'Something to share',
    bodies: [
      '{persona} remembered something about you.',
      '{persona} has been thinking about something you mentioned.',
      'Remember when we talked about this? {persona} wants to follow up.',
    ],
  },
  seasonal_event: {
    title: 'Special moment',
    bodies: [
      'The team wants to mark this occasion with you.',
      'Something special today.',
      '{persona} has something for you.',
    ],
  },
};

// ============================================================================
// ENGAGEMENT NOTIFICATION SERVICE
// ============================================================================

export class EngagementNotificationService {
  private userStates = new Map<string, UserNotificationState>();
  private pendingNotifications = new Map<string, EngagementNotification[]>();
  private notificationCallback: ((notification: EngagementNotification) => void) | null = null;
  private loadedUsers = new Set<string>();

  /**
   * Register a callback for when notifications should be delivered
   */
  onNotification(callback: (notification: EngagementNotification) => void): void {
    this.notificationCallback = callback;
  }

  /**
   * Load user state from Firestore
   */
  private async loadUserState(userId: string): Promise<UserNotificationState | null> {
    if (this.loadedUsers.has(userId)) {
      return this.userStates.get(userId) || null;
    }

    const db = getFirestore();
    if (!db) {
      this.loadedUsers.add(userId);
      return null;
    }

    try {
      const doc = await db.collection(NOTIFICATION_STATE_COLLECTION).doc(userId).get();
      if (doc.exists) {
        const data = doc.data();
        const state: UserNotificationState = {
          ...data,
          lastNotificationAt: data?.lastNotificationAt?.toDate?.() || null,
          snoozeUntil: data?.snoozeUntil?.toDate?.() || null,
        } as UserNotificationState;
        this.userStates.set(userId, state);
        this.loadedUsers.add(userId);
        return state;
      }
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to load notification state');
    }

    this.loadedUsers.add(userId);
    return null;
  }

  /**
   * Save user state to Firestore
   */
  private async saveUserState(userId: string, state: UserNotificationState): Promise<void> {
    const db = getFirestore();
    if (!db) return;

    try {
      await db
        .collection(NOTIFICATION_STATE_COLLECTION)
        .doc(userId)
        .set({
          ...state,
          lastNotificationAt: state.lastNotificationAt || null,
          snoozeUntil: state.snoozeUntil || null,
        });
    } catch (error) {
      getLogger().error({ error, userId }, 'Failed to save notification state');
    }
  }

  /**
   * Get or create user notification state
   */
  async getUserStateAsync(userId: string): Promise<UserNotificationState> {
    // Try to load from cache or Firestore
    const loaded = await this.loadUserState(userId);
    if (loaded) return loaded;

    // Create new state
    const state: UserNotificationState = {
      userId,
      preferences: { ...DEFAULT_PREFERENCES },
      lastNotificationAt: null,
      todayCount: 0,
      dismissedNotifications: [],
      snoozeUntil: null,
    };
    this.userStates.set(userId, state);
    return state;
  }

  /**
   * Get or create user notification state (sync version)
   */
  getUserState(userId: string): UserNotificationState {
    let state = this.userStates.get(userId);
    if (!state) {
      // Fire-and-forget load
      if (!this.loadedUsers.has(userId)) {
        void this.loadUserState(userId);
      }

      state = {
        userId,
        preferences: { ...DEFAULT_PREFERENCES },
        lastNotificationAt: null,
        todayCount: 0,
        dismissedNotifications: [],
        snoozeUntil: null,
      };
      this.userStates.set(userId, state);
    }
    return state;
  }

  /**
   * Update user preferences
   */
  updatePreferences(userId: string, prefs: Partial<NotificationPreferences>): void {
    const state = this.getUserState(userId);
    state.preferences = { ...state.preferences, ...prefs };

    // Persist to Firestore
    void this.saveUserState(userId, state);

    getLogger().info({ userId, prefs }, 'Notification preferences updated');
  }

  /**
   * Check if we can send a notification right now
   */
  canNotify(userId: string, type: EngagementNotification['type']): boolean {
    const state = this.getUserState(userId);
    const { preferences } = state;

    // Check if enabled
    if (!preferences.enabled) return false;

    // Check if type is allowed
    if (!preferences.allowedTypes.includes(type)) return false;

    // Check quiet hours
    const hour = new Date().getHours();
    if (preferences.quietHoursStart < preferences.quietHoursEnd) {
      // Simple case: 22-7 wraps around midnight
      if (hour >= preferences.quietHoursStart || hour < preferences.quietHoursEnd) {
        return false;
      }
    } else {
      // Wrapped case: e.g., 7 to 22 is active hours
      if (hour >= preferences.quietHoursStart && hour < preferences.quietHoursEnd) {
        return false;
      }
    }

    // Check daily limit
    if (state.todayCount >= preferences.maxPerDay) return false;

    // Check snooze
    if (state.snoozeUntil && new Date() < state.snoozeUntil) return false;

    return true;
  }

  /**
   * Generate streak reminder notifications
   */
  async generateStreakReminders(userId: string): Promise<EngagementNotification[]> {
    const notifications: EngagementNotification[] = [];
    const ritualsService = getDailyRitualsService();
    const profile = ritualsService.getOrCreateProfile(userId);

    for (const ritualId of profile.activeRituals) {
      const streak = profile.streaks[ritualId];
      if (!streak || streak.currentStreak === 0) continue;

      // Check if at risk of losing streak
      const lastCompletion = new Date(streak.lastCompletedAt);
      const hoursSinceLast = (Date.now() - lastCompletion.getTime()) / (1000 * 60 * 60);

      // Remind if more than 20 hours since last completion and streak > 2
      if (hoursSinceLast >= 20 && hoursSinceLast <= 28 && streak.currentStreak >= 2) {
        const ritual = PERSONA_RITUALS[ritualId];
        if (!ritual) continue;

        const template = NOTIFICATION_TEMPLATES.streak_reminder;
        const body = this.fillTemplate(
          template.bodies[Math.floor(Math.random() * template.bodies.length)],
          {
            streak: streak.currentStreak.toString(),
            ritual: ritual.name,
            persona: ritual.personaId,
          }
        );

        notifications.push({
          id: `streak_${ritualId}_${Date.now()}`,
          type: 'streak_reminder',
          priority: streak.currentStreak >= 7 ? 'high' : 'medium',
          title: template.title,
          body,
          personaId: ritual.personaId,
          createdAt: new Date(),
          delivered: false,
          dismissed: false,
        });
      }
    }

    return notifications;
  }

  /**
   * Generate ritual due notifications
   */
  async generateRitualDueNotifications(userId: string): Promise<EngagementNotification[]> {
    const notifications: EngagementNotification[] = [];
    const ritualsService = getDailyRitualsService();
    const dueRituals = ritualsService.getDueRituals(userId);

    // Only notify for rituals that match user's preferred time
    const hour = new Date().getHours();
    const preferredTime = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    for (const ritual of dueRituals) {
      if (ritual.preferredTime && ritual.preferredTime !== preferredTime) continue;

      const template = NOTIFICATION_TEMPLATES.ritual_due;
      const body = this.fillTemplate(
        template.bodies[Math.floor(Math.random() * template.bodies.length)],
        {
          ritual: ritual.name,
          persona: this.getPersonaDisplayName(ritual.personaId),
        }
      );

      notifications.push({
        id: `due_${ritual.id}_${Date.now()}`,
        type: 'ritual_due',
        priority: 'low',
        title: template.title,
        body,
        personaId: ritual.personaId,
        createdAt: new Date(),
        delivered: false,
        dismissed: false,
      });
    }

    return notifications;
  }

  /**
   * Generate milestone notification
   */
  createMilestoneNotification(
    userId: string,
    ritualId: string,
    streak: number
  ): EngagementNotification | null {
    const ritual = PERSONA_RITUALS[ritualId];
    if (!ritual) return null;

    // Only notify for significant milestones
    const significantMilestones = [3, 7, 14, 21, 30, 66, 100, 365];
    if (!significantMilestones.includes(streak)) return null;

    const template = NOTIFICATION_TEMPLATES.milestone;
    const body = this.fillTemplate(
      template.bodies[Math.floor(Math.random() * template.bodies.length)],
      {
        streak: streak.toString(),
        ritual: ritual.name,
        persona: this.getPersonaDisplayName(ritual.personaId),
      }
    );

    return {
      id: `milestone_${ritualId}_${streak}_${Date.now()}`,
      type: 'milestone',
      priority: streak >= 30 ? 'high' : 'medium',
      title: template.title,
      body,
      personaId: ritual.personaId,
      createdAt: new Date(),
      delivered: false,
      dismissed: false,
    };
  }

  /**
   * Queue a notification
   */
  queueNotification(userId: string, notification: EngagementNotification): void {
    const pending = this.pendingNotifications.get(userId) || [];
    pending.push(notification);
    this.pendingNotifications.set(userId, pending);
  }

  /**
   * Deliver pending notifications
   */
  async deliverPendingNotifications(userId: string): Promise<EngagementNotification[]> {
    const delivered: EngagementNotification[] = [];
    const pending = this.pendingNotifications.get(userId) || [];
    const state = this.getUserState(userId);

    for (const notification of pending) {
      if (notification.delivered || notification.dismissed) continue;
      if (!this.canNotify(userId, notification.type)) continue;

      // Check expiration
      if (notification.expiresAt && new Date() > notification.expiresAt) {
        notification.dismissed = true;
        continue;
      }

      // Deliver
      notification.delivered = true;
      state.lastNotificationAt = new Date();
      state.todayCount++;
      delivered.push(notification);

      // Persist state changes
      void this.saveUserState(userId, state);

      // Call callback if registered
      if (this.notificationCallback) {
        this.notificationCallback(notification);
      }

      getLogger().info(
        { userId, type: notification.type, id: notification.id },
        'Notification delivered'
      );

      // Limit to one notification per delivery cycle
      break;
    }

    return delivered;
  }

  /**
   * Dismiss a notification
   */
  dismissNotification(userId: string, notificationId: string): void {
    const state = this.getUserState(userId);
    state.dismissedNotifications.push(notificationId);

    // Persist state changes
    void this.saveUserState(userId, state);

    const pending = this.pendingNotifications.get(userId) || [];
    const notification = pending.find((n) => n.id === notificationId);
    if (notification) {
      notification.dismissed = true;
    }
  }

  /**
   * Snooze all notifications
   */
  snoozeNotifications(userId: string, hours: number): void {
    const state = this.getUserState(userId);
    state.snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000);

    // Persist state changes
    void this.saveUserState(userId, state);

    getLogger().info({ userId, hours }, 'Notifications snoozed');
  }

  /**
   * Reset daily count (call at midnight)
   */
  resetDailyCounts(): void {
    for (const state of this.userStates.values()) {
      state.todayCount = 0;
    }
    getLogger().info('Daily notification counts reset');
  }

  /**
   * Fill template with variables
   */
  private fillTemplate(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  /**
   * Get persona display name
   */
  private getPersonaDisplayName(personaId: string): string {
    const names: Record<string, string> = {
      ferni: 'Ferni',
      'alex-chen': 'Alex',
      'maya-santos': 'Maya',
      'jordan-taylor': 'Jordan',
      'nayan-patel': 'Nayan',
      'peter-john': 'Peter',
    };
    return names[personaId] || 'the team';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let notificationService: EngagementNotificationService | null = null;

export function getEngagementNotificationService(): EngagementNotificationService {
  if (!notificationService) {
    notificationService = new EngagementNotificationService();
  }
  return notificationService;
}

export function resetEngagementNotificationService(): void {
  notificationService = null;
}

export default EngagementNotificationService;

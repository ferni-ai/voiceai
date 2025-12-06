/**
 * Push Notifications Backend Service
 *
 * Handles sending push notifications to users via Web Push and APNs/FCM.
 * Supports scheduled notifications, ritual reminders, and engagement triggers.
 */

import { getLogger } from '../utils/logger.js';
import { AgentRole } from '../personas/index.js';

// Web-push module interface (optional dependency)
interface WebPushModule {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string
  ) => Promise<unknown>;
}

// Optional web-push import - notifications will be no-ops if not available
let webpush: WebPushModule | null = null;
let webpushLoadAttempted = false;

async function loadWebPush(): Promise<WebPushModule | null> {
  if (webpushLoadAttempted) return webpush;
  webpushLoadAttempted = true;

  try {
    // @ts-expect-error - web-push is an optional dependency
    const mod = await import('web-push');
    webpush = mod.default || mod;
    getLogger().info('web-push module loaded successfully');
    return webpush;
  } catch {
    getLogger().warn('web-push module not available - push notifications disabled');
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType =
  | 'ritual_reminder'
  | 'streak_milestone'
  | 'prediction_result'
  | 'team_huddle'
  | 'ferni_checkin'
  | 'engagement'
  | 'general';

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  platform: 'web' | 'ios' | 'android';
  userId: string;
  createdAt: string;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  type: NotificationType;
  data?: Record<string, unknown>;
  icon?: string;
  badge?: number;
  sound?: boolean;
  personaId?: string;
}

export interface ScheduledNotification {
  id: string;
  userId: string;
  payload: PushNotificationPayload;
  scheduledFor: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  createdAt: string;
}

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

const NOTIFICATION_TEMPLATES: Record<NotificationType, { icon: string }> = {
  ritual_reminder: { icon: '/icons/ritual-192.png' },
  streak_milestone: { icon: '/icons/streak-192.png' },
  prediction_result: { icon: '/icons/prediction-192.png' },
  team_huddle: { icon: '/icons/team-192.png' },
  ferni_checkin: { icon: '/icons/ferni-192.png' },
  engagement: { icon: '/icons/engagement-192.png' },
  general: { icon: '/icons/icon-192.png' },
};

// ============================================================================
// PERSONA-SPECIFIC MESSAGES
// ============================================================================

const RITUAL_REMINDER_MESSAGES: Record<string, string[]> = {
  ferni: [
    "How's the sky looking today? Let's do a quick weather check.",
    'Morning! Ready for your sky check?',
    "The Wyoming sky awaits. What's the weather in your world?",
  ],
  maya: [
    'Two minutes is all it takes. Ready for your tiny habit?',
    "Small steps, big results. Time for today's practice!",
    'The compound effect starts now. Your moment awaits.',
  ],
  alex: [
    'Strategic clarity starts with your daily check-in.',
    'Time to align your priorities. Quick strategy moment?',
    "Your morning brief is ready. Let's get focused.",
  ],
  jordan: [
    "Your mind-body connection awaits. Ready for today's practice?",
    'Breathe. Ground. Center. Your moment is here.',
    "Wellness check: How's your body feeling today?",
  ],
  peter: [
    'Wisdom begins with reflection. Time for your daily moment.',
    "The examined life calls. Ready for today's reflection?",
    'A moment of clarity awaits. Your practice time is here.',
  ],
  nayan: [
    'Stress relief starts now. Quick check-in time!',
    'Finding calm in the chaos. Your practice awaits.',
    "Your stress break is here. Let's breathe together.",
  ],
};

const STREAK_MILESTONE_MESSAGES: Record<number, string> = {
  3: "3 days strong! You're building momentum.",
  7: "One week! You're creating a real habit.",
  14: "Two weeks of consistency. That's powerful.",
  21: '21 days! Science says this is a habit now.',
  30: "A full month! You're unstoppable.",
  50: "50 days! You've transformed your routine.",
  100: "100 days! You're in the top 1% of consistency.",
};

// ============================================================================
// PUSH NOTIFICATIONS SERVICE
// ============================================================================

class PushNotificationsBackendService {
  private subscriptions = new Map<string, PushSubscription[]>();
  private scheduledNotifications = new Map<string, ScheduledNotification>();
  private initialized = false;

  /**
   * Initialize the service with VAPID keys
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load web-push module lazily
    const wp = await loadWebPush();

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:hello@ferni.ai';

    if (vapidPublicKey && vapidPrivateKey && wp) {
      wp.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      getLogger().info('Push notifications service initialized with VAPID');
    } else if (!wp) {
      getLogger().warn('web-push module not available, push notifications disabled');
    } else {
      getLogger().warn('VAPID keys not configured, push notifications disabled');
    }

    this.initialized = true;
  }

  /**
   * Register a push subscription for a user
   */
  async registerSubscription(subscription: PushSubscription): Promise<void> {
    const userSubs = this.subscriptions.get(subscription.userId) || [];

    // Check if subscription already exists
    const exists = userSubs.some((s) => s.endpoint === subscription.endpoint);
    if (!exists) {
      userSubs.push(subscription);
      this.subscriptions.set(subscription.userId, userSubs);
      getLogger().info(
        { userId: subscription.userId, platform: subscription.platform },
        'Push subscription registered'
      );
    }
  }

  /**
   * Remove a push subscription
   */
  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    const userSubs = this.subscriptions.get(userId) || [];
    const filtered = userSubs.filter((s) => s.endpoint !== endpoint);

    if (filtered.length > 0) {
      this.subscriptions.set(userId, filtered);
    } else {
      this.subscriptions.delete(userId);
    }

    getLogger().info({ userId }, 'Push subscription removed');
  }

  /**
   * Send a push notification to a user
   */
  async sendNotification(userId: string, payload: PushNotificationPayload): Promise<boolean> {
    const userSubs = this.subscriptions.get(userId);
    if (!userSubs || userSubs.length === 0) {
      getLogger().debug({ userId }, 'No subscriptions for user');
      return false;
    }

    const template = NOTIFICATION_TEMPLATES[payload.type] || NOTIFICATION_TEMPLATES.general;
    const notificationPayload = JSON.stringify({
      ...payload,
      icon: payload.icon || template.icon,
    });

    let sent = false;
    for (const sub of userSubs) {
      try {
        if (sub.platform === 'web') {
          await this.sendWebPush(sub, notificationPayload);
          sent = true;
        } else {
          // iOS/Android would use FCM or APNs
          await this.sendNativePush(sub, payload);
          sent = true;
        }
      } catch (error) {
        getLogger().warn(
          { error, userId, endpoint: sub.endpoint },
          'Failed to send push notification'
        );

        // Remove invalid subscription
        if (this.isSubscriptionExpired(error)) {
          await this.removeSubscription(userId, sub.endpoint);
        }
      }
    }

    return sent;
  }

  /**
   * Send notification to multiple users
   */
  async sendBulkNotification(userIds: string[], payload: PushNotificationPayload): Promise<number> {
    let successCount = 0;

    for (const userId of userIds) {
      const success = await this.sendNotification(userId, payload);
      if (success) successCount++;
    }

    getLogger().info({ totalUsers: userIds.length, successCount }, 'Bulk notification sent');
    return successCount;
  }

  /**
   * Schedule a notification for later
   */
  async scheduleNotification(
    userId: string,
    payload: PushNotificationPayload,
    scheduledFor: Date
  ): Promise<string> {
    const id = `sched-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const notification: ScheduledNotification = {
      id,
      userId,
      payload,
      scheduledFor,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.scheduledNotifications.set(id, notification);
    getLogger().info({ userId, id, scheduledFor }, 'Notification scheduled');

    return id;
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelScheduledNotification(id: string): Promise<boolean> {
    const notification = this.scheduledNotifications.get(id);
    if (notification && notification.status === 'pending') {
      notification.status = 'cancelled';
      return true;
    }
    return false;
  }

  /**
   * Process scheduled notifications (call this periodically)
   */
  async processScheduledNotifications(): Promise<void> {
    const now = new Date();

    for (const [id, notification] of this.scheduledNotifications) {
      if (notification.status !== 'pending') continue;

      if (notification.scheduledFor <= now) {
        try {
          await this.sendNotification(notification.userId, notification.payload);
          notification.status = 'sent';
          getLogger().info({ id }, 'Scheduled notification sent');
        } catch (error) {
          notification.status = 'failed';
          getLogger().error({ error, id }, 'Failed to send scheduled notification');
        }
      }
    }
  }

  // ============================================================================
  // CONVENIENCE METHODS FOR COMMON NOTIFICATIONS
  // ============================================================================

  /**
   * Send a ritual reminder notification
   */
  async sendRitualReminder(
    userId: string,
    personaId: string,
    ritualName: string
  ): Promise<boolean> {
    const messages = RITUAL_REMINDER_MESSAGES[personaId] || RITUAL_REMINDER_MESSAGES.ferni;
    const body = messages[Math.floor(Math.random() * messages.length)];

    return this.sendNotification(userId, {
      title: ritualName,
      body,
      type: 'ritual_reminder',
      personaId,
      data: { ritualName, personaId },
    });
  }

  /**
   * Send a streak milestone notification
   */
  async sendStreakMilestone(userId: string, streak: number, ritualName: string): Promise<boolean> {
    const message = STREAK_MILESTONE_MESSAGES[streak] || `${streak} days strong! Keep going.`;

    return this.sendNotification(userId, {
      title: `${streak}-Day Streak!`,
      body: message,
      type: 'streak_milestone',
      data: { streak, ritualName },
    });
  }

  /**
   * Send a prediction result notification
   */
  async sendPredictionResult(
    userId: string,
    predictionTitle: string,
    accuracy: number
  ): Promise<boolean> {
    const emoji = accuracy >= 80 ? '🎯' : accuracy >= 60 ? '👍' : '📈';

    return this.sendNotification(userId, {
      title: 'Prediction Results Ready',
      body: `${emoji} ${predictionTitle}: ${accuracy}% accurate`,
      type: 'prediction_result',
      data: { predictionTitle, accuracy },
    });
  }

  /**
   * Send a team huddle invitation
   */
  async sendTeamHuddleInvite(
    userId: string,
    topic: string,
    personaIds: string[]
  ): Promise<boolean> {
    const personaCount = personaIds.length;

    return this.sendNotification(userId, {
      title: 'Team Huddle Starting',
      body: `${personaCount} advisors are ready to discuss: ${topic}`,
      type: 'team_huddle',
      data: { topic, personaIds },
    });
  }

  /**
   * Send a proactive Ferni check-in
   */
  async sendFerniCheckin(userId: string, message: string): Promise<boolean> {
    return this.sendNotification(userId, {
      title: 'Ferni Here',
      body: message,
      type: 'ferni_checkin',
      personaId: AgentRole.COACH,
    });
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async sendWebPush(subscription: PushSubscription, payload: string): Promise<void> {
    const wp = await loadWebPush();
    if (!wp) {
      getLogger().warn('web-push not available, skipping notification');
      return;
    }
    await wp.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      payload
    );
  }

  private async sendNativePush(
    subscription: PushSubscription,
    payload: PushNotificationPayload
  ): Promise<void> {
    // This would integrate with Firebase Cloud Messaging (FCM) for Android
    // and Apple Push Notification Service (APNs) for iOS
    // For now, log it as a placeholder
    getLogger().debug(
      { platform: subscription.platform, payload },
      'Native push would be sent here'
    );
  }

  private isSubscriptionExpired(error: unknown): boolean {
    const err = error as { statusCode?: number };
    return err.statusCode === 410 || err.statusCode === 404;
  }

  // ==========================================================================
  // CLEANUP METHODS (Memory Leak Prevention)
  // ==========================================================================

  /**
   * Clear all data for a specific user.
   * Call when user is deleted or session ends.
   */
  clearUserData(userId: string): void {
    this.subscriptions.delete(userId);
    // Cancel all scheduled notifications for this user
    for (const [id, notification] of this.scheduledNotifications.entries()) {
      if (notification.userId === userId) {
        void this.cancelScheduledNotification(id);
      }
    }
    getLogger().debug({ userId }, 'Cleared push notification data for user');
  }

  /**
   * Clear all subscriptions and scheduled notifications.
   * Useful for testing or system reset.
   */
  clearAll(): void {
    this.subscriptions.clear();
    // Cancel all scheduled notifications
    for (const id of this.scheduledNotifications.keys()) {
      void this.cancelScheduledNotification(id);
    }
    getLogger().info('Cleared all push notification data');
  }

  /**
   * Get memory usage statistics for monitoring.
   */
  getStats(): { subscriptions: number; scheduledNotifications: number; totalUsers: number } {
    return {
      subscriptions: Array.from(this.subscriptions.values()).reduce(
        (sum, arr) => sum + arr.length,
        0
      ),
      scheduledNotifications: this.scheduledNotifications.size,
      totalUsers: this.subscriptions.size,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: PushNotificationsBackendService | null = null;

export function getPushNotificationsService(): PushNotificationsBackendService {
  if (!instance) {
    instance = new PushNotificationsBackendService();
    void instance.initialize();
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetPushNotificationsService(): void {
  if (instance) {
    instance.clearAll();
    instance = null;
  }
}

export default PushNotificationsBackendService;

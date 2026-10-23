/**
 * Push Notifications Backend Service
 *
 * Handles sending push notifications to users via Web Push and APNs/FCM.
 * Supports scheduled notifications, ritual reminders, and engagement triggers.
 *
 * PERSISTENCE: Subscriptions and scheduled notifications are persisted to Firestore
 * via the unified persistence layer to survive server restarts.
 */

import { getLogger } from '../utils/safe-logger.js';
import { AgentRole } from '../personas/index.js';
import { createPersistenceStore, type PersistenceStore } from './persistence/index.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
import { loadWebPush } from './web-push-loader.js';
import { claimEndpoint, getEndpointOwner, releaseEndpoint } from './push-endpoint-owners.js';
import { sendIosPush } from './ios-push.js';
import {
  RITUAL_REMINDER_MESSAGES,
  STREAK_MILESTONE_MESSAGES,
} from './push-notification-messages.js';

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
  | 'calendar_reminder'
  | 'calendar_digest'
  | 'family_approval_request'
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
  calendar_reminder: { icon: '/icons/calendar-192.png' },
  calendar_digest: { icon: '/icons/calendar-192.png' },
  family_approval_request: { icon: '/icons/family-192.png' },
  general: { icon: '/icons/icon-192.png' },
};

// ============================================================================
// PERSISTENCE TYPES
// ============================================================================

interface UserSubscriptionsData {
  subscriptions: PushSubscription[];
}

interface ScheduledNotificationsData {
  notifications: Record<string, ScheduledNotification>;
}

// ============================================================================
// PUSH NOTIFICATIONS SERVICE
// ============================================================================

class PushNotificationsBackendService {
  private subscriptions = new Map<string, PushSubscription[]>();
  private scheduledNotifications = new Map<string, ScheduledNotification>();
  private initialized = false;
  /** One initialization, shared: callers wait for it instead of racing it. */
  private initializing: Promise<void> | null = null;

  // Persistence stores
  private subscriptionStore: PersistenceStore<UserSubscriptionsData> | null = null;
  private scheduledStore: PersistenceStore<ScheduledNotificationsData> | null = null;

  /**
   * Initialize the service with VAPID keys and persistence. Safe to call more
   * than once: every caller waits for the same run.
   *
   * getPushNotificationsService() starts this without waiting, and the web
   * server never awaits it at boot, so the first send or subscribe in a fresh
   * process used to run before the stores and VAPID details existed: a send
   * found no subscriptions and returned false, and a subscribe answered success
   * without saving anything. Sends and subscription changes now wait here.
   */
  async initialize(): Promise<void> {
    this.initializing ??= this.runInitialize().catch((error: unknown) => {
      this.initializing = null; // let the next caller try again
      throw error;
    });
    await this.initializing;
  }

  private async runInitialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize persistence stores
    this.subscriptionStore = createPersistenceStore<UserSubscriptionsData>({
      collection: 'push_subscriptions',
      holdWrites: () => false, // MINOR_CARE opt-out: a device endpoint
      syncIntervalMs: 10000, // Sync every 10 seconds
      maxPendingChanges: 50,
    });

    this.scheduledStore = createPersistenceStore<ScheduledNotificationsData>({
      collection: 'scheduled_notifications',
      useRootCollection: true, // Use root collection for easier querying
      syncIntervalMs: 5000,
      maxPendingChanges: 100,
    });

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

    // Rehydrate scheduled notifications from persistence
    await this.rehydrateScheduledNotifications();

    this.initialized = true;
    getLogger().info('Push notifications service initialized with persistence');
  }

  /**
   * Rehydrate scheduled notifications from Firestore
   */
  private async rehydrateScheduledNotifications(): Promise<void> {
    try {
      // Load the global scheduled notifications
      const data = await this.scheduledStore?.load('global');
      if (data?.notifications) {
        for (const [id, notification] of Object.entries(data.notifications)) {
          // Only load pending notifications that haven't expired
          if (notification.status === 'pending') {
            const scheduledFor = new Date(notification.scheduledFor);
            if (scheduledFor > new Date()) {
              this.scheduledNotifications.set(cleanForFirestore(id), {
                ...notification,
                scheduledFor,
              });
            }
          }
        }
        getLogger().info(
          { count: this.scheduledNotifications.size },
          'Rehydrated scheduled notifications from persistence'
        );
      }
    } catch (error) {
      getLogger().warn({ error }, 'Failed to rehydrate scheduled notifications');
    }
  }

  /** Fresh from Firestore: the API server writes subscriptions, other processes send. */
  private async loadSubscriptions(userId: string): Promise<PushSubscription[]> {
    const persisted = await this.subscriptionStore?.load(userId, { fresh: true });
    return persisted?.subscriptions ?? [];
  }

  /**
   * Register a push subscription for a user. An endpoint belongs to one user; it
   * moves from a previous owner only with the same keys (EndpointOwnedError otherwise).
   */
  async registerSubscription(subscription: PushSubscription): Promise<void> {
    await this.initialize();
    const { endpoint, keys, userId } = subscription;
    const previousOwner = await claimEndpoint(endpoint, keys, userId);
    if (previousOwner) await this.removeSubscription(previousOwner, endpoint);

    const userSubs = await this.loadSubscriptions(subscription.userId);
    if (!userSubs.some((s) => s.endpoint === subscription.endpoint)) {
      userSubs.push(subscription);
      this.subscriptions.set(subscription.userId, userSubs);
      // Persist to Firestore now (not on the next batch), so other processes' senders see it
      await this.subscriptionStore?.setImmediate(subscription.userId, { subscriptions: userSubs });
      getLogger().info(
        { userId: subscription.userId, platform: subscription.platform },
        'Push subscription registered and persisted'
      );
    }
  }

  /**
   * Remove a push subscription
   */
  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    await this.initialize();
    const filtered = (await this.loadSubscriptions(userId)).filter((s) => s.endpoint !== endpoint);
    // Never a whole-doc delete: after a failed read `filtered` is [] and that dropped every
    // device. The store holds this write until a read succeeds (persistence readFailed).
    if (filtered.length > 0) this.subscriptions.set(userId, filtered);
    else this.subscriptions.delete(userId);
    await this.subscriptionStore?.setImmediate(userId, { subscriptions: filtered });
    await releaseEndpoint(endpoint, userId);

    getLogger().info({ userId }, 'Push subscription removed');
  }

  /**
   * Send a push notification to a user
   */
  async sendNotification(userId: string, payload: PushNotificationPayload): Promise<boolean> {
    await this.initialize();
    const userSubs = await this.loadSubscriptions(userId);
    // Their iPhone too, over APNs, while IOS_PUSH is on for them (ios-push.ts). Never throws.
    const iphone = sendIosPush(userId, payload);
    if (userSubs.length === 0) {
      getLogger().debug({ userId }, 'No subscriptions for user');
      return iphone;
    }

    const template = NOTIFICATION_TEMPLATES[payload.type] || NOTIFICATION_TEMPLATES.general;
    const notificationPayload = JSON.stringify({
      ...payload,
      icon: payload.icon || template.icon,
    });

    let sent = false;
    // Never deliver to an endpoint that has since been claimed by someone else.
    const owners = await Promise.all(userSubs.map((s) => getEndpointOwner(s.endpoint)));
    for (const sub of userSubs.filter((_, i) => owners[i] === userId)) {
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
        // Never the endpoint or error object: web-push's error carries the endpoint (pushable)
        const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
        getLogger().warn(
          { userId, platform: sub.platform, statusCode },
          'Failed to send push notification'
        );

        // Gone (404/410): the browser dropped it, so stop sending to it
        if (this.isSubscriptionExpired(error)) {
          await this.removeSubscription(userId, sub.endpoint);
        }
      }
    }

    return (await iphone) || sent;
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

    // Persist scheduled notifications
    await this.persistScheduledNotifications();

    getLogger().info({ userId, id, scheduledFor }, 'Notification scheduled and persisted');

    return id;
  }

  /**
   * Persist all scheduled notifications to Firestore
   */
  private async persistScheduledNotifications(): Promise<void> {
    const notifications: Record<string, ScheduledNotification> = {};
    for (const [id, notification] of this.scheduledNotifications.entries()) {
      notifications[id] = {
        ...notification,
        scheduledFor:
          notification.scheduledFor instanceof Date
            ? notification.scheduledFor
            : new Date(notification.scheduledFor),
      };
    }
    this.scheduledStore?.set('global', { notifications });
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelScheduledNotification(id: string): Promise<boolean> {
    const notification = this.scheduledNotifications.get(id);
    if (notification && notification.status === 'pending') {
      notification.status = 'cancelled';
      await this.persistScheduledNotifications();
      return true;
    }
    return false;
  }

  /**
   * Process scheduled notifications (call this periodically)
   */
  async processScheduledNotifications(): Promise<void> {
    const now = new Date();
    let processed = false;

    for (const [id, notification] of this.scheduledNotifications) {
      if (notification.status !== 'pending') continue;

      const scheduledFor =
        notification.scheduledFor instanceof Date
          ? notification.scheduledFor
          : new Date(notification.scheduledFor);

      if (scheduledFor <= now) {
        try {
          await this.sendNotification(notification.userId, notification.payload);
          notification.status = 'sent';
          processed = true;
          getLogger().info({ id }, 'Scheduled notification sent');
        } catch (error) {
          notification.status = 'failed';
          processed = true;
          getLogger().error({ error, id }, 'Failed to send scheduled notification');
        }
      }
    }

    // Persist changes if any notifications were processed
    if (processed) {
      await this.persistScheduledNotifications();
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
      // Throw so sendNotification() reports "not sent" instead of a silent success.
      throw new Error('web-push not available; notification not sent');
    }
    await wp.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      payload
    );
  }

  /**
   * FCM, to this subscription's token only (its owner was checked by the caller),
   * never to another registry that doesn't know a token moved. Throws when
   * nothing was delivered, so sendNotification() reports "not sent"; an FCM
   * "unregistered" or "invalid token" answer carries statusCode 410 so the
   * subscription is dropped.
   */
  private async sendNativePush(
    subscription: PushSubscription,
    payload: PushNotificationPayload
  ): Promise<void> {
    const { sendPushNotification, isPushNotificationsAvailable } =
      await import('./outreach/delivery/push-notifications.js');

    if (!isPushNotificationsAvailable()) {
      throw new Error('FCM not initialized; native push not sent');
    }

    const result = await sendPushNotification(
      {
        userId: subscription.userId,
        outreachId: `push-${Date.now()}`,
        personaId: payload.personaId || 'ferni',
        title: payload.title,
        body: payload.body,
        priority: 'high' as const,
        data: payload.data as Record<string, string> | undefined,
      },
      subscription.endpoint
    );

    if (!result.some((r) => r.success)) {
      const gone = result.some(
        (r) => r.failureReason === 'unregistered' || r.failureReason === 'invalid_token'
      );
      throw Object.assign(new Error('Native push delivery failed'), {
        statusCode: gone ? 410 : undefined,
      });
    }
    getLogger().info(
      { userId: subscription.userId, platform: subscription.platform },
      'Native push notification sent via FCM'
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
  async clearUserData(userId: string): Promise<void> {
    this.subscriptions.delete(userId);
    await this.subscriptionStore?.delete(userId);

    // Cancel all scheduled notifications for this user
    for (const [id, notification] of this.scheduledNotifications.entries()) {
      if (notification.userId === userId) {
        await this.cancelScheduledNotification(id);
      }
    }
    getLogger().debug({ userId }, 'Cleared push notification data for user');
  }

  /**
   * Clear all subscriptions and scheduled notifications.
   * Useful for testing or system reset.
   */
  async clearAll(): Promise<void> {
    this.subscriptions.clear();
    this.subscriptionStore?.clearAllCaches();

    // Cancel all scheduled notifications
    for (const id of this.scheduledNotifications.keys()) {
      await this.cancelScheduledNotification(id);
    }
    this.scheduledStore?.clearAllCaches();

    getLogger().info('Cleared all push notification data');
  }

  /**
   * Get memory usage statistics for monitoring.
   */
  getStats(): { subscriptions: number; scheduledNotifications: number; totalUsers: number } {
    const persistenceStats = {
      subscriptionStore: this.subscriptionStore?.getStats() || { cached: 0, dirty: 0 },
      scheduledStore: this.scheduledStore?.getStats() || { cached: 0, dirty: 0 },
    };

    return {
      subscriptions: Array.from(this.subscriptions.values()).reduce(
        (sum, arr) => sum + arr.length,
        0
      ),
      scheduledNotifications: this.scheduledNotifications.size,
      totalUsers: this.subscriptions.size,
      ...persistenceStats,
    };
  }

  /**
   * Shutdown the service (flush all pending data)
   */
  async shutdown(): Promise<void> {
    getLogger().info('Shutting down push notifications service...');

    // Flush all pending persistence
    await this.subscriptionStore?.flush();
    await this.scheduledStore?.flush();

    getLogger().info('Push notifications service shutdown complete');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: PushNotificationsBackendService | null = null;

export function getPushNotificationsService(): PushNotificationsBackendService {
  if (!instance) {
    instance = new PushNotificationsBackendService();
    instance.initialize().catch((error: unknown) => {
      getLogger().warn({ error: String(error) }, 'Push notifications service not initialized yet');
    });
  }
  return instance;
}

/**
 * Reset the singleton instance (for testing)
 */
export async function resetPushNotificationsService(): Promise<void> {
  if (instance) {
    await instance.clearAll();
    instance = null;
  }
}

/**
 * Shutdown the push notifications service (call on app shutdown)
 */
export async function shutdownPushNotificationsService(): Promise<void> {
  if (instance) {
    await instance.shutdown();
    instance = null;
  }
}

export default PushNotificationsBackendService;
